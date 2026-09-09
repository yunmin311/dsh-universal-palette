/**
 * Shared palette controller: presentation + query state, surface-agnostic.
 *
 * The Floating surface and the Composer Morph surface are two thin
 * React wrappers around the same controller instance. State changes
 * (presentation switch, query set, generation bump, search select,
 * action panel toggle, result run, surface close) go through one set
 * of methods so the two surfaces stay in lockstep and the user only
 * ever sees one open at a time.
 *
 * One unique invariant: presentation switches are atomic — the controller
 * commits `presentation` to its new value as part of `openFloating` /
 * `openMorph` / `close`; old-surface teardown happens *after* the new
 * presentation is committed. Aggregator results never overwrite a newer
 * generation.
 */
import type { PaletteAggregator, QueryState } from './aggregator.ts'
import type { PalettePreferences } from './state/preferences.ts'

/** Where the palette surface is mounted right now. */
export type Presentation = null | 'floating' | 'morph'

/** Local search mode (mirrors what the surface requests). */
export type SurfaceMode = 'all' | 'workspaces' | 'sessions'

/** Listener fired on every committed state change. */
export type SearchListener = (state: SearchState) => void

/** Public, immutable view of the controller state. */
export interface SearchState {
  readonly presentation: Presentation
  readonly sessionId: string | null
  readonly query: string
  readonly draft: string
  readonly mode: SurfaceMode
  readonly aggregator: QueryState
  readonly selectedIndex: number
  readonly actionPanelOpen: boolean
  readonly actionPanelSelectedIndex: number
  readonly generation: number
  readonly hasAggregator: boolean
}

/** Inputs the controller wraps; passed in once at construction. */
export interface SearchControllerDeps {
  readonly aggregator: PaletteAggregator
  readonly preferences: () => PalettePreferences
  /** Effective cold verdict snapshot getter; surfaces map it to layout. */
  readonly cold: () => boolean
}

/**
 * Single shared controller.
 *
 * Aggregator is mandatory at construction so both surfaces can rely on a
 * synchronous initial `aggregator` snapshot for the first paint. The
 * controller subscribes to the aggregator and re-emits on every batched
 * update.
 */
export class SearchController {
  private readonly deps: SearchControllerDeps
  private readonly listeners = new Set<SearchListener>()
  private state: SearchState
  private readonly aggregatorUnsub: () => void

  constructor(deps: SearchControllerDeps) {
    this.deps = deps
    this.state = {
      presentation: null,
      sessionId: null,
      query: '',
      draft: '',
      mode: 'all',
      aggregator: deps.aggregator.getState(),
      selectedIndex: 0,
      actionPanelOpen: false,
      actionPanelSelectedIndex: 0,
      generation: 0,
      hasAggregator: true,
    }
    this.aggregatorUnsub = deps.aggregator.subscribe((next) => {
      // Generation guard: only accept the aggregator update if it matches
      // the generation the controller asked for. Surfaces that switch
      // presentation bump the generation, so stale results can never
      // overwrite a fresh surface's first paint.
      if (next.seq < this.state.generation) return
      this.state = { ...this.state, aggregator: next }
      this.emit()
    })
  }

  getState(): SearchState { return this.state }

  subscribe(listener: SearchListener): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * Open the Floating surface. Atomic with respect to any other
   * presentation: the floating presentation commits *before* the old
   * surface's teardown callback fires. If Morph is open, Morph is closed
   * via `close()` after the new presentation is committed (single-surface
   * invariant).
   */
  openFloating(): void {
    const next: SearchState = {
      ...this.state,
      presentation: 'floating',
      sessionId: null,
      draft: '',
      mode: 'all',
      selectedIndex: 0,
      actionPanelOpen: false,
      actionPanelSelectedIndex: 0,
      generation: this.state.generation + 1,
    }
    this.commit(next)
  }

  /**
   * Open the Composer-owned search entry through the best public Host
   * capability. Zero-turn Sessions use compact Floating because locked DSH
   * renders the hero variant without composer.dock; active Sessions use the
   * resident Composer overlay Morph.
   */
  openComposerSearch(sessionId: string): void {
    if (this.deps.cold()) this.openFloating()
    else this.openMorph(sessionId)
  }

  /**
   * Open the Morph surface scoped to `sessionId`. Atomic: closes any open
   * Floating. Surfaces that re-open with a different `sessionId` bump the
   * generation, so the next render can rebind its session scope and the
   * aggregator's stale result cannot leak.
   */
  openMorph(sessionId: string): void {
    const next: SearchState = {
      ...this.state,
      presentation: 'morph',
      sessionId,
      draft: '',
      mode: 'all',
      selectedIndex: 0,
      actionPanelOpen: false,
      actionPanelSelectedIndex: 0,
      generation: this.state.generation + 1,
    }
    this.commit(next)
  }

  /** Switch the open presentation without resetting draft/query/etc. */
  switchPresentation(next: Exclude<Presentation, null>, sessionId: string | null): void {
    if (this.state.presentation === next) return
    const state: SearchState = {
      ...this.state,
      presentation: next,
      sessionId: next === 'floating' ? null : sessionId,
      generation: this.state.generation + 1,
    }
    this.commit(state)
  }

  /** Close whatever surface is open. Aggregator is *not* cancelled here;
   * surfaces that own the floating lifetime are responsible for that. */
  close(): void {
    if (this.state.presentation === null) return
    const next: SearchState = {
      ...this.state,
      presentation: null,
      sessionId: null,
      generation: this.state.generation + 1,
    }
    this.commit(next)
  }

  setDraft(text: string): void {
    if (this.state.draft === text) return
    this.state = { ...this.state, draft: text }
    this.emit()
    this.deps.aggregator.setQuery(text)
  }

  setMode(mode: SurfaceMode): void {
    if (this.state.mode === mode) return
    this.state = { ...this.state, mode, draft: '', selectedIndex: 0 }
    this.emit()
    void this.deps.aggregator.setQueryImmediate('')
  }

  setSelectedIndex(index: number): void {
    if (this.state.selectedIndex === index) return
    this.state = { ...this.state, selectedIndex: index }
    this.emit()
  }

  setActionPanelOpen(open: boolean): void {
    if (this.state.actionPanelOpen === open) return
    this.state = { ...this.state, actionPanelOpen: open, actionPanelSelectedIndex: 0 }
    this.emit()
  }

  setActionPanelIndex(index: number): void {
    if (this.state.actionPanelSelectedIndex === index) return
    this.state = { ...this.state, actionPanelSelectedIndex: index }
    this.emit()
  }

  /** Returns the effective cold verdict for the surface to map to layout. */
  cold(): boolean { return this.deps.cold() }

  /** Release all subscribers and tear down the aggregator subscription. */
  dispose(): void {
    this.aggregatorUnsub()
    this.listeners.clear()
  }

  private commit(next: SearchState): void {
    this.state = next
    this.emit()
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.state)
  }
}
