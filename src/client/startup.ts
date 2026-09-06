import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { PaletteItem } from '../shared/contract.ts'
import type { RankedItem } from './ranking/rank.ts'
import { en, type PaletteTranslate } from './locales.ts'

/** Navigation only: the official Workspace UI owns picking and blank-session reuse. */
export function createStartupItems(
  ctx: Pick<Context, 'sessions' | 'workspaces' | 'uiWorkspace'>,
  showWorkspaces: () => void,
  showRecent: () => void,
  t: PaletteTranslate = key => en[key],
): PaletteItem[] {
  const pick = async () => {
    const path = await ctx.uiWorkspace.pickDirectory()
    if (path === null) return
    const workspace = await ctx.workspaces.create({ path })
    const id = await ctx.uiWorkspace.connectWorkspace(workspace.workspaceId)
    ctx.sessions.open(id)
  }
  const hasWorkspace = ctx.workspaces.list.getSnapshot().items.length > 0
  return [
    { id: 'startup:workspace', providerId: 'navigation', kind: 'action', title: t('workspace'),
      subtitle: t('choose'), primary: { id: 'select-workspace', title: t('workspace'), stayOpen: true,
        run: hasWorkspace ? showWorkspaces : pick } },
    { id: 'startup:new', providerId: 'navigation', kind: 'action', title: t('newSession'),
      subtitle: hasWorkspace ? t('newHint') : t('chooseHint'),
      primary: { id: 'new-session', title: t('newSession'), stayOpen: true,
        run: hasWorkspace ? () => { ctx.uiWorkspace.startSession() } : pick } },
    { id: 'startup:recent', providerId: 'navigation', kind: 'action', title: t('recent'),
      subtitle: t('recentHint'), primary: { id: 'recent', title: t('recent'), stayOpen: true, run: showRecent } },
  ]
}

/** Keep each available native category visible, retaining rank/frecency within it. */
export function contextualItems(items: readonly RankedItem[]): readonly RankedItem[] {
  const unique = new Map<string, RankedItem>()
  for (const row of items) {
    const item = row.item
    const identity = item.kind === 'session' ? item.context?.sessionId ?? item.id : item.id
    const key = `${item.kind}:${identity}`
    const previous = unique.get(key)
    if (!previous || (item.kind === 'session' && item.isCurrent && !previous.item.isCurrent)) unique.set(key, row)
  }
  // Dedupe before the eight-row cap so other sessions can fill vacated places.
  // Other kinds only collapse identical item IDs; no title or cross-type guesses.
  const groups = ['session', 'command', 'model'].map(kind => [...unique.values()].filter(row => row.item.kind === kind))
  groups[0]!.sort((a,b) => Number(!!b.item.isCurrent) - Number(!!a.item.isCurrent))
  const result: RankedItem[] = []
  for (let n = 0; result.length < 8 && groups.some(group => n < group.length); n++) {
    for (const group of groups) {
      if (group[n] && result.length < 8) result.push(group[n]!)
    }
  }
  // Group only after choosing a balanced first eight; within-category rank stays intact.
  return ['session', 'command', 'model'].flatMap(kind => result.filter(row => row.item.kind === kind))
}
