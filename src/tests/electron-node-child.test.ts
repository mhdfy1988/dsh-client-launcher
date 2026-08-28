import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { spawn } from 'node:child_process'
import type { IPty, IPtyForkOptions } from 'node-pty'
import {
  createElectronNodeChildSpawn,
  createElectronNodePtySpawn,
  installElectronNodePtyCompatibility,
  isDirectoryPickerWorker,
  isWindowsAclSandboxRunner,
  type NodePtyModule,
} from '../electron-node-child.js'

const electron = 'D:\\apps\\dsh-desktop-shell.exe'
const workspaceWorker = 'D:\\dsh\\packages\\host\\directory-picker-native\\lib\\worker.cjs'
const installedWorker = 'D:\\dsh\\profiles\\web\\node_modules\\@deepseek-ai\\dsh-host-directory-picker-native\\lib\\worker.cjs'
const workspaceAclRunner = 'D:\\dsh\\packages\\sandbox\\sandbox-windows-acl\\lib\\runner.js'
const installedAclRunner = 'D:\\dsh\\profiles\\web\\node_modules\\@deepseek-ai\\dsh-sandbox-windows-acl\\lib\\runner.js'

test('only matches the DSH native directory-picker worker', () => {
  assert.equal(isDirectoryPickerWorker(electron, [workspaceWorker], electron), true)
  assert.equal(isDirectoryPickerWorker(electron, [installedWorker], electron), true)
  assert.equal(isDirectoryPickerWorker('node.exe', [workspaceWorker], electron), false)
  assert.equal(isDirectoryPickerWorker(electron, ['D:\\other\\lib\\worker.cjs'], electron), false)
  assert.equal(isDirectoryPickerWorker(electron, [workspaceWorker, '--extra'], electron), false)
})

test('only matches the DSH Windows ACL sandbox runner', () => {
  assert.equal(isWindowsAclSandboxRunner(electron, [workspaceAclRunner, '--workspace', 'D:\\work'], electron), true)
  assert.equal(isWindowsAclSandboxRunner(electron, [installedAclRunner, '--mode', 'workspace-write'], electron), true)
  assert.equal(isWindowsAclSandboxRunner(electron, ['--import', 'tsx/esm', 'D:\\dsh\\packages\\sandbox\\sandbox-windows-acl\\src\\runner.ts'], electron), true)
  assert.equal(isWindowsAclSandboxRunner('node.exe', [workspaceAclRunner], electron), false)
  assert.equal(isWindowsAclSandboxRunner(electron, ['D:\\other\\lib\\runner.js'], electron), false)
  assert.equal(isWindowsAclSandboxRunner(electron, ['--import', 'tsx/esm', 'D:\\other\\src\\runner.ts'], electron), false)
})

test('uses an Electron directory chooser only for the picker worker', async () => {
  const calls: Array<{ command: string, args?: readonly string[], env?: NodeJS.ProcessEnv }> = []
  const picks: string[] = []
  const original = ((command: string, args?: readonly string[], options?: { env?: NodeJS.ProcessEnv }) => {
    calls.push({ command, ...(args === undefined ? {} : { args }), ...(options?.env === undefined ? {} : { env: options.env }) })
    return { marker: 'child' }
  }) as unknown as typeof spawn
  const adapted = createElectronNodeChildSpawn(original, electron, async title => {
    picks.push(title)
    return 'D:\\selected'
  })

  const picker = adapted(electron, [workspaceWorker], { env: { DSH_DIALOG_TITLE: 'Select Workspace Directory' } })
  adapted(electron, ['D:\\other\\task.js'], { env: { EXISTING: 'plain' } })
  adapted(electron, [workspaceAclRunner, '--workspace', 'D:\\work'], { env: { EXISTING: 'runner' } })
  const message = await new Promise<unknown>(resolve => { picker.on('message', resolve) })

  assert.deepEqual(picks, ['Select Workspace Directory'])
  assert.deepEqual(message, { kind: 'done', path: 'D:\\selected' })
  assert.equal(calls[0]?.env?.EXISTING, 'plain')
  assert.deepEqual(calls[0]?.args, ['D:\\other\\task.js'])
  assert.equal(calls[0]?.env?.ELECTRON_RUN_AS_NODE, undefined)
  assert.equal(calls[1]?.env?.EXISTING, 'runner')
  assert.equal(calls[1]?.env?.ELECTRON_RUN_AS_NODE, '1')
  assert.deepEqual(calls[1]?.args, [workspaceAclRunner, '--workspace', 'D:\\work'])
  assert.equal(process.env.ELECTRON_RUN_AS_NODE, undefined)
})

