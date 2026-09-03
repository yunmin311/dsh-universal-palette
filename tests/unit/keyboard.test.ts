/**
 * Unit tests: keyboard shortcut detection + conflict reporting.
 */

import '../keyboard-shim.ts'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkConflicts, detectShortcut } from '../../src/client/keyboard.ts'

test('detectShortcut normalizes Ctrl+K', () => {
  const e = new KeyboardEvent('keydown', { ctrlKey: true, key: 'k' })
  assert.equal(detectShortcut(e as unknown as KeyboardEvent), 'Ctrl+K')
})

test('detectShortcut normalizes Cmd+K on macOS', () => {
  const e = new KeyboardEvent('keydown', { metaKey: true, key: 'k' })
  assert.equal(detectShortcut(e as unknown as KeyboardEvent), 'Cmd+K')
})

test('detectShortcut reports Ctrl+Shift+K', () => {
  const e = new KeyboardEvent('keydown', { ctrlKey: true, shiftKey: true, key: 'K' })
  assert.equal(detectShortcut(e as unknown as KeyboardEvent), 'Ctrl+Shift+K')
})

test('checkConflicts reports dsh-spotlight for Ctrl+K', () => {
  const r = checkConflicts('Ctrl+K')
  assert.deepEqual(r.conflictsWith, ['dsh-spotlight'])
})

test('checkConflicts reports dsh-model-palette for Alt+M', () => {
  const r = checkConflicts('Alt+M')
  assert.deepEqual(r.conflictsWith, ['dsh-model-palette'])
})

test('checkConflicts reports no conflict for Ctrl+Shift+K (default)', () => {
  const r = checkConflicts('Ctrl+Shift+K')
  assert.equal(r.conflictsWith.length, 0)
})
