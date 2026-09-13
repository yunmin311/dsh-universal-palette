// Production wiring proof: compiles the REAL src/client/index.ts and runs
// apply() against a stub host context, intercepting only the aggregator and
// cold modules. This proves the production aggregator receives the live
// ranking context (sessionId/workspaceId) and that apply registers cleanup
// disposers for the apply-lifetime objects (cold observable, aggregator,
// controller, preferences).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'

const source = new URL('../../src/client/index.ts', import.meta.url)
const realRequire = createRequire(source)

function compileIndex(): string {
  return ts.transpileModule(readFileSync(source, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText
}

interface Harness {
  apply(): void
  aggregatorCaptures: { context(): unknown; providers: { id: string }[] }[]
  disposeCalls: string[]
  aggregateUnsubs: string[]
  sessionUnsubs: number
  runDisposers(): void
  disposerLabels: string[]
  conflictSnapshots: unknown[]
  setCurrent(next: string | undefined): void
}

function makeHarness(options: { localStorageSeed?: string } = {}): Harness {
  const aggregatorCaptures: { context(): unknown; providers: { id: string }[] }[] = []
  const disposeCalls: string[] = []
  const aggregateUnsubs: string[] = []
  let sessionUnsubs = 0
  const disposerLabels: string[] = []
  const disposers: (() => void)[] = []
  const conflictSnapshots: unknown[] = []
  let current: string | undefined = 's1'

  class CapturingAggregator {
    readonly opts: Record<string, unknown>
    constructor(opts: Record<string, unknown>) {
      this.opts = opts
      aggregatorCaptures.push({ context: opts.context as () => unknown, providers: opts.providers as { id: string }[] })
    }
    getState() {
      return { status: 'idle', query: '', actionsHint: false, items: [], failures: [], seq: 0 }
    }
    subscribe(fn: (s: unknown) => void) {
      fn?.(this.getState())
      return () => { aggregateUnsubs.push('aggregator') }
    }
    setQuery(): void {}
    setQueryImmediate(): Promise<void> { return Promise.resolve() }
    cancel(): void {}
    dispose(): void { disposeCalls.push('aggregator') }
  }

  const coldStub = {
    subscribeCold() {
      return {
        getSnapshot: () => false,
        subscribe: (_fn: () => void) => () => { aggregateUnsubs.push('cold-listener') },
        dispose: () => { disposeCalls.push('cold') },
      }
    },
    readCold: () => false,
    verdictFromSessions: () => false,
  }

  const conflictStub = {
    createConflictObservable: () => ({
      getSnapshot: () => null,
      subscribe: () => () => {},
      set: (next: unknown) => { conflictSnapshots.push(next) },
    }),
  }

  if (options.localStorageSeed !== undefined) {
    ;(globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: () => options.localStorageSeed,
      setItem: () => {},
    }
  }

  const ctx = {
    effect(fn: () => unknown, label: string) {
      disposerLabels.push(String(label))
      const cleanup = fn()
      disposers.push(() => { if (typeof cleanup === 'function') (cleanup as () => void)() })
      return () => {}
    },
    locale: { register: () => () => {}, subscribe: () => () => {}, getSnapshot: () => ({ active: 'en' }), bind: () => (key: string) => key },
    remote: { commands: { list: async () => ({ ok: true, value: [] }) } },
    sessions: {
      list: {
        getSnapshot: () => ({ current }),
        subscribe: () => () => { sessionUnsubs++ },
      },
      binding: () => undefined,
    },
    workspaces: {
      list: {
        getSnapshot: () => ({ items: [{ workspaceId: 'w1', title: 'Alpha', path: 'E:/alpha', sessionIds: ['s1'] }], archivedSessionIds: [] }),
      },
    },
    modelDirectories: {},
    slots: {
      inject: (_name: string, cb: () => unknown) => { cb(); return () => {} },
      register: (options: { name: string }) => ({ registered: options.name }),
      spec: () => undefined,
      subscribe: () => () => {},
    },
    uiWorkspace: {},
    inputTriggers: { registerSource: () => () => {} },
  }

  const req = (id: string): unknown => {
    if (id.endsWith('./aggregator.ts')) return { PaletteAggregator: CapturingAggregator }
    if (id.endsWith('./cold.ts')) return coldStub
    if (id.endsWith('./shortcutConflicts.ts')) return conflictStub
    return id.endsWith('.tsx') ? {} : realRequire(id)
  }

  const harness: Harness = {
    apply() {
      const module = { exports: {} as Record<string, unknown> }
      new Function('require', 'module', 'exports', compileIndex())(req, module, module.exports)
      ;(module.exports.apply as (c: unknown) => void)(ctx)
    },
    aggregatorCaptures,
    disposeCalls,
    aggregateUnsubs,
    get sessionUnsubs() { return sessionUnsubs },
    disposerLabels,
    conflictSnapshots,
    setCurrent(next: string | undefined) { current = next },
    runDisposers() { for (const d of disposers) d() },
  }
  return harness
}

test('production aggregator receives the live ranking context (sessionId + workspaceId)', async () => {
  const h = makeHarness()
  h.apply()
  await new Promise(resolve => setTimeout(resolve, 10)) // let async /find registration settle
  assert.equal(h.aggregatorCaptures.length, 1, 'one aggregator constructed')
  const captured = h.aggregatorCaptures[0]!
  const context = captured.context() as { sessionId?: string; workspaceId?: string }
  assert.equal(context.sessionId, 's1', 'context getter returns the live current session')
  assert.equal(context.workspaceId, 'w1', 'context getter returns the workspace owning the session')

  // The getter is live: a later session change must be reflected, and a
  // session-less host yields an empty context.
  h.setCurrent('s2')
  assert.equal((captured.context() as { sessionId?: string }).sessionId, 's2')
  h.setCurrent(undefined)
  assert.deepEqual(captured.context(), {})
  assert.equal(captured.providers.length, 4)
})

test('shortcut conflict verdict is exposed and follows runtime shortcut changes', async () => {
  const h = makeHarness({ localStorageSeed: JSON.stringify({ shortcut: 'Alt+M' }) })
  h.apply()
  await new Promise(resolve => setTimeout(resolve, 20))
  // Initial attach (platform default Alt+Q: no known conflict -> null),
  // then the customized Alt+M loads and the watcher rebinds to a known
  // conflict, so the notice can follow the runtime change.
  assert.equal(h.conflictSnapshots[0], null)
  assert.deepEqual(
    h.conflictSnapshots[1],
    { shortcut: 'Alt+M', owners: ['dsh-model-palette'] },
    'conflict verdict follows the rebound shortcut',
  )
  h.runDisposers()
})

test('apply registers cleanup for the cold observable, aggregator and controller', async () => {
  const h = makeHarness()
  h.apply()
  h.runDisposers()
  assert.ok(h.disposeCalls.includes('cold'), 'subscribeCold dispose is wired into the plugin lifecycle')
  assert.ok(h.disposeCalls.includes('aggregator'), 'aggregator dispose is wired into the plugin lifecycle')
  assert.ok(h.aggregateUnsubs.includes('aggregator'), 'controller dispose unsubscribes from the aggregator')
  assert.ok(h.disposerLabels.includes('universal-palette: palette core cleanup'), 'core cleanup registered via ctx.effect')
  // Idempotent teardown must not throw.
  h.runDisposers()
})
