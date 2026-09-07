/**
 * Presentation-agnostic palette surface adapter.
 *
 * Builds the visible/selectable item list for Floating and Morph from
 * the shared `SearchState` plus the SurfaceDriver's contextual data
 * (session id, workspace list, startup items). Cold is the controller's
 * verdict at snapshot read time, not a layout prop derived here.
 *
 * Both Floating and Morph call this with their own driver; they share
 * one `UniversalPalette` body and one shared SearchController state.
 */
import type { ReactNode } from 'react'
import type { PaletteItem } from '../shared/contract.ts'
import type { SearchState } from './search-controller.ts'
import type { RankedItem } from './ranking/rank.ts'
import { createStartupItems, contextualItems } from './startup.ts'

export interface SurfaceDriver {
  readonly ctx: Pick<import('@deepseek-ai/cordis').Context, 'sessions' | 'workspaces' | 'uiWorkspace'>
  readonly hasSession: boolean
  readonly workspaces: ReadonlyArray<{ workspaceId: string; title: string; path: string }>
  readonly t: (key: string, params?: Record<string, unknown>) => string
  /** Open the active Session's morph through the controller; no-op for Floating. */
  readonly openMorph?: (sessionId: string) => void
}

export interface PreparedView {
  readonly items: readonly { item: PaletteItem; score: number; matchRanges: readonly { start: number; end: number }[] }[]
  readonly guidance?: string
  readonly contextHint?: string
  readonly sections: boolean
  readonly emptyMessage: string
  readonly isEmpty: boolean
  readonly pendingQuery: boolean
}

/**
 * Pure projection from `SearchState + driver` to the renderer-friendly
 * `PreparedView`. No I/O, no React, no surface-specific state.
 */
export function prepareView(state: SearchState, driver: SurfaceDriver): PreparedView {
  const mode = state.mode
  const draft = state.draft
  const pendingQuery = state.query !== draft.trim().replace(/^>\s*/, '')
  const queryItems = state.aggregator.items
  const contextual = draft.trim() === '' && driver.hasSession && mode === 'all'
    ? contextualItems(queryItems as readonly RankedItem[])
    : queryItems
  let visible: readonly { item: PaletteItem; score: number; matchRanges: readonly { start: number; end: number }[] }[]
  if (mode === 'sessions') {
    visible = queryItems
      .filter((row) => row.item.kind === 'session')
      .map((row) => ({ item: row.item, score: row.score, matchRanges: row.match.ranges }))
  } else if (mode === 'workspaces') {
    visible = driver.workspaces
      .filter((w) => `${w.title} ${w.path}`.toLowerCase().includes(draft.toLowerCase()))
      .map((w) => ({ item: workspaceItem(w, driver), score: 0, matchRanges: [] }))
  } else {
    const base = contextual.map((row) => ({ item: row.item, score: row.score, matchRanges: row.match.ranges }))
    if (!driver.hasSession) {
      const startup = createStartupItems(
        driver.ctx,
        () => undefined,
        () => undefined,
        driver.t,
      )
      visible = [...startup.map(asRanked), ...base]
    } else {
      visible = base
    }
  }

  const guidance = mode === 'workspaces'
    ? driver.t('workspace')
    : mode === 'sessions'
    ? driver.t('recent')
    : !driver.hasSession
    ? driver.workspaces.length === 0 ? driver.t('choose') : driver.t('create')
    : undefined

  const contextHint = !driver.hasSession
    ? driver.t('requires')
    : mode === 'sessions' && visible.length === 0 ? driver.t('noRecent') : undefined

  const emptyMessage = mode === 'sessions' ? driver.t('noRecent') : driver.t('empty')

  return {
    items: pendingQuery ? [] : visible,
    guidance,
    contextHint,
    sections: driver.hasSession && mode === 'all' && draft.trim() === '',
    emptyMessage,
    isEmpty: visible.length === 0,
    pendingQuery,
  }
}

function asRanked(item: PaletteItem): { item: PaletteItem; score: number; matchRanges: readonly { start: number; end: number }[] } {
  return { item, score: 0, matchRanges: [] }
}

function workspaceItem(
  w: { workspaceId: string; title: string; path: string },
  driver: SurfaceDriver,
): PaletteItem {
  return {
    id: `workspace:${w.workspaceId}`,
    providerId: 'navigation',
    kind: 'workspace',
    title: w.title,
    subtitle: w.path,
    primary: {
      id: 'open-workspace',
      title: 'Open',
      run: async () => {
        driver.openMorph?.(w.workspaceId)
      },
    },
  }
}

export function localizedError(
  reason: unknown,
  driver: SurfaceDriver,
): string {
  const message = reason instanceof Error ? reason.message : String(reason)
  return message.startsWith('Feedback text is required') ? driver.t('feedbackRequired') : message
}

export function noopNode(): ReactNode { return null }