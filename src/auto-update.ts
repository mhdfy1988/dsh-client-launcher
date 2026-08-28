import type { MessageBoxOptions, MessageBoxReturnValue } from 'electron'
import type { AppUpdater, ProgressInfo, UpdateDownloadedEvent, UpdateInfo } from 'electron-updater'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const require = createRequire(import.meta.url)

/** Delay before the first update check so the DSH page can finish loading. */
export const AUTO_UPDATE_CHECK_DELAY_MS = 5_000

/** Inputs that determine whether the packaged updater is allowed to run. */
export interface AutoUpdateAvailability {
  /** Whether Electron is running an installed/packaged application. */
  readonly isPackaged: boolean
  /** Whether the process is a short-lived smoke test. */
  readonly isSmokeMode: boolean
  /** Electron resources directory that may contain app-update.yml. */
  readonly resourcesPath: string
  /** Process environment, injected for deterministic tests. */
  readonly env: NodeJS.ProcessEnv
}

/** Return whether a release feed is configured for this packaged application. */
export function shouldEnableAutoUpdate(options: AutoUpdateAvailability): boolean {
  return options.isPackaged
    && !options.isSmokeMode
    && options.env.DSH_DISABLE_AUTO_UPDATE !== '1'
    && existsSync(join(options.resourcesPath, 'app-update.yml'))
}

/** Dependencies used by the update coordinator. */
export interface AutoUpdateDependencies {
  /** Electron updater instance. */
  readonly updater?: AppUpdater
  /** Native dialog implementation. */
  readonly showMessageBox?: (options: MessageBoxOptions) => Promise<MessageBoxReturnValue>
  /** Diagnostic sink. */
  readonly log?: (message: string) => void
  /** Timer implementation. */
  readonly setTimeout?: typeof setTimeout
  /** Timer cleanup implementation. */
  readonly clearTimeout?: typeof clearTimeout
}

/** Handle returned by the automatic update coordinator. */
export interface AutoUpdateHandle {
  /** Cancel the pending check and detach updater listeners. */
  dispose(): void
}

function describeVersion(info: UpdateInfo): string {
  return typeof info.version === 'string' && info.version !== '' ? info.version : '新版本'
}

function defaultLogger(message: string): void {
  process.stdout.write(`DSH_DESKTOP_UPDATE ${message}\n`)
}

/**
 * Configure one packaged NSIS updater and schedule its first check.
 *
 * The updater downloads available releases automatically. Installation remains
 * user-confirmed through a native dialog so a running DSH session is not
 * interrupted without consent.
 *
 * @param options - availability and process flags
 * @param dependencies - injectable updater, dialog and timer dependencies
 * @returns a disposer, or a no-op handle when the feed is unavailable
 */
export function installAutoUpdate(
  options: AutoUpdateAvailability,
  dependencies: AutoUpdateDependencies = {},
): AutoUpdateHandle {
  if (!shouldEnableAutoUpdate(options)) return { dispose() {} }
  const updater = dependencies.updater ?? (require('electron-updater') as { autoUpdater: AppUpdater }).autoUpdater
  const log = dependencies.log ?? defaultLogger
  const showMessageBox = dependencies.showMessageBox ?? ((options: MessageBoxOptions) => {
    const electron = require('electron') as { dialog: { showMessageBox: (value: MessageBoxOptions) => Promise<MessageBoxReturnValue> } }
    return electron.dialog.showMessageBox(options)
  })
  const schedule = dependencies.setTimeout ?? setTimeout
  const clear = dependencies.clearTimeout ?? clearTimeout
  let installPromptOpen = false

  updater.autoDownload = true
  updater.autoInstallOnAppQuit = false

  const onChecking = (): void => { log('checking') }
  const onAvailable = (info: UpdateInfo): void => { log(`available ${describeVersion(info)}`) }
  const onNotAvailable = (info: UpdateInfo): void => { log(`not-available ${describeVersion(info)}`) }
  const onProgress = (info: ProgressInfo): void => { log(`download ${Math.round(info.percent)}%`) }
  const onError = (error: Error): void => { log(`error ${error.message}`) }
  const onDownloaded = (info: UpdateDownloadedEvent): void => {
    log(`downloaded ${describeVersion(info)}`)
    if (installPromptOpen) return
    installPromptOpen = true
    void showMessageBox({
      type: 'info',
      title: '发现启动器更新',
      message: `DSH 客户端启动器 ${describeVersion(info)} 已下载完成。`,
      detail: '立即重启并安装更新，或选择稍后安装。',
      buttons: ['立即重启安装', '稍后'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    }).then(result => {
      if (result.response === 0) updater.quitAndInstall(false, true)
    }).catch(error => {
      log(`install-prompt-error ${error instanceof Error ? error.message : String(error)}`)
    }).finally(() => {
      installPromptOpen = false
    })
  }

  updater.on('checking-for-update', onChecking)
  updater.on('update-available', onAvailable)
  updater.on('update-not-available', onNotAvailable)
  updater.on('download-progress', onProgress)
  updater.on('error', onError)
  updater.on('update-downloaded', onDownloaded)

  const timer = schedule(() => {
    void updater.checkForUpdates().catch(onError)
  }, AUTO_UPDATE_CHECK_DELAY_MS)

  return {
    dispose() {
      clear(timer)
      updater.removeListener('checking-for-update', onChecking)
      updater.removeListener('update-available', onAvailable)
      updater.removeListener('update-not-available', onNotAvailable)
      updater.removeListener('download-progress', onProgress)
      updater.removeListener('error', onError)
      updater.removeListener('update-downloaded', onDownloaded)
    },
  }
}
