import { test } from 'node:test'
import assert from 'node:assert/strict'

import { bridgeKeysActions, OPEN_ACTION_ID, type KeysActionsService } from '../../src/client/keysActions.ts'

interface Harness {
  ctx: { get(name: string): unknown; on(event: string, fn: (...args: unknown[]) => void): () => void }
  provide(service: KeysActionsService | undefined): void
  emitService(name: string, value: unknown): void
}

function createHarness(initial?: KeysActionsService): Harness {
  let current = initial
  const listeners = new Set<(name: string, value: unknown) => void>()
  const ctx = {
    get(name: string) { return name === 'keys.actions' ? current : undefined },
    on(event: string, fn: (...args: unknown[]) => void) {
      assert.equal(event, 'internal/service')
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
  return {
    ctx,
    provide(service) { current = service },
    emitService(name, value) { for (const fn of [...listeners]) fn(name, value) },
  }
}

function fakeService() {
  const registered: { id: string; run: () => void }[] = []
  const register = (def: { id: string; run: () => void }) => {
    registered.push(def)
    return () => { const at = registered.indexOf(def); if (at >= 0) registered.splice(at, 1) }
  }
  return { registered, service: { register, list: () => [], subscribe: () => () => {} } as KeysActionsService }
}

test('bridge registers the open action when the service already exists', () => {
  const { service, registered } = fakeService()
  const harness = createHarness(service)
  let toggles = 0
  const dispose = bridgeKeysActions(harness.ctx, { label: () => '打开 Universal Palette', description: () => 'd', toggle: () => { toggles += 1 } })
  assert.equal(registered.length, 1)
  assert.equal(registered[0]?.id, OPEN_ACTION_ID)
  registered[0]?.run()
  assert.equal(toggles, 1)
  dispose()
  assert.equal(registered.length, 0)
})

test('bridge stays inert while the service is absent and attaches on late provide', () => {
  const harness = createHarness()
  const { service, registered } = fakeService()
  let toggles = 0
  const dispose = bridgeKeysActions(harness.ctx, { label: () => 'L', description: () => 'D', toggle: () => { toggles += 1 } })
  assert.equal(registered.length, 0)
  harness.provide(service)
  harness.emitService('keys.actions', service)
  assert.equal(registered.length, 1)
  registered[0]?.run()
  assert.equal(toggles, 1)
  // A second notification must not duplicate the action.
  harness.emitService('keys.actions', service)
  assert.equal(registered.length, 1)
  dispose()
  assert.equal(registered.length, 0)
})

test('bridge forgets a removed service and re-attaches after reinstall', () => {
  const { service, registered } = fakeService()
  const harness = createHarness(service)
  const dispose = bridgeKeysActions(harness.ctx, { label: () => 'L', description: () => 'D', toggle: () => {} })
  assert.equal(registered.length, 1)
  harness.provide(undefined)
  harness.emitService('keys.actions', undefined)
  harness.provide(service)
  harness.emitService('keys.actions', service)
  assert.equal(registered.length, 1)
  dispose()
  assert.equal(registered.length, 0)
})

test('bridge re-registers with the active locale on locale change', () => {
  const { service, registered } = fakeService()
  const harness = createHarness(service)
  const localeListeners = new Set<() => void>()
  let zh = true
  const dispose = bridgeKeysActions(harness.ctx, {
    label: () => (zh ? '打开 Universal Palette' : 'Open Universal Palette'),
    description: () => 'D',
    toggle: () => {},
    onLocaleChange: fn => { localeListeners.add(fn); return () => localeListeners.delete(fn) },
  })
  assert.equal(registered[0]?.id, OPEN_ACTION_ID)
  zh = false
  for (const fn of [...localeListeners]) fn()
  assert.equal(registered.length, 1)
  dispose()
  assert.equal(registered.length, 0)
})
