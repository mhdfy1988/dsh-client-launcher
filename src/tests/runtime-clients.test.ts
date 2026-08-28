import assert from 'node:assert/strict'
import test from 'node:test'
import { createEmptyRuntimeClientRegistry, parseRuntimeClientRegistry } from '../runtime-clients.js'
import { resolveRuntimeHomeMode } from '../runtime-home.js'

test('packaged release uses Harness home while source and smoke stay isolated', () => {
  assert.equal(resolveRuntimeHomeMode(true, false), 'harness-default')
  assert.equal(resolveRuntimeHomeMode(true, true), 'poc-isolated')
  assert.equal(resolveRuntimeHomeMode(false, false), 'poc-isolated')
})

test('empty launcher registry represents first launch', () => {
  assert.deepEqual(createEmptyRuntimeClientRegistry(), { version: 1, clients: [] })
})

test('launcher registry validates the active client relationship', () => {
  const registry = parseRuntimeClientRegistry({
    version: 1,
    activeId: 'stable',
    clients: [{ id: 'stable', name: 'Stable DSH', root: 'D:\\dsh' }],
  })
  assert.equal(registry.activeId, 'stable')
  assert.throws(() => parseRuntimeClientRegistry({
    version: 1,
    activeId: 'missing',
    clients: [],
  }), /默认 DSH 客户端不存在/)
})

test('launcher registry rejects malformed durable data', () => {
  assert.throws(() => parseRuntimeClientRegistry({ version: 2, clients: [] }), /版本不受支持/)
  assert.throws(() => parseRuntimeClientRegistry({ version: 1, clients: [{ id: '', name: 'DSH', root: 'D:\\dsh' }] }), /缺少 ID/)
  assert.throws(() => parseRuntimeClientRegistry({
    version: 1,
    clients: [
      { id: 'same', name: 'One', root: 'D:\\one' },
      { id: 'same', name: 'Two', root: 'D:\\two' },
    ],
  }), /重复 ID/)
})
