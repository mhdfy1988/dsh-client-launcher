import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const electron = require('electron')
if (typeof electron !== 'string') throw new Error('electron package did not return an executable path')
const main = fileURLToPath(new URL('../lib/main.js', import.meta.url))
const child = spawn(electron, [main], {
  env: { ...process.env, DSH_DESKTOP_POC_STATE_SMOKE: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
})
let stdout = ''
let stderr = ''
child.stdout.on('data', chunk => { stdout += chunk.toString() })
child.stderr.on('data', chunk => { stderr += chunk.toString() })
const [result] = await once(child, 'exit')
if (result !== 0) throw new Error(`window state smoke exited ${result}\n${stdout}\n${stderr}`)
for (const marker of [
  'DSH_DESKTOP_POC_TRAY_READY',
  'DSH_DESKTOP_POC_WINDOW_HIDDEN',
  'DSH_DESKTOP_POC_WINDOW_SHOWN',
  'DSH_DESKTOP_POC_DISPOSED',
]) {
  if (!stdout.includes(marker)) throw new Error(`missing ${marker}\n${stdout}\n${stderr}`)
}
console.log('window-state smoke ok')
