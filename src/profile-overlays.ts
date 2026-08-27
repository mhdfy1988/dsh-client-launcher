import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'

interface ProfileRow {
  id?: unknown
  config?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Bind the selected DSH installation's shipped Agent presets to the Web profile.
 * @param rows - Profile rows composed before launcher-owned overlays.
 * @param shippedPresetRoot - Absolute `config/agent-presets` directory beside the selected DSH app.
 * @returns Launcher overlay preserving the roster's existing configuration.
 */
export function createAgentPresetRootPatch(
  rows: readonly ProfileRow[],
  shippedPresetRoot: string,
): PatchOptions {
  const row = rows.find(candidate => candidate.id === 'agent-presets')
  if (row === undefined) {
    throw new Error('desktop Web profile has no agent-presets row')
  }
  return {
    id: 'agent-presets',
    config: {
      ...(isRecord(row.config) ? row.config : {}),
      roots: [{ path: shippedPresetRoot, trust: 'system' }],
    },
  }
}
