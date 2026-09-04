/** DSH Universal Palette browser plugin for the locked public Client API. */

import { type Context } from '@deepseek-ai/cordis'
import { createElement, useEffect, useLayoutEffect, useRef, useState } from 'react'

import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
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
import {
  createLocalStorageBackend,
  PreferencesStore,
} from './state/preferences.ts'
import {
  createPaletteDom,
  type UniversalPaletteRenderOptions,
} from './UniversalPalette.ts'
import type { PaletteAction, PaletteItem } from '../shared/contract.ts'

export const inject = [
  'remote',
  'remote.commands',
  'sessions',
  'workspaces',
  'modelDirectories',
  'slots',
] as const

interface PaletteOverlayProps {
  readonly aggregator: PaletteAggregator
  readonly preferences: PreferencesStore
}

/** Register only after ui-layout has declared shell.overlay. */
export function apply(ctx: Context): void {
  const preferences = new PreferencesStore(createLocalStorageBackend())
  void preferences.load()
  const aggregator = new PaletteAggregator({
    providers: [
      createCommandsProvider(ctx.remote.commands, ctx.sessions),
      createSessionsProvider(ctx.sessions, ctx.workspaces),
      createModelsProvider(ctx.sessions, ctx.modelDirectories),
      createConversationHitsProvider(ctx.sessions),
    ],
    preferences: () => preferences.snapshot,
    context: () => currentPaletteContext(ctx.sessions, ctx.workspaces),
  })

  const PaletteEntry = () => createElement(PaletteOverlay, { aggregator, preferences })
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'dsh-universal-palette',
  }, PaletteEntry))
}

function PaletteOverlay({ aggregator, preferences }: PaletteOverlayProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
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
    const keyboard = attachKeyboard({
      shortcut: preferences.snapshot.shortcut || 'Ctrl+Shift+K',
      onOpen: () => {
        setOpen(true)
        setSelectedIndex(0)
        setActionPanelOpen(false)
        void aggregator.setQueryImmediate('')
      },
      onClose: () => {
        setOpen(false)
        aggregator.cancel()
      },
      onConflictDetected: (report: ShortcutReport) => {
        setConflicts(report.conflictsWith)
      },
    })
    const unsubscribe = preferences.subscribe(() => { keyboard.reportConflicts() })
    return () => {
      unsubscribe()
      keyboard.dispose()
      aggregator.dispose()
      preferences.dispose()
    }
  }, [aggregator, preferences])

  useLayoutEffect(() => {
    const mount = mountRef.current
    if (mount === null) return
    if (!open) {
      mount.replaceChildren()
      return
    }

    const close = () => {
      setOpen(false)
      setActionPanelOpen(false)
      aggregator.cancel()
    }
    const runPrimary = async () => {
      const ranked = aggregator.getState().items[selectedIndex]
      if (ranked === undefined) return
      await preferences.recordUse(ranked.item.id)
      try {
        await ranked.item.primary.run(new AbortController().signal)
        if (ranked.item.primary.stayOpen !== true) close()
      } catch (error) {
        console.warn('[dsh-universal-palette] primary action failed', error)
      }
    }
    const runSecondary = async (item: PaletteItem, action: PaletteAction) => {
      try {
        await action.run(new AbortController().signal)
        if (action.stayOpen !== true) close()
      } catch (error) {
        console.warn('[dsh-universal-palette] secondary action failed', error)
      }
    }
    const options: UniversalPaletteRenderOptions = {
      query: queryState.query,
      isLoading: queryState.status === 'loading',
      isEmpty: queryState.status === 'empty',
      items: queryState.items.map(ranked => ({
        item: ranked.item,
        score: ranked.score,
        matchRanges: ranked.match.ranges,
      })),
      selectedIndex,
      onSelectedIndexChange: setSelectedIndex,
      onQueryChange: query => { aggregator.setQuery(query) },
      onRunPrimary: () => { void runPrimary() },
      onRunSecondary: (item, action) => { void runSecondary(item, action) },
      onOpenActionPanel: () => { setActionPanelOpen(true) },
      onCloseActionPanel: () => { setActionPanelOpen(false) },
      actionPanelOpen,
      actionPanelSelectedIndex,
      onActionPanelIndexChange: setActionPanelSelectedIndex,
      conflicts,
    }
    const rendered = createPaletteDom(mount, options)
    return () => { rendered.dispose() }
  }, [
    actionPanelOpen,
    actionPanelSelectedIndex,
    aggregator,
    conflicts,
    open,
    preferences,
    queryState,
    selectedIndex,
  ])

  return createElement('div', {
    ref: mountRef,
    'data-plugin': 'dsh-universal-palette',
    style: { pointerEvents: open ? 'auto' : 'none' },
  })
}

export default { inject, apply }
