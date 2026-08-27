/** Commands accepted from the desktop-owned window controls. */
export type WindowControlCommand = 'minimize' | 'toggle-maximize' | 'close'

/** Minimal BrowserWindow surface used by the window control dispatcher. */
export interface WindowControlTarget {
  minimize(): void
  maximize(): void
  unmaximize(): void
  isMaximized(): boolean
  close(): void
}

/**
 * Apply one validated desktop window command.
 *
 * @param target Active desktop window.
 * @param command Renderer command received through the fixed IPC channel.
 * @returns The maximized state after a toggle, otherwise `undefined`.
 */
export function applyWindowControl(target: WindowControlTarget, command: unknown): boolean | undefined {
  switch (command) {
    case 'minimize':
      target.minimize()
      return undefined
    case 'toggle-maximize':
      if (target.isMaximized()) target.unmaximize()
      else target.maximize()
      return target.isMaximized()
    case 'close':
      target.close()
      return undefined
    default:
      return undefined
  }
}
