import assert from 'node:assert/strict'
import test from 'node:test'
import { renderRecoveryPage } from '../recovery-page.js'

test('launcher page offers explicit runtime selection without searching', () => {
  const html = renderRecoveryPage({ message: '缺少根 package.json' })

  assert.match(html, /选择要启动的 DSH/)
  assert.match(html, /添加客户端/)
  assert.match(html, /缺少根 package\.json/)
})

test('launcher page can render without a previous failure', () => {
  const html = renderRecoveryPage({})

  assert.doesNotMatch(html, /自动启动已暂停/)
  assert.match(html, /正在检测客户端/)
})

test('launcher inline script is valid JavaScript', () => {
  const html = renderRecoveryPage({})
  const start = html.indexOf('<script>')
  const end = html.indexOf('</script>', start)

  assert.ok(start >= 0)
  assert.ok(end > start)
  assert.doesNotThrow(() => {
    new Function(html.slice(start + '<script>'.length, end))
  })
})
