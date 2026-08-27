import type { EventEmitter } from 'node:events'

/** Install the GUI process guard for a parent-owned diagnostic pipe. */
export function installBrokenPipeGuard(stream: Pick<EventEmitter, 'on'>): void {
  stream.on('error', (error: unknown) => {
    if (isBrokenPipeError(error)) return
    throw error
  })
}

/** Report whether an output failure only means that the parent closed its pipe. */
export function isBrokenPipeError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'EPIPE'
}
