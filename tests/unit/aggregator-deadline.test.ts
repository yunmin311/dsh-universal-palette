// Wall-clock bounds for the aggregator's ONE shared soft deadline.
//
// The historical implementation waited softDeadlineMs, then drained each
// provider serially for up to another softDeadlineMs each, producing
// 600 + N×600ms wall time with all results withheld. These tests pin the
// contract: a query's wall time must stay near ONE deadline regardless of
// provider count, fast results must be visible at the deadline, and late
// providers must never extend the bound.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PaletteAggregator } from '../../src/client/aggregator.ts'
import type { PaletteProvider } from '../../src/shared/contract.ts'

const DEADLINE = 60
// CI epsilon: generous against timer jitter, but strictly BELOW
// 2×DEADLINE so the historical serial drain (deadline + deadline)
// can never pass these bounds.
const EPSILON = 40

const prefs = () => ({ pins: {}, frecency: {}, glassIntensity: 'soft' as const, shortcut: 'Alt+Q' })

function provider(id: string, ms: number | null, titles: string[] = []): PaletteProvider {
  return {
    id,
    label: id,
    availability: 'ready',
    async collect() {
      if (ms === null) await new Promise<void>(() => {}) // hung host call
      await new Promise(resolve => setTimeout(resolve, ms ?? 0))
      return titles.map(title => ({
        id: `${id}:${title}`, providerId: id, kind: 'command' as const, title,
        primary: { id: 'run', title: 'Run', run: () => {} },
      }))
    },
  }
}

function makeAggregator(providers: PaletteProvider[]) {
  return new PaletteAggregator({ providers, preferences: prefs, softDeadlineMs: DEADLINE, debounceMs: 0 })
}

test('fast + 1 hanging: wall time stays near ONE deadline and fast results are visible', async () => {
  const agg = makeAggregator([provider('fast', 5, ['quick']), provider('hung', null)])
  const t0 = Date.now()
  await agg.runQuery('quick')
  const elapsed = Date.now() - t0
  assert.ok(elapsed < DEADLINE + EPSILON, `wall ${elapsed}ms must stay under one deadline (+eps)`)
  assert.equal(agg.getState().status, 'ready')
  assert.equal(agg.getState().items.find(r => r.item.title === 'quick')?.item.title, 'quick')
  assert.ok(agg.getState().failures.some(f => f.providerId === 'hung'), 'hung provider reported as late')
  agg.dispose()
})

test('fast + 3 hanging: wall time is not multiplied by provider count', async () => {
  const agg = makeAggregator([
    provider('fast', 5, ['quick']),
    provider('hung1', null),
    provider('hung2', null),
    provider('hung3', null),
  ])
  const t0 = Date.now()
  await agg.runQuery('quick')
  const elapsed = Date.now() - t0
  assert.ok(elapsed < DEADLINE + EPSILON, `wall ${elapsed}ms must not scale with provider count`)
  assert.equal(agg.getState().items.find(r => r.item.title === 'quick')?.item.title, 'quick')
  assert.equal(agg.getState().failures.length, 3)
  agg.dispose()
})

test('fast + slow(>deadline): results publish at the deadline and late data is ignored', async () => {
  const agg = makeAggregator([provider('fast', 5, ['quick']), provider('slow', 400, ['late-arriving'])])
  const t0 = Date.now()
  await agg.runQuery('quick')
  const elapsed = Date.now() - t0
  assert.ok(elapsed < DEADLINE + EPSILON, `wall ${elapsed}ms must stay under one deadline (+eps)`)
  assert.equal(agg.getState().items.length, 1)
  assert.equal(agg.getState().items[0]?.item.title, 'quick')
  // The slow provider resolving after the deadline must not mutate the
  // published state of this query.
  await new Promise(resolve => setTimeout(resolve, 450))
  assert.equal(agg.getState().query, 'quick')
  assert.equal(agg.getState().items.length, 1, 'late provider data ignored until the next query')
  assert.equal(agg.getState().items[0]?.item.title, 'quick')
  agg.dispose()
})

