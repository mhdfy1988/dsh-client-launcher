import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { inspectHarnessRuntime } from './runtime.js'

const MAX_LOG_LENGTH = 2_000_000

/** Result returned to the recovery page after preparing a source workspace. */
export interface HarnessBuildResult {
  /** Whether the selected workspace is now loadable. */
  ok: boolean
  /** Combined command output and final validation. */
  log: string
}

function appendBounded(current: string, chunk: string): string {
  const next = current + chunk
  return next.length <= MAX_LOG_LENGTH ? next : next.slice(next.length - MAX_LOG_LENGTH)
}

async function runPnpm(root: string, args: string[]): Promise<{ code: number, output: string }> {
  const command = process.platform === 'win32' ? process.env.ComSpec ?? 'cmd.exe' : 'pnpm'
  const commandArgs = process.platform === 'win32' ? ['/d', '/s', '/c', 'pnpm.cmd', ...args] : args
  const child = spawn(command, commandArgs, {
    cwd: root,
    env: process.env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = `$ pnpm ${args.join(' ')}\n`
  child.stdout.on('data', chunk => { output = appendBounded(output, chunk.toString()) })
  child.stderr.on('data', chunk => { output = appendBounded(output, chunk.toString()) })
  const code = await new Promise<number>((resolveExit, reject) => {
    child.once('error', reject)
    child.once('exit', value => { resolveExit(value ?? 1) })
  })
  return { code, output }
}

/**
 * Install missing dependencies and run the official build of one DSH source workspace.
 * @param root - selected DSH source root.
 * @returns command log and post-build readiness.
 */
export async function buildHarnessWorkspace(root: string): Promise<HarnessBuildResult> {
  const before = inspectHarnessRuntime(root)
  if (before.layout !== 'workspace') {
    return { ok: false, log: `拒绝构建：${root} 不是可识别的 DSH 源码工作区。` }
  }

  let log = `目标 DSH：${before.root}\n构建会写入 node_modules 和 lib 构建产物，不修改源码或插件。\n`
  if (!existsSync(join(before.root, 'apps', 'cli', 'node_modules'))) {
    const install = await runPnpm(before.root, ['install', '--frozen-lockfile'])
    log = appendBounded(log, install.output)
    if (install.code !== 0) return { ok: false, log: appendBounded(log, `\n依赖安装失败，退出码 ${install.code}。`) }
  }

  const build = await runPnpm(before.root, ['run', 'build'])
  log = appendBounded(log, build.output)
  if (build.code !== 0) return { ok: false, log: appendBounded(log, `\nDSH 构建失败，退出码 ${build.code}。`) }

  const after = inspectHarnessRuntime(before.root)
  if (!after.ready) {
    return { ok: false, log: appendBounded(log, `\n构建完成，但运行时仍未就绪：\n${after.issues.join('\n')}`) }
  }
  return { ok: true, log: appendBounded(log, '\n当前 DSH 已完成构建并通过运行时检查。') }
}
