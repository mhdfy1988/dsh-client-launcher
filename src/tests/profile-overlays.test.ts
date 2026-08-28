import assert from 'node:assert/strict'
import test from 'node:test'
import { createAgentPresetRootPatch, createTelemetryOptOutPatch } from '../profile-overlays.js'

test('preserves the roster config while binding the selected DSH preset root', () => {
  assert.deepEqual(createAgentPresetRootPatch([
    { id: 'agent-presets', config: { default: 'standard', includeUserRoot: true } },
  ], 'D:\\dsh\\config\\agent-presets'), {
    id: 'agent-presets',
    config: {
      default: 'standard',
      includeUserRoot: true,
      roots: [{ path: 'D:\\dsh\\config\\agent-presets', trust: 'system' }],
    },
  })
})

test('fails loud when the selected Web profile has no preset roster', () => {
  assert.throws(
    () => createAgentPresetRootPatch([], 'D:\\dsh\\config\\agent-presets'),
    /no agent-presets row/u,
  )
})

test('only disables telemetry when the user opts out and the profile provides it', () => {
  const rows = [{ id: 'session-telemetry-otel' }]
  assert.deepEqual(createTelemetryOptOutPatch('1', rows), {
    id: 'session-telemetry-otel',
    disabled: true,
  })
  assert.deepEqual(createTelemetryOptOutPatch('false', rows), {
    id: 'session-telemetry-otel',
    disabled: true,
  })
  assert.equal(createTelemetryOptOutPatch('', rows), undefined)
  assert.equal(createTelemetryOptOutPatch('1', []), undefined)
})
