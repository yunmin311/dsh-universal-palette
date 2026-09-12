/**
 * Hero composer dock capability, read from the public slot ledger only.
 *
 * `ctx.slots.spec(key)` is the public typed declaration probe: a host that
 * declares the (experimental) `conversation.hero.composer.dock` seat returns
 * its spec; stock hosts return `undefined`. `ctx.slots.subscribe(key, fn)`
 * fires on declaration/collapse, so the observable stays live without
 * polling, DOM reads, or private registry access.
 *
 * Composer Search availability composes the capability with the cold
 * verdict: `!cold || heroDockAvailable`. Active sessions always allow the
 * Composer Search; a Hero surface without the dock fails closed.
 */
import type { Context } from '@deepseek-ai/cordis'

/** The experimental seat this plugin registers into; declared by enhanced hosts only. */
export const HERO_COMPOSER_DOCK = 'conversation.hero.composer.dock'

/** Minimal observable read by surfaces and the Search button. */
export interface AvailabilityObservable {
  readonly getSnapshot: () => boolean
  readonly subscribe: (fn: () => void) => () => void
}

/** Cold-verdict face consumed by the availability composition. */
export interface ColdFace {
  readonly getSnapshot: () => boolean
  readonly subscribe: (fn: () => void) => () => void
}

interface SlotsSpecFace {
  readonly spec?: (key: string) => unknown
  readonly subscribe?: (key: string, fn: () => void) => () => void
}

/**
 * Whether the host declares the Hero composer dock. Defensive against
 * partial test mocks: a missing or hostile slots face reports `false`
 * (fail closed), never throws.
 */
export function createHeroDockAvailability(ctx: Context): AvailabilityObservable & { dispose: () => void } {
  const slots = (ctx as { slots?: SlotsSpecFace }).slots
  const read = (): boolean => {
    try {
      return typeof slots?.spec === 'function' ? slots.spec(HERO_COMPOSER_DOCK) !== undefined : false
    } catch {
      return false
    }
  }
  const listeners = new Set<() => void>()
  let off: (() => void) | undefined
  if (typeof slots?.subscribe === 'function') {
    try {
      off = slots.subscribe(HERO_COMPOSER_DOCK, () => {
        for (const fn of [...listeners]) fn()
      })
    } catch {
      off = undefined
    }
  }
  return {
    getSnapshot: read,
    subscribe(fn) {
      listeners.add(fn)
      return () => { listeners.delete(fn) }
    },
    dispose: () => {
      try { off?.() } catch { /* ledger already gone */ }
      listeners.clear()
    },
  }
}

/**
 * Composer Search availability: `!cold || heroDockAvailable`.
 * Active sessions always pass; a Hero surface passes only when the host
 * declares the dock. Both upstream observables keep the verdict live.
 */
export function createComposerSearchAvailability(
  cold: ColdFace,
  heroDock: AvailabilityObservable,
): AvailabilityObservable & { dispose: () => void } {
  const read = (): boolean => !cold.getSnapshot() || heroDock.getSnapshot()
  const listeners = new Set<() => void>()
  const emit = () => { for (const fn of [...listeners]) fn() }
  const offCold = cold.subscribe(emit)
  const offDock = heroDock.subscribe(emit)
  return {
    getSnapshot: read,
    subscribe(fn) {
      listeners.add(fn)
      return () => { listeners.delete(fn) }
    },
    dispose: () => {
      try { offCold() } catch { /* upstream gone */ }
      try { offDock() } catch { /* upstream gone */ }
      listeners.clear()
    },
  }
}

/**
 * Render-level suppression for the shared active overlay seat. This is a
 * compatibility gate, not placement routing: placement stays owned by the
 * slot mount location. A Hero surface (cold) on a host without the dock
 * must not present the upward overlay.
 */
export function suppressActiveOverlay(placement: 'hero-down' | 'active-up', cold: boolean, composerSearchAllowed: boolean): boolean {
  return placement === 'active-up' && cold && !composerSearchAllowed
}

/**
 * Live suppression verdict for the shared active overlay seat, composed
 * from the cold verdict and the Composer Search availability. Surfaces
 * subscribe to it instead of reading cold directly, so the gate stays
 * reactive without re-introducing blank-driven placement.
 */
export function createActiveOverlaySuppression(
  cold: ColdFace,
  composerSearch: AvailabilityObservable,
): AvailabilityObservable & { dispose: () => void } {
  const read = (): boolean => suppressActiveOverlay('active-up', cold.getSnapshot(), composerSearch.getSnapshot())
  const listeners = new Set<() => void>()
  const emit = () => { for (const fn of [...listeners]) fn() }
  const offCold = cold.subscribe(emit)
  const offSearch = composerSearch.subscribe(emit)
  return {
    getSnapshot: read,
    subscribe(fn) {
      listeners.add(fn)
      return () => { listeners.delete(fn) }
    },
    dispose: () => {
      try { offCold() } catch { /* upstream gone */ }
      try { offSearch() } catch { /* upstream gone */ }
      listeners.clear()
    },
  }
}
