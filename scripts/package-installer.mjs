import { spawn } from 'node:child_process'
import { access, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const portableRoot = join(root, '.artifacts', 'portable-release')
const portableDir = join(portableRoot, 'dsh-client-launcher-win32-x64')
const installerOut = join(root, '.artifacts', 'installer')
const builderCli = join(root, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js')
const typeScriptCli = join(root, 'node_modules', 'typescript', 'bin', 'tsc')

/**
 * Run one repository command and fail with its exit code.
 * @param {string} command executable name
 * @param {string[]} args command arguments
 * @returns {Promise<void>} completion promise
 */
async function run(command, args) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
  })
  const [code, signal] = await new Promise(resolve => child.once('exit', (...event) => resolve(event)))
  if (code !== 0) throw new Error(`${command} exited with code ${code ?? 'null'} signal ${signal ?? 'none'}`)
}

await rm(installerOut, { recursive: true, force: true })
await mkdir(installerOut, { recursive: true })
await run(process.execPath, [join(root, 'scripts', 'generate-icons.mjs')])
await run(process.execPath, [join(root, 'scripts', 'clean.mjs')])
await run(process.execPath, [typeScriptCli, '-p', join(root, 'tsconfig.json')])
process.env.DSH_DESKTOP_PACKAGE_OUT = portableRoot
process.env.DSH_DESKTOP_SHELL_STAGE = join(root, '.artifacts', 'shell-stage-release')
process.env.DSH_DESKTOP_PACKAGE_NAME = 'dsh-client-launcher'
process.env.DSH_DESKTOP_PRODUCT_NAME = 'DSH 客户端启动器'
process.env.DSH_DESKTOP_EXECUTABLE_NAME = 'dsh-client-launcher'
await import('./package-portable.mjs')
await writeFile(
  join(portableDir, 'resources', 'app-update.yml'),
  [
    'provider: github',
    'owner: mhdfy1988',
    'repo: dsh-client-launcher',
    'releaseType: release',
    'updaterCacheDirName: dsh-desktop-shell-updater',
    '',
  ].join('\n'),
  'utf8',
)
await access(join(portableDir, 'dsh-client-launcher.exe'))
await access(join(portableDir, 'resources', 'app-update.yml'))
await access(builderCli)
await run(process.execPath, [
  builderCli,
  '--prepackaged',
  portableDir,
  '--win',
  'nsis',
  '--x64',
  '--config',
  'installer/electron-builder.yml',
  '--publish',
  'never',
])

console.log(`installer directory: ${installerOut}`)
