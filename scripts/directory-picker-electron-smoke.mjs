import { spawn } from 'node:child_process'
import { accessSync, appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app, dialog } from 'electron'
import { installElectronNodeChildCompatibility } from '../lib/electron-node-child.js'

const runtimeRoot = process.env.DSH_DESKTOP_SMOKE_RUNTIME_DIR
const selectionPath = process.env.DSH_DESKTOP_PICKER_SMOKE_SELECT_PATH?.trim() || undefined
const resultFile = process.env.DSH_DESKTOP_PICKER_SMOKE_RESULT_FILE
const report = (message) => {
  if (resultFile !== undefined && resultFile !== '') appendFileSync(resultFile, `${message}\n`, 'utf8')
  else process.stdout.write(`${message}\n`)
}
if (runtimeRoot === undefined || runtimeRoot.trim() === '') {
  throw new Error('DSH_DESKTOP_SMOKE_RUNTIME_DIR must point to an isolated built DSH checkout')
}

const worker = join(runtimeRoot, 'packages', 'host', 'directory-picker-native', 'lib', 'worker.cjs')
accessSync(worker)
const smokeUserData = join(process.cwd(), '.artifacts', 'picker-smoke-electron-user-data')
mkdirSync(smokeUserData, { recursive: true })
app.setPath('userData', smokeUserData)
report('picker smoke waiting for Electron ready')
void app.whenReady().then(() => {
report('picker smoke Electron ready')
const disposeCompatibility = installElectronNodeChildCompatibility(async title => {
  const result = await dialog.showOpenDialog({
    title,
    ...(selectionPath === undefined ? {} : { defaultPath: selectionPath }),
    properties: ['openDirectory'],
  })
  return result.canceled ? null : (result.filePaths[0] ?? null)
})
report(`picker smoke parent ${JSON.stringify({ execPath: process.execPath, worker, selectionPath })}`)
const child = spawn(process.execPath, [worker], {
  env: { ...process.env, DSH_DIALOG_TITLE: 'DSH Desktop picker smoke' },
  stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  windowsHide: true,
})

const escapedTitle = 'DSH Desktop picker smoke'.replaceAll("'", "''")
const buttonName = selectionPath === undefined ? '取消' : '选择文件夹'
const englishButtonName = selectionPath === undefined ? 'Cancel' : 'Select Folder'
const automation = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class DshDesktopPickerAutomation {
  [DllImport("user32.dll")]
  public static extern IntPtr SendMessage(IntPtr hWnd, uint message, IntPtr wParam, IntPtr lParam);
}
'@
$root = [System.Windows.Automation.AutomationElement]::RootElement
$titleCondition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, '${escapedTitle}')
$deadline = [DateTime]::UtcNow.AddSeconds(5)
while ([DateTime]::UtcNow -lt $deadline) {
  $window = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $titleCondition)
  if ($null -ne $window) {
    $buttonZh = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, '${buttonName}')
    $buttonEn = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, '${englishButtonName}')
    $buttonCondition = New-Object System.Windows.Automation.OrCondition($buttonZh, $buttonEn)
    $button = $window.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $buttonCondition)
    if ($null -eq $button) { exit 4 }
    $buttonHandle = [IntPtr]$button.Current.NativeWindowHandle
    if ($buttonHandle -eq [IntPtr]::Zero) { exit 8 }
    [void][DshDesktopPickerAutomation]::SendMessage($buttonHandle, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero)
    exit 0
  }
  Start-Sleep -Milliseconds 100
}
exit 2
`
const automationChild = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', automation], {
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
})
let automationStderr = ''
automationChild.stderr?.on('data', chunk => { automationStderr += chunk.toString() })
automationChild.once('exit', code => {
  report(`picker smoke automation exited ${code ?? 'null'}`)
  if (automationStderr !== '') report(`picker smoke automation stderr ${JSON.stringify(automationStderr)}`)
})

let completed = false
let stderr = ''
child.stderr?.on('data', chunk => { stderr += chunk.toString() })
child.once('error', error => { process.stderr.write(`picker smoke child error: ${error.stack ?? error.message}\n`) })
const timeout = setTimeout(() => {
  process.stderr.write(`picker smoke timeout\n${stderr}`)
  child.kill()
  disposeCompatibility()
  app.exit(1)
}, 10_000)
child.on('message', (message) => {
  report(`picker smoke message ${JSON.stringify(message)}`)
  if (typeof message !== 'object' || message === null || message.kind !== 'done') return
  completed = selectionPath === undefined ? message.path === null : message.path === selectionPath
})

child.once('exit', (code, signal) => {
  clearTimeout(timeout)
  disposeCompatibility()
  if (completed) {
    report('DSH_DESKTOP_PICKER_WORKER_READY')
    app.exit(0)
    return
  }
  process.stderr.write(`directory picker did not report the expected result; exit=${code ?? 'null'} signal=${signal ?? 'null'}\n${stderr}`)
  app.exit(1)
})
}).catch(error => {
  report(`picker smoke startup error ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`)
  app.exit(1)
})
