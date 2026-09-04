/**
 * Unit tests: provider failure isolation.
 *
 * Verifies that one provider's throw / timeout / abort does not
 * propagate to the aggregator; other providers' items still
 * surface.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PaletteAggregator } from '../../src/client/aggregator.ts'
import type { PaletteProvider } from '../../src/shared/contract.ts'

function okProvider(id: string, titles: string[]): PaletteProvider {
  return {
    id,
    label: id,
    collect() {
      return titles.map((title) => ({
        id: `${id}:${title}`,
        providerId: id,
        kind: 'command',
        title,
        primary: { id: 'p', title: 'p', kind: 'primary', run: async () => {} },
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

test('one provider throws -> other provider still emits items', async () => {
  const agg = new PaletteAggregator({
    providers: [throwingProvider('bad', 5), okProvider('good', ['foo'])],
    preferences: () => ({
      pins: {},
      frecency: {},
      glassIntensity: 'soft',
      shortcut: 'Ctrl+Shift+K',
    }),
    softDeadlineMs: 50,
    hardLimit: 40,
    debounceMs: 0,
  })
  await agg.setQueryImmediate('foo')
  const state = agg.getState()
  assert.equal(state.items.find((r) => r.item.providerId === 'good')?.item.title, 'foo')
  assert.equal(state.failures.length, 1)
  assert.equal(state.failures[0]?.providerId, 'bad')
})

test('slow provider past soft deadline does not block other results', async () => {
  const agg = new PaletteAggregator({
    providers: [hangingProvider('slow'), okProvider('fast', ['foo'])],
    preferences: () => ({
      pins: {},
      frecency: {},
      glassIntensity: 'soft',
      shortcut: 'Ctrl+Shift+K',
    }),
    softDeadlineMs: 50,
    hardLimit: 40,
    debounceMs: 0,
  })
  await agg.setQueryImmediate('foo')
  const state = agg.getState()
  assert.equal(state.items.find((r) => r.item.providerId === 'fast')?.item.title, 'foo')
})

test('cancel aborts in-flight query', async () => {
  const agg = new PaletteAggregator({
    providers: [hangingProvider('hanging')],
    preferences: () => ({
      pins: {},
      frecency: {},
      glassIntensity: 'soft',
      shortcut: 'Ctrl+Shift+K',
    }),
    softDeadlineMs: 50,
    hardLimit: 40,
    debounceMs: 0,
  })
  const first = agg.setQueryImmediate('first')
  const second = agg.setQueryImmediate('second')
  await Promise.all([first, second])
  assert.equal(agg.getState().query, 'second')
})
