import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { access, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const runtimeInput = process.env.DSH_DESKTOP_INSTALLER_SMOKE_RUNTIME_DIR?.trim()
if (!runtimeInput) throw new Error('DSH_DESKTOP_INSTALLER_SMOKE_RUNTIME_DIR must point to an isolated DSH checkout')

const runtimeRoot = resolve(runtimeInput)
const productName = 'DSH 客户端启动器'
const executableName = 'dsh-client-launcher'
const desktopProcessNames = [`${executableName}.exe`, 'dsh-client-launcher-preview.exe', 'desktop-shell-preview.exe']
const installDir = join(runtimeRoot, 'client-launcher')
if (dirname(installDir) !== runtimeRoot) throw new Error('installer-owned directory escaped the isolated DSH checkout')

/**
 * Run a child process and capture its text output.
 * @param {string} command executable path
 * @param {string[]} args command arguments
 * @param {NodeJS.ProcessEnv} [env] child environment
 * @returns {Promise<{stdout: string, stderr: string}>} captured output
 */
async function run(command, args, env = process.env) {
  const child = spawn(command, args, {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', chunk => { stdout += chunk.toString() })
  child.stderr.on('data', chunk => { stderr += chunk.toString() })
  const [code, signal] = await new Promise(resolveExit => child.once('exit', (...event) => resolveExit(event)))
  if (code !== 0) {
    throw new Error(`${command} exited with code ${code ?? 'null'} signal ${signal ?? 'none'}\n${stdout}\n${stderr}`)
  }
  return { stdout, stderr }
}

/**
 * Calculate the SHA-256 digest for one file.
 * @param {string} path file path
 * @returns {Promise<string>} uppercase digest
 */
async function hashFile(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex').toUpperCase()
}

/** @param {string} path candidate path */
async function exists(path) {
  try {
    await stat(path)
    return true
  } catch (cause) {
    if (cause?.code === 'ENOENT') return false
    throw cause
  }
}

/**
 * Wait for an NSIS self-removal child to delete an owned path.
 * @param {string} path path owned by the installer
 * @returns {Promise<void>} completion promise
 */
async function waitForRemoval(path) {
  const deadline = Date.now() + 10_000
  while (await exists(path)) {
    if (Date.now() >= deadline) throw new Error(`installer-owned path remains after uninstall: ${path}`)
    await new Promise(resolveDelay => setTimeout(resolveDelay, 100))
  }
}

/**
 * Reject an installer lifecycle run while any current or legacy desktop client is open.
 * @returns {Promise<void>} completion promise
 */
async function assertNoDesktopClientProcesses() {
  const running = []
  for (const name of desktopProcessNames) {
    const result = await run('tasklist.exe', ['/FI', `IMAGENAME eq ${name}`, '/FO', 'CSV', '/NH'])
    if (result.stdout.toLowerCase().includes(`"${name.toLowerCase()}"`)) running.push(name)
  }
  if (running.length > 0) {
    throw new Error(`close the running DSH desktop client before installer smoke: ${running.join(', ')}`)
  }
}

await access(join(runtimeRoot, 'package.json'))
await access(join(runtimeRoot, 'pnpm-lock.yaml'))
await assertNoDesktopClientProcesses()
if (await exists(installDir)) throw new Error(`installer-owned directory already exists: ${installDir}`)

await import('./package-installer.mjs')
const installerDir = join(root, '.artifacts', 'installer')
const installerName = (await readdir(installerDir)).find(name => name.endsWith('-setup.exe'))
if (!installerName) throw new Error('NSIS installer is missing')
const installer = join(installerDir, installerName)
const protectedFiles = [join(runtimeRoot, 'package.json'), join(runtimeRoot, 'pnpm-lock.yaml')]
const beforeHashes = await Promise.all(protectedFiles.map(hashFile))
const beforeStatus = (await run('git.exe', ['-C', runtimeRoot, 'status', '--short'])).stdout
const desktopShortcut = join(process.env.USERPROFILE ?? '', 'Desktop', `${productName}.lnk`)
const startMenuShortcut = join(process.env.APPDATA ?? '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', `${productName}.lnk`)
if (desktopShortcut.startsWith('Desktop') || startMenuShortcut.startsWith('Microsoft')) throw new Error('Windows profile paths are unavailable')
if (await exists(desktopShortcut) || await exists(startMenuShortcut)) throw new Error('shortcuts already exist before installer smoke')
const dataRoot = join(process.env.APPDATA ?? '', productName)
if (dataRoot === productName) throw new Error('APPDATA is unavailable')
await mkdir(dataRoot, { recursive: true })
const dataMarker = join(dataRoot, `.installer-smoke-${randomUUID()}`)
await writeFile(dataMarker, 'preserve\n', 'utf8')

let installed = false
try {
  await run(installer, ['/currentuser', '/S', `/D=${installDir}`])
  installed = true
  const executable = join(installDir, `${executableName}.exe`)
  await access(executable)
  const updateConfig = join(installDir, 'resources', 'app-update.yml')
  const updateConfigText = await readFile(updateConfig, 'utf8')
  if (!updateConfigText.includes('provider: github') || !updateConfigText.includes('repo: dsh-client-launcher')) {
    throw new Error('updater configuration is missing the GitHub feed')
  }
  await access(desktopShortcut)
  await access(startMenuShortcut)

  const smokeEnv = {
    ...process.env,
    DSH_DESKTOP_EXECUTABLE_NAME: executableName,
    DSH_DESKTOP_PORTABLE_DIR: installDir,
    DSH_DESKTOP_SMOKE_USE_FOLDER_LOCAL: '1',
    DSH_DISABLE_AUTO_UPDATE: '1',
  }
  delete smokeEnv.DSH_DESKTOP_SMOKE_RUNTIME_DIR
  await run(process.execPath, [join(root, 'scripts', 'portable-smoke.mjs')], smokeEnv)

  await run(installer, ['/currentuser', '/S', `/D=${installDir}`])
  await access(executable)
  await run(process.execPath, [join(root, 'scripts', 'portable-smoke.mjs')], smokeEnv)

  const uninstallerName = (await readdir(installDir)).find(name => name.startsWith('Uninstall ') && name.endsWith('.exe'))
  if (!uninstallerName) throw new Error('uninstaller is missing')
  await run(join(installDir, uninstallerName), ['/currentuser', '/S'])
  await waitForRemoval(installDir)
  await waitForRemoval(desktopShortcut)
  await waitForRemoval(startMenuShortcut)
  installed = false

  if (await exists(desktopShortcut) || await exists(startMenuShortcut)) throw new Error('shortcuts remain after uninstall')
  await access(dataMarker)
  const afterHashes = await Promise.all(protectedFiles.map(hashFile))
  if (JSON.stringify(afterHashes) !== JSON.stringify(beforeHashes)) throw new Error('DSH package or lockfile changed during installer smoke')
  const afterStatus = (await run('git.exe', ['-C', runtimeRoot, 'status', '--short'])).stdout
  if (afterStatus !== beforeStatus) throw new Error(`DSH worktree changed during installer smoke\nbefore:\n${beforeStatus}\nafter:\n${afterStatus}`)

  console.log(JSON.stringify({
    status: 'ok',
    runtimeRoot,
    installer: basename(installer),
    installerSha256: await hashFile(installer),
    autoUpdateConfigured: true,
    dataPreserved: true,
  }))
} finally {
  if (installed && await exists(installDir)) {
    const uninstallerName = (await readdir(installDir)).find(name => name.startsWith('Uninstall ') && name.endsWith('.exe'))
    if (uninstallerName) {
      console.error('installer smoke cleanup: removing installation')
      await run(join(installDir, uninstallerName), ['/currentuser', '/S'])
      await waitForRemoval(installDir)
    }
  }
  await rm(dataMarker, { force: true })
}
