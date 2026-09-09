/**
 * Cold/active placement signal, from official Session Controller state only.
 *
 * Public read paths:
 * - `currentSessionId(ctx)` reads `ctx.sessions.list.getSnapshot().current`.
 * - `currentSessionBlank(ctx)` reads the current Session's official
 *   `blank` field through `binding.session.getSnapshot()`.
 *
 * Both observables expose the standard `getSnapshot`/`subscribe` pair
 * declared by `@deepseek-ai/dsh-api-session-controller/client`. The
 * `subscribeCold` helper builds a composite observable that fires when
 * either upstream mutates and returns the current cold verdict.
 *
 * Cold verdicts:
 * - no current Session -> cold;
 * - current Session snapshot `blank === true` -> cold;
 * - snapshot `blank === false` -> active;
 * - binding/snapshot/field unavailable -> active; unknown never overrides a
 *   previously confirmed verdict (see `readCold` semantics).
 */
import type { Context } from '@deepseek-ai/cordis'
import type { ISessions, SessionBinding, SessionSnapshot } from '@deepseek-ai/dsh-api-session-controller/client'

/** Cold state: `true` = compact centered Floating; `false` = full centered Floating. */
export type ColdState = boolean

/**
 * Pure verdict from a Session Binding snapshot.
 *
 * - `undefined` binding or `undefined`/`null` snapshot -> `active` (the
 *   signal is unavailable; we never gamble on the more aggressive cold
 *   variant).
 * - snapshot `blank === true` -> cold.
 * - otherwise -> active.
 */
export function verdictFromSnapshot(snapshot: SessionSnapshot | undefined | null): ColdState {
  if (snapshot === undefined || snapshot === null) return false
  return snapshot.blank === true
}

/**
 * Pure verdict from a binding. A `binding` of `undefined` (current id
 * resolves no binding) is `active` — the conservative signal.
 */
export function verdictFromBinding(binding: SessionBinding | undefined): ColdState {
  if (binding === undefined) return false
  const getSnapshot = binding.session?.getSnapshot
  if (typeof getSnapshot !== 'function') return false
  return verdictFromSnapshot(getSnapshot.call(binding.session))
}

/**
 * Pure verdict from a sessions service: empty list (no current id) is
 * cold; everything else defers to the binding verdict.
 */
export function verdictFromSessions(sessions: Pick<ISessions, 'list' | 'binding'>): ColdState {
  const current = sessions.list?.getSnapshot?.()?.current
  if (current === undefined) return true
  return verdictFromBinding(sessions.binding?.(current))
}

/** Public shape used by `cold.ts` consumers and tests. */
export interface ColdObservable {
  getSnapshot(): ColdState
  subscribe(fn: () => void): () => void
}

/**
 * Build a composite observable over Session Controller public state.
 *
 * - Subscribes to `ctx.sessions.list` for current-id changes.
 * - Subscribes to the current Session binding's `session` observable for
 *   `blank` flips; the subscription is moved whenever `current` changes,
 *   and is removed when there is no current Session.
 *
 * `stale-unknown` behavior: the observable keeps the last *confirmed*
 * verdict until either upstream confirms a new one. A transient
 * `undefined` binding never collapses cold back to active.
 */
export function subscribeCold(ctx: Context): ColdObservable {
  let verdict: ColdState = readCold(ctx)
  const listeners = new Set<() => void>()
  let bindingOff: (() => void) | undefined
  let sessionsOff: (() => void) | undefined
  const notify = () => { for (const fn of listeners) fn() }

  const rebind = () => {
    bindingOff?.()
    bindingOff = undefined
    const list = ctx.sessions?.list
    if (!list || typeof list.getSnapshot !== 'function') return
    const next = readCold(ctx)
    // stale-unknown guard: a missing binding keeps the last confirmed verdict
    const id = list.getSnapshot().current
    if (id === undefined) {
      // No current session is a definite cold verdict; refresh it.
      if (next !== verdict) { verdict = next; notify() }
      return
    }
    const binding = ctx.sessions.binding?.(id)
    if (binding === undefined || typeof binding.session?.subscribe !== 'function') {
      // Unknown — keep the last confirmed verdict; do not collapse cold.
      return
    }
    if (next !== verdict) { verdict = next; notify() }
    const observed = binding.session.getSnapshot?.()
    bindingOff = binding.session.subscribe(() => {
      const confirmed = verdictFromSnapshot(binding.session.getSnapshot?.())
      if (confirmed !== verdict) { verdict = confirmed; notify() }
    })
    // Run a synchronous read so a settled `blank === true` after subscribe is captured.
    if (observed && verdictFromSnapshot(observed) !== verdict) {
      verdict = verdictFromSnapshot(observed)
      notify()
    }
  }

  sessionsOff = ctx.sessions?.list?.subscribe?.(() => {
    rebind()
  })
  rebind()

  return {
    getSnapshot: () => verdict,
    subscribe(fn) {
      listeners.add(fn)
      return () => { listeners.delete(fn) }
    },
  }
}

/**
 * Convenience read used by `subscribeCold` initial pass and pure tests.
 * Defensive against partial context mocks: every accessor is optional
 * and a wholly-missing signal reports cold (the legacy V0 default)
 * rather than throwing. Production code paths always have a real
 * `ctx.sessions.list.getSnapshot().current`.
 */
export function readCold(ctx: Context): ColdState {
  const list = ctx.sessions?.list
  if (!list || typeof list.getSnapshot !== 'function') return true
  return verdictFromSessions(ctx.sessions)
}
