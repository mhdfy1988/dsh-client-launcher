import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell, Tray, type IpcMainEvent, type OpenDialogOptions } from 'electron'
import type { Context } from '@deepseek-ai/cordis'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspect } from 'node:util'
import { prepareProfile } from './profile.js'
import { buildHarnessWorkspace } from './runtime-build.js'
import {
  getHarnessRuntimeRoot,
  HarnessRuntimeNotReadyError,
  importHarnessPackage,
  inspectHarnessRuntime,
  installHarnessModuleFallback,
  readHarnessVersion,
} from './runtime.js'
import { createShutdownController } from './shutdown.js'
import { installElectronNodeChildCompatibility } from './electron-node-child.js'
import { resolveDesktopTheme } from './theme-colors.js'
import { installBrokenPipeGuard } from './output.js'
import { applyWindowControl } from './window-controls.js'

const BIN_NAME = 'dsh-desktop-shell'
const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const DEFAULT_USER_DATA = app.getPath('userData')
const PACKAGED_DATA_ROOT = process.env.DSH_DESKTOP_POC_PACKAGED_DATA_ROOT ?? DEFAULT_USER_DATA
const POC_ROOT = app.isPackaged ? join(PACKAGED_DATA_ROOT, 'poc') : join(PROJECT_ROOT, '.poc')
const USER_DATA = app.isPackaged ? join(PACKAGED_DATA_ROOT, 'electron-user-data') : join(POC_ROOT, 'electron-user-data')
const DSH_HOME = join(POC_ROOT, 'dsh-home')
const WINDOW_STATE = join(USER_DATA, 'window-state.json')
const smokeDelay = Number.parseInt(process.env.DSH_DESKTOP_POC_SMOKE_MS ?? '', 10)
const smokeMode = Number.isFinite(smokeDelay) && smokeDelay >= 0
const traceFile = join(POC_ROOT, 'desktop-startup.log')
const DESKTOP_ICON = fileURLToPath(new URL('../assets/dsh-desktop-icon.ico', import.meta.url))

installBrokenPipeGuard(process.stdout)

function trace(message: string): void {
  if (process.env.DSH_DESKTOP_POC_FILE_TRACE !== '1') return
  appendFileSync(traceFile, `${new Date().toISOString()} ${message}\n`, 'utf8')
}

mkdirSync(USER_DATA, { recursive: true })
mkdirSync(DSH_HOME, { recursive: true })
app.setPath('userData', USER_DATA)
process.env.DSH_HOME = DSH_HOME
process.env.DSH_TELEMETRY_DISABLED = '1'

let host: Context | undefined
let window: BrowserWindow | undefined
let tray: Tray | undefined
let nativeExitStarted = false
let relaunchRequested = false
let runtimeBuildActive = false
let removeModuleFallback: (() => void) | undefined
let removeElectronNodeChildCompatibility: (() => void) | undefined

const shutdown = createShutdownController(
  async () => {
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
    process.stdout.write('DSH_DESKTOP_POC_DISPOSED\n')
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
  tray.setToolTip('DSH Desktop POC')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示 DSH Desktop', click: showWindow },
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

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
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

async function showRecovery(cause: unknown): Promise<void> {
  await host?.fiber.dispose()
  host = undefined
  removeModuleFallback?.()
  removeModuleFallback = undefined
  const message = cause instanceof Error ? cause.message : String(cause)
  const canBuild = cause instanceof HarnessRuntimeNotReadyError && cause.inspection.canBuild
  window = new BrowserWindow({
    width: 760,
    height: 460,
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
  const buildControls = canBuild
    ? '<p>这是一个 DSH 源码工作区。构建会安装缺失依赖并生成 lib 产物，不会修改源码或插件。</p><button id="build">安装依赖并构建当前 DSH</button><pre id="build-log"></pre><script>document.getElementById("build").addEventListener("click",async()=>{const button=document.getElementById("build");const log=document.getElementById("build-log");button.disabled=true;log.textContent="正在准备当前 DSH，请勿关闭窗口……";const result=await window.dshDesktop.buildRuntime();log.textContent=result.log;if(!result.ok)button.disabled=false;});</script>'
    : ''
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>DSH Desktop 启动失败</title><style>body{margin:0;background:#080b18;color:#edf0ff;font:16px/1.7 system-ui;padding:48px}main{max-width:720px;margin:auto;border:1px solid #343b66;border-radius:18px;padding:30px;background:#10152a}h1{margin-top:0;font-size:24px}code,pre{display:block;padding:14px;background:#090d1b;border-radius:10px;color:#ffb4bd;white-space:pre-wrap;max-height:260px;overflow:auto}button{margin-top:10px;padding:10px 16px;border:1px solid #7568d8;border-radius:9px;background:#29234d;color:#fff;cursor:pointer}button:disabled{opacity:.55;cursor:wait}</style><main><h1>DSH Desktop 启动失败</h1><p>主窗口没有继续加载。关闭此窗口即可结束本次隔离运行。</p><code>${escapeHtml(message)}</code>${buildControls}</main></html>`
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  process.stdout.write('DSH_DESKTOP_POC_RECOVERY_READY\n')
  if (smokeMode) setTimeout(() => { requestQuit(0) }, smokeDelay)
}

async function start(): Promise<void> {
  trace('start')
  app.setName('DSH Desktop POC')
  if (!app.requestSingleInstanceLock()) {
    app.exit(0)
    return
  }
  installQuitSources()
  installRuntimeBuildHandler()
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
  let runtime = inspectHarnessRuntime()
  if (!runtime.ready && process.env.DSH_DESKTOP_POC_AUTO_BUILD === '1' && runtime.canBuild) {
    const buildResult = await buildHarnessWorkspace(runtime.root)
    process.stdout.write(`DSH_DESKTOP_POC_BUILD_RESULT ${JSON.stringify(buildResult)}\n`)
    if (!buildResult.ok) throw new Error(buildResult.log)
    runtime = inspectHarnessRuntime(runtime.root)
  }
  if (!runtime.ready) throw new HarnessRuntimeNotReadyError(runtime)
  const [{ boot, loadLayeredEnv }, { provideCmdline }, { DSH_LAUNCH_ENVIRONMENT_KEY }] = await Promise.all([
    importHarnessPackage<typeof import('@deepseek-ai/dsh-app-boot')>('@deepseek-ai/dsh-app-boot'),
    importHarnessPackage<typeof import('@deepseek-ai/dsh-cmdline')>('@deepseek-ai/dsh-cmdline'),
    importHarnessPackage<typeof import('@deepseek-ai/dsh-launch-environment')>('@deepseek-ai/dsh-launch-environment'),
    importHarnessPackage<typeof import('@deepseek-ai/dsh-host-webserver')>('@deepseek-ai/dsh-host-webserver'),
  ])
  const dshVersion = readHarnessVersion()
  if (process.platform === 'win32') app.setAppUserModelId('local.dsh.desktop.poc')
  process.stdout.write(`DSH_DESKTOP_POC_RUNTIME ${JSON.stringify({
    desktop: '0.0.1-poc.0',
    electron: process.versions.electron,
    node: process.versions.node,
    modules: process.versions.modules,
    dsh: dshVersion,
  })}\n`)

  if (process.env.DSH_DESKTOP_POC_FORCE_BOOT_FAILURE === '1') {
    throw new Error('forced POC boot failure')
  }

  const prepared = await prepareProfile(DSH_HOME)
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
