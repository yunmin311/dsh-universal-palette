/**
 * Unit tests: ranking + fuzzy match.
 *
 * Pure-Node tests; no DSH imports. The aggregator, providers, and
 * ranking modules are DSH-agnostic data flow and can be tested
 * against a fake `HostSurface`.
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

test('empty query returns zero', () => {
  const r = matchItem('', { title: 'compact' })
  assert.equal(r.score, 0)
})

test('no match returns zero', () => {
  const r = matchItem('zzzzzz', { title: 'compact' })
  assert.equal(r.score, 0)
})
