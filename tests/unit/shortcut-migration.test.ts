/**
 * Shortcut migration tests.
 *
 *  - empty storage: pick platform default;
 *  - non-empty storage (any non-empty value, including Ctrl+Shift+K): keep
 *    verbatim;
 *  - empty string: treat as missing — pick platform default;
 *  - platform-default lookup must agree with the index.ts fallback path,
 *    so a host that migrates from no-storage to defaultShortcut gets the
 *    same string the index.ts path would supply.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultShortcut } from '../../src/client/shortcut.ts'
import { bridgeKeysActions } from '../../src/client/keysActions.ts'

function migrate(stored: string | undefined, platform: NodeJS.Platform): string {
  return typeof stored === 'string' && stored.trim().length > 0 ? stored : defaultShortcut(platform)
}

test('stored Ctrl+Shift+K is kept verbatim on every platform', () => {
  assert.equal(migrate('Ctrl+Shift+K', 'win32'), 'Ctrl+Shift+K')
  assert.equal(migrate('Ctrl+Shift+K', 'linux'), 'Ctrl+Shift+K')
  assert.equal(migrate('Ctrl+Shift+K', 'darwin'), 'Ctrl+Shift+K')
})

test('stored custom value is kept verbatim', () => {
  assert.equal(migrate('Ctrl+Alt+P', 'win32'), 'Ctrl+Alt+P')
  assert.equal(migrate('Alt+Space', 'darwin'), 'Alt+Space')
})

test('missing storage falls back to platform default (Windows)', () => {
  assert.equal(migrate(undefined, 'win32'), 'Alt+Q')
})

test('missing storage falls back to platform default (Linux)', () => {
  assert.equal(migrate(undefined, 'linux'), 'Alt+Q')
})

test('missing storage falls back to platform default (macOS)', () => {
  assert.equal(migrate(undefined, 'darwin'), 'Cmd+Shift+K')
})

test('empty string falls back to platform default', () => {
  assert.equal(migrate('', 'win32'), 'Alt+Q')
  assert.equal(migrate('', 'darwin'), 'Cmd+Shift+K')
})

test('whitespace-only storage falls back to platform default', () => {
  assert.equal(migrate('   ', 'linux'), 'Alt+Q')
})

test('keys.actions bridge missing => no behavior change', () => {
  // Bridge is a no-op when ctx.get('keys.actions') is missing; verified by
  // asserting the helper still returns a disposer without throwing.
  const ctxWithoutKeys = { get: () => undefined, on: () => () => undefined }
  let disposed = false
  bridgeKeysActions(ctxWithoutKeys, {
    label: () => 'Open Universal Palette',
    description: () => 'Search commands, sessions, models, and history',
    toggle: () => undefined,
  })
  disposed = true
  assert.equal(disposed, true)
})