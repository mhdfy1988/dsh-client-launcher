import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell, Tray, type IpcMainEvent, type IpcMainInvokeEvent, type OpenDialogOptions } from 'electron'
import type { Context } from '@deepseek-ai/cordis'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspect } from 'node:util'
import { prepareProfile } from './profile.js'
import { buildHarnessWorkspace } from './runtime-build.js'
import {
  getHarnessRuntimeRoot,
  getFolderLocalHarnessRuntimeRoot,
  HarnessRuntimeNotReadyError,
  importHarnessPackage,
  inspectHarnessRuntime,
  installHarnessModuleFallback,
  readHarnessVersion,
} from './runtime.js'
import { createShutdownController } from './shutdown.js'
import {
  installElectronNodeChildCompatibility,
  installElectronNodePtyCompatibility,
  type ElectronNodePtyCompatibility,
  type NodePtyModule,
} from './electron-node-child.js'
import { resolveDesktopTheme } from './theme-colors.js'
import { installBrokenPipeGuard } from './output.js'
import { renderRecoveryPage } from './recovery-page.js'
import {
  createEmptyRuntimeClientRegistry,
  parseRuntimeClientRegistry,
  type RuntimeClientRecord,
  type RuntimeClientRegistry,
} from './runtime-clients.js'
import { applyWindowControl } from './window-controls.js'
import { installAutoUpdate, type AutoUpdateHandle } from './auto-update.js'

const BIN_NAME = 'dsh-desktop-shell'
const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const DEFAULT_USER_DATA = app.getPath('userData')
const PACKAGED_DATA_ROOT = process.env.DSH_DESKTOP_POC_PACKAGED_DATA_ROOT ?? DEFAULT_USER_DATA
const POC_ROOT = app.isPackaged ? join(PACKAGED_DATA_ROOT, 'poc') : join(PROJECT_ROOT, '.poc')
const USER_DATA = app.isPackaged ? join(PACKAGED_DATA_ROOT, 'electron-user-data') : join(POC_ROOT, 'electron-user-data')
const WINDOW_STATE = join(USER_DATA, 'window-state.json')
const RUNTIME_CLIENTS = join(POC_ROOT, 'runtime-clients.json')
const smokeDelay = Number.parseInt(process.env.DSH_DESKTOP_POC_SMOKE_MS ?? '', 10)
const smokeMode = Number.isFinite(smokeDelay) && smokeDelay >= 0
const traceFile = join(POC_ROOT, 'desktop-startup.log')
const DESKTOP_ICON = fileURLToPath(new URL('../assets/dsh-desktop-icon.ico', import.meta.url))

installBrokenPipeGuard(process.stdout)

function trace(message: string): void {
  if (process.env.DSH_DESKTOP_POC_FILE_TRACE !== '1') return
  appendFileSync(traceFile, `${new Date().toISOString()} ${message}\n`, 'utf8')
}

mkdirSync(POC_ROOT, { recursive: true })
mkdirSync(USER_DATA, { recursive: true })
app.setPath('userData', USER_DATA)
process.env.DSH_TELEMETRY_DISABLED = '1'

let host: Context | undefined
let window: BrowserWindow | undefined
let tray: Tray | undefined
let nativeExitStarted = false
let relaunchRequested = false
let runtimeBuildActive = false
let removeModuleFallback: (() => void) | undefined
let removeElectronNodeChildCompatibility: (() => void) | undefined
let electronNodePtyCompatibility: ElectronNodePtyCompatibility | undefined
let autoUpdate: AutoUpdateHandle | undefined

const shutdown = createShutdownController(
  async () => {
    const remainingPtys = await electronNodePtyCompatibility?.prepareForShutdown() ?? 0
    if (remainingPtys > 0) {
      writeFileSync(1, `DSH_DESKTOP_POC_PTY_DRAIN_INCOMPLETE ${JSON.stringify({ remainingPtys })}\n`)
    }
    if (window !== undefined && !window.isDestroyed()) window.destroy()
    window = undefined
    tray?.destroy()
    tray = undefined
    await host?.fiber.dispose()
    host = undefined
    removeModuleFallback?.()
    removeModuleFallback = undefined
    removeElectronNodeChildCompatibility?.()
    removeElectronNodeChildCompatibility = undefined
    electronNodePtyCompatibility?.dispose()
    electronNodePtyCompatibility = undefined
    autoUpdate?.dispose()
    autoUpdate = undefined
    writeFileSync(1, 'DSH_DESKTOP_POC_DISPOSED\n')
  },
  (code) => {
    nativeExitStarted = true
    if (relaunchRequested) app.relaunch()
    app.exit(code)
  },
)

