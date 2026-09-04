import type { PaletteAction, PaletteItem, PaletteProvider } from '../../shared/contract.ts'
import type { CommandDescriptorView, CapabilityProbe } from '../capabilities.ts'

export function createCommandsProvider(probe: CapabilityProbe): PaletteProvider | null {
  if (!probe.commands) return null
  return {
    id: 'commands',
    label: 'Commands',
    availability: 'ready',
    async collect(input, signal) {
      const cap = probe.commands!
      const agent = (probe.sessions?.getCurrent?.() ?? null) as unknown
      let descriptors: readonly CommandDescriptorView[] = []
      try {
        descriptors = await cap.list(agent)
      } catch {
        if (signal.aborted) return []
        return []
      }
      if (signal.aborted) return []
      const items: PaletteItem[] = []
      for (const d of descriptors) {
        if (signal.aborted) break
        items.push(buildCommandItem(d, probe))
      }
      return items.slice(0, input.limit)
    },
  }
}

function buildCommandItem(d: CommandDescriptorView, probe: CapabilityProbe): PaletteItem {
  const id = `commands:${d.name}`
  const execute: PaletteAction = {
    id: 'execute',
    title: 'Execute',
    kind: 'primary',
    run: async (signal) => {
      const cap = probe.commands!
      const agent = (probe.sessions?.getCurrent?.() ?? null) as unknown
      await cap.execute(agent, `/${d.name}`, signal)
    },
  }
  return {
    id,
    providerId: 'commands',
    kind: 'command',
    title: `/${d.name}`,
    subtitle: d.description,
    keywords: d.input?.hint ? [d.input.hint] : undefined,
    primary: execute,
    secondary: [],
  }
}
