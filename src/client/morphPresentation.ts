import type { PaletteItemKind } from '../shared/contract.ts'

const FIND_PREFIX = '/find'

/** Project the public Composer draft into the Morph query without owning input. */
export function composerSearchQuery(draft: string): { query: string; slashMode: boolean } {
  if (draft === FIND_PREFIX || draft.startsWith(`${FIND_PREFIX} `)) {
    return { query: draft.slice(FIND_PREFIX.length).trimStart(), slashMode: true }
  }
  return { query: draft, slashMode: false }
}

/** Only the result kinds useful in the compact native-style row get a marker. */
export function morphTypeLabel(kind: PaletteItemKind): string | undefined {
  switch (kind) {
    case 'command': return 'COMMAND'
    case 'model': return 'MODEL'
    case 'session': return 'SESSION'
    case 'conversation-hit': return 'CONVERSATION'
    case 'skill': return 'SKILL'
    default: return undefined
  }
}

/** Keep provider prose to one quiet row instead of leaking long metadata blobs. */
export function conciseMorphDescription(value: string | undefined, limit = 96): string {
  const normalized = value?.replace(/\s+/g, ' ').trim() ?? ''
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit).trimEnd()}…`
}
