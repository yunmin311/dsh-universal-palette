/**
 * Integration test: full aggregator + ranking + provider flow.
 *
 * Spec §15 acceptance: keyboard, ranking, provider isolation,
 * session/model action, DSH API missing → graceful degrade.
 *
 * We mount the aggregator only (UI is verified separately via a smoke
 * test in the DOM shim harness).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PaletteAggregator } from '../../src/client/aggregator.ts'
import { PreferencesStore } from '../../src/client/ranking/frecency.ts'
import { createInMemoryBackend } from '../../src/client/state/preferences-backend.ts'
import { probe, capabilityReport, type HostSurface } from '../../src/client/capabilities.ts'
import { createCommandsProvider } from '../../src/client/providers/commands.ts'
import { createSessionsProvider } from '../../src/client/providers/sessions.ts'
import { createModelsProvider } from '../../src/client/providers/models.ts'
import type { PaletteItem, PaletteProvider } from '../../src/shared/contract.ts'

const fullHost: HostSurface = {
  version: '0.1.2-alpha.3',
  hasShellOverlaySlot: true,
  commands: {
    list: async () => [
      { name: 'compact', description: 'Compact current session' },
      { name: 'goal', description: 'Set a goal' },
    ],
    find: async () => undefined,
    execute: async () => ({ kind: 'success' }),
  },
  sessions: {
    list: async () => [
      { id: 's1', title: 'Auth refactor', workspaceId: 'w1', updatedAt: Date.now() },
    ],
    getCurrent: () => ({ id: 's1', workspaceId: 'w1' }),
    getCurrentWorkspace: () => ({ id: 'w1' }),
    open: async (id) => {
      ;(globalThis as { lastOpen?: string }).lastOpen = id
    },
  },
  workspaces: {
    list: async () => [{ id: 'w1', title: 'main' }],
    current: () => ({ id: 'w1' }),
  },
  modelDirectory: {
    list: async () => [
      {
        provider: 'deepseek',
        models: [{ id: 'r1', displayName: 'DeepSeek Reasoner' }],
      },
    ],
    select: async (_sid, sel) => {
      ;(globalThis as { lastSelect?: unknown }).lastSelect = sel
    },
  },
}

test('full flow: open palette → query mixed → action opens session', async () => {
  const p = probe(fullHost)
  const report = capabilityReport(p)
  assert.equal(report.commands, true)
  assert.equal(report.sessions, true)
  assert.equal(report.modelDirectory, true)

  const providers: PaletteProvider[] = [
    createCommandsProvider(p)!,
    createSessionsProvider(p)!,
    createModelsProvider(p)!,
  ]

  const backend = createInMemoryBackend()
  const prefs = new PreferencesStore(backend)
  await prefs.load()
  const agg = new PaletteAggregator({
    providers,
    preferences: prefs,
    capabilityProbe: p,
    softDeadlineMs: 100,
    hardLimit: 40,
    debounceMs: 0,
  })

  await agg.setQueryImmediate('compact')
  const state = agg.getState()
  // Commands include "/compact" so it should rank first via exact prefix
  const top = state.items[0]
  assert.ok(top)
  assert.equal(top!.item.title, '/compact')

  // Now search for an existing session by id-like text
  await agg.setQueryImmediate('auth')
  const state2 = agg.getState()
  const sessionItem = state2.items.find((r) => r.item.kind === 'session')
  assert.ok(sessionItem)
  assert.equal(sessionItem!.item.title, 'Auth refactor')

  // Run the primary action — should call session.open via the wire
  await sessionItem!.item.primary.run(new AbortController().signal)
  assert.equal((globalThis as { lastOpen?: string }).lastOpen, 's1')
})

test('graceful degradation: only commands capability available', async () => {
  const host: HostSurface = {
    commands: {
      list: async () => [{ name: 'compact', description: 'Compact current session' }],
      find: async () => undefined,
      execute: async () => ({ kind: 'success' }),
    },
  }
  const p = probe(host)
  const report = capabilityReport(p)
  assert.equal(report.commands, true)
  assert.equal(report.sessions, false)
  assert.equal(report.modelDirectory, false)
  // Only the commands provider should register
  assert.ok(createCommandsProvider(p))
  assert.equal(createSessionsProvider(p), null)
  assert.equal(createModelsProvider(p), null)
  assert.equal(createConversationHitsProvider(p), null)
})

import { createConversationHitsProvider } from '../../src/client/providers/conversation-hits.ts'

test('mixed query returns ranked cross-kind items', async () => {
  const p = probe(fullHost)
  const providers: PaletteProvider[] = [
    createCommandsProvider(p)!,
    createSessionsProvider(p)!,
    createModelsProvider(p)!,
  ]
  const backend = createInMemoryBackend()
  const prefs = new PreferencesStore(backend)
  await prefs.load()
  const agg = new PaletteAggregator({
    providers,
    preferences: prefs,
    capabilityProbe: p,
    softDeadlineMs: 100,
    hardLimit: 40,
    debounceMs: 0,
  })
  await agg.setQueryImmediate('deep')
  const items = agg.getState().items
  assert.ok(items.length > 0)
  assert.ok(items.some((i) => i.item.kind === 'model'))
})

test('aggregator caps at hardLimit', async () => {
  const manyProvider: PaletteProvider = {
    id: 'many',
    label: 'many',
    collect(input) {
      const arr: PaletteItem[] = []
      for (let i = 0; i < 100; i++) {
        arr.push({
          id: `many:${i}`,
          providerId: 'many',
          kind: 'action',
          title: `item ${i}`,
          primary: { id: 'p', title: 'p', kind: 'primary', run: async () => {} },
        })
      }
      return arr.slice(0, input.limit)
    },
  }
  const p = probe({})
  const backend = createInMemoryBackend()
  const prefs = new PreferencesStore(backend)
  await prefs.load()
  const agg = new PaletteAggregator({
    providers: [manyProvider],
    preferences: prefs,
    capabilityProbe: p,
    softDeadlineMs: 100,
    hardLimit: 40,
    debounceMs: 0,
  })
  await agg.setQueryImmediate('item')
  assert.ok(agg.getState().items.length <= 40)
})