function requestQuit(code: number): void {
  void shutdown.request(code)
}

function requestRestart(): void {
  relaunchRequested = true
  process.stdout.write('DSH_DESKTOP_POC_RESTART_REQUESTED\n')
  requestQuit(0)
}

function installRuntimeBuildHandler(): void {
  ipcMain.handle('dsh-desktop:build-runtime', async () => {
    if (runtimeBuildActive) return { ok: false, log: '当前 DSH 构建已经在进行中。' }
    runtimeBuildActive = true
    try {
      const result = await buildHarnessWorkspace(getHarnessRuntimeRoot())
      if (result.ok) setTimeout(requestRestart, 250)
      return result
    } catch (cause) {
      return { ok: false, log: formatFailure(cause) }
    } finally {
      runtimeBuildActive = false
    }
  })
}

function runtimeClientId(root: string): string {
  const normalized = process.platform === 'win32' ? resolve(root).toLocaleLowerCase('en-US') : resolve(root)
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16)
}

function readRuntimeClients(): RuntimeClientRegistry {
  if (!existsSync(RUNTIME_CLIENTS)) return createEmptyRuntimeClientRegistry()
  const value: unknown = JSON.parse(readFileSync(RUNTIME_CLIENTS, 'utf8'))
  return parseRuntimeClientRegistry(value)
}

function writeRuntimeClients(registry: RuntimeClientRegistry): void {
  writeFileSync(RUNTIME_CLIENTS, `${JSON.stringify(registry, null, 2)}\n`, 'utf8')
}

function createRuntimeClient(root: string): RuntimeClientRecord {
  const absoluteRoot = resolve(root)
  return {
    id: runtimeClientId(absoluteRoot),
    name: basename(absoluteRoot) || absoluteRoot,
    root: absoluteRoot,
  }
}

function upsertRuntimeClient(registry: RuntimeClientRegistry, client: RuntimeClientRecord): RuntimeClientRegistry {
  return {
    ...registry,
    clients: [...registry.clients.filter(item => item.id !== client.id), client],
  }
}

interface RuntimeClientView extends RuntimeClientRecord {
  source: 'folder' | 'saved'
  saved: boolean
  active: boolean
  ready: boolean
  canBuild: boolean
  layout?: string
  version?: string
  issues: string[]
}

function inspectRuntimeClient(client: RuntimeClientRecord, source: RuntimeClientView['source'], registry: RuntimeClientRegistry): RuntimeClientView {
  const inspection = inspectHarnessRuntime(client.root)
  let version: string | undefined
  if (inspection.anchor !== undefined) {
    const manifest = JSON.parse(readFileSync(inspection.anchor, 'utf8')) as { version?: unknown }
    if (typeof manifest.version === 'string') version = manifest.version
  }
  return {
    ...client,
    source,
    saved: registry.clients.some(item => item.id === client.id),
    active: registry.activeId === client.id,
    ready: inspection.ready,
    canBuild: inspection.canBuild,
    ...(inspection.layout === undefined ? {} : { layout: inspection.layout }),
    ...(version === undefined ? {} : { version }),
    issues: inspection.issues,
  }
}

function listRuntimeClients(registry = readRuntimeClients()): RuntimeClientView[] {
  const folderClient = createRuntimeClient(getFolderLocalHarnessRuntimeRoot())
  const savedFolderClient = registry.clients.find(client => client.id === folderClient.id)
  const views = [inspectRuntimeClient(savedFolderClient ?? folderClient, 'folder', registry)]
  for (const client of registry.clients) {
    if (client.id === folderClient.id) continue
    views.push(inspectRuntimeClient(client, 'saved', registry))
  }
  return views
}

function findRuntimeClient(id: string, registry: RuntimeClientRegistry): RuntimeClientRecord | undefined {
  const folderClient = createRuntimeClient(getFolderLocalHarnessRuntimeRoot())
  if (folderClient.id === id) return registry.clients.find(client => client.id === id) ?? folderClient
  return registry.clients.find(client => client.id === id)
}

function scheduleRuntimeStart(client: RuntimeClientRecord, registry: RuntimeClientRegistry): void {
  const updated = upsertRuntimeClient(registry, client)
  writeRuntimeClients({ ...updated, activeId: client.id })
  process.env.DSH_DESKTOP_RUNTIME_DIR = client.root
  setTimeout(requestRestart, 250)
}

