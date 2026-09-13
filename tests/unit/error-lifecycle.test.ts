// Action-error lifecycle: the error banner state lives on the shared
// SearchController so it cannot survive close/reopen, mode switches or an
// effective query change, and a successful later run clears it. The
// historical Floating/Morph components kept `error` in local useState with
// no reset path, so one failed action polluted every future open.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SearchController } from '../../src/client/search-controller.ts'
import { PaletteAggregator } from '../../src/client/aggregator.ts'

const prefs = () => ({ pins: {}, frecency: {}, glassIntensity: 'soft' as const, shortcut: 'Alt+Q' })

function makeController(): SearchController {
  const aggregator = new PaletteAggregator({ providers: [], preferences: prefs })
  return new SearchController({
    aggregator,
    preferences: prefs,
    cold: () => false,
    heroComposerSearchAllowed: () => true,
  })
}

test('a failed action reports its error into the shared state (surface run flow)', () => {
  const controller = makeController()
  controller.openFloating()
  controller.reportError(null) // surfaces clear before every run attempt
  assert.equal(controller.getState().error, null)
  controller.reportError('boom')
  assert.equal(controller.getState().error, 'boom')
})

test('action failure → close → reopen: the stale error is gone', () => {
  const controller = makeController()
  controller.openFloating()
  controller.reportError('boom')
  controller.close()
  controller.openFloating()
  assert.equal(controller.getState().error, null, 'reopen must not show the previous error')
})

test('action failure → query change: the stale error is gone; no-op draft edits keep it', () => {
  const controller = makeController()
  controller.openFloating()
  controller.setDraft('first')
  controller.reportError('boom')
  controller.setDraft('first') // same draft: not an effective query change
  assert.equal(controller.getState().error, 'boom')
  controller.setDraft('second')
  assert.equal(controller.getState().error, null, 'an effective query change clears the error')
})

test('morph: action failure → close → reopen → error cleared', () => {
  const controller = makeController()
  controller.openMorph('s1')
  controller.reportError('boom')
  controller.close()
  controller.openMorph('s1')
  assert.equal(controller.getState().error, null)
})

test('mode switch clears a stale error too', () => {
  const controller = makeController()
  controller.openFloating()
  controller.reportError('boom')
  controller.setMode('sessions')
  assert.equal(controller.getState().error, null)
})

test('a later successful run leaves no error (clear-before-run flow)', () => {
  const controller = makeController()
  controller.openFloating()
  controller.reportError('boom')
  controller.reportError(null) // the successful attempt clears first
  assert.equal(controller.getState().error, null)
  assert.equal(controller.getState().presentation, 'floating')
})
