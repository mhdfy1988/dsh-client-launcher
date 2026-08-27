import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeCssColor, resolveDesktopTheme } from '../theme-colors.js'

test('normalizes opaque computed CSS colors', () => {
  assert.equal(normalizeCssColor('rgb(17, 34, 51)'), '#112233')
  assert.equal(normalizeCssColor('rgb(17 34 51 / 100%)'), '#112233')
  assert.equal(normalizeCssColor('#A99CFF'), '#a99cff')
  assert.equal(normalizeCssColor('rgba(17, 34, 51, 0.5)'), undefined)
})

test('selects contrasting Windows caption symbols', () => {
  assert.deepEqual(resolveDesktopTheme({
    background: 'rgb(23, 20, 47)',
    foreground: 'rgb(255, 255, 255)',
    accent: 'rgb(169, 156, 255)',
  }), {
    background: '#17142f',
    foreground: '#ffffff',
    accent: '#a99cff',
    symbol: '#ffffff',
  })
  assert.equal(resolveDesktopTheme({ background: 'white' }), undefined)
})