function eventOwnsLauncher(event: IpcMainInvokeEvent | IpcMainEvent): boolean {
  return window !== undefined && !window.isDestroyed() && event.sender === window.webContents
}

function installRecoveryActionHandlers(): void {
  ipcMain.handle('dsh-desktop:list-runtimes', (event) => {
    if (!eventOwnsLauncher(event)) return { clients: [], error: '启动器窗口已经关闭。' }
    try {
      return { clients: listRuntimeClients() }
    } catch (cause) {
      return { clients: [], error: formatFailure(cause) }
    }
  })
  ipcMain.handle('dsh-desktop:add-runtime', async (event) => {
    if (!eventOwnsLauncher(event) || window === undefined) return { error: '启动器窗口已经关闭。' }
    const result = await dialog.showOpenDialog(window, {
      title: '选择 DSH 根目录',
      properties: ['openDirectory'],
    })
    if (result.canceled || result.filePaths[0] === undefined) return {}
    const inspection = inspectHarnessRuntime(result.filePaths[0])
    if (!inspection.ready && !inspection.canBuild) {
      return { error: inspection.issues.join('\n') }
    }
    const registry = readRuntimeClients()
    writeRuntimeClients(upsertRuntimeClient(registry, createRuntimeClient(inspection.root)))
    return {}
  })
  ipcMain.handle('dsh-desktop:start-runtime', (event, id: unknown) => {
    if (!eventOwnsLauncher(event)) return { error: '启动器窗口已经关闭。' }
    if (typeof id !== 'string') return { error: 'DSH 客户端 ID 无效。' }
    const registry = readRuntimeClients()
    const client = findRuntimeClient(id, registry)
    if (client === undefined) return { error: 'DSH 客户端不存在。' }
    const inspection = inspectHarnessRuntime(client.root)
    if (!inspection.ready) return { error: inspection.issues.join('\n') }
    scheduleRuntimeStart(client, registry)
    return { restarting: true }
  })
  ipcMain.handle('dsh-desktop:prepare-runtime', async (event, id: unknown) => {
    if (!eventOwnsLauncher(event)) return { error: '启动器窗口已经关闭。' }
    if (typeof id !== 'string') return { error: 'DSH 客户端 ID 无效。' }
    if (runtimeBuildActive) return { error: '当前 DSH 构建已经在进行中。' }
    const registry = readRuntimeClients()
    const client = findRuntimeClient(id, registry)
    if (client === undefined) return { error: 'DSH 客户端不存在。' }
    runtimeBuildActive = true
    try {
      const result = await buildHarnessWorkspace(client.root)
      if (!result.ok) return { error: result.log }
      scheduleRuntimeStart(client, registry)
      return { restarting: true }
    } finally {
      runtimeBuildActive = false
    }
  })
  ipcMain.handle('dsh-desktop:remove-runtime', (event, id: unknown) => {
    if (!eventOwnsLauncher(event)) return { error: '启动器窗口已经关闭。' }
    if (typeof id !== 'string') return { error: 'DSH 客户端 ID 无效。' }
    const registry = readRuntimeClients()
    if (!registry.clients.some(client => client.id === id)) return {}
    writeRuntimeClients({
      version: 1,
      ...(registry.activeId === id || registry.activeId === undefined ? {} : { activeId: registry.activeId }),
      clients: registry.clients.filter(client => client.id !== id),
    })
    return {}
  })
  ipcMain.handle('dsh-desktop:open-install-directory', async (event) => {
    if (window === undefined || window.isDestroyed() || event.sender !== window.webContents) {
      return { ok: false, error: '恢复窗口已经关闭。' }
    }
    const installDirectory = app.isPackaged ? dirname(process.execPath) : PROJECT_ROOT
    const error = await shell.openPath(installDirectory)
    return error === '' ? { ok: true } : { ok: false, error }
  })
  ipcMain.on('dsh-desktop:recovery-quit', (event: IpcMainEvent) => {
    if (window === undefined || window.isDestroyed() || event.sender !== window.webContents) return
    requestQuit(0)
  })
}

function installThemeHandler(): void {
  ipcMain.on('dsh-desktop:theme-colors', (event: IpcMainEvent, value: unknown) => {
    if (window === undefined || window.isDestroyed() || event.sender !== window.webContents) return
    const theme = resolveDesktopTheme(value)
    if (theme === undefined) return
    window.setBackgroundColor(theme.background)
    process.stdout.write(`DSH_DESKTOP_POC_THEME ${JSON.stringify(theme)}\n`)
  })
}

