import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { EventEmitter } from 'node:events'
import { AUTO_UPDATE_CHECK_DELAY_MS, installAutoUpdate, shouldEnableAutoUpdate } from '../auto-update.js'
import type { AppUpdater, ProgressInfo, UpdateCheckResult, UpdateDownloadedEvent, UpdateInfo } from 'electron-updater'
import type { AutoUpdateDependencies, AutoUpdateStatus } from '../auto-update.js'

test('auto-update requires a packaged app with a release feed', () => {
  const resourcesPath = mkdtempSync(join(tmpdir(), 'dsh-update-test-'))
  try {
    assert.equal(shouldEnableAutoUpdate({ isPackaged: false, isSmokeMode: false, resourcesPath, env: {} }), false)
    assert.equal(shouldEnableAutoUpdate({ isPackaged: true, isSmokeMode: false, resourcesPath, env: {} }), false)
    writeFileSync(join(resourcesPath, 'app-update.yml'), 'provider: github\n', 'utf8')
    assert.equal(shouldEnableAutoUpdate({ isPackaged: true, isSmokeMode: false, resourcesPath, env: {} }), true)
  } finally {
    rmSync(resourcesPath, { recursive: true, force: true })
  }
})

test('auto-update stays disabled for smoke runs and explicit opt-out', () => {
  const resourcesPath = mkdtempSync(join(tmpdir(), 'dsh-update-test-'))
  try {
    mkdirSync(resourcesPath, { recursive: true })
    writeFileSync(join(resourcesPath, 'app-update.yml'), 'provider: github\n', 'utf8')
    assert.equal(shouldEnableAutoUpdate({ isPackaged: true, isSmokeMode: true, resourcesPath, env: {} }), false)
    assert.equal(shouldEnableAutoUpdate({ isPackaged: true, isSmokeMode: false, resourcesPath, env: { DSH_DISABLE_AUTO_UPDATE: '1' } }), false)
  } finally {
    rmSync(resourcesPath, { recursive: true, force: true })
  }
})

test('auto-update publishes progress and can reopen a deferred install prompt', async () => {
  const resourcesPath = mkdtempSync(join(tmpdir(), 'dsh-update-test-'))
  const updater = new EventEmitter() as unknown as AppUpdater
  let checkCount = 0
  let installCount = 0
  updater.checkForUpdates = async (): Promise<UpdateCheckResult | null> => { checkCount += 1; return null }
  updater.quitAndInstall = () => { installCount += 1 }
  const logs: string[] = []
  const statuses: AutoUpdateStatus[] = []
  let timerCallback: (() => void) | undefined
  let cleared = false
  let promptCount = 0
  const promptResponses = [1, 0]
  try {
    writeFileSync(join(resourcesPath, 'app-update.yml'), 'provider: github\n', 'utf8')
    const handle = installAutoUpdate(
      { isPackaged: true, isSmokeMode: false, resourcesPath, env: {} },
      {
        updater,
        log: message => logs.push(message),
        onStatus: status => statuses.push(status),
        setTimeout: ((callback: Parameters<typeof setTimeout>[0], delay: number) => {
          assert.equal(delay, AUTO_UPDATE_CHECK_DELAY_MS)
          timerCallback = callback as () => void
          return {} as ReturnType<typeof setTimeout>
        }) as NonNullable<AutoUpdateDependencies['setTimeout']>,
        clearTimeout: () => { cleared = true },
        showMessageBox: async () => {
          promptCount += 1
          return { response: promptResponses.shift() ?? 1, checkboxChecked: false }
        },
      },
    )

    assert.equal(updater.autoDownload, true)
    assert.equal(updater.autoInstallOnAppQuit, false)
    timerCallback?.()
    await Promise.resolve()
    assert.equal(checkCount, 1)

    updater.emit('checking-for-update')
    updater.emit('update-available', { version: '0.0.2-poc.0' } as UpdateInfo)
    updater.emit('download-progress', { percent: 43.6 } as ProgressInfo)
    updater.emit('update-downloaded', { version: '0.0.2-poc.0' } as UpdateDownloadedEvent)
    await new Promise<void>(resolve => { setImmediate(resolve) })
    assert.equal(promptCount, 1)
    assert.equal(installCount, 0)
    assert.equal(handle.requestInstall(), true)
    await new Promise<void>(resolve => { setImmediate(resolve) })
    assert.equal(promptCount, 2)
    assert.equal(installCount, 1)
    assert.deepEqual(logs, [
      'checking',
      'available 0.0.2-poc.0',
      'download 44%',
      'downloaded 0.0.2-poc.0',
    ])
    assert.deepEqual(statuses, [
      { phase: 'checking' },
      { phase: 'downloading', version: '0.0.2-poc.0', percent: 0 },
      { phase: 'downloading', version: '0.0.2-poc.0', percent: 44 },
      { phase: 'downloaded', version: '0.0.2-poc.0' },
    ])

    handle.dispose()
    assert.equal(cleared, true)
  } finally {
    rmSync(resourcesPath, { recursive: true, force: true })
  }
})
