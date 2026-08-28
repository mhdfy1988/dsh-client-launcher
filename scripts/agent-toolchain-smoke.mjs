import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const runtimeRoot = process.env.DSH_DESKTOP_SMOKE_RUNTIME_DIR?.trim()
if (!runtimeRoot) throw new Error('DSH_DESKTOP_SMOKE_RUNTIME_DIR must point to an isolated built DSH checkout')

const portableDir = process.env.DSH_DESKTOP_PORTABLE_DIR
  ?? fileURLToPath(new URL('../.artifacts/portable/dsh-client-launcher-win32-x64/', import.meta.url))
const executableName = process.env.DSH_DESKTOP_EXECUTABLE_NAME ?? 'dsh-client-launcher'
const executable = join(portableDir, `${executableName}.exe`)
await access(executable)

const tempRoot = await mkdtemp(join(tmpdir(), 'dsh-desktop-toolchain-'))
const workspace = join(tempRoot, 'workspace')
const packagedDataRoot = join(tempRoot, 'desktop-data')
const screenshotPath = fileURLToPath(new URL('../.artifacts/agent-toolchain.png', import.meta.url))
const historyPath = fileURLToPath(new URL('../.artifacts/agent-toolchain-history.json', import.meta.url))
const workspaceFile = join(workspace, 'desktop-toolchain.txt')
await mkdir(workspace, { recursive: true })
await mkdir(dirname(screenshotPath), { recursive: true })

const scenario = process.env.DSH_DESKTOP_AGENT_TOOLCHAIN_SCENARIO?.trim() || 'foreground'
if (scenario !== 'foreground' && scenario !== 'background' && scenario !== 'cancel' && scenario !== 'terminal') {
  throw new Error(`unsupported DSH_DESKTOP_AGENT_TOOLCHAIN_SCENARIO: ${JSON.stringify(scenario)}`)
}
const background = scenario === 'background'
const cancellation = scenario === 'cancel'
const persistentTerminal = scenario === 'terminal'
const successMarker = background ? 'DESKTOP_BACKGROUND_DONE' : 'DESKTOP_TOOLCHAIN_DONE'
const rendererMarker = cancellation ? 'tool call aborted' : successMarker
const fileMarker = background ? 'FILE_OK|BACKGROUND_OK' : cancellation ? 'CANCEL_FAILED' : persistentTerminal ? 'FILE_OK|TERMINAL_OK' : 'FILE_OK|POWERSHELL_OK'
const command = `${background ? 'Start-Sleep -Milliseconds 750; ' : cancellation ? 'Start-Sleep -Seconds 30; ' : ''}[IO.File]::WriteAllText((Join-Path (Get-Location) 'desktop-toolchain.txt'), '${fileMarker}', (New-Object Text.UTF8Encoding $false)); Get-Content -Raw -LiteralPath 'desktop-toolchain.txt'`
const toolArguments = JSON.stringify(persistentTerminal ? { command } : {
  command,
  description: background ? '验证客户端启动器中的后台 PowerShell 作业' : cancellation ? '验证客户端启动器中的 PowerShell 取消' : '验证客户端启动器中的工作区文件写入和 PowerShell 子进程',
  timeoutMs: 20_000,
  workdir: workspace,
  ...(background ? { run_in_background: true } : {}),
})
let rendererObservation = 'not inspected'

async function freePort() {
  const server = createServer()
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(0, '127.0.0.1', resolveListen)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('free-port probe returned no TCP address')
  await new Promise(resolveClose => server.close(resolveClose))
  return address.port
}

function waitForLine(child, pattern, label, timeoutMs) {
  return new Promise((resolveLine, rejectLine) => {
    let output = ''
    const timer = setTimeout(() => {
      cleanup()
      rejectLine(new Error(`${label} did not become ready in ${timeoutMs}ms\n${output}`))
    }, timeoutMs)
    const onData = (chunk) => {
      output += chunk.toString()
      const match = pattern.exec(output)
      if (match === null) return
      cleanup()
      resolveLine({ match, output })
    }
    const onExit = (code) => {
      cleanup()
      rejectLine(new Error(`${label} exited before readiness (code ${code ?? 'null'})\n${output}`))
    }
    const cleanup = () => {
      clearTimeout(timer)
      child.stdout?.off('data', onData)
      child.stderr?.off('data', onData)
      child.off('exit', onExit)
    }
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    child.once('exit', onExit)
  })
}

