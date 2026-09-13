/**
 * Palette core: query lifecycle, provider coordination, ranking.
 *
 * Inputs are pure DSH-derived data (no DOM, no DSH types). The client
 * face's `apply(ctx)` builds the providers from real DSH services and
 * feeds them in.
 */

import type { PaletteCollectInput, PaletteContext, PaletteItem, PaletteProvider } from '../shared/contract.ts'
import type { PalettePreferences } from './state/preferences.ts'
import { rankItems, type RankedItem } from './ranking/rank.ts'

export interface AggregatorOptions {
  readonly providers: readonly PaletteProvider[]
  readonly preferences: () => PalettePreferences
  readonly context?: () => PaletteContext
  readonly now?: () => number
  readonly softDeadlineMs?: number
  readonly hardLimit?: number
  readonly debounceMs?: number
}

export interface QueryState {
  readonly status: 'idle' | 'loading' | 'ready' | 'empty' | 'error'
  readonly query: string
  readonly actionsHint: boolean
  readonly items: readonly RankedItem[]
  readonly failures: readonly { providerId: string; reason: string }[]
  readonly seq: number
}

const DEFAULT_SOFT_DEADLINE_MS = 600
const DEFAULT_HARD_LIMIT = 40
const DEFAULT_DEBOUNCE_MS = 28

type Listener = (state: QueryState) => void

export class PaletteAggregator {
  private readonly providers: readonly PaletteProvider[]
  private readonly preferencesGetter: () => PalettePreferences
  private readonly contextGetter: () => PaletteContext
  private readonly nowFn: () => number
  private readonly softDeadlineMs: number
  private readonly hardLimit: number
  private readonly debounceMs: number

  private state: QueryState = {
    status: 'idle',
    query: '',
    actionsHint: false,
    items: [],
    failures: [],
    seq: 0,
  }
  private listeners = new Set<Listener>()
  private currentController: AbortController | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null

  constructor(opts: AggregatorOptions) {
    this.providers = opts.providers
    this.preferencesGetter = opts.preferences
    this.contextGetter = opts.context ?? (() => ({}))
    this.nowFn = opts.now ?? Date.now
    this.softDeadlineMs = opts.softDeadlineMs ?? DEFAULT_SOFT_DEADLINE_MS
    this.hardLimit = opts.hardLimit ?? DEFAULT_HARD_LIMIT
    this.debounceMs = opts.debounceMs ?? DEFAULT_DEBOUNCE_MS
  }

  getState(): QueryState {
    return this.state
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => {
      this.listeners.delete(listener)
    }
  }

  setQuery(query: string): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      void this.runQuery(query)
    }, this.debounceMs)
  }

  setQueryImmediate(query: string): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    return this.runQuery(query)
  }

  cancel(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    if (this.currentController) {
      this.currentController.abort()
      this.currentController = null
    }
  }

  dispose(): void {
    this.cancel()
    this.listeners.clear()
  }

  async runQuery(query: string): Promise<void> {
    if (this.currentController) this.currentController.abort()
    const controller = new AbortController()
    this.currentController = controller
    const seq = this.state.seq + 1
    const trimmed = query.trim()
    const actionsHint = trimmed.startsWith('>')
    const effectiveQuery = actionsHint ? trimmed.slice(1).trimStart() : trimmed

    const context = this.contextGetter()

    this.state = {
      ...this.state,
      status: 'loading',
      query: effectiveQuery,
      actionsHint,
      items: [],
      failures: [],
      seq,
    }
    this.notify()

    const input: PaletteCollectInput = {
      query: effectiveQuery,
      actionsHint,
      context,
      limit: this.hardLimit,
    }

    const collectPromises = this.providers.map((p) => this.collectOne(p, input, controller.signal))

    // One shared soft deadline per query: the deadline publishes whatever
    // has resolved by then, providers still in flight are marked `late`
    // and their data is ignored until the next query. Late providers can
    // therefore never multiply the wall-clock latency, and fast results
    // are never held hostage by a slow peer.
    const collected: PaletteItem[] = []
    const failures: { providerId: string; reason: string }[] = []
    const settled = collectPromises.map(() => false)

    const publish = (): void => {
      if (controller.signal.aborted) return
      const ranked = rankItems(collected, {
        query: effectiveQuery,
        context,
        preferences: this.preferencesGetter(),
        now: this.nowFn(),
        actionsHint,
      })
      const capped = ranked.slice(0, this.hardLimit)
      this.state = {
        status: capped.length === 0 ? 'empty' : 'ready',
        query: effectiveQuery,
        actionsHint,
        items: capped,
        failures: [...failures],
        seq,
      }
      this.notify()
    }

    await new Promise<void>((resolve) => {
      let done = false
      const finish = () => {
        if (done) return
        done = true
        clearTimeout(deadlineTimer)
        controller.signal.removeEventListener('abort', onAbort)
        resolve()
      }
      const onAbort = () => finish()
      const deadlineTimer = setTimeout(() => {
        for (let i = 0; i < settled.length; i++) {
          if (!settled[i]) failures.push({ providerId: this.providers[i]!.id, reason: 'late' })
        }
        publish()
        finish()
      }, this.softDeadlineMs)
      controller.signal.addEventListener('abort', onAbort, { once: true })

      if (collectPromises.length === 0) {
        publish()
        finish()
        return
      }
      collectPromises.forEach((promise, i) => {
        void promise.then(result => {
          settled[i] = true
          if (result.kind === 'ok') collected.push(...result.items)
          else if (result.kind === 'fail' && result.reason !== 'aborted') {
            failures.push({ providerId: result.providerId, reason: result.reason })
          }
          if (!done && settled.every(Boolean)) {
            publish()
            finish()
          }
        })
      })
    })
  }

  private async collectOne(
    provider: PaletteProvider,
    input: PaletteCollectInput,
    signal: AbortSignal,
  ): Promise<
    | { kind: 'ok'; items: PaletteItem[] }
    | { kind: 'fail'; providerId: string; reason: string }
  > {
    try {
      const items = await provider.collect(input, signal)
      if (signal.aborted) {
        return { kind: 'fail', providerId: provider.id, reason: 'aborted' }
      }
      return { kind: 'ok', items }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      return { kind: 'fail', providerId: provider.id, reason }
    }
  }

  private notify(): void {
    for (const l of this.listeners) l(this.state)
  }
}
