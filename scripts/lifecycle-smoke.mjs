import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const electron = require('electron')
if (typeof electron !== 'string') throw new Error('electron package did not return an executable path')

const main = fileURLToPath(new URL('../lib/main.js', import.meta.url))
await access(main)
const iterations = Number.parseInt(process.env.DSH_DESKTOP_POC_ITERATIONS ?? '20', 10)
if (!Number.isSafeInteger(iterations) || iterations < 1) throw new Error('invalid smoke iteration count')

async function runOnce(index) {
  return new Promise((resolve, reject) => {
    const child = spawn(electron, [main], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        DSH_DESKTOP_POC_SMOKE_MS: '50',
        DSH_DESKTOP_POC_RUN_ID: String(index),
      },
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error(`iteration ${index} timed out\n${stdout}\n${stderr}`))
    }, 30_000)
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.once('error', (cause) => {
      clearTimeout(timeout)
      reject(cause)
    })
    child.once('exit', async (code) => {
      clearTimeout(timeout)
      try {
        assertSuccessfulRun(index, code, stdout, stderr)
        const match = /DSH_DESKTOP_POC_READY (http:\/\/127\.0\.0\.1:\d+)/u.exec(stdout)
        await assertPortClosed(match?.[1])
        resolve(stdout)
      } catch (cause) {
        reject(cause)
      }
    })
  })
}

function assertSuccessfulRun(index, code, stdout, stderr) {
  if (code !== 0) throw new Error(`iteration ${index} exited ${String(code)}\n${stdout}\n${stderr}`)
  if (!stdout.includes('DSH_DESKTOP_POC_READY ')) throw new Error(`iteration ${index} never became ready\n${stdout}\n${stderr}`)
  if (!stdout.includes('DSH_DESKTOP_POC_RENDERER_READY ')) throw new Error(`iteration ${index} renderer did not become ready\n${stdout}\n${stderr}`)
  if (!stdout.includes('DSH_DESKTOP_POC_PLUGIN_MOUNTED')) throw new Error(`iteration ${index} did not mount the Desktop plugin\n${stdout}\n${stderr}`)
  if (!stdout.includes('DSH_DESKTOP_POC_PLUGIN_UNMOUNTED')) throw new Error(`iteration ${index} did not unmount the Desktop plugin\n${stdout}\n${stderr}`)
  if (!stdout.includes('DSH_DESKTOP_POC_DISPOSED')) throw new Error(`iteration ${index} did not report disposal\n${stdout}\n${stderr}`)
}

async function assertPortClosed(origin) {
  if (origin === undefined) throw new Error('ready output did not contain an origin')
  try {
    await fetch(origin, { signal: AbortSignal.timeout(1_000) })
  } catch {
    return
  }
  throw new Error(`disposed Host remains reachable at ${origin}`)
}


for (let index = 1; index <= iterations; index += 1) {
  const stdout = await runOnce(index)
  if (index === 1) {
    const runtime = /^DSH_DESKTOP_POC_RUNTIME .+$/mu.exec(stdout)?.[0]
    if (runtime === undefined) throw new Error('Electron runtime baseline was not reported')
    process.stdout.write(`${runtime}\n`)
    const renderer = /^DSH_DESKTOP_POC_RENDERER_READY .+$/mu.exec(stdout)?.[0]
    if (renderer === undefined) throw new Error('Renderer baseline was not reported')
    process.stdout.write(`${renderer}\n`)
  }
  process.stdout.write(`lifecycle ${index}/${iterations} ok\n`)
}
