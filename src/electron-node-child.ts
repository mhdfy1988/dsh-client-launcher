import childProcess, { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { syncBuiltinESMExports } from 'node:module'

type SpawnFunction = typeof spawn
type PickDirectory = (title: string) => Promise<string | null>

/** Test whether a child launch targets DSH's packaged Win32 picker worker. */
export function isDirectoryPickerWorker(command: string, args: readonly string[] | undefined, electronExecPath: string): boolean {
  if (command !== electronExecPath || args?.length !== 1) return false
  const workerPath = args[0]?.replaceAll('\\', '/')
  if (workerPath === undefined || !workerPath.endsWith('/lib/worker.cjs')) return false
  return workerPath.includes('/packages/host/directory-picker-native/')
    || workerPath.includes('/@deepseek-ai/dsh-host-directory-picker-native/')
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
