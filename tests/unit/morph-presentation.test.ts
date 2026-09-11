import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { composerSearchQuery, morphTypeLabel, conciseMorphDescription } from '../../src/client/morphPresentation.ts'

test('Composer draft is the single Morph query source', () => {
  assert.deepEqual(composerSearchQuery('/find arch'), { query: 'arch', slashMode: true })
  assert.deepEqual(composerSearchQuery('/find   architecture'), { query: 'architecture', slashMode: true })
  assert.deepEqual(composerSearchQuery('please review...'), { query: 'please review...', slashMode: false })
  assert.deepEqual(composerSearchQuery('/'), { query: '/', slashMode: false })
})

test('Morph uses only lightweight native-style type markers', () => {
  assert.equal(morphTypeLabel('command'), 'COMMAND')
  assert.equal(morphTypeLabel('model'), 'MODEL')
  assert.equal(morphTypeLabel('session'), 'SESSION')
  assert.equal(morphTypeLabel('conversation-hit'), 'CONVERSATION')
  assert.equal(morphTypeLabel('skill'), 'SKILL')
  assert.equal(morphTypeLabel('workspace'), undefined)
})

test('Morph descriptions collapse whitespace and stay to one compact line', () => {
  assert.equal(conciseMorphDescription('  Built-in agent  for\n researching and analysis  '), 'Built-in agent for researching and analysis')
  const long = conciseMorphDescription('x'.repeat(200))
  assert.ok(long.length <= 97)
  assert.match(long, /…$/)
})

test('Morph renderer has results only and no plugin-owned input chrome', () => {
  const source = readFileSync(new URL('../../src/client/MorphResults.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /<input|role="combobox"|footer|actionPanel|section/i)
  assert.match(source, /role="listbox"/)
  assert.match(source, /role="option"/)
  assert.match(source, /placement: MorphPlacement/)
  assert.match(source, /data-placement=\{props\.placement\}/)
  assert.match(source, /data-session-id=\{props\.sessionId\}/)
})

test('active Morph geometry keeps the locked upward DSH slash-menu placement', () => {
  const css = readFileSync(new URL('../../src/client/MorphResults.module.css', import.meta.url), 'utf8')
  for (const token of ['bottom: calc(100% + 4px)', 'width: 100%', 'border-radius: 20px', 'min-height: 40px', 'border-radius: 10px']) {
    assert.match(css, new RegExp(token.replace(/[()*+]/g, '\\$&')))
  }
  assert.match(css, /--dsw-elevation-prominent/)
  assert.doesNotMatch(css, /backdrop-filter|540px|600px/)
  assert.match(css, /\[data-placement=['"]active-up['"]\] \.surface/)
  assert.match(css, /border-radius:\s*20px 20px 12px 12px/)
})

test('Hero Morph is a normal-flow downward dock capped to about five rows', () => {
  const css = readFileSync(new URL('../../src/client/MorphResults.module.css', import.meta.url), 'utf8')
  assert.match(css, /\[data-placement=['"]hero-down['"]\]/)
  assert.match(css, /position:\s*static/)
  assert.match(css, /margin-top:\s*4px/)
  assert.match(css, /max-width:\s*var\(--dsh-composer-card-max-width\)/)
  assert.match(css, /max-height:\s*208px/)
  assert.match(css, /border-radius:\s*12px 12px 20px 20px/)
})

test('slot mount location is the only Morph placement source of truth', () => {
  const source = readFileSync(new URL('../../src/client/morph.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /controller\.cold\(\)|SessionSnapshot\.blank|readCold/)
  assert.match(source, /placement=\{props\.placement\}/)
  assert.match(source, /heroSeat\.mount\(\)/)
  assert.match(source, /props\.placement === 'active-up' && heroSeatMounted/)
  assert.doesNotMatch(source, /<div data-session-id=/)
})
