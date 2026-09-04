import type { PaletteAction, PaletteItem, PaletteProvider } from '../../shared/contract.ts'
import type { CapabilityProbe, SessionSearchHit } from '../capabilities.ts'

export function createConversationHitsProvider(probe: CapabilityProbe): PaletteProvider | null {
  if (!probe.sessionQuery) return null
  return {
    id: 'conversation-hits',
    label: 'Conversation Hits',
    availability: 'ready',
    async collect(input, signal) {
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
      const cap = probe.sessions
      if (!cap) return
      await cap.open(hit.sessionId)
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
    secondary: [],
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