test('all providers fast: results publish without waiting for the deadline', async () => {
  const agg = makeAggregator([
    provider('a', 2, ['quick-a']),
    provider('b', 3, ['quick-b']),
  ])
  const t0 = Date.now()
  await agg.runQuery('quick')
  const elapsed = Date.now() - t0
  assert.ok(elapsed < DEADLINE, `all-settled publish must beat the deadline (took ${elapsed}ms)`)
  assert.equal(agg.getState().items.length, 2)
  agg.dispose()
})

test('superseded query: only the newest query publishes, even when the old one drains later', async () => {
  const agg = makeAggregator([
    provider('hung', null, ['alpha-stale']),
    provider('fresh', 5, ['beta-fresh']),
  ])
  // Query A hangs; query B supersedes it before the deadline. Both queries
  // match their own titles so a leaked stale publish would be visible.
  const first = agg.runQuery('alpha')
  const second = agg.runQuery('beta')
  await Promise.all([first, second])
  assert.equal(agg.getState().query, 'beta')
  assert.equal(agg.getState().items.find(r => r.item.title === 'beta-fresh')?.item.title, 'beta-fresh')
  assert.equal(agg.getState().items.find(r => r.item.title === 'alpha-stale'), undefined)
  // Query A's deadline timer must not publish a stale state afterwards.
  await new Promise(resolve => setTimeout(resolve, DEADLINE + 100))
  assert.equal(agg.getState().query, 'beta')
  agg.dispose()
})

test('dispose during an in-flight query: no late publish and pending debounce timer is silenced', async () => {
  // Strict sequence assertions: the ONLY publishes allowed are the initial
  // subscribe snapshot and the loading state. A leaked debounce publish, a
  // leaked deadline publish or a late provider publish all change the
  // sequence and fail.
  const agg = new PaletteAggregator({
    providers: [provider('hung', null, ['never-published'])],
    preferences: prefs,
    softDeadlineMs: DEADLINE,
    debounceMs: 15,
  })
  const published: string[] = []
  agg.subscribe(state => { published.push(state.query) }) // initial snapshot: ''
  agg.setQuery('quick') // starts the debounce timer only
  agg.dispose() // must clear the pending debounce timer
  await new Promise(resolve => setTimeout(resolve, DEADLINE + 100))
  assert.deepEqual(published, [''], 'disposed aggregator must not publish the debounced query')

  // In-flight query whose provider would contribute items only after the
  // deadline: dispose must silence the deadline publish AND the late data.
  const agg2 = makeAggregator([provider('slow', 200, ['late-item'])])
  const states: number[] = []
  agg2.subscribe(state => { states.push(state.items.length) }) // initial snapshot: 0
  const inflight = agg2.runQuery('quick') // loading publish: 0
  agg2.dispose()
  await inflight
  await new Promise(resolve => setTimeout(resolve, DEADLINE + 200 + 100))
  assert.deepEqual(states, [0, 0], 'neither a deadline publish nor late provider data may land after dispose')
})

test('failure isolation under the deadline: throwing and hanging providers do not lose fast results', async () => {
  const throwing: PaletteProvider = {
    id: 'bad', label: 'bad', availability: 'ready',
    async collect() { await new Promise(r => setTimeout(r, 5)); throw new Error('boom') },
  }
  const agg = makeAggregator([throwing, provider('fast', 5, ['quick']), provider('hung', null)])
  await agg.runQuery('quick')
  assert.equal(agg.getState().items.find(r => r.item.title === 'quick')?.item.title, 'quick')
  assert.ok(agg.getState().failures.some(f => f.providerId === 'bad' && f.reason === 'boom'))
  assert.ok(agg.getState().failures.some(f => f.providerId === 'hung'))
  agg.dispose()
})
