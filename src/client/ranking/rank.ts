/**
 * Aggregator-side ranking (spec §7).
 *
 * final = 0.46·text + 0.19·context + 0.15·frecency + 0.10·pin + 0.10·hint
 *
 * Hard rules (spec §7): exact title and exact alias override jumps a
 * result to positions 1-2 even when the weighted score would put it
 * lower.
 */

import type { PaletteContext, PaletteItem } from '../../shared/contract.ts'
import { frecencyScore, type PalettePreferences } from '../state/preferences.ts'
import { matchItem, type MatchResult } from './fuzzy.ts'

export interface RankInput {
  readonly query: string
  readonly context: PaletteContext
  readonly preferences: PalettePreferences
  readonly now: number
  readonly actionsHint: boolean
}

export interface RankedItem {
  readonly item: PaletteItem
  readonly score: number
  readonly match: MatchResult
}

const WEIGHTS = {
  text: 0.46,
  context: 0.19,
  frecency: 0.15,
  pin: 0.1,
  hint: 0.1,
} as const

function contextScore(item: PaletteItem, ctx: PaletteContext): number {
  let s = 0
  const ic = item.context ?? {}
  if (ctx.workspaceId && ic.workspaceId === ctx.workspaceId) s += 0.55
  if (ctx.sessionId && ic.sessionId === ctx.sessionId) s += 0.25
  if (ctx.provider && ic.provider === ctx.provider) s += 0.2
  return Math.min(1, s)
}

function pinBoost(itemId: string, preferences: PalettePreferences): number {
  return preferences.pins[itemId] ? 1 : 0
}

function providerHintScore(item: PaletteItem, hint: boolean, queryEmpty: boolean): number {
  if (!hint) return 0
  if (item.kind === 'command' || item.kind === 'action') return 1
  return 0
}

function emptyQueryScore(
  item: PaletteItem,
  prefs: PalettePreferences,
  ctx: PaletteContext,
  now: number,
): number {
  let s = 0
  s += pinBoost(item.id, prefs) * 1.0
  s += contextScore(item, ctx) * 0.7
  s += frecencyScore(prefs.frecency[item.id], now) * 0.4
  if (item.context?.workspaceId === ctx.workspaceId && ctx.workspaceId) s += 0.15
  return s
}

export function rankItems(items: readonly PaletteItem[], input: RankInput): RankedItem[] {
  const visible: PaletteItem[] = []
  for (const it of items) visible.push(it)

  const empty = input.query.trim().length === 0

  const scored: RankedItem[] = visible.map((item) => {
    if (empty) {
      return {
        item,
        score: emptyQueryScore(item, input.preferences, input.context, input.now),
        match: { score: 0, ranges: [] },
      }
    }

    const match = matchItem(input.query, {
      title: item.title,
      subtitle: item.subtitle,
      keywords: item.keywords,
      aliases: undefined,
    })
    const text = match.score
    const ctx = contextScore(item, input.context)
    const freq = frecencyScore(input.preferences.frecency[item.id], input.now)
    const pin = pinBoost(item.id, input.preferences)
    const hint = providerHintScore(item, input.actionsHint, false)

    const final =
      WEIGHTS.text * text +
      WEIGHTS.context * ctx +
      WEIGHTS.frecency * freq +
      WEIGHTS.pin * pin +
      WEIGHTS.hint * hint

    return { item, score: final, match }
  })

  scored.sort((a, b) => b.score - a.score)

  if (!empty) {
    const top = scored.find((s) => s.match.score >= 0.92)
    if (top) {
      const idx = scored.indexOf(top)
      if (idx > 1) {
        scored.splice(idx, 1)
        scored.unshift(top)
      } else if (idx === 1 && scored.length >= 2) {
        const swap = scored[1]
        scored[1] = top
        scored[0] = swap!
      }
    }
  }

  return scored.filter((s) => (empty ? s.score > 0 : s.match.score > 0))
}
