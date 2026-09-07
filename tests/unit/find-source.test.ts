/**
 * /find Input Trigger source tests.
 *
 *  - candidate list contains exactly `find`;
 *  - picking the candidate opens Morph (controller.openMorph called);
 *  - exact Enter on `/find` opens Morph and returns handled;
 *  - non-exact `/find something` is not intercepted;
 *  - Host command catalog collision is reported via PublicSlashFindCollision.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createFindSource, findHostFindCollisions, PublicSlashFindCollision } from '../../src/client/findSource.ts'

function fakeController() {
  const calls: string[] = []
  return { calls, openMorph: (id: string) => { calls.push(id) } }
}

test('candidate list exposes only the find candidate', async () => {
  const ctrl = fakeController()
  const source = createFindSource(() => ctrl.openMorph('x'))
  const candidates = await source.candidates({ sessionId: 's1' } as never, { query: 'fi', position: 'leading', drilled: false, signal: new AbortController().signal })
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0]?.name, 'find')
})

test('exact /find on Enter opens Morph and returns handled', async () => {
  const ctrl = fakeController()
  const source = createFindSource(() => ctrl.openMorph('s1'))
  const result = await source.matchEnter!(
    { sessionId: 's1' } as never,
    '/find',
    new AbortController().signal,
    { images: 0 },
  )
  assert.equal(ctrl.calls[0], 's1')
  assert.equal(result, 'handled')
})

test('non-exact /find text is not intercepted (handled === undefined / not claim)', async () => {
  const ctrl = fakeController()
  const source = createFindSource(() => ctrl.openMorph('s1'))
  const result = await source.matchEnter!(
    { sessionId: 's1' } as never,
    '/find assets',
    new AbortController().signal,
    { images: 0 },
  )
  assert.equal(ctrl.calls.length, 0)
  assert.equal(result, undefined)
})

test('pick route also opens Morph', () => {
  const ctrl = fakeController()
  const source = createFindSource(() => ctrl.openMorph('s2'))
  const out = source.onPick({
    candidate: { name: 'find' },
    session: { sessionId: 's2' },
    position: 'leading',
    via: 'menu',
    action: 'pick',
    span: { start: 0, end: 5, draftRev: 0 },
  })
  assert.equal(ctrl.calls[0], 's2')
  assert.equal(out, 'handled')
})

test('Host command catalog collision returns find name', async () => {
  const ctx = {
    sessions: { list: { getSnapshot: () => ({ current: 's1' }) } },
    remote: {
      commands: {
        list: async () => ({ ok: true, value: { items: [{ name: 'find' }, { name: 'help' }] } }),
      },
    },
  } as never
  const collisions = await findHostFindCollisions(ctx)
  assert.deepEqual([...collisions], ['find'])
})

test('PublicSlashFindCollision carries the host-side name', () => {
  const err = new PublicSlashFindCollision(['find'])
  assert.equal(err.code, 'PUBLIC_SLASH_FIND_COLLISION')
  assert.match(err.message, /Host command catalog/)
})

test('Empty host catalog returns no collisions', async () => {
  const ctx = {
    sessions: { list: { getSnapshot: () => ({ current: 's1' }) } },
    remote: { commands: { list: async () => ({ ok: true, value: { items: [] } }) } },
  } as never
  const collisions = await findHostFindCollisions(ctx)
  assert.equal(collisions.length, 0)
})