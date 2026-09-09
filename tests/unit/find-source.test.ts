/**
 * /find Input Trigger source tests.
 *
 *  - candidate list contains exactly `find`;
 *  - picking the candidate enters a persistent public command claim;
 *  - Space/Enter keep `/find query` out of the Agent submission path;
 *  - claimed Enter executes the selected result;
 *  - Host command catalog collision is reported via PublicSlashFindCollision.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createFindSource, findHostFindCollisions, PublicSlashFindCollision } from '../../src/client/findSource.ts'

function fakeController() {
  const calls: string[] = []
  return { calls, openComposerSearch: (id: string) => { calls.push(id) } }
}

test('candidate list exposes only the find candidate', async () => {
  const ctrl = fakeController()
  const source = createFindSource(() => ctrl.openComposerSearch('x'))
  const candidates = await source.candidates({ sessionId: 's1' } as never, { query: 'fi', position: 'leading', drilled: false, signal: new AbortController().signal })
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0]?.name, 'find')
})

test('exact /find on Enter returns a local claim that executes the selected result', async () => {
  const ctrl = fakeController()
  const executed: string[] = []
  const source = createFindSource(
    () => ctrl.openComposerSearch('s1'),
    async query => { executed.push(query); return true },
  )
  const result = await source.matchEnter!(
    { sessionId: 's1' } as never,
    '/find',
    new AbortController().signal,
    { images: 0 },
  )
  assert.equal(ctrl.calls.length, 0)
  assert.ok(result && typeof result === 'object' && 'claim' in result)
  assert.equal(result.claim.token, '/find ')
  const settlement = await result.claim.submit('architecture', {} as never, [])
  assert.deepEqual(settlement, { kind: 'success' })
  assert.deepEqual(executed, ['architecture'])
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(ctrl.calls[0], 's1')
})

test('/find with trailing query is claimed and never falls through to Agent submission', async () => {
  const ctrl = fakeController()
  const executed: string[] = []
  const source = createFindSource(
    () => ctrl.openComposerSearch('s1'),
    async query => { executed.push(query); return true },
  )
  const result = await source.matchEnter!(
    { sessionId: 's1' } as never,
    '/find assets',
    new AbortController().signal,
    { images: 0 },
  )
  assert.equal(ctrl.calls.length, 0)
  assert.ok(result && typeof result === 'object' && 'claim' in result)
  await result.claim.submit('assets', {} as never, [])
  assert.deepEqual(executed, ['assets'])
})

test('pick route enters /find command mode before opening Composer search', async () => {
  const ctrl = fakeController()
  const source = createFindSource(() => ctrl.openComposerSearch('s2'))
  const out = source.onPick({
    candidate: { name: 'find' },
    session: { sessionId: 's2' },
    position: 'leading',
    via: 'menu',
    action: 'pick',
    span: { start: 0, end: 5, draftRev: 0 },
  })
  assert.ok(out && typeof out === 'object' && 'claim' in out)
  assert.equal(out.claim.token, '/find ')
  assert.equal(ctrl.calls.length, 0)
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(ctrl.calls[0], 's2')
})

test('typing space after /find enters the same persistent claim', async () => {
  const ctrl = fakeController()
  const source = createFindSource(() => ctrl.openComposerSearch('s3'))
  const out = source.matchSpace!({ sessionId: 's3' } as never, '/find')
  assert.ok(out && typeof out === 'object' && 'claim' in out)
  assert.equal(out.claim.token, '/find ')
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.deepEqual(ctrl.calls, ['s3'])
})

test('bare slash and unrelated commands are never claimed by Universal Palette', async () => {
  const source = createFindSource(() => undefined)
  assert.equal(source.matchSpace!({ sessionId: 's1' } as never, '/'), undefined)
  assert.equal(await source.matchEnter!({ sessionId: 's1' } as never, '/', new AbortController().signal, { images: 0 }), undefined)
  assert.equal(await source.matchEnter!({ sessionId: 's1' } as never, '/goal', new AbortController().signal, { images: 0 }), undefined)
})

test('cold hero fallback consumes /find without leaving an unreachable command claim', async () => {
  const ctrl = fakeController()
  const source = createFindSource(
    () => ctrl.openComposerSearch('cold'),
    async () => false,
    () => false,
  )
  const out = source.onPick({
    candidate: { name: 'find' }, session: { sessionId: 'cold' }, position: 'leading',
    via: 'menu', action: 'pick', span: { start: 0, end: 5, draftRev: 0 },
  })
  assert.deepEqual(out, { text: '' })
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.deepEqual(ctrl.calls, ['cold'])
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
