/**
 * Sessions provider (P0, spec §6.1, §8.5).
 *
 * Source: `ctx.sessions.list({...})` (current-session + workspace-scoped
 * summaries). We deliberately use the per-session `current` workspace as
 * the default scope; when the user types the workspace name (or id), we
 * surface sessions from that workspace. (Cross-workspace policy matches
 * the spec's "current workspace bias" rule.)
 *
 * No fragment search here — that's the Conversation Hit provider. We
 * only return title + workspace + age so the aggregator can rank.
 */

import type {
  PaletteAction,
  PaletteCollectInput,
  PaletteItem,
  PaletteProvider,
} from '../../shared/contract.ts'
import type { CapabilityProbe, SessionSummary } from '../capabilities.ts'

export function createSessionsProvider(probe: CapabilityProbe): PaletteProvider | null {
  if (!probe.sessions) return null

  return {
    id: 'sessions',
    label: 'Sessions',
    availability: 'ready',

    async collect(input: PaletteCollectInput, signal: AbortSignal): Promise<PaletteItem[]> {
      const cap = probe.sessions!
      const currentWorkspaceId = (probe.workspaces?.current() as { id?: string } | null)?.id
      let summaries: readonly SessionSummary[]
      try {
        summaries = await cap.list(signal)
      } catch (err) {
        if (signal.aborted) return []
        return []
      }
      if (signal.aborted) return []

      const items: PaletteItem[] = []
      for (const s of summaries) {
        if (signal.aborted) break
        if (s.archived) continue
        items.push(buildSessionItem(s, currentWorkspaceId, probe))
      }
      return items.slice(0, input.limit)
    },
  }
}

function buildSessionItem(
  s: SessionSummary,
  currentWorkspaceId: string | undefined,
  probe: CapabilityProbe,
): PaletteItem {
  const id = `sessions:${s.id}`
  const open: PaletteAction = {
    id: 'open',
    title: 'Open',
    kind: 'primary',
    run: async () => {
      const cap = probe.sessions!
      await cap.open(s.id)
    },
  }
  const reference: PaletteAction = {
    id: 'reference',
    title: 'Reference in current conversation',
    kind: 'secondary',
    run: async () => {
      // Reference insertion: only available when a current session and
      // the session-reference seam are present. We never silently copy
      // full session bodies into Composer (spec §4.6).
      const ref = probe.referenceSource
      const session = probe.sessions?.getCurrent?.()
      if (!ref || !session) return
      await ref.list(`dsh-session:${s.id}`, new AbortController().signal)
    },
  }
  const copyId: PaletteAction = {
    id: 'copy-id',
    title: 'Copy id',
    kind: 'secondary',
    run: async () => {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(s.id)
      }
    },
  }
  return {
    id,
    providerId: 'sessions',
    kind: 'session',
    title: s.title || '(untitled)',
    subtitle: s.workspaceId && s.workspaceId !== currentWorkspaceId ? `workspace: ${s.workspaceId}` : undefined,
    badges: s.updatedAt ? [relativeAge(s.updatedAt)] : undefined,
    primary: open,
    secondary: [reference, copyId],
    context: { sessionId: s.id, workspaceId: s.workspaceId },
  }
}

function relativeAge(updatedAt: number): string {
  const diff = Date.now() - updatedAt
  const m = Math.round(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  return `${d}d ago`
}
