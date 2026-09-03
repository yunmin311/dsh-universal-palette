/**
 * Unit tests: preferences store persistence + pin/hide/alias/frecency.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PreferencesStore } from '../../src/client/ranking/frecency.ts'
import { createInMemoryBackend } from '../../src/client/state/preferences-backend.ts'

test('pin adds then removes', async () => {
  const backend = createInMemoryBackend()
  const prefs = new PreferencesStore(backend)
  await prefs.load()
  const a = await prefs.togglePin('cmd:compact')
  assert.equal(a, true)
  const b = await prefs.togglePin('cmd:compact')
  assert.equal(b, false)
})

test('hide is idempotent', async () => {
  const backend = createInMemoryBackend()
  const prefs = new PreferencesStore(backend)
  await prefs.load()
  await prefs.setHide('x', true)
  await prefs.setHide('x', true)
  await prefs.setHide('x', false)
  await prefs.setHide('x', false)
  // No error means idempotency; backend state holds the latest
  assert.equal(backend.state.hides['x'], undefined)
})

test('alias with empty string clears', async () => {
  const backend = createInMemoryBackend()
  const prefs = new PreferencesStore(backend)
  await prefs.load()
  await prefs.setAlias('a', 'cmpct')
  assert.equal(backend.state.aliases['a'], 'cmpct')
  await prefs.setAlias('a', '')
  assert.equal(backend.state.aliases['a'], undefined)
})

test('recordUse increments count and updates lastUsedAt', async () => {
  const backend = createInMemoryBackend()
  const prefs = new PreferencesStore(backend)
  await prefs.load()
  await prefs.recordUse('a')
  await prefs.recordUse('a')
  assert.equal(backend.state.frecency['a']?.count, 2)
  assert.ok(typeof backend.state.frecency['a']?.lastUsedAt === 'number')
})

test('resetRanking clears frecency but preserves pins', async () => {
  const backend = createInMemoryBackend()
  const prefs = new PreferencesStore(backend)
  await prefs.load()
  await prefs.recordUse('a')
  await prefs.togglePin('b')
  await prefs.resetRanking()
  assert.equal(backend.state.frecency['a'], undefined)
  assert.ok(backend.state.pins['b'])
})
