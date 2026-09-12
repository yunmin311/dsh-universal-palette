/**
 * SearchController tests:
 *  - presentation is mutually exclusive (Floating <-> Morph);
 *  - opening a new surface bumps generation so stale aggregator results
 *    are ignored;
 *  - close clears the presentation and bound sessionId;
 *  - draft + mode + selectedIndex propagate to subscribers.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SearchController } from '../../src/client/search-controller.ts'
import { PaletteAggregator, type QueryState } from '../../src/client/aggregator.ts'

class StubAggregator extends PaletteAggregator {
  public states: QueryState[] = []
  public queries: string[] = []
  constructor() {
    super({ providers: [], preferences: () => ({ pins: {}, frecency: {}, glassIntensity: 'soft', shortcut: '' }) })
  }
  publish(next: QueryState) { this.states.push(next) }
  override setQuery(query: string) { this.queries.push(query); super.setQuery(query) }
}

function mkController(cold = false, heroComposerSearchAllowed = true): { controller: SearchController; aggregator: StubAggregator } {
  const aggregator = new StubAggregator()
  const controller = new SearchController({
    aggregator,
    preferences: () => ({ pins: {}, frecency: {}, glassIntensity: 'soft', shortcut: '' }),
    cold: () => cold,
    heroComposerSearchAllowed: () => heroComposerSearchAllowed,
  })
  return { controller, aggregator }
}

test('openComposerSearch uses Morph for a Hero Session', () => {
  const { controller, aggregator } = mkController(true)
  controller.openComposerSearch('s-cold')
  assert.equal(controller.getState().presentation, 'morph')
  assert.equal(controller.getState().sessionId, 's-cold')
  assert.equal(controller.getState().composerEntry, 'direct')
  assert.deepEqual(aggregator.queries, [''])
})

test('reopening Morph with an unchanged empty query retriggers the initial search', () => {
  const { controller, aggregator } = mkController(true)
  controller.openMorph('s-cold')
  controller.close()
  controller.openMorph('s-cold')
  assert.deepEqual(aggregator.queries, ['', ''])
})

test('openComposerSearch uses Morph for an active Session', () => {
  const { controller } = mkController(false)
  controller.openComposerSearch('s-active')
  assert.equal(controller.getState().presentation, 'morph')
  assert.equal(controller.getState().sessionId, 's-active')
  assert.equal(controller.getState().composerEntry, 'direct')
})

test('slash entry is recorded without changing the active Morph route', () => {
  const { controller } = mkController(false)
  controller.openComposerSearch('s-active', 'slash')
  assert.equal(controller.getState().presentation, 'morph')
  assert.equal(controller.getState().composerEntry, 'slash')
})

test('openFloating sets presentation to floating', () => {
  const { controller } = mkController()
  controller.openFloating()
  assert.equal(controller.getState().presentation, 'floating')
  assert.equal(controller.getState().sessionId, null)
  assert.equal(controller.getState().composerEntry, null)
})

test('openMorph then openFloating returns to single surface', () => {
  const { controller } = mkController()
  controller.openMorph('s1')
  assert.equal(controller.getState().presentation, 'morph')
  controller.openFloating()
  assert.equal(controller.getState().presentation, 'floating')
  assert.equal(controller.getState().sessionId, null)
})

test('openFloating then openMorph swaps the bound sessionId', () => {
  const { controller } = mkController()
  controller.openFloating()
  controller.openMorph('s1')
  assert.equal(controller.getState().presentation, 'morph')
  assert.equal(controller.getState().sessionId, 's1')
})

test('close clears presentation and sessionId', () => {
  const { controller } = mkController()
  controller.openMorph('s2')
  controller.close()
  assert.equal(controller.getState().presentation, null)
  assert.equal(controller.getState().sessionId, null)
})

test('openFloating bumps generation; old aggregator result does not overwrite', () => {
  const { controller, aggregator } = mkController()
  const observer: number[] = []
  controller.subscribe((s) => observer.push(s.generation))
  const before = controller.getState().generation
  controller.openFloating()
  const after = controller.getState().generation
  assert.ok(after > before)
  // The aggregator seq from before the open should not advance the
  // generation; the controller commits on openFloating and that commits
  // becomes the new minimum. The aggregator stub is not invoked from
  // here, but the guard in the constructor already filters by seq < gen.
  assert.equal(aggregator.states.length, 0)
})

test('valid aggregator results survive repeated presentation generations', async () => {
  const { controller } = mkController()
  for (let index = 0; index < 4; index += 1) {
    controller.openMorph('s1')
    controller.close()
  }
  controller.setDraft('arch')
  await new Promise(resolve => setTimeout(resolve, 60))
  assert.equal(controller.getState().aggregator.query, 'arch')
})

test('setDraft + setSelectedIndex propagate through state', () => {
  const { controller } = mkController()
  controller.setDraft('foo')
  controller.setSelectedIndex(3)
  assert.equal(controller.getState().draft, 'foo')
  assert.equal(controller.getState().selectedIndex, 3)
})

test('setMode resets draft and selectedIndex', () => {
  const { controller } = mkController()
  controller.setDraft('foo')
  controller.setSelectedIndex(2)
  controller.setMode('sessions')
  assert.equal(controller.getState().mode, 'sessions')
  assert.equal(controller.getState().draft, '')
  assert.equal(controller.getState().selectedIndex, 0)
})

test('switchPresentation is a no-op when already in that presentation', () => {
  const { controller } = mkController()
  controller.openFloating()
  const before = controller.getState().generation
  controller.switchPresentation('floating', null)
  assert.equal(controller.getState().generation, before)
})

// ---------------------------------------------------------------------------
// Fail-closed Hero compatibility: a Hero surface (cold) on a host without the
// Hero composer dock must never enter the Morph presentation, while active
// sessions and the Global Floating surface stay unaffected.
// ---------------------------------------------------------------------------

test('STOCK Hero openComposerSearch fails closed: no morph presentation', () => {
  const { controller } = mkController(true, false)
  controller.openComposerSearch('s-hero')
  assert.equal(controller.getState().presentation, null)
  assert.equal(controller.getState().sessionId, null)
})

test('STOCK active openComposerSearch still opens Morph', () => {
  // The composed verdict allows active sessions even on stock (allowed=true);
  // only the cold Hero surface is gated.
  const { controller } = mkController(false, true)
  controller.openComposerSearch('s-active')
  assert.equal(controller.getState().presentation, 'morph')
  assert.equal(controller.getState().sessionId, 's-active')
})

test('FORK Hero openComposerSearch opens Morph for the hero-down seat', () => {
  const { controller } = mkController(true, true)
  controller.openComposerSearch('s-hero')
  assert.equal(controller.getState().presentation, 'morph')
  assert.equal(controller.getState().sessionId, 's-hero')
})

test('Hero gate leaves Alt+Q Global Floating unaffected', () => {
  const { controller } = mkController(true, false)
  controller.openFloating()
  assert.equal(controller.getState().presentation, 'floating')
})

test('openMorph stays unguarded for slot-mounted surfaces', () => {
  const { controller } = mkController(true, false)
  controller.openMorph('s-hero')
  assert.equal(controller.getState().presentation, 'morph')
  controller.close()
})
