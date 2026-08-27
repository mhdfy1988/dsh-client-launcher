import { spawn } from 'node:child_process'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const portableDir = process.env.DSH_DESKTOP_PORTABLE_DIR ?? fileURLToPath(new URL('../.artifacts/portable/dsh-desktop-shell-win32-x64/', import.meta.url))
const executable = join(portableDir, 'dsh-desktop-shell.exe')
await access(executable)
const packagedDataRoot = await mkdtemp(join(tmpdir(), 'dsh-desktop-smoke-'))
const runtimeRoot = process.env.DSH_DESKTOP_SMOKE_RUNTIME_DIR
const useFolderLocalRuntime = process.env.DSH_DESKTOP_SMOKE_USE_FOLDER_LOCAL === '1'
if (!useFolderLocalRuntime && (runtimeRoot === undefined || runtimeRoot.trim() === '')) {
  throw new Error('DSH_DESKTOP_SMOKE_RUNTIME_DIR must point to an isolated DSH checkout')
}
const childEnv = {
  ...process.env,
  DSH_DESKTOP_POC_AUTO_BUILD: process.env.DSH_DESKTOP_SMOKE_AUTO_BUILD ?? '0',
  DSH_DESKTOP_POC_SMOKE_MS: '100',
  DSH_DESKTOP_POC_FILE_TRACE: '1',
  DSH_DESKTOP_POC_PACKAGED_DATA_ROOT: packagedDataRoot,
}
delete childEnv.DSH_DESKTOP_RUNTIME_DIR
if (runtimeRoot !== undefined && !useFolderLocalRuntime) childEnv.DSH_DESKTOP_RUNTIME_DIR = runtimeRoot
try {
  const child = spawn(executable, [], {
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', chunk => { stdout += chunk.toString() })
  child.stderr.on('data', chunk => { stderr += chunk.toString() })
  const timeoutMs = process.env.DSH_DESKTOP_SMOKE_AUTO_BUILD === '1' ? 15 * 60_000 : 30_000
  let timedOut = false
  const timeout = setTimeout(() => { timedOut = true; child.kill() }, timeoutMs)
  const [code] = await new Promise(resolve => { child.once('exit', (...args) => resolve(args)) })
  clearTimeout(timeout)
  if (timedOut) throw new Error(`portable smoke timed out\n${stdout}\n${stderr}`)
  if (code !== 0 || !stdout.includes('DSH_DESKTOP_POC_READY ') || !stdout.includes('DSH_DESKTOP_POC_THEME ') || !stdout.includes('DSH_DESKTOP_POC_DISPOSED')) {
    throw new Error(`portable smoke failed code=${code}\n${stdout}\n${stderr}`)
  }
} finally {
  await rm(packagedDataRoot, { recursive: true, force: true })
}
console.log('portable smoke ok')
