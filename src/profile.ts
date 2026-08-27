import { existsSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import type { Profile } from '@deepseek-ai/dsh-app-boot'
import { importHarnessPackage, resolveHarnessPackageJson } from './runtime.js'
import { createAgentPresetRootPatch } from './profile-overlays.js'

const BIN_NAME = 'dsh-desktop-shell'
const PROFILE_NAME = 'desktop-poc'
const ROOT_CONFIG_NAME = 'cordis.yml'

/** Official Profile inputs consumed by one POC Host generation. */
export interface PreparedProfile {
  /** Persistent profile metadata and installed package root. */
  profile: Profile
  /** Empty root include used by the Cordis Loader. */
  rootConfig: string
  /** Profile package URL used for bare package resolution. */
  bareModuleBaseUrl: string
  /** Ordered official Bundle, Profile and launcher safety patches. */
  patches: PatchOptions[]
}

/**
 * Initialize and compose the isolated Web profile used by the POC.
 * @param homeDir - isolated Harness home owned by this POC.
 * @returns official Loader inputs with a final loopback-only overlay.
 */
export async function prepareProfile(homeDir: string): Promise<PreparedProfile> {
  const {
    composeEntries,
    healProfilesModuleFallback,
    initProfile,
    loadProfile,
    PROFILE_TEMPLATES,
    resolveProfileDir,
  } = await importHarnessPackage<typeof import('@deepseek-ai/dsh-app-boot')>('@deepseek-ai/dsh-app-boot')
  const bundles = PROFILE_TEMPLATES.web
  if (bundles === undefined) {
    throw new Error(`${BIN_NAME}: installed app-boot has no web profile template`)
  }

  const profileDir = resolveProfileDir(PROFILE_NAME, homeDir)
  if (!existsSync(join(profileDir, 'package.json'))) {
    initProfile(profileDir, bundles)
  }

  const installAnchor = resolveHarnessPackageJson()
  healProfilesModuleFallback(installAnchor, homeDir)
  const profile = loadProfile(BIN_NAME, PROFILE_NAME, installAnchor, homeDir)
  const rootConfig = join(profile.dir, ROOT_CONFIG_NAME)
  writeFileSync(rootConfig, '[]\n', 'utf8')

  const patches: PatchOptions[] = []
  for (const layer of profile.layers) patches.push(...layer.patches)
  patches.push(...profile.patches)
  const shippedPresetRoot = join(dirname(installAnchor), 'config', 'agent-presets')
  if (!existsSync(join(shippedPresetRoot, 'standard', 'preset.yml'))) {
    throw new Error(`${BIN_NAME}: selected DSH installation has no shipped standard preset at ${shippedPresetRoot}`)
  }
  patches.push(createAgentPresetRootPatch(composeEntries([patches]), shippedPresetRoot))
  patches.push(
    {
      insert: [
        {
          id: 'desktop-poc-host',
          name: new URL('./plugin.js', import.meta.url).href,
        },
      ],
    },
    {
      id: 'webserver',
      disabled: false,
      config: { host: '127.0.0.1', port: 0 },
    },
    {
      id: 'web-runtime',
      disabled: false,
      config: {
        openBrowser: false,
        printUrl: false,
        surfaceContext: true,
        trustedHosts: [],
      },
    },
  )

  return {
    profile,
    rootConfig,
    bareModuleBaseUrl: pathToFileURL(join(profile.dir, 'package.json')).href,
    patches,
  }
}