function publishWindowState(target: BrowserWindow): void {
  if (target.isDestroyed()) return
  target.webContents.send('dsh-desktop:window-state', { maximized: target.isMaximized() })
}

function installWindowControlHandler(): void {
  ipcMain.on('dsh-desktop:window-control', (event: IpcMainEvent, command: unknown) => {
    if (window === undefined || window.isDestroyed() || event.sender !== window.webContents) return
    const maximized = applyWindowControl(window, command)
    if (maximized !== undefined && !window.isDestroyed()) publishWindowState(window)
  })
  ipcMain.on('dsh-desktop:window-controls-ready', (event: IpcMainEvent) => {
    if (window === undefined || window.isDestroyed() || event.sender !== window.webContents) return
    publishWindowState(window)
  })
}

function showWindow(): void {
  if (window === undefined || window.isDestroyed()) return
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
  process.stdout.write('DSH_DESKTOP_POC_WINDOW_SHOWN\n')
}

function installTray(): void {
  tray = new Tray(nativeImage.createFromPath(DESKTOP_ICON))
  tray.setToolTip('DSH 客户端启动器')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示 DSH 客户端启动器', click: showWindow },
    { label: '重启 Host', click: requestRestart },
    { type: 'separator' },
    { label: '退出', click: () => { requestQuit(0) } },
  ]))
  tray.on('click', showWindow)
  process.stdout.write('DSH_DESKTOP_POC_TRAY_READY\n')
}

function readWindowState(): { x?: number, y?: number, width: number, height: number, maximized?: boolean } {
  try {
    const value = JSON.parse(readFileSync(WINDOW_STATE, 'utf8')) as Record<string, unknown>
    const width = typeof value.width === 'number' && value.width >= 800 ? value.width : 1280
    const height = typeof value.height === 'number' && value.height >= 600 ? value.height : 820
    const x = typeof value.x === 'number' ? value.x : undefined
    const y = typeof value.y === 'number' ? value.y : undefined
    return { ...(x === undefined ? {} : { x }), ...(y === undefined ? {} : { y }), width, height, maximized: value.maximized === true }
  } catch {
    return { width: 1280, height: 820 }
  }
}

function saveWindowState(): void {
  if (window === undefined || window.isDestroyed() || window.isMinimized()) return
  const [x, y] = window.getPosition()
  const [width, height] = window.getSize()
  writeFileSync(WINDOW_STATE, JSON.stringify({ x, y, width, height, maximized: window.isMaximized() }) + '\n', 'utf8')
}

function installQuitSources(): void {
  process.on('SIGINT', () => { requestQuit(130) })
  process.on('SIGTERM', () => { requestQuit(0) })
  app.on('before-quit', (event) => {
    if (nativeExitStarted) return
    event.preventDefault()
    requestQuit(0)
  })
}

async function waitForRendererReady(target: BrowserWindow): Promise<{ title: string, bodyLength: number }> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const result = await target.webContents.executeJavaScript(`({
      title: document.title,
      bodyLength: document.body?.innerText?.trim().length ?? 0,
    })`) as unknown
    if (typeof result === 'object' && result !== null) {
      const title = Reflect.get(result, 'title')
      const bodyLength = Reflect.get(result, 'bodyLength')
      if (typeof title === 'string' && typeof bodyLength === 'number' && bodyLength > 20) {
        return { title, bodyLength }
      }
    }
    await new Promise(resolve => { setTimeout(resolve, 100) })
  }
  throw new Error('renderer did not produce visible content within 5 seconds')
}

function formatFailure(cause: unknown): string {
  if (cause instanceof AggregateError) return [...cause.errors].map(formatFailure).join('\n')
  if (typeof cause === 'object' && cause !== null) {
    const errors = Reflect.get(cause, 'errors')
    if (Array.isArray(errors)) return errors.map(formatFailure).join('\n')
    const nested = Reflect.get(cause, 'cause')
    if (nested !== undefined) {
      const message = cause instanceof Error ? cause.stack ?? cause.message : String(cause)
      return `${message}\ncaused by:\n${formatFailure(nested)}`
    }
  }
  return cause instanceof Error ? cause.stack ?? cause.message : String(cause)
}

