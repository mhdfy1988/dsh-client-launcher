import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { packager } = require('@electron/packager')

const root = fileURLToPath(new URL('..', import.meta.url))
const out = process.env.DSH_DESKTOP_PACKAGE_OUT ?? fileURLToPath(new URL('../.artifacts/portable/', import.meta.url))
const shellStage = process.env.DSH_DESKTOP_SHELL_STAGE ?? fileURLToPath(new URL('../.artifacts/shell-stage/', import.meta.url))
const rootPackage = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const packageName = process.env.DSH_DESKTOP_PACKAGE_NAME ?? rootPackage.name
const productName = process.env.DSH_DESKTOP_PRODUCT_NAME ?? packageName
const executableName = process.env.DSH_DESKTOP_EXECUTABLE_NAME ?? 'dsh-client-launcher'
const updaterVersion = rootPackage.dependencies?.['electron-updater']
if (typeof updaterVersion !== 'string' || updaterVersion === '') throw new Error('electron-updater must be a runtime dependency')
const pnpmCli = process.env.npm_execpath
if (!pnpmCli) throw new Error('package:portable must run through pnpm so the production dependency closure can be deployed')

/**
 * Run one packaging command and fail with its exit code.
 * @param {string} command executable path
 * @param {string[]} args command arguments
 * @param {NodeJS.ProcessEnv} [env] child environment
 * @returns {Promise<void>} completion promise
 */
async function run(command, args, env = process.env) {
  const child = spawn(command, args, {
    cwd: root,
    env,
    stdio: 'inherit',
    windowsHide: true,
  })
  const [code, signal] = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (...event) => resolve(event))
  })
  if (code !== 0) throw new Error(`${command} exited with code ${code ?? 'null'} signal ${signal ?? 'none'}`)
}

await rm(out, { recursive: true, force: true })
await rm(shellStage, { recursive: true, force: true })
await mkdir(out, { recursive: true })
await mkdir(shellStage, { recursive: true })
await writeFile(join(shellStage, 'package.json'), `${JSON.stringify({
  name: packageName,
  productName,
  version: rootPackage.version,
  private: true,
  type: 'module',
  main: 'lib/main.js',
  dependencies: {
    'electron-updater': updaterVersion,
  },
}, null, 2)}\n`, 'utf8')
await run(process.execPath, [
  pnpmCli,
  'install',
  '--prod',
  '--prefer-offline',
  '--ignore-scripts',
  '--ignore-workspace',
  '--no-lockfile',
  '--config.node-linker=hoisted',
  '--dir',
  shellStage,
])
for (const metadata of ['.bin', '.modules.yaml', '.pnpm', '.pnpm-workspace-state-v1.json']) {
  await rm(join(shellStage, 'node_modules', metadata), { recursive: true, force: true })
}
await cp(join(root, 'lib'), join(shellStage, 'lib'), { recursive: true })
await cp(join(root, 'assets'), join(shellStage, 'assets'), { recursive: true })
const [artifact] = await packager({
  dir: shellStage,
  out: out,
  name: executableName,
  platform: 'win32',
  arch: 'x64',
  electronVersion: '43.4.0',
  asar: true,
  icon: join(root, 'assets', 'dsh-desktop-icon.ico'),
  overwrite: true,
  prune: false,
  win32metadata: {
    CompanyName: 'DSH Community',
    FileDescription: productName,
    InternalName: 'dsh-client-launcher',
    OriginalFilename: `${executableName}.exe`,
    ProductName: productName,
  },
})
await run(join(root, 'node_modules', 'electron', 'dist', 'electron.exe'), [
  join(root, 'scripts', 'packaged-updater-smoke.cjs'),
  join(artifact, 'resources', 'app.asar', 'lib', 'auto-update.js'),
])
console.log(`portable package: ${artifact}`)
