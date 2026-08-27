import { createRequire } from 'node:module'
import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { packager } = require('@electron/packager')

const root = fileURLToPath(new URL('..', import.meta.url))
const out = process.env.DSH_DESKTOP_PACKAGE_OUT ?? fileURLToPath(new URL('../.artifacts/portable/', import.meta.url))
const shellStage = process.env.DSH_DESKTOP_SHELL_STAGE ?? fileURLToPath(new URL('../.artifacts/shell-stage/', import.meta.url))
await rm(out, { recursive: true, force: true })
await rm(shellStage, { recursive: true, force: true })
await mkdir(out, { recursive: true })
await mkdir(shellStage, { recursive: true })
await cp(join(root, 'lib'), join(shellStage, 'lib'), { recursive: true })
await cp(join(root, 'assets'), join(shellStage, 'assets'), { recursive: true })
await writeFile(join(shellStage, 'package.json'), `${JSON.stringify({
  name: 'dsh-desktop-shell',
  version: '0.0.1-poc.0',
  private: true,
  type: 'module',
  main: 'lib/main.js',
}, null, 2)}\n`, 'utf8')
const [artifact] = await packager({
  dir: shellStage,
  out: out,
  name: 'dsh-desktop-shell',
  platform: 'win32',
  arch: 'x64',
  electronVersion: '43.4.0',
  asar: true,
  icon: join(root, 'assets', 'dsh-desktop-icon.ico'),
  overwrite: true,
  prune: false,
})
console.log(`portable package: ${artifact}`)
