/**
 * Commands provider (P0, spec §6.1, §8.3).
 *
 * Source: host's `command.list({ sessionId })` (the per-session command
 * directory). The browser-side adapter for that wire is `ui-commands`,
 * which the activator wraps and injects here as `host.commands`.
 *
 * Capability degradation:
 *   - When `host.commands` is missing (developer-preview DSH may not
 *     expose it on the current profile), the provider is not
 *     registered. Aggregator reports a missing provider, not a crash.
 */

import type {
  PaletteAction,
  PaletteCollectInput,
  PaletteItem,
  PaletteProvider,
} from '../../shared/contract.ts'
import type { CapabilityProbe, CommandDescriptorView } from '../capabilities.ts'

export function createCommandsProvider(probe: CapabilityProbe): PaletteProvider | null {
  if (!probe.commands) return null

  return {
    id: 'commands',
    label: 'Commands',
    availability: 'ready',

    async collect(input: PaletteCollectInput, signal: AbortSignal): Promise<PaletteItem[]> {
      const cap = probe.commands!
      const agent = (probe.sessions?.getCurrent?.() ?? null) as unknown
      let descriptors: readonly CommandDescriptorView[]
      try {
        descriptors = await cap.list(agent)
      } catch (err) {
        if (signal.aborted) return []
        // Single-provider failure: surface 0 items but never throw.
        reportProviderFailure('commands', err)
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

function buildCommandItem(
  desc: CommandDescriptorView,
  probe: CapabilityProbe,
): PaletteItem {
  const id = `commands:${desc.name}`
  const execute: PaletteAction = {
    id: 'execute',
    title: 'Execute',
    kind: 'primary',
    run: async (signal) => {
      const cap = probe.commands!
      const agent = (probe.sessions?.getCurrent?.() ?? null) as unknown
      await cap.execute(agent, `/${desc.name}`, signal)
    },
  }
  return {
    id,
    providerId: 'commands',
    kind: 'command',
    title: `/${desc.name}`,
    subtitle: desc.description,
    keywords: desc.input?.hint ? [desc.input.hint] : undefined,
    primary: execute,
    secondary: [],
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function reportProviderFailure(id: string, err: unknown): void {
  // Hook for future telemetry; spec §11 requires we never throw up.
}
