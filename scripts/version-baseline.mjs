import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const electron = require('electron/package.json')
const dsh = require('@deepseek-ai/dsh/package.json')
const desktop = require('../package.json')
const lockfile = await readFile(new URL('../pnpm-lock.yaml', import.meta.url))

process.stdout.write(`${JSON.stringify({
  desktop: desktop.version,
  electron: electron.version,
  node: process.version,
  dsh: dsh.version,
  lockfileSha256: createHash('sha256').update(lockfile).digest('hex'),
}, null, 2)}\n`)
