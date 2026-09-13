// Zero-session navigation closure: every startup row the Floating palette
// renders must be a real, executable action. The historical prepareView
// passed `() => undefined` for both showWorkspaces and showRecent, leaving
// "Select workspace" (with existing workspaces) and "Recent sessions" as
// dead rows, and mode:'workspaces' rows called openMorph with a workspaceId
// in place of a sessionId.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import * as startup from '../../src/client/startup.ts'
import * as locales from '../../src/client/locales.ts'

const nodeRequire = createRequire(import.meta.url)

// paletteSurface.tsx is pure projection logic; load it through the same
// transpile harness the other tsx-facing tests use so the node runner can
// exercise it directly.
const surface = (() => {
  const code = ts.transpileModule(readFileSync(new URL('../../src/client/paletteSurface.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText
  const module = { exports: {} as Record<string, unknown> }
  const shim = (id: string): unknown => {
    if (id.endsWith('startup.ts')) return startup
    if (id.endsWith('locales.ts')) return locales
    if (id === 'react') return nodeRequire('react')
    return {}
  }
  new Function('require', 'module', 'exports', code)(shim, module, module.exports)
  return module.exports as typeof import('../../src/client/paletteSurface.tsx')
})()

const { prepareView } = surface

const en: Record<string, string> = {
  workspace: 'Select workspace', choose: 'Select a workspace to start', create: 'Create or open a Session',
  newSession: 'New session', recent: 'Recent sessions', newHint: 'Create or open a blank Session',
  chooseHint: 'Choose a workspace, then start a Session', recentHint: 'Open an existing conversation',
  requires: 'Commands and models require an active Session', noRecent: 'No recent sessions yet.',
  empty: 'Choose a workspace or start a Session to continue.',
}
const t = (key: string) => en[key] ?? key

function makeState(overrides: Partial<SearchState> = {}): SearchState {
  return {
    presentation: 'floating', sessionId: null, composerEntry: null, query: '', draft: '',
    mode: 'all', aggregator: { status: 'ready', query: '', actionsHint: false, items: [], failures: [], seq: 1 },
    selectedIndex: 0, actionPanelOpen: false, actionPanelSelectedIndex: 0, generation: 1, hasAggregator: true,
    ...overrides,
  }
}

function makeDriverCtx(overrides: {
  workspaces?: readonly { workspaceId: string; title: string; path: string; sessionIds: string[] }[]
  connectResult?: string
} = {}) {
  const calls: unknown[] = []
  const workspaces = overrides.workspaces ?? [
    { workspaceId: 'w1', title: 'Alpha', path: 'E:/alpha', sessionIds: ['s1'] },
    { workspaceId: 'w2', title: 'Beta', path: 'E:/beta', sessionIds: [] },
  ]
  const ctx = {
    sessions: {
      open: (id: string) => calls.push(['open', id]),
      list: { getSnapshot: () => ({ current: undefined, ids: [], byId: {}, phase: 'ready' as const }) },
    },
    workspaces: {
      list: { getSnapshot: () => ({ items: workspaces, archivedSessionIds: [] }) },
      create: async (input: unknown) => { calls.push(['create', input]); return { workspaceId: 'w-created' } },
    },
    uiWorkspace: {
      pickDirectory: async () => { calls.push(['pickDirectory']); return 'E:/picked' },
      connectWorkspace: async (id: string) => { calls.push(['connect', id]); return overrides.connectResult ?? 's1' },
      startSession: () => { calls.push(['startSession']) },
    },
  }
  return { ctx: ctx as never, calls }
}

function sessionRow(id: string, title: string) {
  return {
    item: {
      id: `sessions:${id}`, providerId: 'sessions', kind: 'session' as const, title,
      context: { sessionId: id }, primary: { id: 'open', title: 'Open', run: () => {} }, secondary: [],
    },
    score: 1, match: { score: 1, ranges: [] },
  }
}

test('zero-session with existing workspaces: Select workspace enters the real workspaces mode', () => {
  const { ctx, calls } = makeDriverCtx()
  const modes: string[] = []
  const view = prepareView(makeState(), {
    ctx, hasSession: false,
    workspaces: [{ workspaceId: 'w1', title: 'Alpha', path: 'E:/alpha' }],
    t,
    setMode: mode => { modes.push(mode); void mode },
  })
  const row = view.items.find(entry => entry.item.id === 'startup:workspace')
  assert.ok(row, 'startup Select workspace row is rendered')
  row!.item.primary.run(new AbortController().signal)
  assert.deepEqual(modes, ['workspaces'], 'Select workspace switches into the workspaces mode')
  assert.equal(calls.length, 0)
})

test('zero-session: Recent sessions enters the real sessions mode and shows session rows', () => {
  const { ctx } = makeDriverCtx()
  const modes: string[] = []
  const view = prepareView(makeState(), {
    ctx, hasSession: false, workspaces: [], t,
    setMode: mode => { modes.push(mode); void mode },
  })
  const row = view.items.find(entry => entry.item.id === 'startup:recent')
  assert.ok(row, 'startup Recent sessions row is rendered')
  row!.item.primary.run(new AbortController().signal)
  assert.deepEqual(modes, ['sessions'])

  // The mode it navigates to must land on real session rows, not an empty stub.
  const sessionsView = prepareView(
    makeState({
      mode: 'sessions',
      aggregator: { status: 'ready', query: '', actionsHint: false, items: [sessionRow('s9', 'Old chat')], failures: [], seq: 2 },
    }),
    { ctx, hasSession: false, workspaces: [], t, setMode: () => {} },
  )
  assert.equal(sessionsView.items.length, 1)
  assert.equal(sessionsView.items[0]!.item.title, 'Old chat')
})

test('zero-session without workspaces: Select workspace still uses the native picker flow', async () => {
  const { ctx, calls } = makeDriverCtx({ workspaces: [], connectResult: 's-created' })
  const view = prepareView(makeState(), {
    ctx, hasSession: false, workspaces: [], t, setMode: () => {},
  })
  const row = view.items.find(entry => entry.item.id === 'startup:workspace')
  assert.ok(row)
  await row!.item.primary.run(new AbortController().signal)
  assert.deepEqual(calls, [['pickDirectory'], ['create', { path: 'E:/picked' }], ['connect', 'w-created'], ['open', 's-created']])
})

test('zero-session with existing workspaces: New session starts a session in the current workspace', () => {
  const { ctx, calls } = makeDriverCtx()
  const view = prepareView(makeState(), {
    ctx, hasSession: false,
    workspaces: [{ workspaceId: 'w1', title: 'Alpha', path: 'E:/alpha' }],
    t, setMode: () => {},
  })
  const row = view.items.find(entry => entry.item.id === 'startup:new')
  assert.ok(row)
  row!.item.primary.run(new AbortController().signal)
  assert.deepEqual(calls, [['startSession']])
})

test('workspaces mode: a workspace row connects and opens the real Session for that workspace', async () => {
  const { ctx, calls } = makeDriverCtx({ connectResult: 's-connected' })
  const view = prepareView(makeState({ mode: 'workspaces' }), {
    ctx, hasSession: false,
    workspaces: [
      { workspaceId: 'w1', title: 'Alpha', path: 'E:/alpha' },
      { workspaceId: 'w2', title: 'Beta', path: 'E:/beta' },
    ],
    t, setMode: () => {},
  })
  assert.equal(view.items.length, 2)
  const alpha = view.items.find(entry => entry.item.subtitle === 'E:/alpha')
  assert.ok(alpha, 'workspace rows are rendered with their path subtitle')
  await alpha!.item.primary.run(new AbortController().signal)
  assert.deepEqual(calls, [['connect', 'w1'], ['open', 's-connected']])
})

test('no startup row is a no-op: every rendered zero-session row produces an observable effect', async () => {
  const { ctx, calls } = makeDriverCtx()
  const modes: string[] = []
  const view = prepareView(makeState(), {
    ctx, hasSession: false,
    workspaces: [{ workspaceId: 'w1', title: 'Alpha', path: 'E:/alpha' }],
    t, setMode: mode => { modes.push(mode); void mode },
  })
  const startup = view.items.filter(entry => entry.item.id.startsWith('startup:'))
  assert.equal(startup.length, 3, 'all three startup rows render')
  for (const entry of startup) {
    await entry.item.primary.run(new AbortController().signal)
  }
  assert.equal(modes.length + calls.length, 3, 'each startup row has a user-visible effect')
})
