/**
 * Palette aggregator (palette core).
 *
 * Owns:
 *   - the provider list (native + third-party)
 *   - the query lifecycle (debounce, AbortController per query, hard cap)
 *   - the result merge + ranking
 *
 * Does NOT own:
 *   - the UI (consumes `subscribe()`)
 *   - the preference store (consumes via getter)
 *   - the keyboard layer (consumes `open/close`)
 *
 * Spec §7.3: every async query must be cancellable; local provider
 * queries return synchronously wrapped in a resolved promise so we can
 * still use the same AbortController path.
 */

import type {
  PaletteCollectInput,
  PaletteContext,
  PaletteItem,
  PaletteProvider,
} from '../shared/contract.ts'
import type { CapabilityProbe } from './capabilities.ts'
import { PreferencesStore } from './ranking/frecency.ts'
import { rankItems, type RankedItem } from './ranking/rank.ts'

export interface AggregatorOptions {
  readonly providers: readonly PaletteProvider[]
  readonly preferences: PreferencesStore
  readonly capabilityProbe: CapabilityProbe
  readonly softDeadlineMs?: number
  readonly hardLimit?: number
  readonly now?: () => number
  readonly debounceMs?: number
}

export interface QueryState {
  readonly status: 'idle' | 'loading' | 'ready' | 'empty' | 'error'
  readonly query: string
  readonly actionsHint: boolean
  readonly items: readonly RankedItem[]
  /** Per-provider failure markers for the UI status row. */
  readonly failures: readonly { providerId: string; reason: string }[]
  /** Sequence id; bumps on every successful emit. UI uses it to discard stale responses. */
  readonly seq: number
}

const DEFAULT_SOFT_DEADLINE_MS = 600
const DEFAULT_HARD_LIMIT = 40
const DEFAULT_DEBOUNCE_MS = 28

type Listener = (state: QueryState) => void

export class PaletteAggregator {
  private readonly providers: readonly PaletteProvider[]
  private readonly preferences: PreferencesStore
  private readonly capabilityProbe: CapabilityProbe
  private readonly softDeadlineMs: number
  private readonly hardLimit: number
  private readonly debounceMs: number
  private readonly nowFn: () => number

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
    this.preferences = opts.preferences
    this.capabilityProbe = opts.capabilityProbe
    this.softDeadlineMs = opts.softDeadlineMs ?? DEFAULT_SOFT_DEADLINE_MS
    this.hardLimit = opts.hardLimit ?? DEFAULT_HARD_LIMIT
    this.nowFn = opts.now ?? Date.now
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

  /** Bypass debounce — used for the first paint of an empty-query state. */
  setQueryImmediate(query: string): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    return this.runQuery(query)
  }

  /** Cancels any in-flight query and clears the debounce timer. */
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

  /** Test-only escape hatch for synchronous behavior. */
  async runQuery(query: string): Promise<void> {
    if (this.currentController) {
      this.currentController.abort()
    }
    const controller = new AbortController()
    this.currentController = controller
    const seq = this.state.seq + 1
    const trimmed = query.trim()
    const actionsHint = trimmed.startsWith('>')
    const effectiveQuery = actionsHint ? trimmed.slice(1).trimStart() : trimmed

    const context = this.collectContext()

    // Emit loading state immediately so the UI shows a thin progress row.
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

    const providersEnabled = this.providers.filter((p) => {
      const pref = this.preferences.snapshot.providers[p.id]
      return pref ? pref.enabled : true
    })

    const collectPromises = providersEnabled.map((p) =>
      this.collectOne(p, input, controller.signal),
    )

    // Soft deadline: after `softDeadlineMs`, the aggregator stops waiting
    // for slow providers. Per spec §7.3, that provider's items simply
    // do not contribute to this round. We use allSettled so a slow
    // provider does not block the loop; the deadline only short-circuits
    // the `await Promise.all` step, after which we still wait briefly for
    // any provider that managed to finish first.
    const settled = await Promise.race<'all' | 'deadline'>([
      Promise.allSettled(collectPromises).then(() => 'all' as const),
      new Promise<'deadline'>((resolve) =>
        setTimeout(() => resolve('deadline'), this.softDeadlineMs),
      ),
    ])

    if (controller.signal.aborted) return
    if (settled === 'deadline') {
      // Soft deadline expired. We still drain anything that finished
      // naturally in the background; providers still pending are
      // abandoned for this round.
    }

    const collected: PaletteItem[] = []
    const failures: { providerId: string; reason: string }[] = []
    for (let i = 0; i < collectPromises.length; i++) {
      const promise = collectPromises[i]
      const provider = providersEnabled[i]
      if (!promise || !provider) continue
      // Awaiting here is bounded — any provider that did not settle in
      // time is now awaited with a short grace period. After this point
      // we DO NOT block forever; we just take what we got.
      try {
        const r = await Promise.race([
          promise,
          new Promise<'late'>((resolve) =>
            setTimeout(() => resolve('late'), Math.max(50, this.softDeadlineMs)),
          ),
        ])
        if (r === 'late') {
          failures.push({ providerId: provider.id, reason: 'late' })
        } else if (r.kind === 'ok') {
          collected.push(...r.items)
        } else if (r.kind === 'fail' && r.reason !== 'aborted') {
          failures.push({ providerId: r.providerId, reason: r.reason })
        }
      } catch {
        failures.push({ providerId: provider.id, reason: 'failed' })
      }
    }

    if (controller.signal.aborted) return

    const ranked = rankItems(collected, {
      query: effectiveQuery,
      context,
      preferences: this.preferences.snapshot,
      now: this.nowFn(),
      actionsHint,
    })

    const capped = ranked.slice(0, this.hardLimit)
    this.state = {
      status: capped.length === 0 ? 'empty' : 'ready',
      query: effectiveQuery,
      actionsHint,
      items: capped,
      failures,
      seq,
    }
    this.notify()
  }

  /** Mark an item as used; persists to frecency + closes the palette on demand. */
  async recordUse(itemId: string): Promise<void> {
    await this.preferences.recordUse(itemId)
  }

  private collectContext(): PaletteContext {
    const session = this.capabilityProbe.sessions?.getCurrent?.() as
      | { id?: string; workspaceId?: string }
      | null
    const workspace = this.capabilityProbe.workspaces?.current?.() as { id?: string } | null
    return {
      sessionId: session?.id,
      workspaceId: session?.workspaceId ?? workspace?.id,
    }
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
