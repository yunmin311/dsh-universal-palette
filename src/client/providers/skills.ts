/**
 * Skills provider (P1, spec §6.1, §8.6).
 *
 * Source: the skill catalog exposed via `skills/list` Remote (used by
 * `dsh-client-ui-skill`). We do NOT replicate the slash-pipeline pick
 * (that's dsh-reference-anything); we surface skills as palette items
 * with a primary action that inserts a literal `/skillname` token and
 * closes the palette. DSH's `dsh-tool-skill` recognizes the token at
 * pre-step boundary and injects the body — deterministically.
 */

import type {
  PaletteAction,
  PaletteCollectInput,
  PaletteItem,
  PaletteProvider,
} from '../../shared/contract.ts'
import type { CapabilityProbe } from '../capabilities.ts'

export function createSkillsProvider(probe: CapabilityProbe): PaletteProvider | null {
  if (!probe.skills) return null

  return {
    id: 'skills',
    label: 'Skills',
    availability: 'ready',

    async collect(input: PaletteCollectInput, signal: AbortSignal): Promise<PaletteItem[]> {
      const cap = probe.skills!
      let entries
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

function buildSkillItem(entry: { name: string; description: string }): PaletteItem {
  const id = `skills:${entry.name}`
  const load: PaletteAction = {
    id: 'load',
    title: 'Insert skill',
    kind: 'primary',
    run: async () => {
      // We DO NOT replicate the slash-pipeline UX (that is the input
      // trigger's job and dsh-reference-anything's domain). The palette
      // exposes a stable insertion path: dispatch a CustomEvent that
      // any active Composer (or the input trigger) can listen for.
      if (typeof document === 'undefined') return
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
