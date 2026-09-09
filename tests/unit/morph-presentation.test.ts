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
})

test('Morph geometry follows the locked DSH slash-menu tokens', () => {
  const css = readFileSync(new URL('../../src/client/MorphResults.module.css', import.meta.url), 'utf8')
  for (const token of ['bottom: calc(100% + 4px)', 'width: 100%', 'border-radius: 20px', 'min-height: 40px', 'border-radius: 10px']) {
    assert.match(css, new RegExp(token.replace(/[()*+]/g, '\\$&')))
  }
  assert.match(css, /--dsw-elevation-prominent/)
  assert.doesNotMatch(css, /backdrop-filter|540px|600px/)
})
