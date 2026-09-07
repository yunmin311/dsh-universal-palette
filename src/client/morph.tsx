/**
 * Composer Morph wrapper.
 *
 * Registered through the public `conversation.input.overlay` slot —
 * strict per-Session, list-kind, scope 'session'. The Morph renders
 * only when:
 * - the shared SearchController commits `presentation === 'morph'`,
 * - the bound `sessionId` matches the slot's current Session, and
 * - the slot session itself is still resolvable (Session not cleared).
 *
 * On Session switch / clear / scope dispose the slot teardown fires
 * automatically through `ctx.slots.register`'s disposer.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { NS, presentItem } from './locales.ts'
import type { PaletteAggregator } from './aggregator.ts'
import type { PreferencesStore } from './state/preferences.ts'
import type { SidebarObservable } from './sidebarState.ts'
import { SearchController } from './search-controller.ts'
import type { ColdObservable } from './cold.ts'
import { UniversalPalette } from './UniversalPalette.tsx'
import { prepareView, localizedError } from './paletteSurface.tsx'
import type { PaletteAction, PaletteItem } from '../shared/contract.ts'

export interface MorphProps {
  readonly ctx: Context
  readonly sessionId: string
  readonly sidebar: SidebarObservable
  readonly aggregator: PaletteAggregator
  readonly preferences: PreferencesStore
  readonly cold: ColdObservable
  readonly controller: SearchController
}

/**
 * One Morph instance per Session; its lifecycle is the slot lifecycle.
 * The wrapper binds to `sessionId` and re-reads it on every render so
 * a slot Session flip naturally re-mounts through React's key (the
 * parent calls `<Morph ... key={sessionId} />`).
 */
export function Morph(props: MorphProps) {
  const locale = useSyncExternalStore(fn => props.ctx.locale.subscribe(fn), () => props.ctx.locale.getSnapshot())
  const t = useMemo(() => bindLocale(props.ctx.locale, NS), [props.ctx.locale])
  const sidebarWide = useSyncExternalStore(props.sidebar.subscribe, props.sidebar.getSnapshot)
  const cold = useSyncExternalStore(props.cold.subscribe, props.cold.getSnapshot)
  const state = useSyncExternalStore(
    fn => props.controller.subscribe(fn),
    () => props.controller.getState(),
  )
  const [error, setError] = useState('')
  const [view, setView] = useState(() => buildView(state, props, t))
  useEffect(() => {
    setView(buildView(state, props, t))
  }, [state, props, t, locale])

  // If the controller presentation moved off Morph (or to a different
  // sessionId) we render nothing; the parent slot teardown handles the
  // remaining disposal when the Session itself goes away.
  if (state.presentation !== 'morph') return null
  if (state.sessionId !== props.sessionId) return null

  const runPrimary = async () => {
    const item = view.items[Math.min(state.selectedIndex, Math.max(0, view.items.length - 1))]?.item
    if (!item) return
    try {
      await props.preferences.recordUse(item.id)
      await item.primary.run(new AbortController().signal)
      if (item.primary.stayOpen !== true) props.controller.close()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  const runSecondary = async (item: PaletteItem, action: PaletteAction) => {
    try {
      await props.preferences.recordUse(item.id)
      await action.run(new AbortController().signal)
      if (action.stayOpen !== true) props.controller.close()
      else props.controller.setActionPanelOpen(false)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  const displayError = error
    ? localizedError(error, { ctx: props.ctx, hasSession: true, workspaces: [], t })
    : (state.aggregator.failures.length ? t('providerFailed') : '')
  return <div data-presentation="morph" data-session-id={props.sessionId}>
    <UniversalPalette
      t={t}
      sidebarWide={sidebarWide}
      cold={cold}
      query={state.draft}
      isLoading={view.pendingQuery || state.aggregator.status === 'loading'}
      isEmpty={view.items.length === 0}
      sections={view.sections}
      emptyMessage={view.emptyMessage}
      guidance={view.guidance}
      contextHint={view.contextHint}
      error={displayError}
      items={view.items}
      selectedIndex={Math.min(state.selectedIndex, Math.max(0, view.items.length - 1))}
      conflicts={[]}
      actionPanelOpen={state.actionPanelOpen}
      actionPanelSelectedIndex={state.actionPanelSelectedIndex}
      onSelectedIndexChange={(i) => props.controller.setSelectedIndex(i)}
      onQueryChange={(q) => props.controller.setDraft(q)}
      onRunPrimary={() => { void runPrimary() }}
      onRunSecondary={(item, action) => { void runSecondary(item, action) }}
      onOpenActionPanel={() => props.controller.setActionPanelOpen(true)}
      onCloseActionPanel={() => props.controller.setActionPanelOpen(false)}
      onActionPanelIndexChange={(i) => props.controller.setActionPanelIndex(i)}
      onClose={() => props.controller.close()}
      rootDataAttributes={{ 'data-presentation': 'morph' }}
    />
  </div>
}

function buildView(
  state: ReturnType<SearchController['getState']>,
  props: MorphProps,
  t: (key: string, params?: Record<string, unknown>) => string,
) {
  const workspaces = props.ctx.workspaces.list.getSnapshot().items.map((w) => ({
    workspaceId: String(w.workspaceId),
    title: w.title,
    path: w.path,
  }))
  const view = prepareView(state, {
    ctx: props.ctx,
    hasSession: props.ctx.sessions.list.getSnapshot().current !== undefined,
    workspaces,
    t,
  })
  return view
}

function bindLocale(locale: LocaleRuntime, ns: string): (key: string, params?: Record<string, unknown>) => string {
  return (locale.bind as unknown as (namespace: string) => (key: string, params?: Record<string, unknown>) => string)(ns)
}