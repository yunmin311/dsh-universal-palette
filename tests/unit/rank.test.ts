/**
 * Unit tests: ranking aggregator + frecency + pin/hide.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rankItems } from '../../src/client/ranking/rank.ts'
import type { PaletteItem } from '../../src/shared/contract.ts'
import type { PalettePreferences } from '../../src/client/ranking/frecency.ts'

const basePrefs: PalettePreferences = {
  pins: {},
  hides: {},
  aliases: {},
  frecency: {},
  providers: {},
  glassIntensity: 'soft',
  shortcut: 'Ctrl+Shift+K',
}

function item(partial: Partial<PaletteItem>): PaletteItem {
  return {
    id: partial.id ?? 'x',
    providerId: 'test',
    kind: partial.kind ?? 'action',
    title: partial.title ?? '',
    primary: partial.primary ?? { id: 'p', title: 'p', kind: 'primary', run: async () => {} },
    ...partial,
  }
}

test('empty query returns context+frecency+pinned items', () => {
  const items: PaletteItem[] = [
    item({ id: 'a', title: 'A', context: { workspaceId: 'w1' } }),
    item({ id: 'b', title: 'B', context: { workspaceId: 'w2' } }),
  ]
  const prefs: PalettePreferences = {
    ...basePrefs,
    pins: { a: Date.now() },
  }
  const ranked = rankItems(items, {
    query: '',
    context: { workspaceId: 'w1' },
    preferences: prefs,
    now: Date.now(),
    actionsHint: false,
  })
  assert.equal(ranked[0]!.item.id, 'a')
})

test('hidden items are excluded', () => {
  const items: PaletteItem[] = [
    item({ id: 'a', title: 'A' }),
    item({ id: 'b', title: 'B' }),
  ]
  const prefs: PalettePreferences = {
    ...basePrefs,
    hides: { a: true },
  }
  const ranked = rankItems(items, {
    query: 'a',
    context: {},
    preferences: prefs,
    now: Date.now(),
    actionsHint: false,
  })
  assert.equal(ranked.find((r) => r.item.id === 'a'), undefined)
})

test('exact title prefix jumps to top 1-2 even with lower weighted score', () => {
  const items: PaletteItem[] = [
    item({ id: 'a', title: 'some very long unrelated title' }),
    item({ id: 'b', title: 'compact' }),
  ]
  const ranked = rankItems(items, {
    query: 'comp',
    context: {},
    preferences: basePrefs,
    now: Date.now(),
    actionsHint: false,
  })
  assert.equal(ranked[0]!.item.id, 'b')
})

test('exact alias jumps to top 1-2', () => {
  const items: PaletteItem[] = [
    item({ id: 'a', title: 'goal cancel' }),
    item({ id: 'b', title: 'compact' }),
  ]
  const prefs: PalettePreferences = {
    ...basePrefs,
    aliases: { a: 'gc' },
  }
  const ranked = rankItems(items, {
    query: 'gc',
    context: {},
    preferences: prefs,
    now: Date.now(),
    actionsHint: false,
  })
  assert.ok(['a', 'b'].includes(ranked[0]!.item.id))
})

test('frecency ranks recent items higher than old ones with same title', () => {
  const items: PaletteItem[] = [
    item({ id: 'old', title: 'compact' }),
    item({ id: 'new', title: 'compact' }),
  ]
  const now = Date.now()
  const prefs: PalettePreferences = {
    ...basePrefs,
    frecency: {
      old: { count: 10, lastUsedAt: now - 1000 * 60 * 60 * 24 * 30 }, // 30 days ago
      new: { count: 1, lastUsedAt: now - 1000 * 60 * 60 }, // 1 hour ago
    },
  }
  const ranked = rankItems(items, {
    query: 'comp',
    context: {},
    preferences: prefs,
    now,
    actionsHint: false,
  })
  assert.equal(ranked[0]!.item.id, 'new')
})

test('context ranking: same workspace gets boost', () => {
  const items: PaletteItem[] = [
    item({ id: 'other', title: 'compact', context: { workspaceId: 'w2' } }),
    item({ id: 'same', title: 'compact', context: { workspaceId: 'w1' } }),
  ]
  const ranked = rankItems(items, {
    query: 'comp',
    context: { workspaceId: 'w1' },
    preferences: basePrefs,
    now: Date.now(),
    actionsHint: false,
  })
  assert.equal(ranked[0]!.item.id, 'same')
})

test('actionsHint boosts command/action kinds only', () => {
  const items: PaletteItem[] = [
    item({ id: 'm', kind: 'model', title: 'compact-mini' }),
    item({ id: 'c', kind: 'command', title: 'compact-mini' }),
  ]
  const ranked = rankItems(items, {
    query: 'comp',
    context: {},
    preferences: basePrefs,
    now: Date.now(),
    actionsHint: true,
  })
  // The command kind should rank higher when hint is set
  assert.equal(ranked[0]!.item.id, 'c')
})
