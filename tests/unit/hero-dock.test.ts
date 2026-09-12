/**
 * Hero composer dock capability tests:
 *  - `ctx.slots.spec` is the public declaration probe (stock hosts report
 *    no dock; enhanced hosts report one);
 *  - the availability observable is live through `ctx.slots.subscribe`;
 *  - Composer Search availability composes `!cold || heroDockAvailable`;
 *  - the active overlay suppression predicate is a compatibility gate,
 *    not placement routing.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  HERO_COMPOSER_DOCK,
  createComposerSearchAvailability,
  createHeroDockAvailability,
  suppressActiveOverlay,
} from '../../src/client/heroDock.ts'

interface FakeSlots {
  spec?: (key: string) => unknown
  subscribe?: (key: string, fn: () => void) => () => void
}

function fakeCtx(slots: FakeSlots) {
  return { slots } as unknown as Parameters<typeof createHeroDockAvailability>[0]
}

test('STOCK: host without the dock reports no capability, no throw', () => {
  const availability = createHeroDockAvailability(fakeCtx({}))
  assert.equal(availability.getSnapshot(), false)
  availability.dispose()
})

test('FORK: host declaring the dock reports capability via public spec()', () => {
  const specCalls: string[] = []
  const availability = createHeroDockAvailability(fakeCtx({
    spec(key) { specCalls.push(key); return { kind: 'list', scope: 'session' } },
  }))
  assert.equal(availability.getSnapshot(), true)
  assert.deepEqual(specCalls, [HERO_COMPOSER_DOCK])
  availability.dispose()
})

test('availability flips live through the public subscribe() declaration channel', () => {
  let declared = false
  const listeners = new Set<() => void>()
  const availability = createHeroDockAvailability(fakeCtx({
    spec: () => declared ? { kind: 'list' } : undefined,
    subscribe(_key, fn) {
      listeners.add(fn)
      return () => { listeners.delete(fn) }
    },
  }))
  assert.equal(availability.getSnapshot(), false)
  const seen: boolean[] = []
  availability.subscribe(() => seen.push(availability.getSnapshot()))
  declared = true
  for (const fn of [...listeners]) fn()
  assert.equal(availability.getSnapshot(), true)
  assert.deepEqual(seen, [true])
  availability.dispose()
})

test('hostile slots face fails closed instead of throwing', () => {
  const availability = createHeroDockAvailability(fakeCtx({
    spec() { throw new Error('boom') },
    subscribe() { throw new Error('boom') },
  }))
  assert.equal(availability.getSnapshot(), false)
  availability.dispose()
})

function staticCold(value: boolean) {
  return { getSnapshot: () => value, subscribe: () => () => undefined }
}

test('Composer Search availability: active always allowed, Hero needs the dock', () => {
  const allowedWithDock = createComposerSearchAvailability(staticCold(true), { getSnapshot: () => true, subscribe: () => () => undefined })
  const allowedWithoutDock = createComposerSearchAvailability(staticCold(true), { getSnapshot: () => false, subscribe: () => () => undefined })
  const activeWithoutDock = createComposerSearchAvailability(staticCold(false), { getSnapshot: () => false, subscribe: () => () => undefined })
  assert.equal(allowedWithDock.getSnapshot(), true)
  assert.equal(allowedWithoutDock.getSnapshot(), false)
  assert.equal(activeWithoutDock.getSnapshot(), true)
  allowedWithDock.dispose()
  allowedWithoutDock.dispose()
  activeWithoutDock.dispose()
})

test('suppression is a compatibility gate: only active-up on cold without capability', () => {
  assert.equal(suppressActiveOverlay('active-up', true, false), true)
  assert.equal(suppressActiveOverlay('active-up', true, true), false)
  assert.equal(suppressActiveOverlay('active-up', false, false), false)
  assert.equal(suppressActiveOverlay('hero-down', true, false), false)
  assert.equal(suppressActiveOverlay('hero-down', true, true), false)
})