async function showRecovery(cause?: unknown): Promise<void> {
  await host?.fiber.dispose()
  host = undefined
  removeModuleFallback?.()
  removeModuleFallback = undefined
  window = new BrowserWindow({
    width: 960,
    height: 640,
    show: !smokeMode,
    backgroundColor: '#080b18',
    icon: DESKTOP_ICON,
    autoHideMenuBar: true,
    frame: false,
    thickFrame: true,
    webPreferences: {
      preload: fileURLToPath(new URL('./preload.cjs', import.meta.url)),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.on('closed', () => {
    window = undefined
    if (!nativeExitStarted) app.quit()
  })
  const message = cause === undefined ? undefined : cause instanceof Error ? cause.message : String(cause)
  const html = renderRecoveryPage(message === undefined ? {} : { message })
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  process.stdout.write('DSH_DESKTOP_POC_RECOVERY_READY\n')
  if (smokeMode) setTimeout(() => { requestQuit(0) }, smokeDelay)
}

async function start(): Promise<void> {
  trace('start')
  app.setName('DSH 客户端启动器')
  if (!app.requestSingleInstanceLock()) {
    app.exit(0)
    return
  }
  installQuitSources()
  installRuntimeBuildHandler()
  installRecoveryActionHandlers()
  installThemeHandler()
  installWindowControlHandler()
  Menu.setApplicationMenu(null)
  app.on('second-instance', () => {
    process.stdout.write('DSH_DESKTOP_POC_SECOND_INSTANCE\n')
    showWindow()
  })

  await app.whenReady()
  trace('electron-ready')
  removeElectronNodeChildCompatibility = installElectronNodeChildCompatibility(async (title) => {
    const options: OpenDialogOptions = { title, properties: ['openDirectory'] }
    const result = window === undefined || window.isDestroyed()
      ? await dialog.showOpenDialog(options)
      : await dialog.showOpenDialog(window, options)
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
  const explicitRoot = process.env.DSH_DESKTOP_RUNTIME_DIR?.trim()
  let automaticRoot: string | undefined
  if (explicitRoot !== undefined && explicitRoot !== '') {
    automaticRoot = explicitRoot
  } else if (smokeMode) {
    automaticRoot = getFolderLocalHarnessRuntimeRoot()
  } else {
    const registry = readRuntimeClients()
    automaticRoot = registry.clients.find(client => client.id === registry.activeId)?.root
  }
  if (automaticRoot === undefined) {
    await showRecovery()
    return
  }
  process.env.DSH_DESKTOP_RUNTIME_DIR = automaticRoot
  const runtimeDshHome = join(POC_ROOT, 'runtimes', runtimeClientId(automaticRoot), 'dsh-home')
  mkdirSync(runtimeDshHome, { recursive: true })
  process.env.DSH_HOME = runtimeDshHome
  let runtime = inspectHarnessRuntime(automaticRoot)
  if (!runtime.ready && process.env.DSH_DESKTOP_POC_AUTO_BUILD === '1' && runtime.canBuild) {
    const buildResult = await buildHarnessWorkspace(runtime.root)
    process.stdout.write(`DSH_DESKTOP_POC_BUILD_RESULT ${JSON.stringify(buildResult)}\n`)
    if (!buildResult.ok) throw new Error(buildResult.log)
    runtime = inspectHarnessRuntime(runtime.root)
  }
  if (!runtime.ready && explicitRoot === undefined && !smokeMode) {
    await showRecovery(new HarnessRuntimeNotReadyError(runtime))
    return
  }
  if (!runtime.ready) throw new HarnessRuntimeNotReadyError(runtime)
  const [{ boot, loadLayeredEnv }, { provideCmdline }, { DSH_LAUNCH_ENVIRONMENT_KEY }] = await Promise.all([
    importHarnessPackage<typeof import('@deepseek-ai/dsh-app-boot')>('@deepseek-ai/dsh-app-boot'),
    importHarnessPackage<typeof import('@deepseek-ai/dsh-cmdline')>('@deepseek-ai/dsh-cmdline'),
    importHarnessPackage<typeof import('@deepseek-ai/dsh-launch-environment')>('@deepseek-ai/dsh-launch-environment'),
    importHarnessPackage<typeof import('@deepseek-ai/dsh-host-webserver')>('@deepseek-ai/dsh-host-webserver'),
  ])
  const dshVersion = readHarnessVersion()
  if (process.platform === 'win32') app.setAppUserModelId('local.dsh.client.launcher')
  process.stdout.write(`DSH_DESKTOP_POC_RUNTIME ${JSON.stringify({
    desktop: '0.1.1',
    electron: process.versions.electron,
    node: process.versions.node,
    modules: process.versions.modules,
    dsh: dshVersion,
  })}\n`)

  if (process.env.DSH_DESKTOP_POC_FORCE_BOOT_FAILURE === '1') {
    throw new Error('forced POC boot failure')
  }

  const prepared = await prepareProfile(runtimeDshHome)
  const profileRequire = createRequire(fileURLToPath(prepared.bareModuleBaseUrl))
  const subprocessLocalManifest = profileRequire.resolve('@deepseek-ai/dsh-subprocess-local/package.json')
  const runtimeNodePty = createRequire(subprocessLocalManifest)('node-pty') as NodePtyModule
  electronNodePtyCompatibility = installElectronNodePtyCompatibility(runtimeNodePty)
  removeModuleFallback = installHarnessModuleFallback(prepared.bareModuleBaseUrl)
  trace('profile-prepared')
  const environment = loadLayeredEnv(BIN_NAME, runtime.root)
  host = await boot(
    BIN_NAME,
    prepared.rootConfig,
    prepared.patches,
    (ctx) => {
      ctx.provide(DSH_LAUNCH_ENVIRONMENT_KEY, environment)
      provideCmdline(ctx, {
        args: ['--host', '127.0.0.1', '--port', '0'],
        exit: requestQuit,
      })
    },
    prepared.bareModuleBaseUrl,
  )
  trace('host-booted')

  const origin = `http://127.0.0.1:${host.webServer.port}`
  const windowState = readWindowState()
  window = new BrowserWindow({
    ...(windowState.x === undefined ? {} : { x: windowState.x }),
    ...(windowState.y === undefined ? {} : { y: windowState.y }),
    width: windowState.width,
    height: windowState.height,
    show: !smokeMode,
    backgroundColor: '#080b18',
    icon: DESKTOP_ICON,
    autoHideMenuBar: true,
    frame: false,
    thickFrame: true,
    webPreferences: {
      preload: fileURLToPath(new URL('./preload.cjs', import.meta.url)),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== origin) event.preventDefault()
  })
  window.on('closed', () => {
    saveWindowState()
    window = undefined
  })
  window.on('resize', saveWindowState)
  window.on('move', saveWindowState)
  window.on('maximize', () => { if (window !== undefined) publishWindowState(window) })
  window.on('unmaximize', () => { if (window !== undefined) publishWindowState(window) })
  window.on('close', (event) => {
    if (nativeExitStarted || smokeMode) return
    event.preventDefault()
    window?.hide()
    process.stdout.write('DSH_DESKTOP_POC_WINDOW_HIDDEN\n')
  })
  await window.loadURL(origin)
  trace('renderer-loaded')
  const renderer = await waitForRendererReady(window)
  shutdown.markRunning()
  process.stdout.write(`DSH_DESKTOP_POC_RENDERER_READY ${JSON.stringify(renderer)}\n`)
  installTray()
  autoUpdate = installAutoUpdate({
    isPackaged: app.isPackaged,
    isSmokeMode: smokeMode,
    resourcesPath: process.resourcesPath,
    env: process.env,
  })
  process.stdout.write(`DSH_DESKTOP_POC_READY ${origin}\n`)

  if (smokeMode) {
    setTimeout(() => { requestQuit(0) }, smokeDelay)
  }
  if (process.env.DSH_DESKTOP_POC_STATE_SMOKE === '1') {
    window.hide()
    process.stdout.write('DSH_DESKTOP_POC_WINDOW_HIDDEN\n')
    showWindow()
    setTimeout(() => { requestQuit(0) }, 50)
  }
  const singleInstanceExitDelay = Number.parseInt(process.env.DSH_DESKTOP_POC_SINGLE_INSTANCE_EXIT_MS ?? '', 10)
  if (Number.isFinite(singleInstanceExitDelay) && singleInstanceExitDelay >= 0) {
    setTimeout(() => { requestQuit(0) }, singleInstanceExitDelay)
  }
}

void start().catch(async (cause: unknown) => {
  process.stderr.write(`${BIN_NAME}: ${formatFailure(cause)}\n`)
  if (process.env.DSH_DESKTOP_POC_FILE_TRACE === '1') process.stderr.write(`${inspect(cause, { depth: 12 })}\n`)
  try {
    await showRecovery(cause)
  } catch (recoveryCause) {
    process.stderr.write(`${BIN_NAME}: recovery failed: ${recoveryCause instanceof Error ? recoveryCause.stack ?? recoveryCause.message : String(recoveryCause)}\n`)
    await shutdown.request(1)
  }
})
