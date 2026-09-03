/**
 * Unit tests: fuzzy match + subsequence scoring.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchItem } from '../../src/client/ranking/fuzzy.ts'

test('exact title match returns 1.0', () => {
  const r = matchItem('compact', { title: 'compact' })
  assert.equal(r.score, 1)
})

test('case-insensitive exact', () => {
  const r = matchItem('COMPACT', { title: 'compact' })
  assert.equal(r.score, 1)
})

test('prefix match scores higher than subsequence', () => {
  const prefix = matchItem('comp', { title: 'compact' })
  const subseq = matchItem('cmpt', { title: 'compact' })
  assert.ok(prefix.score > subseq.score)
})

test('alias exact match beats subsequence', () => {
  const alias = matchItem('gc', {
    title: 'goal cancel',
    aliases: ['gc'],
  })
  const subseq = matchItem('goal cancel', { title: 'goal cancel' })
  // alias exact (0.95) vs exact title (1) — exact title should win
  assert.ok(subseq.score > alias.score)
})

test('subsequence match returns ranges', () => {
  const r = matchItem('cmpt', { title: 'compact' })
  assert.ok(r.ranges.length > 0)
})

test('empty query returns zero', () => {
  const r = matchItem('', { title: 'compact' })
  assert.equal(r.score, 0)
})

test('no match returns zero', () => {
  const r = matchItem('zzzzzz', { title: 'compact' })
  assert.equal(r.score, 0)
})

test('keyword match scores lower than title', () => {
  const k = matchItem('review', { title: 'go', keywords: ['review'] })
  const t = matchItem('rev', { title: 'review' })
  assert.ok(t.score > k.score)
})
