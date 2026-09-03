/**
 * Conversation Hits provider (P0, spec §6.1, §8.5).
 *
 * Source: `ctx.sessionQuery.searchSessions` and `.searchEvents` from
 * `dsh-tool-session-query` (which is opt-in and not mounted by default
 * per packages/session-query/tool-session-query/README.md). When the
 * capability is absent, the provider degrades: no items, no crash.
 *
 * Two-row shape (spec §4.5): we keep one PaletteItem per session hit,
 * carrying `snippet` for the Conversation Hit row variant (which is
 * taller than a normal result row in the UI).
 *
 * The provider is intentionally LAST in registration order so the FTS
 * path never blocks a P0 query (spec §13 Phase C).
 */

import type {
  PaletteAction,
  PaletteCollectInput,
  PaletteItem,
  PaletteProvider,
} from '../../shared/contract.ts'
import type {
  CapabilityProbe,
  EventSearchHit,
  SessionSearchHit,
} from '../capabilities.ts'

export function createConversationHitsProvider(probe: CapabilityProbe): PaletteProvider | null {
  if (!probe.sessionQuery) return null

  return {
    id: 'conversation-hits',
    label: 'Conversation Hits',
    availability: 'ready',

    async collect(input: PaletteCollectInput, signal: AbortSignal): Promise<PaletteItem[]> {
      const cap = probe.sessionQuery!
      const q = input.query.trim()
      if (q.length === 0) return []
      let sessionHits: readonly SessionSearchHit[] = []
      try {
        sessionHits = await cap.searchSessions(q, signal)
      } catch {
        if (signal.aborted) return []
        return []
      }
      if (signal.aborted) return []

      const items: PaletteItem[] = []
      for (const h of sessionHits) {
        if (signal.aborted) break
        items.push(buildHitItem(h, probe))
      }
      return items.slice(0, input.limit)
    },
  }
}

function buildHitItem(hit: SessionSearchHit, probe: CapabilityProbe): PaletteItem {
  const id = `conversation-hits:${hit.sessionId}`
  const openAt: PaletteAction = {
    id: 'open',
    title: 'Open',
    kind: 'primary',
    run: async () => {
      // Best-effort open. DSH does not currently expose a stable
      // "open at exact seq" wire; spec §4.5 + §8.5 require we do not
      // fake precise location. Open-session is the only honest move.
      const cap = probe.sessions
      if (!cap) return
      await cap.open(hit.sessionId)
    },
  }
  const reference: PaletteAction = {
    id: 'reference',
    title: 'Reference session',
    kind: 'secondary',
    run: async () => {
      const ref = probe.referenceSource
      if (!ref) return
      await ref.list(`dsh-session:${hit.sessionId}`, new AbortController().signal)
    },
  }
  const copyExcerpt: PaletteAction = {
    id: 'copy-excerpt',
    title: 'Copy excerpt',
    kind: 'secondary',
    run: async () => {
      if (!hit.snippet) return
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(hit.snippet)
      }
    },
  }
  return {
    id,
    providerId: 'conversation-hits',
    kind: 'conversation-hit',
    title: hit.title || '(untitled)',
    subtitle: hit.snippet ? undefined : 'conversation hit',
    snippet: hit.snippet,
    badges: hit.updatedAt ? [relativeAge(hit.updatedAt)] : undefined,
    primary: openAt,
    secondary: [reference, copyExcerpt],
    context: { sessionId: hit.sessionId },
  }
}

function relativeAge(updatedAt: number): string {
  const diff = Date.now() - updatedAt
  const m = Math.round(diff / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

/**
 * Adapter helper exposed for tests: lets the test harness inject a
 * pre-loaded conversation-hit shape without re-implementing the wire.
 */
export function fromEventHit(hit: EventSearchHit): PaletteItem {
  const id = `conversation-hits:${hit.sessionId}:${hit.eventSeq ?? 'tail'}`
  return {
    id,
    providerId: 'conversation-hits',
    kind: 'conversation-hit',
    title: hit.snippet.slice(0, 60),
    snippet: hit.snippet,
    badges: hit.updatedAt ? [relativeAge(hit.updatedAt)] : undefined,
    primary: {
      id: 'open',
      title: 'Open',
      kind: 'primary',
      run: async () => {},
    },
    secondary: [],
    context: { sessionId: hit.sessionId },
  }
}
