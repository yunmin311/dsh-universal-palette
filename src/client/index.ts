/** DSH Universal Palette browser plugin for the locked public Client API. */

import { type Context } from '@deepseek-ai/cordis'
import { createElement, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { NS, en, zh, presentItem } from './locales.ts'

import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import { createStartupItems, contextualItems } from './startup.ts'
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'

import { PaletteAggregator, type QueryState } from './aggregator.ts'
import {
  createCommandsProvider,
  createConversationHitsProvider,
  currentPaletteContext,
  createModelsProvider,
  createSessionsProvider,
} from './adapters.ts'
import { attachKeyboard, type ShortcutReport } from './keyboard.ts'
import { bridgeKeysActions } from './keysActions.ts'
import {
  createLocalStorageBackend,
  PreferencesStore,
} from './state/preferences.ts'
import {
  UniversalPalette,
  type UniversalPaletteProps,
} from './UniversalPalette.tsx'
import type { PaletteAction, PaletteItem } from '../shared/contract.ts'

export const inject = [
  'remote',
  'remote.commands',
  'sessions',
  'workspaces',
  'modelDirectories',
  'slots',
  'uiWorkspace',
  'inputTriggers',
  'locale',
] as const

interface PaletteOverlayProps {
  readonly ctx: Context
  readonly sidebar: { getSnapshot: () => boolean; subscribe: (fn: () => void) => () => void }
  readonly aggregator: PaletteAggregator
  readonly preferences: PreferencesStore
  readonly paletteControl: { toggle: () => void }
}

/** Register only after ui-layout has declared shell.overlay. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, {zh, en}), 'universal-palette: dictionaries')
  const preferences = new PreferencesStore(createLocalStorageBackend())
  void preferences.load()
  const aggregator = new PaletteAggregator({
    providers: [
      createCommandsProvider(ctx.remote.commands, ctx.sessions, ctx.inputTriggers),
      createSessionsProvider(ctx.sessions, ctx.workspaces),
      createModelsProvider(ctx.sessions, ctx.modelDirectories),
      createConversationHitsProvider(ctx.sessions),
    ],
    preferences: () => preferences.snapshot,
    context: () => currentPaletteContext(ctx.sessions, ctx.workspaces),
  })

  // Public footer owner prop communicates wide/compact only. No DOM or store reads.
  let wide = true
  const listeners = new Set<() => void>()
  const sidebar = { getSnapshot: () => wide, subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } } }
  const SidebarState = (props: { wide: boolean }) => {
    useEffect(() => { wide = props.wide; for (const listener of listeners) listener() }, [props.wide])
    return null
  }
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action', id: 'dsh-universal-palette-layout-state',
  }, SidebarState))
  // Optional Keys Palette bridge: exactly one bindable "open" action over the
  // public keys.actions service; absent plugin means zero behavior change.
  const paletteControl = { toggle: () => {} }
  ctx.effect(() => bridgeKeysActions(ctx, {
    label: () => (ctx.locale.getSnapshot().active.startsWith('zh') ? '打开 Universal Palette' : 'Open Universal Palette'),
    description: () => (ctx.locale.getSnapshot().active.startsWith('zh')
      ? '搜索命令、会话、模型与历史' : 'Search commands, sessions, models, and history'),
    toggle: () => paletteControl.toggle(),
    onLocaleChange: fn => (typeof ctx.locale.subscribe === 'function' ? ctx.locale.subscribe(fn) : () => {}),
  }), 'universal-palette: keys-actions bridge')
  const PaletteEntry = () => createElement(PaletteOverlay, { ctx, sidebar, aggregator, preferences, paletteControl })
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'dsh-universal-palette',
  }, PaletteEntry))
}

function PaletteOverlay({ ctx, sidebar, aggregator, preferences, paletteControl }: PaletteOverlayProps) {
  const locale = useSyncExternalStore(fn => ctx.locale.subscribe(fn), () => ctx.locale.getSnapshot())
  const t = ctx.locale.bind(NS)
  const sidebarWide = useSyncExternalStore(sidebar.subscribe, sidebar.getSnapshot)
  const [open, setOpen] = useState(false)
  const openRef = useRef(false)
  const panelRef = useRef(false)
  const returnFocus = useRef<HTMLElement | null>(null)
  const [draft, setDraft] = useState('')
  const [mode, setMode] = useState<'all' | 'workspaces' | 'sessions'>('all')
  const [error, setError] = useState('')
  const [, setContextVersion] = useState(0)
  const close = () => {
    openRef.current = false
    panelRef.current = false
    setOpen(false)
    setActionPanelOpen(false)
    aggregator.cancel()
    if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true })
  }
  const escape = () => {
    if (panelRef.current) { panelRef.current = false; setActionPanelOpen(false) }
    else close()
  }
  const [queryState, setQueryState] = useState<QueryState>(() => aggregator.getState())
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [actionPanelOpen, setActionPanelOpen] = useState(false)
  const [actionPanelSelectedIndex, setActionPanelSelectedIndex] = useState(0)
  const [conflicts, setConflicts] = useState<readonly string[]>([])

  useEffect(() => aggregator.subscribe((next) => {
    setQueryState(next)
    setSelectedIndex(index => Math.min(index, Math.max(0, next.items.length - 1)))
  }), [aggregator])

  useEffect(() => {
    const show = () => {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      openRef.current = true
      panelRef.current = false
      setOpen(true)
      setDraft('')
      setMode('all')
      setError('')
      setSelectedIndex(0)
      setActionPanelOpen(false)
      void aggregator.setQueryImmediate('')
    }
    paletteControl.toggle = () => { openRef.current ? close() : show() }
    const keyboard = attachKeyboard({
      shortcut: preferences.snapshot.shortcut || 'Ctrl+Shift+K',
      isOpen: () => openRef.current,
      onOpen: show,
      onClose: close,
      onEscape: escape,
      onConflictDetected: (report: ShortcutReport) => { setConflicts(report.conflictsWith) },
    })
    const refresh = () => {
      if (!openRef.current) return
      setContextVersion(value => value + 1)
      void aggregator.setQueryImmediate(aggregator.getState().query)
    }
    const offSessions = ctx.sessions.list.subscribe(refresh)
    const offWorkspaces = ctx.workspaces.list.subscribe(refresh)
    return () => {
      offSessions()
      offWorkspaces()
      keyboard.dispose()
      aggregator.cancel()
    }
  }, [aggregator, preferences, ctx])

  if (!open) return null

    const hasSession = ctx.sessions.list.getSnapshot().current !== undefined
    const workspaces = ctx.workspaces.list.getSnapshot().items
    const asRanked = (item: PaletteItem) => ({ item, score: 0, matchRanges: [] })
    const changeMode = (next: 'workspaces' | 'sessions') => { setMode(next); setDraft(''); setSelectedIndex(0); void aggregator.setQueryImmediate('') }
    // During the aggregator's debounce, old-query rows must not remain executable.
    const pendingQuery = queryState.query !== draft.trim().replace(/^>\s*/, '')
    let visible = (pendingQuery ? [] : draft.trim() === '' && hasSession && mode === 'all'
      ? contextualItems(queryState.items) : queryState.items)
      .filter(row => mode !== 'sessions' || row.item.kind === 'session')
      .map(ranked => ({ item: ranked.item, score: ranked.score, matchRanges: ranked.match.ranges }))
    if (mode === 'workspaces') {
      visible = workspaces.filter(w => `${w.title} ${w.path}`.toLowerCase().includes(draft.toLowerCase())).map(w => asRanked({
        id: `workspace:${w.workspaceId}`, providerId: 'navigation', kind: 'workspace', title: w.title, subtitle: w.path,
        primary: { id: 'open-workspace', title: 'Open', run: async () => {
          const id = await ctx.uiWorkspace.connectWorkspace(w.workspaceId)
          ctx.sessions.open(id)
        } },
      }))
    } else if (!hasSession && mode === 'all') {
      const startup = createStartupItems(ctx, () => changeMode('workspaces'), () => changeMode('sessions'), t)
      visible = [...startup.map(asRanked), ...visible]
    }
    const guidance = mode === 'workspaces' ? t('workspace')
      : mode === 'sessions' ? t('recent')
      : !hasSession ? workspaces.length === 0 ? t('choose') : t('create') : undefined
    const contextHint = !hasSession ? t('requires')
      : mode === 'sessions' && visible.length === 0 ? t('noRecent') : undefined
    const displayError = (reason: unknown) => {
      const message = reason instanceof Error ? reason.message : String(reason)
      return message.startsWith('Feedback text is required') ? t('feedbackRequired')
        : locale.active.startsWith('zh') ? t('actionFailed') : message
    }
    const selected = Math.min(selectedIndex, Math.max(0, visible.length - 1))
    const runPrimary = async () => {
      const ranked = visible[selected]
      if (ranked === undefined) return
      await preferences.recordUse(ranked.item.id)
      try {
        await ranked.item.primary.run(new AbortController().signal)
        if (ranked.item.primary.stayOpen !== true) close()
      } catch (error) {
        setError(error instanceof Error ? error.message : String(error))
      }
    }
    const runSecondary = async (item: PaletteItem, action: PaletteAction) => {
      try {
        await preferences.recordUse(item.id)
        await action.run(new AbortController().signal)
        if (action.stayOpen !== true) close()
        else { panelRef.current = false; setActionPanelOpen(false) }
      } catch (error) {
        setError(error instanceof Error ? error.message : String(error))
      }
    }
    const options: UniversalPaletteProps = {
      t,
      sections: hasSession && mode === 'all' && draft.trim() === '',
      emptyMessage: mode === 'sessions' ? t('noRecent') : t('empty'),
      query: draft,
      onClose: close,
      sidebarWide,
      guidance,
      contextHint,
      error: error ? displayError(error) : (queryState.failures.length ? t('providerFailed') : ''),
      isLoading: pendingQuery || queryState.status === 'loading',
      isEmpty: visible.length === 0,
      items: visible.map(row => ({...row, item:presentItem(row.item, t, locale.active.startsWith('zh'))})),
      selectedIndex: selected,
      onSelectedIndexChange: setSelectedIndex,
      onQueryChange: query => { setDraft(query); setSelectedIndex(0); panelRef.current = false; setActionPanelOpen(false); setError(''); aggregator.setQuery(query) },
      onRunPrimary: () => { void runPrimary() },
      onRunSecondary: (item, action) => { void runSecondary(item, action) },
      onOpenActionPanel: () => { panelRef.current = true; setActionPanelOpen(true) },
      onCloseActionPanel: () => { panelRef.current = false; setActionPanelOpen(false) },
      actionPanelOpen,
      actionPanelSelectedIndex,
      onActionPanelIndexChange: setActionPanelSelectedIndex,
      conflicts,
    }
  return createElement(UniversalPalette, options)
}

export default { inject, apply }
