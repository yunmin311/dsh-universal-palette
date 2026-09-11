import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHeroSeatPresence } from '../../src/client/morphSeatPresence.ts'

test('Hero seat presence follows slot mount lifecycle', () => {
  const presence = createHeroSeatPresence()
  const snapshots: boolean[] = []
  presence.subscribe(() => snapshots.push(presence.getSnapshot()))

  const unmount = presence.mount()
  assert.equal(presence.getSnapshot(), true)
  unmount()
  assert.equal(presence.getSnapshot(), false)
  assert.deepEqual(snapshots, [true, false])
})

test('Hero seat presence is safe across duplicate mounts and disposals', () => {
  const presence = createHeroSeatPresence()
  const unmountA = presence.mount()
  const unmountB = presence.mount()
  assert.equal(presence.getSnapshot(), true)
  unmountA()
  assert.equal(presence.getSnapshot(), true)
  unmountA()
  assert.equal(presence.getSnapshot(), true)
  unmountB()
  assert.equal(presence.getSnapshot(), false)
})
