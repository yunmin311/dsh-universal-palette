import type { PaletteAction, PaletteItem, PaletteProvider } from '../../shared/contract.ts'
import type { CapabilityProbe, ModelGroup } from '../capabilities.ts'

export function createModelsProvider(probe: CapabilityProbe): PaletteProvider | null {
  if (!probe.modelDirectory) return null
  return {
    id: 'models',
    label: 'Models',
    availability: 'ready',
    async collect(input, signal) {
      const cap = probe.modelDirectory!
      const session = probe.sessions?.getCurrent?.() as { id?: string } | null
      const sessionId = session?.id
      if (!sessionId) return []
      let groups: readonly ModelGroup[] = []
      try {
        groups = await cap.list(sessionId, signal)
      } catch {
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
  model: { id: string; displayName: string; defaultEffort?: string },
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
