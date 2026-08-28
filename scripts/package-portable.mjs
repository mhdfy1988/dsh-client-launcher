import { createRequire } from 'node:module'
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
await rm(out, { recursive: true, force: true })
await rm(shellStage, { recursive: true, force: true })
await mkdir(out, { recursive: true })
await mkdir(shellStage, { recursive: true })
await cp(join(root, 'lib'), join(shellStage, 'lib'), { recursive: true })
await cp(join(root, 'assets'), join(shellStage, 'assets'), { recursive: true })
await writeFile(join(shellStage, 'package.json'), `${JSON.stringify({
  name: packageName,
  productName,
  version: rootPackage.version,
  private: true,
  type: 'module',
  main: 'lib/main.js',
}, null, 2)}\n`, 'utf8')
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
console.log(`portable package: ${artifact}`)
