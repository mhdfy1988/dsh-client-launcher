/** Runtime states owned by the POC Electron process. */
export type RuntimeState = 'idle' | 'starting' | 'running' | 'stopping' | 'exited'

/** Observable bounded shutdown used by Electron quit sources. */
export interface ShutdownController {
  /** Current lifecycle state. */
  readonly state: RuntimeState
  /** Mark successful Host startup. */
  markRunning(): void
  /** Dispose the Host once; a second request escalates to native exit. */
  request(code: number): Promise<void>
}
/**
 * Create one fail-fast shutdown owner around the complete Cordis disposer.
 * @param dispose - releases the current Host generation.
 * @param exit - completes native Electron exit.
 * @param timeoutMs - maximum graceful disposal interval.
 * @returns lifecycle controller shared by every quit source.
 */
export function createShutdownController(
  dispose: () => Promise<void>,
  exit: (code: number) => void,
  timeoutMs = 5_000,
): ShutdownController {
  let state: RuntimeState = 'idle'
  let pending: Promise<void> | undefined
  let timeout: ReturnType<typeof setTimeout> | undefined
  let exited = false

  const exitOnce = (code: number): void => {
    if (exited) return
    exited = true
    if (timeout !== undefined) clearTimeout(timeout)
    state = 'exited'
    exit(code)
  }

  return {
    get state() {
      return state
    },
    markRunning() {
      if (state !== 'idle' && state !== 'starting') {
        throw new Error(`cannot mark runtime running from ${state}`)
      }
      state = 'running'
    },
    request(code) {
      if (pending !== undefined) {
        exitOnce(code)
        return pending
      }
      state = 'stopping'
      const failureCode = code === 0 ? 1 : code
      timeout = setTimeout(() => { exitOnce(failureCode) }, timeoutMs)
      pending = Promise.resolve().then(dispose).then(
        () => { exitOnce(code) },
        () => { exitOnce(failureCode) },
      )
      return pending
    },
  }
}
