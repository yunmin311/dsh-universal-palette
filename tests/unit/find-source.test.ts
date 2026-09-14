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
import { createFindSource, findHostFindCollisions, PublicSlashFindCollision, registerFindSource } from '../../src/client/findSource.ts'

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

test('Hero /find enters the same persistent claim as active Composer search', async () => {
  const ctrl = fakeController()
  const source = createFindSource(
    () => ctrl.openComposerSearch('cold'),
    async () => false,
  )
  const out = source.onPick({
    candidate: { name: 'find' }, session: { sessionId: 'cold' }, position: 'leading',
    via: 'menu', action: 'pick', span: { start: 0, end: 5, draftRev: 0 },
  })
  assert.ok(out && typeof out === 'object' && 'claim' in out)
  assert.equal(out.claim.token, '/find ')
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.deepEqual(ctrl.calls, ['cold'])
})

// The real rc1 public contract: `list(agentId) => Promise<RemoteResult<
// readonly CommandDescriptor[]>>` — `value` is a flat descriptor ARRAY
// (node_modules/@deepseek-ai/dsh-commands/lib/typert.remote-client.d.ts:13).
// These tests intentionally shape the mock after that contract, not after
// the implementation's historical `{ value: { items } }` misreading.

test('Host command catalog collision returns find name (real rc1 array shape)', async () => {
  const ctx = {
    sessions: { list: { getSnapshot: () => ({ current: 's1' }) } },
    remote: {
      commands: {
        list: async () => ({ ok: true, value: [{ name: 'find', description: 'Host find' }, { name: 'help', description: 'Help' }] }),
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

test('Empty host catalog returns no collisions (real rc1 array shape)', async () => {
  const ctx = {
    sessions: { list: { getSnapshot: () => ({ current: 's1' }) } },
    remote: { commands: { list: async () => ({ ok: true, value: [] }) } },
  } as never
  const collisions = await findHostFindCollisions(ctx)
  assert.equal(collisions.length, 0)
})

test('Host catalog unavailable (ok:false) returns no collisions and does not throw', async () => {
  const ctx = {
    sessions: { list: { getSnapshot: () => ({ current: 's1' }) } },
    remote: { commands: { list: async () => ({ ok: false, error: { code: 'X', message: 'down' } }) } },
  } as never
  const collisions = await findHostFindCollisions(ctx)
  assert.equal(collisions.length, 0)
})

test('Host catalog success with a non-array value fails closed instead of claiming /find', async () => {
  const ctx = {
    sessions: { list: { getSnapshot: () => ({ current: 's1' }) } },
    remote: { commands: { list: async () => ({ ok: true, value: { items: [{ name: 'find' }] } }) } },
  } as never
  await assert.rejects(() => findHostFindCollisions(ctx), /unexpected shape/i)
})

// ---------------------------------------------------------------------------
// registerFindSource: verdict at registration + cold-start re-verdict.
// ---------------------------------------------------------------------------

interface FindSourceCtx {
  sessions: { list: { getSnapshot: () => { current?: string }; subscribe: (fn: () => void) => () => void } }
  remote: { commands: { list: (id: unknown) => Promise<{ ok: boolean; value?: readonly { name: string; description: string }[] }> } }
  inputTriggers?: { registerSource: (src: unknown) => () => void }
  effect(fn: () => unknown): () => void
}

function makeRegistrationCtx(overrides: Partial<FindSourceCtx> = {}) {
  let current: string | undefined
  const sessionListeners = new Set<() => void>()
  let catalog: readonly { name: string; description: string }[] = [{ name: 'help', description: 'Help' }]
  const registered: unknown[] = []
  let unregisterCount = 0
  const ctx: FindSourceCtx = {
    sessions: {
      list: {
        getSnapshot: () => ({ current }),
        subscribe: fn => { sessionListeners.add(fn); return () => { sessionListeners.delete(fn) } },
      },
    },
    remote: { commands: { list: async () => ({ ok: true, value: catalog }) } },
    inputTriggers: {
      registerSource: src => {
        registered.push(src)
        return () => { unregisterCount++ }
      },
    },
    effect(fn) {
      const cleanup = fn()
      return () => { if (typeof cleanup === 'function') (cleanup as () => void)() }
    },
    ...overrides,
  }
  return {
    ctx,
    registered,
    get unregisterCount() { return unregisterCount },
    setCurrent(next: string | undefined) { current = next },
    setCatalog(next: readonly { name: string; description: string }[]) { catalog = next },
    emitSessionChange() { for (const fn of [...sessionListeners]) fn() },
  }
}

const registrationController = { openComposerSearch: () => {} } as never

test('registerFindSource registers the source when the host catalog has no find command', async () => {
  const harness = makeRegistrationCtx()
  harness.setCurrent('s1')
  const disposer = await registerFindSource({ ctx: harness.ctx as never, controller: registrationController })
  assert.equal(harness.registered.length, 1, 'exactly one source registered')
  disposer()
  assert.equal(harness.unregisterCount, 1, 'disposer releases the registration')
})

test('registerFindSource refuses to shadow a host /find already present at registration', async () => {
  const harness = makeRegistrationCtx()
  harness.setCurrent('s1')
  harness.setCatalog([{ name: 'find', description: 'Host find' }])
  await assert.rejects(
    () => registerFindSource({ ctx: harness.ctx as never, controller: registrationController }),
    (error: unknown) => error instanceof PublicSlashFindCollision,
  )
  assert.equal(harness.registered.length, 0, 'no palette source registered over the host command')
})

test('cold start: registers without a session, withdraws the claim once a session with a host find appears', async () => {
  const harness = makeRegistrationCtx()
  harness.setCurrent(undefined)
  const disposer = await registerFindSource({ ctx: harness.ctx as never, controller: registrationController })
  assert.equal(harness.registered.length, 1, 'cold start registers (no session to probe yet)')

  harness.setCurrent('s1')
  harness.setCatalog([{ name: 'find', description: 'Host find' }])
  harness.emitSessionChange()
  await new Promise(resolve => setTimeout(resolve, 20))
  assert.equal(harness.unregisterCount, 1, 'palette /find claim withdrawn so the host command is not shadowed')
  assert.equal(harness.registered.length, 1, 'no duplicate re-registration')
  disposer()
})

test('cold start: keeps the source registered when the session appears on a host without find', async () => {
  const harness = makeRegistrationCtx()
  harness.setCurrent(undefined)
  const disposer = await registerFindSource({ ctx: harness.ctx as never, controller: registrationController })
  harness.setCurrent('s1')
  harness.emitSessionChange()
  await new Promise(resolve => setTimeout(resolve, 20))
  assert.equal(harness.unregisterCount, 0, 'no collision: source stays registered')
  assert.equal(harness.registered.length, 1)
  disposer()
})

// ---------------------------------------------------------------------------
// Fail-closed Hero compatibility for /find: the candidate is withheld on a
// Hero surface without the dock, but a hand-typed `/find …` is still claimed
// (never falls through to the Agent pipeline) and answers with the explicit
// localized capability error.
// ---------------------------------------------------------------------------

const stockHeroCapability = {
  composerSearchAllowed: () => false,
  unavailableError: () => "Composer Search is unavailable on this host's Hero surface.",
}
const searchAllowedCapability = {
  composerSearchAllowed: () => true,
  unavailableError: () => 'unused',
}

test('STOCK Hero: candidate list is empty (no /find row in the native slash menu)', async () => {
  const source = createFindSource(() => undefined, async () => false, stockHeroCapability)
  const candidates = await source.candidates({ sessionId: 's-hero' } as never, { query: 'fi', position: 'leading', drilled: false, signal: new AbortController().signal })
  assert.deepEqual(candidates, [])
})

test('STOCK active: candidate list still offers /find', async () => {
  // Active sessions compose to allowed=true even on stock.
  const source = createFindSource(() => undefined, async () => false, searchAllowedCapability)
  const candidates = await source.candidates({ sessionId: 's-active' } as never, { query: 'fi', position: 'leading', drilled: false, signal: new AbortController().signal })
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0]?.name, 'find')
})

test('FORK Hero: candidate list offers /find', async () => {
  const source = createFindSource(() => undefined, async () => false, searchAllowedCapability)
  const candidates = await source.candidates({ sessionId: 's-hero' } as never, { query: 'fi', position: 'leading', drilled: false, signal: new AbortController().signal })
  assert.equal(candidates.length, 1)
})

test('STOCK Hero: hand-typed /find is still claimed, never falls through to the Agent', async () => {
  const executed: string[] = []
  const source = createFindSource(
    () => undefined,
    async query => { executed.push(query); return true },
    stockHeroCapability,
  )
  const result = await source.matchEnter!(
    { sessionId: 's-hero' } as never,
    '/find test',
    new AbortController().signal,
    { images: 0 },
  )
  assert.ok(result && typeof result === 'object' && 'claim' in result)
  assert.equal(result.claim.token, '/find ')
})

test('STOCK Hero: claimed Enter answers the explicit capability error', async () => {
  const executed: string[] = []
  const source = createFindSource(
    () => undefined,
    async query => { executed.push(query); return true },
    stockHeroCapability,
  )
  const result = await source.matchEnter!(
    { sessionId: 's-hero' } as never,
    '/find test',
    new AbortController().signal,
    { images: 0 },
  )
  const settlement = await result?.claim?.submit?.('test', {} as never, [])
  assert.deepEqual(settlement, { kind: 'error', text: "Composer Search is unavailable on this host's Hero surface." })
  assert.deepEqual(executed, [])
})

test('STOCK Hero: matchSpace claim still fires so Space selection cannot leak to the Agent', async () => {
  const source = createFindSource(() => undefined, async () => false, stockHeroCapability)
  const out = source.matchSpace!({ sessionId: 's-hero' } as never, '/find')
  assert.ok(out && typeof out === 'object' && 'claim' in out)
  const settlement = await out.claim.submit('query', {} as never, [])
  assert.equal(settlement.kind, 'error')
})


test('rapid session changes: the newest session verdict wins even if an older probe resolves later', async () => {
  // Regression: the old `probing` flag dropped session events that arrived
  // while a probe was in flight, so a stale (older session) verdict could
  // win. Each event must start its own probe and only the LATEST event's
  // verdict may be applied.
  const pending: Array<(value: { ok: boolean; value?: readonly { name: string; description: string }[] }) => void> = []
  const listSubscribers: Array<() => void> = []
  let current: string | undefined
  let unregisterCount = 0
  const registered: unknown[] = []
  const ctx = {
    sessions: {
      list: {
        getSnapshot: () => ({ current }),
        subscribe(fn: () => void) { listSubscribers.push(fn); return () => {} },
      },
    },
    remote: {
      commands: {
        // Manual gates: each probe's result is released explicitly.
        list: () => new Promise(resolve => { pending.push(resolve) }),
      },
    },
    inputTriggers: {
      registerSource: () => {
        registered.push(1)
        return () => { unregisterCount++ }
      },
    },
    effect(fn: () => unknown) {
      const cleanup = fn()
      return () => { if (typeof cleanup === 'function') (cleanup as () => void)() }
    },
  } as never
  const emit = () => { for (const fn of [...listSubscribers]) fn() }
  const disposer = await registerFindSource({ ctx, controller: { openComposerSearch: () => {} } as never })
  assert.equal(registered.length, 1, 'cold start registers')

  // Session A appears: host catalog for A has no find (probe 1, held open).
  current = 'sA'
  emit()
  assert.equal(pending.length, 1, 'probe 1 started for session A')

  // Session B appears before probe 1 resolves; B's catalog owns find.
  current = 'sB'
  emit()
  assert.ok(pending.length >= 2, 'a new probe started for session B (no dropped events)')

  // B's verdict resolves first: claim withdrawn.
  pending[pending.length - 1]!({ ok: true, value: [{ name: 'find', description: 'Host find' }] })
  await new Promise(resolve => setTimeout(resolve, 10))
  assert.equal(unregisterCount, 1, 'B owns find: palette claim withdrawn')

  // A's stale verdict resolves afterwards: it must NOT re-register.
  pending[0]!({ ok: true, value: [] })
  await new Promise(resolve => setTimeout(resolve, 10))
  assert.equal(unregisterCount, 1, 'stale session A verdict ignored')
  assert.equal(registered.length, 1, 'no duplicate registration from stale probes')
  disposer()
})
