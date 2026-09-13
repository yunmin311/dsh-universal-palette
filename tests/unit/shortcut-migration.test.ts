import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bridgeKeysActions } from '../../src/client/keysActions.ts'
import {
  PreferencesStore,
  type PalettePreferences,
  type PreferencesBackend,
} from '../../src/client/state/preferences.ts'

const LEGACY_DEFAULTS: PalettePreferences = {
  pins: {},
  frecency: {},
  glassIntensity: 'soft',
  shortcut: 'Ctrl+Shift+K',
}

function memoryBackend(initial: unknown = null): {
  backend: PreferencesBackend
  read: () => unknown
} {
  let stored = structuredClone(initial)
  return {
    backend: {
      async load() {
        return structuredClone(stored) as PalettePreferences | null
      },
      async save(preferences) {
        stored = structuredClone(preferences)
      },
    },
    read: () => structuredClone(stored),
  }
}

async function reload(
  backend: PreferencesBackend,
  platformDefault: string,
): Promise<PreferencesStore> {
  const store = new PreferencesStore(backend, platformDefault)
  await store.load()
  return store
}

test('Windows fresh snapshot starts with Alt+Q', () => {
  const { backend } = memoryBackend()
  const store = new PreferencesStore(backend, 'Alt+Q')
  assert.equal(store.snapshot.shortcut, 'Alt+Q')
})

test('Windows fresh persist and reload keeps Alt+Q', async () => {
  const memory = memoryBackend()
  const first = await reload(memory.backend, 'Alt+Q')

  await first.recordUse('command:/goal')
  assert.deepEqual(memory.read(), {
    schemaVersion: 1,
    shortcutCustomized: false,
    pins: {},
    frecency: {
      'command:/goal': {
        count: 1,
        lastUsedAt: first.snapshot.frecency['command:/goal']!.lastUsedAt,
      },
    },
    glassIntensity: 'soft',
    shortcut: 'Alt+Q',
  })

  const second = await reload(memory.backend, 'Alt+Q')
  assert.equal(second.snapshot.shortcut, 'Alt+Q')
})

test('macOS fresh snapshot starts with Cmd+Shift+K', () => {
  const { backend } = memoryBackend()
  const store = new PreferencesStore(backend, 'Cmd+Shift+K')
  assert.equal(store.snapshot.shortcut, 'Cmd+Shift+K')
})

test('macOS fresh persist and reload keeps Cmd+Shift+K', async () => {
  const memory = memoryBackend()
  const first = await reload(memory.backend, 'Cmd+Shift+K')
  await first.recordUse('command:/goal')

  const second = await reload(memory.backend, 'Cmd+Shift+K')
  assert.equal(second.snapshot.shortcut, 'Cmd+Shift+K')
  assert.equal((memory.read() as { shortcutCustomized: boolean }).shortcutCustomized, false)
})

test('new-schema explicit custom shortcut survives persistence and reload', async () => {
  const memory = memoryBackend({
    schemaVersion: 1,
    shortcutCustomized: true,
    ...LEGACY_DEFAULTS,
    shortcut: 'Ctrl+Alt+P',
  })
  const first = await reload(memory.backend, 'Alt+Q')
  await first.recordUse('command:/goal')

  const second = await reload(memory.backend, 'Alt+Q')
  assert.equal(second.snapshot.shortcut, 'Ctrl+Alt+P')
  assert.equal((memory.read() as { shortcutCustomized: boolean }).shortcutCustomized, true)
})

test('legacy Ctrl+Shift+K migrates to the platform default', async () => {
  const windows = await reload(memoryBackend(LEGACY_DEFAULTS).backend, 'Alt+Q')
  const mac = await reload(memoryBackend(LEGACY_DEFAULTS).backend, 'Cmd+Shift+K')

  assert.equal(windows.snapshot.shortcut, 'Alt+Q')
  assert.equal(mac.snapshot.shortcut, 'Cmd+Shift+K')
})

test('legacy non-default shortcut is treated as explicit customization', async () => {
  const memory = memoryBackend({ ...LEGACY_DEFAULTS, shortcut: 'Ctrl+Alt+P' })
  const first = await reload(memory.backend, 'Alt+Q')
  await first.togglePin('command:/goal')

  const second = await reload(memory.backend, 'Alt+Q')
  assert.equal(second.snapshot.shortcut, 'Ctrl+Alt+P')
  assert.equal((memory.read() as { shortcutCustomized: boolean }).shortcutCustomized, true)
})

test('frecency and pin persistence never replace the effective shortcut', async () => {
  const memory = memoryBackend()
  const first = await reload(memory.backend, 'Alt+Q')
  await first.recordUse('command:/goal')
  await first.togglePin('command:/goal')

  assert.equal(first.snapshot.shortcut, 'Alt+Q')
  const second = await reload(memory.backend, 'Alt+Q')
  assert.equal(second.snapshot.shortcut, 'Alt+Q')
  assert.equal(second.snapshot.frecency['command:/goal']?.count, 1)
  assert.ok(second.snapshot.pins['command:/goal'])
})

test('keys.actions bridge missing => no behavior change', () => {
  const ctxWithoutKeys = { get: () => undefined, on: () => () => undefined }
  assert.doesNotThrow(() => bridgeKeysActions(ctxWithoutKeys, {
    label: () => 'Open Universal Palette',
    description: () => 'Search commands, sessions, models, and history',
    toggle: () => undefined,
  }))
})
