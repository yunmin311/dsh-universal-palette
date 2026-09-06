/**
 * Unit tests: ranking weights.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rankItems } from '../../src/client/ranking/rank.ts'
import type { PaletteItem } from '../../src/shared/contract.ts'

const basePrefs = {
  pins: {} as Record<string, number>,
  frecency: {} as Record<string, { count: number; lastUsedAt: number }>,
  glassIntensity: 'soft' as const,
  shortcut: 'Ctrl+Shift+K',
}

for (const [query, expected] of [
  ['goal', ['goal']], ['permission', ['permission']], ['flash', ['flash']], ['cobalt-otter-904', ['hit']],
] as const) test(`relevance regression: ${query} excludes unrelated models and sessions even when pinned`, () => {
  const rows = [
    item({id:'goal',kind:'command',title:'/goal'}),
    item({id:'permission',kind:'command',title:'/permission'}),
    item({id:'pro',kind:'model',title:'DeepSeek-V4-Pro',subtitle:'Stronger agentic coding, knowledge, and difficult reasoning; suited to complex or quality-critical tasks at higher cost.'}),
    item({id:'flash',kind:'model',title:'DeepSeek-V4-Flash'}),
    item({id:'session',kind:'session',title:'Unrelated conversation',subtitle:'a goal for later'}),
    item({id:'hit',kind:'conversation-hit',title:'Smoke history',snippet:'The cobalt-otter-904 conversation',keywords:['The cobalt-otter-904 conversation']}),
  ]
  assert.deepEqual(rankItems(rows,{query,context:{},preferences:{...basePrefs,pins:{pro:1,session:1}},now:Date.now(),actionsHint:false}).map(r=>r.item.id),expected)
})

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

test('cold-start Recent sessions keeps catalog rows without context, pins or prior palette use', () => {
  const ranked = rankItems([item({id:'s1',kind:'session',title:'Existing conversation'})], {
    query:'', context:{}, preferences:basePrefs, now:Date.now(), actionsHint:false,
  })
  assert.equal(ranked.length, 1)
  assert.equal(ranked[0]!.item.id, 's1')
})

test('empty query returns context+frecency+pinned items', () => {
  const items: PaletteItem[] = [
    item({ id: 'a', title: 'A', context: { workspaceId: 'w1' } }),
    item({ id: 'b', title: 'B', context: { workspaceId: 'w2' } }),
  ]
  const prefs = { ...basePrefs, pins: { a: Date.now() } }
  const ranked = rankItems(items, {
    query: '',
    context: { workspaceId: 'w1' },
    preferences: prefs,
    now: Date.now(),
    actionsHint: false,
  })
  assert.equal(ranked[0]!.item.id, 'a')
})

test('hidden items are excluded (no-op in V1; P0 surface only)', () => {
  // The store still carries `hides` and `aliases` as optional
  // surfaces (V1.1); the ranker does not currently consume them.
  const items: PaletteItem[] = [item({ id: 'a', title: 'A' })]
  const ranked = rankItems(items, {
    query: 'A',
    context: {},
    preferences: basePrefs,
    now: Date.now(),
    actionsHint: false,
  })
  assert.equal(ranked.length, 1)
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

test('frecency ranks recent items higher than old ones', () => {
  const now = Date.now()
  const items: PaletteItem[] = [
    item({ id: 'old', title: 'compact' }),
    item({ id: 'new', title: 'compact' }),
  ]
  const prefs = {
    ...basePrefs,
    frecency: {
      old: { count: 10, lastUsedAt: now - 1000 * 60 * 60 * 24 * 30 },
      new: { count: 1, lastUsedAt: now - 1000 * 60 * 60 },
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
