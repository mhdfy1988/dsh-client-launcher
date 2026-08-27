import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const electron = require('electron')
if (typeof electron !== 'string') throw new Error('electron package did not return an executable path')
const main = fileURLToPath(new URL('../lib/main.js', import.meta.url))

const result = await new Promise((resolve, reject) => {
  const child = spawn(electron, [main], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      DSH_DESKTOP_POC_FORCE_BOOT_FAILURE: '1',
      DSH_DESKTOP_POC_SMOKE_MS: '50',
    },
    windowsHide: true,
  })
  let stdout = ''
  let stderr = ''
  const timeout = setTimeout(() => {
    child.kill()
    reject(new Error(`recovery smoke timed out\n${stdout}\n${stderr}`))
  }, 15_000)
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', chunk => { stdout += chunk })
  child.stderr.on('data', chunk => { stderr += chunk })
  child.once('error', reject)
  child.once('exit', code => {
    clearTimeout(timeout)
    resolve({ code, stdout, stderr })
  })
})

if (result.code !== 0) throw new Error(`recovery smoke exited ${String(result.code)}\n${result.stdout}\n${result.stderr}`)
if (!result.stdout.includes('DSH_DESKTOP_POC_RECOVERY_READY')) throw new Error(`recovery page did not become ready\n${result.stdout}\n${result.stderr}`)
if (result.stdout.includes('DSH_DESKTOP_POC_READY ')) throw new Error('failed Host exposed the main ready state')
if (!result.stdout.includes('DSH_DESKTOP_POC_DISPOSED')) throw new Error('recovery exit did not complete disposal')
process.stdout.write('recovery smoke ok\n')
