import type { PaletteAction, PaletteItem, PaletteProvider } from '../../shared/contract.ts'
import type { CapabilityProbe, SkillEntry } from '../capabilities.ts'

export function createSkillsProvider(probe: CapabilityProbe): PaletteProvider | null {
  if (!probe.skills) return null
  return {
    id: 'skills',
    label: 'Skills',
    availability: 'ready',
    async collect(input, signal) {
      const cap = probe.skills!
      let entries: readonly SkillEntry[] = []
      try {
        entries = await cap.list(signal)
      } catch {
        if (signal.aborted) return []
        return []
      }
      if (signal.aborted) return []
      const items: PaletteItem[] = []
      for (const e of entries) {
        if (signal.aborted) break
        if (!e.userInvocable) continue
        items.push(buildSkillItem(e))
      }
      return items.slice(0, input.limit)
    },
  }
}

function buildSkillItem(entry: SkillEntry): PaletteItem {
  const id = `skills:${entry.name}`
  const load: PaletteAction = {
    id: 'load',
    title: 'Insert skill',
    kind: 'primary',
    run: async () => {
      document.dispatchEvent(
        new CustomEvent('dsh:palette:insert-skill', {
          detail: { name: entry.name, literal: `/${entry.name} ` },
        }),
      )
    },
  }
  return {
    id,
    providerId: 'skills',
    kind: 'skill',
    title: `/${entry.name}`,
    subtitle: entry.description,
    primary: load,
    secondary: [],
  }
}
