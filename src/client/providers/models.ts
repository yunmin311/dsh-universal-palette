/**
 * Models provider (P0, spec §6.1, §8.4).
 *
 * Source: `ctx.modelDirectories` (per-session provider-grouped directory)
 * and `session.selectModel` (selection contract). Implementation:
 *   - read the current session id (fallback: empty = provider idle)
 *   - call list() and flatten groups into PaletteItems
 *   - primary action submits selection to `session.selectModel`
 *   - secondary actions expose Favorite + "Open source" (which deep-links
 *     into dsh-model-palette's provider config page when the third-party
 *     capability is detected — see spec §2 conflict matrix)
 *
 * Graceful degradation:
 *   - Missing capability: provider not registered.
 *   - Empty current session: provider returns empty (no fake items).
 */

import type {
  PaletteAction,
  PaletteCollectInput,
  PaletteItem,
  PaletteProvider,
} from '../../shared/contract.ts'
import type { CapabilityProbe, ModelEntry, ModelGroup } from '../capabilities.ts'

export function createModelsProvider(probe: CapabilityProbe): PaletteProvider | null {
  if (!probe.modelDirectory) return null

  return {
    id: 'models',
    label: 'Models',
    availability: 'ready',

    async collect(input: PaletteCollectInput, signal: AbortSignal): Promise<PaletteItem[]> {
      const cap = probe.modelDirectory!
      const session = probe.sessions?.getCurrent?.() as { id?: string } | null
      const sessionId = session?.id ?? input.context.sessionId
      if (!sessionId) return []
      let groups: readonly ModelGroup[]
      try {
        groups = await cap.list(sessionId, signal)
      } catch (err) {
        if (signal.aborted) return []
        return []
      }
      if (signal.aborted) return []
      const items: PaletteItem[] = []
      for (const g of groups) {
        for (const m of g.models) {
          if (signal.aborted) break
          items.push(buildModelItem(g.provider, m, sessionId, probe))
        }
      }
      return items.slice(0, input.limit)
    },
  }
}

function buildModelItem(
  provider: string,
  model: ModelEntry,
  sessionId: string,
  probe: CapabilityProbe,
): PaletteItem {
  const id = `models:${provider}:${model.id}`
  const switchAction: PaletteAction = {
    id: 'switch',
    title: 'Switch to this model',
    kind: 'primary',
    run: async () => {
      const cap = probe.modelDirectory!
      await cap.select(sessionId, {
        provider,
        model: model.id,
        effort: model.defaultEffort,
      })
    },
  }
  return {
    id,
    providerId: 'models',
    kind: 'model',
    title: model.displayName,
    subtitle: provider,
    keywords: [provider, model.id],
    badges: model.defaultEffort ? [model.defaultEffort] : undefined,
    primary: switchAction,
    secondary: [],
    context: { provider, sessionId },
  }
}