async function rpc(baseUrl, method, payload) {
  const response = await fetch(`${baseUrl}/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: `desktop-smoke-${method}-${Date.now()}`,
      method,
      payload,
    }),
  })
  if (!response.ok) throw new Error(`${method} failed over HTTP ${response.status}: ${await response.text()}`)
  const body = await response.json()
  if (body?.result?.ok !== true) {
    throw new Error(`${method} failed: ${body?.result?.error?.code ?? 'UNKNOWN'}: ${body?.result?.error?.message ?? JSON.stringify(body)}`)
  }
  return body.result.value
}

async function poll(label, probe, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  let last
  while (Date.now() < deadline) {
    try {
      last = await probe()
      if (last) return last
    } catch (error) {
      last = error
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 150))
  }
  throw new Error(`${label} timed out; last observation: ${last instanceof Error ? last.message : JSON.stringify(last)}`)
}

async function connectCdp(port, origin) {
  const target = await poll('Electron CDP target', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`)
    if (!response.ok) return undefined
    const targets = await response.json()
    return targets.find(candidate => candidate.type === 'page' && candidate.url.startsWith(origin))
  }, 15_000)
  if (typeof target.webSocketDebuggerUrl !== 'string') throw new Error('Electron CDP target has no websocket URL')
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener('open', resolveOpen, { once: true })
    socket.addEventListener('error', rejectOpen, { once: true })
  })
  let nextId = 0
  const pending = new Map()
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data))
    const entry = pending.get(message.id)
    if (entry === undefined) return
    pending.delete(message.id)
    if (message.error === undefined) entry.resolve(message.result)
    else entry.reject(new Error(message.error.message))
  })
  const call = (method, params = {}) => new Promise((resolveCall, rejectCall) => {
    const id = ++nextId
    pending.set(id, { resolve: resolveCall, reject: rejectCall })
    socket.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression) => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails !== undefined) throw new Error(result.exceptionDetails.text)
    return result.result.value
  }
  return { socket, call, evaluate }
}

async function waitForExit(child, timeoutMs, label) {
  if (child.exitCode !== null) return child.exitCode
  return await new Promise((resolveExit, rejectExit) => {
    const timer = setTimeout(() => {
      rejectExit(new Error(`${label} did not exit in ${timeoutMs}ms`))
    }, timeoutMs)
    child.once('exit', (code) => {
      clearTimeout(timer)
      resolveExit(code)
    })
  })
}

async function assertPortClosed(port) {
  await poll('desktop Host port closure', async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(300) })
      await response.body?.cancel()
      return false
    } catch {
      return true
    }
  }, 10_000)
}

