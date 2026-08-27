import assert from 'node:assert/strict'
import test from 'node:test'
import { applyWindowControl, type WindowControlTarget } from '../window-controls.js'

function createTarget(maximized = false): WindowControlTarget & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    minimize: () => { calls.push('minimize') },
    maximize: () => { maximized = true; calls.push('maximize') },
    unmaximize: () => { maximized = false; calls.push('unmaximize') },
    isMaximized: () => maximized,
    close: () => { calls.push('close') },
  }
}

test('dispatches minimize and close commands', () => {
  const target = createTarget()
  assert.equal(applyWindowControl(target, 'minimize'), undefined)
  assert.equal(applyWindowControl(target, 'close'), undefined)
  assert.deepEqual(target.calls, ['minimize', 'close'])
})

test('toggles maximized state in both directions', () => {
  const target = createTarget()
  assert.equal(applyWindowControl(target, 'toggle-maximize'), true)
  assert.equal(applyWindowControl(target, 'toggle-maximize'), false)
  assert.deepEqual(target.calls, ['maximize', 'unmaximize'])
})

test('ignores commands outside the fixed protocol', () => {
  const target = createTarget()
  assert.equal(applyWindowControl(target, 'destroy'), undefined)
  assert.deepEqual(target.calls, [])
})
