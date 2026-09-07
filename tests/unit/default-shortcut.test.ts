import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultShortcut } from '../../src/client/shortcut.ts'

test('Windows fresh default is Alt+Q', () => {
  assert.equal(defaultShortcut('win32'), 'Alt+Q')
})

test('Linux fresh default is Alt+Q', () => {
  assert.equal(defaultShortcut('linux'), 'Alt+Q')
})

test('macOS fresh default is Cmd+Shift+K', () => {
  assert.equal(defaultShortcut('darwin'), 'Cmd+Shift+K')
})