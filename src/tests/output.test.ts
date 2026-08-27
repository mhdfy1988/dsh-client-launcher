import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { installBrokenPipeGuard, isBrokenPipeError } from '../output.js'

test('keeps the GUI alive when its parent closes the diagnostic pipe', () => {
  const stream = new EventEmitter()
  installBrokenPipeGuard(stream)

  assert.doesNotThrow(() => {
    stream.emit('error', Object.assign(new Error('broken pipe'), { code: 'EPIPE' }))
  })
})

test('does not hide unrelated output errors', () => {
  const error = Object.assign(new Error('permission denied'), { code: 'EACCES' })
  assert.equal(isBrokenPipeError(error), false)
  assert.equal(isBrokenPipeError(Object.assign(new Error('broken pipe'), { code: 'EPIPE' })), true)
})