let mock
let desktop
let cdp
let desktopStdout = ''
let desktopStderr = ''
let mockStdout = ''
let mockStderr = ''
try {
  const mockPort = await freePort()
  const cdpPort = await freePort()
  const runtimeRequire = createRequire(join(runtimeRoot, 'package.json'))
  const tsxLoader = pathToFileURL(runtimeRequire.resolve('tsx/esm')).href
  const mockEntry = join(runtimeRoot, 'packages', 'test-support', 'llm-mock-server', 'src', 'bin.ts')
  mock = spawn(process.execPath, [
    '--import', tsxLoader,
    mockEntry,
    '--port', String(mockPort),
    '--api-key', 'desktop-smoke-key',
    '--sequence', 'tool_call_success,success',
    '--repeat-last',
    '--success-text', successMarker,
    '--tool-name', 'pwsh',
    '--tool-arguments', toolArguments,
  ], {
    cwd: runtimeRoot,
    env: { ...process.env, TSX_TSCONFIG_PATH: join(runtimeRoot, 'tsconfig.json') },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  mock.stdout.on('data', chunk => { mockStdout += chunk.toString() })
  mock.stderr.on('data', chunk => { mockStderr += chunk.toString() })
  const mockReady = await waitForLine(mock, /"type":"ready","baseURL":"([^"]+)"/u, 'official mock LLM', 20_000)
  const baseURL = mockReady.match[1]

  desktop = spawn(executable, [`--remote-debugging-port=${cdpPort}`, '--remote-allow-origins=*'], {
    cwd: portableDir,
    env: {
      ...process.env,
      DSH_DESKTOP_RUNTIME_DIR: runtimeRoot,
      DSH_DESKTOP_POC_PACKAGED_DATA_ROOT: packagedDataRoot,
      DSH_DESKTOP_POC_SMOKE_MS: '30000',
      DSH_DESKTOP_POC_FILE_TRACE: '1',
      DEEPSEEK_API_KEY: 'desktop-smoke-key',
      DEEPSEEK_BASE_URL: baseURL,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  desktop.stdout.on('data', chunk => { desktopStdout += chunk.toString() })
  desktop.stderr.on('data', chunk => { desktopStderr += chunk.toString() })
  const desktopReady = await waitForLine(desktop, /DSH_DESKTOP_POC_READY (http:\/\/127\.0\.0\.1:(\d+))/u, 'packaged desktop', 60_000)
  const origin = desktopReady.match[1]
  const hostPort = Number(desktopReady.match[2])

  const adopted = await rpc(origin, 'workspace.create', { path: workspace })
  if (typeof adopted?.workspace?.workspaceId !== 'string') {
    throw new Error(`workspace.create returned no workspace id: ${JSON.stringify(adopted)}`)
  }
  if (persistentTerminal) {
    const permission = await rpc(origin, 'settings.update', {
      ns: 'permission',
      patch: { defaultPreset: 'danger-full-access' },
    })
    if (permission?.value?.defaultPreset !== 'danger-full-access') {
      throw new Error(`settings.update did not select danger-full-access for the terminal session: ${JSON.stringify(permission)}`)
    }
  }
  const created = await rpc(origin, 'session.create', {
    workspaceId: adopted.workspace.workspaceId,
    ...(persistentTerminal ? { agentPreset: 'minimal' } : {}),
  })
  if (typeof created?.sessionId !== 'string') throw new Error(`session.create returned no session id: ${JSON.stringify(created)}`)
  if (persistentTerminal && created.agentPreset !== 'minimal') {
    throw new Error(`session.create did not select the minimal persistent-terminal preset: ${JSON.stringify(created)}`)
  }
  const title = 'Desktop toolchain smoke'
  await rpc(origin, 'session.rename', { sessionId: created.sessionId, title })
  await rpc(origin, 'session.prompt', {
    sessionId: created.sessionId,
    mode: 'queue',
    content: [{ type: 'text', text: 'Run the requested validation tool call.' }],
  })

  let history
  if (cancellation) {
    await poll('PowerShell tool call start', async () => {
      const page = await rpc(origin, 'session.history', { sessionId: created.sessionId, maxMessages: 100 })
      const text = JSON.stringify(page)
      return text.includes('tool/call') && text.includes(fileMarker)
    }, 10_000)
    await new Promise(resolveWait => setTimeout(resolveWait, 750))
    await rpc(origin, 'session.cancel', { sessionId: created.sessionId })
    history = await poll('Agent cancellation completion', async () => {
      const page = await rpc(origin, 'session.history', { sessionId: created.sessionId, maxMessages: 100 })
      return JSON.stringify(page).includes(rendererMarker) ? page : undefined
    }, 15_000)
  } else {
    history = await poll('Agent turn completion', async () => {
      const page = await rpc(origin, 'session.history', { sessionId: created.sessionId, maxMessages: 100 })
      return JSON.stringify(page).includes(successMarker) ? page : undefined
    }, 25_000)
  }
  const historyText = JSON.stringify(history)
  await writeFile(historyPath, `${JSON.stringify(history, null, 2)}\n`, 'utf8')
  if (!historyText.includes('pwsh') || !historyText.includes(fileMarker) || historyText.includes('unknown tool')) {
    throw new Error(`session history did not preserve the pwsh tool result: ${historyText}`)
  }
  if (background && !historyText.includes('started background job pwsh-')) {
    throw new Error(`background pwsh result returned no job id: ${historyText}`)
  }
  if (cancellation) {
    await new Promise(resolveWait => setTimeout(resolveWait, 1_000))
    try {
      await access(workspaceFile)
      throw new Error('cancelled PowerShell command still created its output file')
    } catch (error) {
      if (error instanceof Error && error.message === 'cancelled PowerShell command still created its output file') throw error
    }
  } else {
    const written = await poll('workspace file result', async () => {
      try {
        return await readFile(workspaceFile, 'utf8')
      } catch {
        return undefined
      }
    }, 10_000)
    if (written !== fileMarker) throw new Error(`workspace file mismatch: ${JSON.stringify(written)}`)
  }

  cdp = await connectCdp(cdpPort, origin)
  await cdp.call('Page.enable')
  await cdp.call('Page.reload', { ignoreCache: true })
  await poll('session transcript in packaged Renderer', async () => {
    const observation = await cdp.evaluate(`(() => {
      const title = ${JSON.stringify(title)}
      const marker = ${JSON.stringify(rendererMarker)}
      const workspaceName = ${JSON.stringify('workspace')}
      const clickExactText = (text) => {
        const matches = [...document.querySelectorAll('button,[role="button"],[role="treeitem"],a,div')]
          .filter(node => node.textContent?.trim() === text)
        const target = matches.find(node => node instanceof HTMLElement && node.offsetParent !== null)
        if (!(target instanceof HTMLElement)) return false
        target.click()
        return true
      }
      const clickSession = () => {
        const target = [...document.querySelectorAll('[role="treeitem"]')]
          .find(node => node.textContent?.includes(title) === true && node instanceof HTMLElement && node.offsetParent !== null)
        if (!(target instanceof HTMLElement)) return false
        target.click()
        return true
      }
      if (!document.body?.innerText.includes(marker)) {
        if (!document.body?.innerText.includes(title)) clickExactText(workspaceName)
        clickSession()
      }
      const text = document.body?.innerText ?? ''
      return {
        visible: text.includes(title) && text.includes(marker),
        hasTitle: text.includes(title),
        hasMarker: text.includes(marker),
        excerpt: text.slice(0, 2000),
      }
    })()`)
    rendererObservation = JSON.stringify(observation)
    return observation?.visible === true
  }, 15_000)
  const screenshot = await cdp.call('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'))
  cdp.socket.close()
  cdp = undefined

  const desktopCode = await waitForExit(desktop, 40_000, 'packaged desktop')
  if (desktopCode !== 0
    || !desktopStdout.includes('DSH_DESKTOP_POC_DISPOSED')
    || desktopStdout.includes('DSH_DESKTOP_POC_PTY_DRAIN_INCOMPLETE')) {
    throw new Error(`packaged desktop did not dispose cleanly (code ${desktopCode})\n${desktopStdout}\n${desktopStderr}`)
  }
  await assertPortClosed(hostPort)
  if (!mockStdout.includes('tool_call_success')) {
    throw new Error(`official mock did not report the tool-call behavior\n${mockStdout}\n${mockStderr}`)
  }
  console.log(JSON.stringify({
    status: 'ok',
    scenario,
    runtimeRoot,
    origin,
    workspaceFile,
    screenshotPath,
  }))
} catch (error) {
  const details = [
    error instanceof Error ? (error.stack ?? error.message) : String(error),
    `desktop stdout:\n${desktopStdout}`,
    `desktop stderr:\n${desktopStderr}`,
    `mock stdout:\n${mockStdout}`,
    `mock stderr:\n${mockStderr}`,
    `renderer observation:\n${rendererObservation}`,
  ].join('\n\n')
  throw new Error(details)
} finally {
  cdp?.socket.close()
  if (desktop?.exitCode === null) {
    desktop.kill()
    await waitForExit(desktop, 10_000, 'packaged desktop cleanup').catch(() => undefined)
  }
  if (mock?.exitCode === null) {
    mock.kill()
    await waitForExit(mock, 10_000, 'official mock cleanup').catch(() => undefined)
  }
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(error => {
    process.stderr.write(`agent-toolchain smoke cleanup retained ${tempRoot}: ${error instanceof Error ? error.message : String(error)}\n`)
  })
}
