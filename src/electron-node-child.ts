import childProcess, { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { syncBuiltinESMExports } from 'node:module'
import type { IPty, IPtyForkOptions } from 'node-pty'

type SpawnFunction = typeof spawn
type NodePtySpawnFunction = (file: string, args: string[] | string, options: IPtyForkOptions) => IPty
type PickDirectory = (title: string) => Promise<string | null>

/** Mutable CommonJS surface loaded from the selected DSH runtime. */
export interface NodePtyModule {
  spawn: NodePtySpawnFunction
}

/** Lifecycle controls for the Electron-specific node-pty compatibility layer. */
export interface ElectronNodePtyCompatibility {
  /** Ask active interactive shells to exit before DSH releases their native handles. */
  prepareForShutdown(timeoutMs?: number): Promise<number>
  /** Restore the runtime module and remove compatibility-owned listeners. */
  dispose(): void
}

/** Test whether a child launch targets DSH's packaged Win32 picker worker. */
export function isDirectoryPickerWorker(command: string, args: readonly string[] | undefined, electronExecPath: string): boolean {
  if (command !== electronExecPath || args?.length !== 1) return false
  const workerPath = args[0]?.replaceAll('\\', '/')
  if (workerPath === undefined || !workerPath.endsWith('/lib/worker.cjs')) return false
  return workerPath.includes('/packages/host/directory-picker-native/')
    || workerPath.includes('/@deepseek-ai/dsh-host-directory-picker-native/')
}

/** Test whether a child launch targets DSH's Windows ACL sandbox runner. */
export function isWindowsAclSandboxRunner(command: string, args: readonly string[] | undefined, electronExecPath: string): boolean {
  if (command !== electronExecPath || args === undefined) return false
  const normalized = args.map(argument => argument.replaceAll('\\', '/'))
  const builtRunner = normalized[0]
  if (builtRunner?.endsWith('/lib/runner.js') === true) {
    return builtRunner.includes('/packages/sandbox/sandbox-windows-acl/')
      || builtRunner.includes('/@deepseek-ai/dsh-sandbox-windows-acl/')
  }
  const sourceRunner = normalized[2]
  return normalized[0] === '--import'
    && normalized[1] === 'tsx/esm'
    && sourceRunner?.endsWith('/src/runner.ts') === true
    && (sourceRunner.includes('/packages/sandbox/sandbox-windows-acl/')
      || sourceRunner.includes('/@deepseek-ai/dsh-sandbox-windows-acl/'))
}

function createDirectoryPickerProcess(title: string, pickDirectory: PickDirectory): ChildProcess {
  const processEvents = new EventEmitter()
  let settled = false

  const finish = (event: 'message' | 'error', value: unknown): void => {
    if (settled) return
    settled = true
    processEvents.emit(event, value)
    processEvents.emit('exit', 0, null)
  }

  queueMicrotask(() => {
    void pickDirectory(title).then(
      path => { finish('message', { kind: 'done', path }) },
      cause => { finish('error', cause instanceof Error ? cause : new Error(String(cause))) },
    )
  })

  Object.assign(processEvents, {
    kill: (): boolean => {
      if (settled) return false
      settled = true
      processEvents.emit('exit', 0, null)
      return true
    },
    unref: (): void => undefined,
  })
  return processEvents as ChildProcess
}

/**
 * Adapt only DSH's Win32 picker launch to Electron's native dialog.
 * @param originalSpawn - child-process implementation to delegate to.
 * @param electronExecPath - current Electron executable path.
 * @param pickDirectory - Electron-backed single-directory chooser.
 * @returns a spawn-compatible function preserving DSH's worker event protocol.
 */
export function createElectronNodeChildSpawn(
  originalSpawn: SpawnFunction,
  electronExecPath: string,
  pickDirectory: PickDirectory,
): SpawnFunction {
  const adapted = (command: string, args?: readonly string[], options?: SpawnOptions) => {
    if (isWindowsAclSandboxRunner(command, args, electronExecPath)) {
      const runnerOptions = {
        ...options,
        env: { ...options?.env, ELECTRON_RUN_AS_NODE: '1' },
      }
      return Reflect.apply(originalSpawn, childProcess, [command, args, runnerOptions]) as ReturnType<SpawnFunction>
    }
    if (!isDirectoryPickerWorker(command, args, electronExecPath)) {
      const forwarded = args === undefined ? [command, options] : [command, args, options]
      return Reflect.apply(originalSpawn, childProcess, forwarded) as ReturnType<SpawnFunction>
    }
    const title = options?.env?.DSH_DIALOG_TITLE
    if (typeof title !== 'string' || title === '') throw new Error('directory picker title is missing')
    return createDirectoryPickerProcess(title, pickDirectory)
  }
  return adapted as unknown as SpawnFunction
}

/**
 * Adapt only a node-pty launch of DSH's Windows ACL runner to Electron's Node mode.
 * @param originalSpawn - node-pty implementation to delegate to.
 * @param electronExecPath - current Electron executable path.
 * @param onSpawn - optional observer for compatibility-owned lifecycle tracking.
 * @returns a node-pty-compatible function preserving every unrelated launch.
 */
export function createElectronNodePtySpawn(
  originalSpawn: NodePtySpawnFunction,
  electronExecPath: string,
  onSpawn?: (terminal: IPty) => void,
): NodePtySpawnFunction {
  return (file, args, options) => {
    let terminal: IPty
    if (!Array.isArray(args) || !isWindowsAclSandboxRunner(file, args, electronExecPath)) {
      terminal = originalSpawn(file, args, options)
    } else {
      terminal = originalSpawn(file, args, {
        ...options,
        env: { ...options.env, ELECTRON_RUN_AS_NODE: '1' },
      })
    }
    onSpawn?.(terminal)
    return terminal
  }
}

/**
 * Install the selected runtime's node-pty compatibility before DSH imports its named export.
 * @param nodePty - mutable CommonJS node-pty module resolved from the selected DSH runtime.
 * @returns lifecycle controls for graceful app shutdown and module restoration.
 */
export function installElectronNodePtyCompatibility(nodePty: NodePtyModule): ElectronNodePtyCompatibility {
  const originalSpawn = nodePty.spawn
  const active = new Map<IPty, { dispose(): void }>()
  const track = (terminal: IPty): void => {
    const exitSubscription = terminal.onExit(() => {
      active.delete(terminal)
      exitSubscription.dispose()
    })
    active.set(terminal, exitSubscription)
  }
  nodePty.spawn = createElectronNodePtySpawn(originalSpawn, process.execPath, track)
  return {
    async prepareForShutdown(timeoutMs = 1_500): Promise<number> {
      for (const terminal of active.keys()) {
        try {
          terminal.write('exit\r')
        } catch (_terminalExitedBeforeShutdownWrite) {
          // The exit listener owns removal when node-pty publishes the event.
        }
      }
      const deadline = Date.now() + timeoutMs
      while (active.size > 0 && Date.now() < deadline) {
        await new Promise(resolve => { setTimeout(resolve, Math.min(25, Math.max(1, deadline - Date.now()))) })
      }
      return active.size
    },
    dispose(): void {
      nodePty.spawn = originalSpawn
      for (const subscription of active.values()) subscription.dispose()
      active.clear()
    },
  }
}

/**
 * Install the Electron-native directory picker adapter for this Host generation.
 * @param pickDirectory - Electron-backed single-directory chooser.
 * @returns disposer that restores Node's original child-process export.
 */
export function installElectronNodeChildCompatibility(pickDirectory: PickDirectory): () => void {
  const originalSpawn = childProcess.spawn
  childProcess.spawn = createElectronNodeChildSpawn(originalSpawn, process.execPath, pickDirectory)
  syncBuiltinESMExports()
  return () => {
    childProcess.spawn = originalSpawn
    syncBuiltinESMExports()
  }
}
