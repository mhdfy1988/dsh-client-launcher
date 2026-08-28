/** Data-directory policy for source, smoke, and packaged launcher runs. */
export type RuntimeHomeMode = 'harness-default' | 'poc-isolated'

/**
 * Select the data-directory mode for one launcher process.
 * @param packaged - whether Electron is running a packaged application.
 * @param smoke - whether the process is an automated smoke run.
 * @returns the isolated mode for development/smoke, otherwise Harness default mode.
 */
export function resolveRuntimeHomeMode(packaged: boolean, smoke: boolean): RuntimeHomeMode {
  return !packaged || smoke ? 'poc-isolated' : 'harness-default'
}
