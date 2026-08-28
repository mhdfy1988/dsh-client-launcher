const { app } = require('electron')
const { createRequire } = require('node:module')

const autoUpdateEntry = process.argv[2]
if (!autoUpdateEntry) throw new Error('packaged auto-update entry path is required')

app.whenReady().then(() => {
  const requireFromPackage = createRequire(autoUpdateEntry)
  const updater = requireFromPackage('electron-updater')
  if (!updater?.autoUpdater || typeof updater.autoUpdater.checkForUpdates !== 'function') {
    throw new Error('packaged electron-updater does not expose autoUpdater')
  }
  process.stdout.write('DSH_DESKTOP_PACKAGED_UPDATER_OK\n')
  app.quit()
}).catch(error => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  app.exit(1)
})
