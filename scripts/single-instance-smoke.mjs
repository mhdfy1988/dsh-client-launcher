import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const electron = require('electron')
const main = fileURLToPath(new URL('../lib/main.js', import.meta.url))
const env = { ...process.env, DSH_DESKTOP_POC_SINGLE_INSTANCE_EXIT_MS: '2500' }
const first = spawn(electron, [main], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
let firstOut = ''
let firstErr = ''
first.stdout.on('data', chunk => { firstOut += chunk.toString() })
first.stderr.on('data', chunk => { firstErr += chunk.toString() })
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`first instance did not become ready\n${firstOut}\n${firstErr}`)), 20_000)
  const check = () => {
    if (firstOut.includes('DSH_DESKTOP_POC_READY ')) { clearTimeout(timer); resolve() }
    else setTimeout(check, 50)
  }
  check()
})
const second = spawn(electron, [main], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
let secondOut = ''
let secondErr = ''
second.stdout.on('data', chunk => { secondOut += chunk.toString() })
second.stderr.on('data', chunk => { secondErr += chunk.toString() })
const [secondCode] = await new Promise(resolve => { second.once('exit', (...args) => resolve(args)) })
const [firstCode] = await new Promise(resolve => { first.once('exit', (...args) => resolve(args)) })
if (secondCode !== 0 || firstCode !== 0 || !firstOut.includes('DSH_DESKTOP_POC_SECOND_INSTANCE')) {
  throw new Error(`single instance smoke failed\nfirst=${firstCode}\n${firstOut}\n${firstErr}\nsecond=${secondCode}\n${secondOut}\n${secondErr}`)
}
console.log('single-instance smoke ok')
