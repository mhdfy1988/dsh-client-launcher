import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { spawn } from 'node:child_process'
import { createElectronNodeChildSpawn, isDirectoryPickerWorker } from '../electron-node-child.js'

const electron = 'D:\\apps\\dsh-desktop-shell.exe'
const workspaceWorker = 'D:\\dsh\\packages\\host\\directory-picker-native\\lib\\worker.cjs'
const installedWorker = 'D:\\dsh\\profiles\\web\\node_modules\\@deepseek-ai\\dsh-host-directory-picker-native\\lib\\worker.cjs'

test('only matches the DSH native directory-picker worker', () => {
  assert.equal(isDirectoryPickerWorker(electron, [workspaceWorker], electron), true)
  assert.equal(isDirectoryPickerWorker(electron, [installedWorker], electron), true)
  assert.equal(isDirectoryPickerWorker('node.exe', [workspaceWorker], electron), false)
  assert.equal(isDirectoryPickerWorker(electron, ['D:\\other\\lib\\worker.cjs'], electron), false)
  assert.equal(isDirectoryPickerWorker(electron, [workspaceWorker, '--extra'], electron), false)
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
  const message = await new Promise<unknown>(resolve => { picker.on('message', resolve) })

  assert.deepEqual(picks, ['Select Workspace Directory'])
  assert.deepEqual(message, { kind: 'done', path: 'D:\\selected' })
  assert.equal(calls[0]?.env?.EXISTING, 'plain')
  assert.deepEqual(calls[0]?.args, ['D:\\other\\task.js'])
  assert.equal(process.env.ELECTRON_RUN_AS_NODE, undefined)
})
