/**
 * Unit tests: provider failure isolation.
 *
 * Per spec §3 + §11: a single provider's throw / timeout / abort must
 * not propagate to the aggregator. Other providers must still emit
 * their items.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PaletteAggregator } from '../../src/client/aggregator.ts'
import { PreferencesStore } from '../../src/client/ranking/frecency.ts'
import { createInMemoryBackend } from '../../src/client/state/preferences-backend.ts'
import type { CapabilityProbe } from '../../src/client/capabilities.ts'
import type { PaletteProvider } from '../../src/shared/contract.ts'

const noProbe: CapabilityProbe = {
  commands: null,
  sessions: null,
  workspaces: null,
  modelDirectory: null,
  sessionQuery: null,
  skills: null,
  referenceSource: null,
  theme: null,
  shellOverlaySlot: false,
  thirdPartyProviders: false,
  dshVersion: 'test',
}

function okProvider(id: string, items: { id: string; title: string }[]): PaletteProvider {
  return {
    id,
    label: id,
    collect() {
      return items.map((i) => ({
        id: `${id}:${i.id}`,
        providerId: id,
        kind: 'command' as const,
        title: i.title,
        primary: { id: 'p', title: 'p', kind: 'primary' as const, run: async () => {} },
        secondary: [],
      }))
    },
  }
}

function throwingProvider(id: string, afterMs: number): PaletteProvider {
  return {
    id,
    label: id,
    collect(_input, signal) {
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('boom')), afterMs)
        signal.addEventListener('abort', () => {
          clearTimeout(t)
          reject(new DOMException('aborted', 'AbortError'))
        })
      })
    },
  }
}

function hangingProvider(id: string): PaletteProvider {
  return {
    id,
    label: id,
    collect(_input, signal) {
      return new Promise((resolve) => {
        signal.addEventListener('abort', () => resolve([]))
      })
    },
  }
}

async function makeAgg(providers: PaletteProvider[]): Promise<PaletteAggregator> {
  const backend = createInMemoryBackend()
  const prefs = new PreferencesStore(backend)
  await prefs.load()
  return new PaletteAggregator({
    providers,
    preferences: prefs,
    capabilityProbe: noProbe,
    softDeadlineMs: 50,
    hardLimit: 40,
    debounceMs: 0,
  })
}

test('one provider throws → other provider still emits items', async () => {
  const agg = await makeAgg([
    throwingProvider('bad', 5),
    okProvider('good', [{ id: '1', title: 'foo' }]),
  ])
  await agg.setQueryImmediate('foo')
  const state = agg.getState()
  assert.equal(state.items.find((r) => r.item.providerId === 'good')?.item.title, 'foo')
  assert.equal(state.failures.length, 1)
  assert.equal(state.failures[0]?.providerId, 'bad')
})

test('slow provider past soft deadline does not block other results', async () => {
  const agg = await makeAgg([
    hangingProvider('slow'),
    okProvider('fast', [{ id: '1', title: 'foo' }]),
  ])
  await agg.setQueryImmediate('foo')
  const state = agg.getState()
  assert.equal(state.items.find((r) => r.item.providerId === 'fast')?.item.title, 'foo')
})

test('new query aborts previous one', async () => {
  const agg = await makeAgg([
    hangingProvider('hanging'),
  ])
  const first = agg.setQueryImmediate('first')
  const second = agg.setQueryImmediate('second')
  await Promise.all([first, second])
  const state = agg.getState()
  // the second query's controller should have aborted the first
  assert.equal(state.query, 'second')
})

test('cancel aborts in-flight query and clears debounce', async () => {
  const agg = await makeAgg([hangingProvider('hanging')])
  const p = agg.setQueryImmediate('q')
  agg.cancel()
  await p
  // No assertion on items count because the provider returns empty on
  // abort. The key check: aggregator is still usable.
  await agg.setQueryImmediate('q2')
  assert.equal(agg.getState().query, 'q2')
})
