import type { PaletteAction, PaletteItem, PaletteProvider } from '../../shared/contract.ts'
import type { CapabilityProbe, SessionSummary } from '../capabilities.ts'

export function createSessionsProvider(probe: CapabilityProbe): PaletteProvider | null {
  if (!probe.sessions) return null
  return {
    id: 'sessions',
    label: 'Sessions',
    availability: 'ready',
    async collect(input, signal) {
      const cap = probe.sessions!
      const currentWorkspaceId = (probe.workspaces?.current() as { id?: string } | null)?.id
      let summaries: readonly SessionSummary[] = []
      try {
        summaries = await cap.list(signal)
      } catch {
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
  return {
    id,
    providerId: 'sessions',
    kind: 'session',
    title: s.title || '(untitled)',
    subtitle: s.workspaceId && s.workspaceId !== currentWorkspaceId ? `workspace: ${s.workspaceId}` : undefined,
    badges: s.updatedAt ? [relativeAge(s.updatedAt)] : undefined,
    primary: open,
    secondary: [],
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
