import { test } from 'node:test'
import assert from 'node:assert/strict'

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
const source = new URL('../../src/client/cold.ts', import.meta.url)
const realRequire = createRequire(source)
const module = { exports: {} as typeof import('../../src/cold.ts') }
const code = ts.transpileModule(readFileSync(source, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
new Function('require', 'module', 'exports', code)(realRequire, module, module.exports)
const { verdictFromSnapshot, verdictFromBinding, verdictFromSessions, subscribeCold } = module.exports

const ctxWith = (
  current: string | undefined,
  snapshot: { blank: boolean } | undefined | null,
  bindings: Record<string, unknown> = {},
) => {
  const subscribers: Array<() => void> = []
  const sessionSubscribers: Array<() => void> = []
  let lastBlank = snapshot === null || snapshot === undefined ? undefined : snapshot.blank
  const session = {
    getSnapshot() { return lastBlank === undefined ? undefined : { blank: lastBlank } },
    subscribe(fn: () => void) { sessionSubscribers.push(fn); return () => {} },
  }
  const ctx = {
    sessions: {
      list: {
        getSnapshot: () => ({ current }),
        subscribe(fn: () => void) { subscribers.push(fn); return () => {} },
      },
      binding: (id: string) => {
        if (id in bindings) return bindings[id]
        return snapshot === undefined ? undefined : { session }
      },
    },
  } as never
  return {
    ctx,
    flipBlank(next: boolean) {
      lastBlank = next
      for (const fn of sessionSubscribers) fn()
    },
    switchSession() {
      for (const fn of subscribers) fn()
    },
  }
}

test('cold when there is no current session', () => {
  assert.equal(verdictFromSessions(ctxWith(undefined, undefined).ctx.sessions), true)
})

test('cold when the official session snapshot reports blank', () => {
  assert.equal(verdictFromSessions(ctxWith('s1', { blank: true }).ctx.sessions), true)
  assert.equal(verdictFromSessions(ctxWith('s1', { blank: false }).ctx.sessions), false)
})

test('conservatively active when the binding or snapshot is unavailable', () => {
  assert.equal(verdictFromSessions(ctxWith('s1', undefined).ctx.sessions), false)
  assert.equal(verdictFromSessions(ctxWith('s1', null).ctx.sessions), false)
})

test('verdictFromSnapshot is pure and ignores non-blank snapshots', () => {
  assert.equal(verdictFromSnapshot(undefined), false)
  assert.equal(verdictFromSnapshot(null), false)
  assert.equal(verdictFromSnapshot({ blank: true } as never), true)
  assert.equal(verdictFromSnapshot({ blank: false } as never), false)
})

test('verdictFromBinding returns active on missing binding', () => {
  assert.equal(verdictFromBinding(undefined), false)
})

test('subscribeCold starts cold when current snapshot is blank', () => {
  const harness = ctxWith('s1', { blank: true })
  const cold = subscribeCold(harness.ctx)
  assert.equal(cold.getSnapshot(), true)
})

test('subscribeCold flips to active in real time when blank becomes false', () => {
  const harness = ctxWith('s1', { blank: true })
  const cold = subscribeCold(harness.ctx)
  let observed: boolean | undefined
  cold.subscribe(() => { observed = cold.getSnapshot() })
  harness.flipBlank(false)
  assert.equal(observed, false)
  assert.equal(cold.getSnapshot(), false)
})

test('subscribeCold flips to cold in real time when blank becomes true', () => {
  const harness = ctxWith('s1', { blank: false })
  const cold = subscribeCold(harness.ctx)
  let observed: boolean | undefined
  cold.subscribe(() => { observed = cold.getSnapshot() })
  harness.flipBlank(true)
  assert.equal(observed, true)
  assert.equal(cold.getSnapshot(), true)
})

test('stale-unknown: a confirmed cold verdict is not collapsed when the binding briefly disappears', () => {
  // The harness starts with a blank snapshot (cold). When the binding
  // subsequently reports `undefined`, the last confirmed verdict must
  // be preserved (no flickering to active just because the binding
  // became transiently unavailable).
  const sessionSubscribers: Array<() => void> = []
  const listSubscribers: Array<() => void> = []
  let lastBlank = true
  let bindingActive = true
  const session = {
    getSnapshot() { return { blank: lastBlank } },
    subscribe(fn: () => void) { sessionSubscribers.push(fn); return () => {} },
  }
  const ctx = {
    sessions: {
      list: {
        getSnapshot: () => ({ current: 's1' }),
        subscribe(fn: () => void) { listSubscribers.push(fn); return () => {} },
      },
      binding: () => (bindingActive ? { session } : undefined),
    },
  } as never
  const cold = subscribeCold(ctx)
  assert.equal(cold.getSnapshot(), true)
  // binding flips to undefined mid-stream
  bindingActive = false
  for (const fn of listSubscribers) fn()
  assert.equal(cold.getSnapshot(), true)
  // binding comes back, snapshot flips to non-blank: now active
  bindingActive = true
  for (const fn of listSubscribers) fn()
  lastBlank = false
  for (const fn of sessionSubscribers) fn()
  assert.equal(cold.getSnapshot(), false)
})