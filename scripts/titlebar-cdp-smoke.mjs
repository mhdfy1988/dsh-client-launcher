import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const endpoint = process.env.DSH_DESKTOP_CDP_ENDPOINT ?? 'http://127.0.0.1:9346/json'
const screenshotPath = resolve(process.env.DSH_DESKTOP_CDP_SCREENSHOT ?? '.artifacts/titlebar-cdp.png')
const [target] = await (await fetch(endpoint)).json()
if (target?.webSocketDebuggerUrl === undefined) throw new Error(`No page target at ${endpoint}`)

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

function call(method, params = {}) {
  return new Promise((resolveCall, rejectCall) => {
    const id = ++nextId
    pending.set(id, { resolve: resolveCall, reject: rejectCall })
    socket.send(JSON.stringify({ id, method, params }))
  })
}

async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails !== undefined) throw new Error(result.exceptionDetails.text)
  return result.result.value
}

const controls = await evaluate(`(() => {
  const titleBar = document.querySelector('#dsh-desktop-titlebar')
  const runtimeLabel = document.querySelector('#dsh-desktop-runtime-label')
  const buttons = [...document.querySelectorAll('.dsh-desktop-window-button')]
  if (!(titleBar instanceof HTMLElement)) return null
  const style = getComputedStyle(titleBar)
  return {
    buttonIds: buttons.map(button => button.id),
    background: style.backgroundColor,
    foreground: style.color,
    height: titleBar.getBoundingClientRect().height,
    runtimeLabel: runtimeLabel?.textContent,
    runtimePath: runtimeLabel?.getAttribute('title'),
  }
})()`)
if (controls === null || controls.height !== 36 || controls.buttonIds.length !== 3
  || !controls.runtimeLabel?.startsWith('当前客户端：') || controls.runtimePath === '') {
  throw new Error(`Invalid desktop controls: ${JSON.stringify(controls)}`)
}

const beforeToggle = await evaluate(`({
  state: document.querySelector('#dsh-desktop-window-maximize')?.dataset.maximized,
  outerWidth: window.outerWidth,
  outerHeight: window.outerHeight,
  screenX: window.screenX,
  screenY: window.screenY,
  availableWidth: screen.availWidth,
  availableHeight: screen.availHeight,
})`)
await evaluate(`document.querySelector('#dsh-desktop-window-maximize')?.click()`)
await new Promise(resolveWait => setTimeout(resolveWait, 500))
const afterToggle = await evaluate(`({
  state: document.querySelector('#dsh-desktop-window-maximize')?.dataset.maximized,
  outerWidth: window.outerWidth,
  outerHeight: window.outerHeight,
  screenX: window.screenX,
  screenY: window.screenY,
})`)
const expectedAfterToggle = beforeToggle.state === 'true' ? 'false' : 'true'
if (afterToggle.state !== expectedAfterToggle) {
  throw new Error(`Maximize state did not toggle: ${JSON.stringify({ beforeToggle, afterToggle })}`)
}
await evaluate(`document.querySelector('#dsh-desktop-window-maximize')?.click()`)
await new Promise(resolveWait => setTimeout(resolveWait, 500))
const restored = await evaluate(`document.querySelector('#dsh-desktop-window-maximize')?.dataset.maximized`)
if (restored !== beforeToggle.state) throw new Error(`Original state was not restored: ${JSON.stringify({ beforeToggle, afterToggle, restored })}`)

await call('Page.enable')
const screenshot = await call('Page.captureScreenshot', { format: 'png', fromSurface: true })
await mkdir(dirname(screenshotPath), { recursive: true })
await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'))
socket.close()
console.log(JSON.stringify({ controls, beforeToggle, afterToggle, restored, screenshotPath }))
