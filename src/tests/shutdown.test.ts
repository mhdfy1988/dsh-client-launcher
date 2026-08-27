import assert from 'node:assert/strict'
import test from 'node:test'
import { createShutdownController } from '../shutdown.js'

test('graceful shutdown disposes once before native exit', async () => {
  const events: string[] = []
  const controller = createShutdownController(
    async () => { events.push('dispose') },
    code => { events.push(`exit:${code}`) },
    100,
  )
  controller.markRunning()
  await controller.request(0)
  assert.deepEqual(events, ['dispose', 'exit:0'])
  assert.equal(controller.state, 'exited')
})
test('second shutdown request escalates without a second dispose', async () => {
  const events: string[] = []
  let release: (() => void) | undefined
  const controller = createShutdownController(
    () => new Promise<void>((resolve) => {
      events.push('dispose')
      release = resolve
    }),
    code => { events.push(`exit:${code}`) },
    1_000,
  )
  const first = controller.request(0)
  await Promise.resolve()
  const second = controller.request(130)
  release?.()
  await Promise.all([first, second])
  assert.deepEqual(events, ['dispose', 'exit:130'])
})

test('dispose failure exits with a failure code', async () => {
  const exits: number[] = []
  const controller = createShutdownController(
    async () => { throw new Error('dispose failed') },
    code => { exits.push(code) },
    100,
  )
  await controller.request(0)
  assert.deepEqual(exits, [1])
})
