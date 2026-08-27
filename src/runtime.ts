import { app } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SOURCE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const REQUIRED_PACKAGES = [
  '@deepseek-ai/dsh-app-boot',
  '@deepseek-ai/dsh-cmdline',
  '@deepseek-ai/dsh-launch-environment',
  '@deepseek-ai/dsh-host-webserver',
] as const

/** Supported on-disk DSH installation layouts. */
export type HarnessRuntimeLayout = 'installed' | 'workspace'

/** Result of validating one explicit DSH root. */
export interface HarnessRuntimeInspection {
  /** Absolute candidate root. */
  root: string
  /** Recognized layout when root markers are present. */
  layout?: HarnessRuntimeLayout
  /** Package manifest used as the Node module resolution anchor. */
  anchor?: string
  /** Whether every required published entry is loadable. */
  ready: boolean
  /** Whether the Desktop build helper may prepare this root. */
  canBuild: boolean
  /** Actionable validation failures. */
  issues: string[]
}

/** Error shown when the selected DSH root cannot start. */
export class HarnessRuntimeNotReadyError extends Error {
  /**
   * Create a fail-loud runtime validation error.
   * @param inspection - complete validation result for the selected root.
   */
  constructor(readonly inspection: HarnessRuntimeInspection) {
    super(`DSH runtime is not ready: ${inspection.root}\n${inspection.issues.join('\n')}`)
    this.name = 'HarnessRuntimeNotReadyError'
  }
}

/**
 * Select the only DSH root this process is allowed to use.
 * @returns explicit override, folder-local packaged root, or source dependency root.
 */
export function getHarnessRuntimeRoot(): string {
  const override = process.env.DSH_DESKTOP_RUNTIME_DIR?.trim()
  if (override) return resolve(override)
  if (app.isPackaged) return dirname(dirname(process.execPath))
  return SOURCE_ROOT
}

/**
 * Validate one DSH root without installing dependencies or generating outputs.
 * @param root - absolute or relative candidate root.
 * @returns detected layout, resolution anchor and failures.
 */
export function inspectHarnessRuntime(root = getHarnessRuntimeRoot()): HarnessRuntimeInspection {
  const absoluteRoot = resolve(root)
  const rootManifest = join(absoluteRoot, 'package.json')
  const installedAnchor = join(absoluteRoot, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')
  const workspaceAnchor = join(absoluteRoot, 'apps', 'cli', 'package.json')
  const workspaceLock = join(absoluteRoot, 'pnpm-lock.yaml')
  const workspaceConfig = join(absoluteRoot, 'pnpm-workspace.yaml')
  const issues: string[] = []

  if (!existsSync(rootManifest)) issues.push(`缺少根 package.json：${rootManifest}`)

  let layout: HarnessRuntimeLayout | undefined
  let anchor: string | undefined
  if (existsSync(installedAnchor)) {
    layout = 'installed'
    anchor = installedAnchor
  } else if (existsSync(workspaceAnchor) && existsSync(workspaceLock) && existsSync(workspaceConfig)) {
    layout = 'workspace'
    anchor = workspaceAnchor
  } else {
    issues.push('既不是已安装 DSH 运行时，也不是完整 DSH 源码工作区。')
  }

  if (anchor !== undefined) {
    const runtimeRequire = createRequire(anchor)
    for (const packageName of REQUIRED_PACKAGES) {
      try {
        runtimeRequire.resolve(packageName)
      } catch {
        issues.push(`无法解析必要包 ${packageName}；源码工作区可能尚未安装依赖或完成构建。`)
      }
    }
  }

  return {
    root: absoluteRoot,
    ...(layout === undefined ? {} : { layout }),
    ...(anchor === undefined ? {} : { anchor }),
    ready: issues.length === 0,
    canBuild: layout === 'workspace',
    issues,
  }
}

function requireReadyRuntime(): HarnessRuntimeInspection & { anchor: string } {
  const inspection = inspectHarnessRuntime()
  if (!inspection.ready || inspection.anchor === undefined) throw new HarnessRuntimeNotReadyError(inspection)
  return { ...inspection, anchor: inspection.anchor }
}

/**
 * Resolve one package entry from the selected DSH root.
 * @param specifier - published package name or exported subpath.
 * @returns absolute physical entry path.
 */
export function resolveHarnessPackage(specifier: string): string {
  const runtime = requireReadyRuntime()
  return createRequire(runtime.anchor).resolve(specifier)
}

/** Resolve the selected DSH package manifest. */
export function resolveHarnessPackageJson(): string {
  return requireReadyRuntime().anchor
}

/** Read the selected DSH version without loading its executable entry. */
export function readHarnessVersion(): string {
  const manifest = JSON.parse(readFileSync(resolveHarnessPackageJson(), 'utf8')) as { version?: unknown }
  if (typeof manifest.version !== 'string') throw new Error('selected DSH package manifest has no version')
  return manifest.version
}

/**
 * Import one package from the selected DSH root.
 * @param specifier - published package name or exported subpath.
 * @returns loaded ESM namespace.
 */
export async function importHarnessPackage<T>(specifier: string): Promise<T> {
  const entry = resolveHarnessPackage(specifier)
  return import(pathToFileURL(entry).href) as Promise<T>
}

/**
 * Route unresolved bare plugin imports through the selected Profile fallback.
 * @param baseUrl - file URL inside the Profile directory whose parent walk reaches profiles/node_modules.
 * @returns disposer that removes the process-wide resolver hook.
 */
export function installHarnessModuleFallback(baseUrl: string): () => void {
  const registration = registerHooks({
    resolve(specifier, context, nextResolve) {
      try {
        return nextResolve(specifier, context)
      } catch (cause) {
        const isBare = !specifier.startsWith('.')
          && !specifier.startsWith('/')
          && !specifier.startsWith('file:')
          && !specifier.startsWith('node:')
          && !/^[A-Za-z]:[\\/]/u.test(specifier)
        if (!isBare) throw cause
        return nextResolve(specifier, { ...context, parentURL: baseUrl })
      }
    },
  })
  return () => { registration.deregister() }
}
