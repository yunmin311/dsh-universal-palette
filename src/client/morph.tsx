/**
 * Composer Morph presentation.
 *
 * Registered through the host's mutually exclusive Composer seats. The seat
 * itself supplies placement: Hero dock points down; active overlay points up.
 *
 * Active positioning reuses DSH MenuView's public popup pattern
 * (position: absolute; bottom: calc(100% + 4px)).
 */
import { useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { InputActions, InputState } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { NS, presentItem } from './locales.ts'
import type { PaletteAggregator } from './aggregator.ts'
import type { PreferencesStore } from './state/preferences.ts'
import type { SidebarObservable } from './sidebarState.ts'
import { SearchController } from './search-controller.ts'
import { MorphResults, type MorphPlacement } from './MorphResults.tsx'
import { composerSearchQuery } from './morphPresentation.ts'
import { localizedError } from './paletteSurface.tsx'
import type { AvailabilityObservable } from './heroDock.ts'
import type { HeroSeatPresence } from './morphSeatPresence.ts'

const subscribeNever = () => () => undefined
const snapshotFalse = () => false

export interface MorphProps {
  readonly ctx: Context
  readonly sessionId: string
  readonly sidebar: SidebarObservable
  readonly aggregator: PaletteAggregator
  readonly preferences: PreferencesStore
  readonly placement: MorphPlacement
  readonly heroSeat: HeroSeatPresence
  readonly controller: SearchController
  readonly useInput: <T>(selector: (state: InputState) => T) => T
  readonly inputActions: InputActions
  /** Live fail-closed gate for the shared active overlay seat (see heroDock.ts). */
  readonly overlaySuppressed?: AvailabilityObservable
}

/**
 * One Morph instance per Session; its lifecycle is the slot lifecycle.
 * Renders whenever the shared controller commits presentation morph for
 * the bound Session. Placement is owned by the Host slot that mounted it.
 */
export function Morph(props: MorphProps) {
  const locale = useSyncExternalStore(fn => props.ctx.locale.subscribe(fn), () => props.ctx.locale.getSnapshot())
  const t = useMemo(() => bindLocale(props.ctx.locale, NS), [props.ctx.locale])
  useLayoutEffect(
    () => props.placement === 'hero-down' ? props.heroSeat.mount() : undefined,
    [props.heroSeat, props.placement],
  )
  const heroSeatMounted = useSyncExternalStore(props.heroSeat.subscribe, props.heroSeat.getSnapshot)
  // Fail-closed compatibility gate for the shared active overlay seat:
  // a Hero surface (cold) on a host without the Hero composer dock never
  // presents through `conversation.input.overlay`. Suppression, not
  // placement routing — the hook stays unconditional (rules of hooks).
  const overlaySuppressed = useSyncExternalStore(
    props.overlaySuppressed?.subscribe ?? subscribeNever,
    props.overlaySuppressed?.getSnapshot ?? snapshotFalse,
    props.overlaySuppressed?.getSnapshot ?? snapshotFalse,
  )
  const state = useSyncExternalStore(
    fn => props.controller.subscribe(fn),
    () => props.controller.getState(),
  )
  const composerDraft = props.useInput(input => input.draft)
  const composer = composerSearchQuery(composerDraft)
  const [error, setError] = useState('')
  const view = useMemo(() => buildView(state, t, locale.active.startsWith('zh')), [locale, state, t])

  // The public Composer draft is the only query source. Slash mode ends as
  // soon as its claimed token disappears; direct-button mode accepts any
  // ordinary draft without rewriting it.
  useEffect(() => {
    if (state.presentation !== 'morph' || state.sessionId !== props.sessionId) return
    if (state.composerEntry === 'slash' && !composer.slashMode) {
      props.controller.close()
      return
    }
    if (state.draft !== composer.query) {
      props.controller.setSelectedIndex(0)
      props.controller.setDraft(composer.query)
    }
  }, [composer.query, composer.slashMode, props.controller, props.sessionId, state.composerEntry, state.draft, state.presentation, state.sessionId])

  const closeMorph = () => {
    // Breaking the token prefix is the public InputMachine signal that releases
    // the claim. Direct-button entry leaves the ordinary draft byte-for-byte.
    if (state.composerEntry === 'slash' && composer.slashMode) {
      props.inputActions.setDraft(composer.query)
    }
    props.controller.close()
  }
  const runAt = async (index: number) => {
    const item = view.items[Math.min(index, Math.max(0, view.items.length - 1))]?.item
    if (!item) return
    try {
      if (state.composerEntry === 'slash' && composer.slashMode) {
        props.inputActions.setDraft(composer.query)
      }
      await props.preferences.recordUse(item.id)
      await item.primary.run(new AbortController().signal)
      if (item.primary.stayOpen !== true) props.controller.close()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  // Composer keeps focus. Capture navigation for the result-only direct mode;
  // slash Enter deliberately remains with DSH's public command claim.
  useEffect(() => {
    if (state.presentation !== 'morph' || state.sessionId !== props.sessionId) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.repeat) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeMorph()
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        event.stopPropagation()
        const step = event.key === 'ArrowDown' ? 1 : -1
        props.controller.setSelectedIndex(Math.max(0, Math.min(view.items.length - 1, state.selectedIndex + step)))
      } else if (event.key === 'Enter' && state.composerEntry === 'direct') {
        event.preventDefault()
        event.stopPropagation()
        void runAt(state.selectedIndex)
      }
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true } as EventListenerOptions)
  }, [composer.query, composer.slashMode, props.controller, props.inputActions, props.preferences, props.sessionId, state.composerEntry, state.presentation, state.selectedIndex, state.sessionId, view.items])

  // If the controller presentation moved off Morph (or to a different
  // sessionId) we render nothing; the parent slot teardown handles the
  // remaining disposal when the Session itself goes away.
  if (state.presentation !== 'morph') return null
  if (state.sessionId !== props.sessionId) return null
  if (props.placement === 'active-up' && heroSeatMounted) return null
  if (props.placement === 'active-up' && overlaySuppressed) return null
  const displayError = error
    ? localizedError(error, { ctx: props.ctx, hasSession: true, workspaces: [], t })
    : (state.aggregator.failures.length ? t('providerFailed') : '')
  return <MorphResults
    placement={props.placement}
    sessionId={props.sessionId}
    label={t('results')}
    loadingText={t('searching')}
    emptyText={view.emptyMessage}
    error={displayError}
    loading={view.pendingQuery || state.aggregator.status === 'loading'}
    items={view.items}
    selectedIndex={Math.min(state.selectedIndex, Math.max(0, view.items.length - 1))}
    onSelectedIndexChange={index => props.controller.setSelectedIndex(index)}
    onRun={index => { props.controller.setSelectedIndex(index); void runAt(index) }}
  />
}

function buildView(
  state: ReturnType<SearchController['getState']>,
  t: (key: string, params?: Record<string, unknown>) => string,
  chinese: boolean,
) {
  const effective = state.draft.trim().replace(/^>\s*/, '')
  const pendingQuery = state.aggregator.query !== effective
  return {
    items: pendingQuery ? [] : state.aggregator.items.map(row => ({
      item: presentItem(row.item, t, chinese),
      score: row.score,
      matchRanges: row.match.ranges,
    })),
    pendingQuery,
    emptyMessage: effective ? t('noResults', { query: state.draft }) : t('empty'),
  }
}

function bindLocale(locale: LocaleRuntime, ns: string): (key: string, params?: Record<string, unknown>) => string {
  return (locale.bind as unknown as (namespace: string) => (key: string, params?: Record<string, unknown>) => string)(ns)
}
