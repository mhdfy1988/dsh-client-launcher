import { app } from 'electron'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

async function runPowerShell() {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "[Console]::Write('DSH_POWERSHELL_OK')",
    ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.once('error', reject)
    child.once('exit', code => {
      if (code !== 0 || stdout !== 'DSH_POWERSHELL_OK') {
        reject(new Error(`PowerShell smoke failed: code=${String(code)} stdout=${stdout} stderr=${stderr}`))
        return
      }
      resolve()
    })
  })
}

async function runPty() {
  const pty = require('node-pty')
  return new Promise((resolve, reject) => {
    const terminal = pty.spawn('powershell.exe', [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "[Console]::Write('DSH_PTY_OK')",
    ], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: process.cwd(),
      env: process.env,
    })
    let output = ''
    const timeout = setTimeout(() => {
      terminal.kill()
      reject(new Error(`node-pty smoke timed out: ${output}`))
    }, 10_000)
    terminal.onData(data => { output += data })
    terminal.onExit(({ exitCode }) => {
      clearTimeout(timeout)
      if (exitCode !== 0 || !output.includes('DSH_PTY_OK')) {
        reject(new Error(`node-pty smoke failed: code=${String(exitCode)} output=${output}`))
        return
      }
      resolve()
    })
  })
}

async function start() {
  await app.whenReady()
  const koffi = require('koffi')
  const kernel32 = koffi.load('kernel32.dll')
  const getCurrentProcessId = kernel32.func('uint32 __stdcall GetCurrentProcessId()')
  if (getCurrentProcessId() !== process.pid) throw new Error('koffi returned the wrong process id')
  await runPowerShell()
  await runPty()
  process.stdout.write(`DSH_DESKTOP_POC_ABI_OK ${JSON.stringify({
    electron: process.versions.electron,
    node: process.versions.node,
    modules: process.versions.modules,
    platform: process.platform,
    arch: process.arch,
  })}\n`)
  app.exit(0)
}

void start().catch((cause) => {
  process.stderr.write(`${cause instanceof Error ? cause.stack ?? cause.message : String(cause)}\n`)
  app.exit(1)
})