test('enables Electron Node mode only for a node-pty Windows ACL runner', () => {
  const calls: Array<{ file: string, args: string[] | string, options: IPtyForkOptions }> = []
  const original = ((file: string, args: string[] | string, options: IPtyForkOptions) => {
    calls.push({ file, args, options })
    return { marker: 'pty' } as unknown as IPty
  })
  const adapted = createElectronNodePtySpawn(original, electron)

  adapted('pwsh.exe', ['-NoProfile'], { env: { EXISTING: 'plain' } })
  adapted(electron, [workspaceAclRunner, '--workspace', 'D:\\work'], { env: { EXISTING: 'runner' } })
  adapted(electron, 'D:\\other\\task.js', { env: { EXISTING: 'command-line' } })

  assert.equal(calls[0]?.options.env?.EXISTING, 'plain')
  assert.equal(calls[0]?.options.env?.ELECTRON_RUN_AS_NODE, undefined)
  assert.equal(calls[1]?.options.env?.EXISTING, 'runner')
  assert.equal(calls[1]?.options.env?.ELECTRON_RUN_AS_NODE, '1')
  assert.equal(calls[2]?.options.env?.EXISTING, 'command-line')
  assert.equal(calls[2]?.options.env?.ELECTRON_RUN_AS_NODE, undefined)
  assert.equal(process.env.ELECTRON_RUN_AS_NODE, undefined)
})

test('asks tracked node-pty shells to exit before restoring the runtime module', async () => {
  const writes: string[] = []
  let exitListener: ((event: { exitCode: number; signal?: number }) => void) | undefined
  let listenerDisposed = false
  const terminal = {
    onExit(listener: (event: { exitCode: number; signal?: number }) => void) {
      exitListener = listener
      return { dispose: () => { listenerDisposed = true } }
    },
    write(data: string) {
      writes.push(data)
      queueMicrotask(() => { exitListener?.({ exitCode: 0, signal: 0 }) })
    },
  } as unknown as IPty
  const originalSpawn: NodePtyModule['spawn'] = () => terminal
  const nodePty = { spawn: originalSpawn }
  const compatibility = installElectronNodePtyCompatibility(nodePty)

  nodePty.spawn('pwsh.exe', ['-NoProfile'], { env: {} })
  assert.equal(await compatibility.prepareForShutdown(100), 0)
  assert.deepEqual(writes, ['exit\r'])
  assert.equal(listenerDisposed, true)

  compatibility.dispose()
  assert.equal(nodePty.spawn, originalSpawn)
})

test('reports a node-pty shell that does not exit during the bounded drain', async () => {
  let listenerDisposed = false
  const terminal = {
    onExit() { return { dispose: () => { listenerDisposed = true } } },
    write() {},
  } as unknown as IPty
  const originalSpawn: NodePtyModule['spawn'] = () => terminal
  const nodePty = { spawn: originalSpawn }
  const compatibility = installElectronNodePtyCompatibility(nodePty)

  nodePty.spawn('pwsh.exe', [], { env: {} })
  assert.equal(await compatibility.prepareForShutdown(1), 1)

  compatibility.dispose()
  assert.equal(listenerDisposed, true)
})
