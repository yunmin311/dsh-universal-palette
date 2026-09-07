import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { NS, presentItem } from './locales.ts'
import type { PaletteAggregator } from './aggregator.ts'
import type { PreferencesStore } from './state/preferences.ts'
import type { SidebarObservable } from './sidebarState.ts'
import { SearchController, type SearchState } from './search-controller.ts'
import type { ColdObservable } from './cold.ts'
import { UniversalPalette } from './UniversalPalette.tsx'
import { prepareView, localizedError } from './paletteSurface.tsx'
import type { PaletteAction, PaletteItem } from '../shared/contract.ts'

export interface FloatingProps {
  readonly ctx: Context
  readonly sidebar: SidebarObservable
  readonly aggregator: PaletteAggregator
  readonly preferences: PreferencesStore
  readonly cold: ColdObservable
  readonly paletteControl: { toggle: () => void }
  readonly controller: SearchController
}

export function Floating(props: FloatingProps) {
  const locale = useSyncExternalStore(fn => props.ctx.locale.subscribe(fn), () => props.ctx.locale.getSnapshot())
  const t = useMemo(() => bindLocale(props.ctx.locale, NS), [props.ctx.locale])
const sidebarWide = useSyncExternalStore(props.sidebar.subscribe, props.sidebar.getSnapshot)
const cold = useSyncExternalStore(props.cold.subscribe, props.cold.getSnapshot)
  const controller = props.controller
  const state = useSyncExternalStore(
    fn => controller.subscribe(fn),
    () => controller.getState(),
  )
  const [conflicts] = useState<readonly string[]>([])
  const [error, setError] = useState('')
  const returnFocus = useRef<HTMLElement | null>(null)
  const [view, setView] = useState(() => buildView(state, props, t))
  useEffect(() => {
    setView(buildView(state, props, t))
  }, [state, props, t, locale])

  // Sessions/workspaces refresh wiring. The keyboard listener is
  // registered once at apply time so it works before this body mounts.
  useEffect(() => {
    const refresh = () => {
      if (controller.getState().presentation !== 'floating') return
      void props.aggregator.setQueryImmediate(controller.getState().draft)
    }
    const offSessions = props.ctx.sessions.list.subscribe(refresh)
    const offWorkspaces = props.ctx.workspaces.list.subscribe(refresh)
    return () => {
      offSessions()
      offWorkspaces()
    }
  }, [controller, props])

  // Restore focus on unmount/close
  useLayoutEffect(() => {
    if (state.presentation !== 'floating') {
      if (returnFocus.current?.isConnected) {
        returnFocus.current.focus({ preventScroll: true })
        returnFocus.current = null
      }
      return
    }
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
  }, [state.presentation])

  if (state.presentation !== 'floating') return null

  const displayError = error
    ? localizedError(error, { ctx: props.ctx, hasSession: true, workspaces: [], t })
    : (state.aggregator.failures.length ? t('providerFailed') : '')
  const runPrimary = async () => {
    const item = view.items[Math.min(state.selectedIndex, Math.max(0, view.items.length - 1))]?.item
    if (!item) return
    try {
      await props.preferences.recordUse(item.id)
      await item.primary.run(new AbortController().signal)
      if (item.primary.stayOpen !== true) controller.close()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  const runSecondary = async (item: PaletteItem, action: PaletteAction) => {
    try {
      await props.preferences.recordUse(item.id)
      await action.run(new AbortController().signal)
      if (action.stayOpen !== true) controller.close()
      else controller.setActionPanelOpen(false)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  return <div data-presentation="floating">
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
      conflicts={conflicts}
      actionPanelOpen={state.actionPanelOpen}
      actionPanelSelectedIndex={state.actionPanelSelectedIndex}
      onSelectedIndexChange={(i) => controller.setSelectedIndex(i)}
      onQueryChange={(q) => controller.setDraft(q)}
      onRunPrimary={() => { void runPrimary() }}
      onRunSecondary={(item, action) => { void runSecondary(item, action) }}
      onOpenActionPanel={() => controller.setActionPanelOpen(true)}
      onCloseActionPanel={() => controller.setActionPanelOpen(false)}
      onActionPanelIndexChange={(i) => controller.setActionPanelIndex(i)}
      onClose={() => controller.close()}
      rootDataAttributes={{ 'data-presentation': 'floating' }}
    />
  </div>
}

function buildView(state: SearchState, props: FloatingProps, t: (key: string, params?: Record<string, unknown>) => string) {
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