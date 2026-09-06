import { test } from 'node:test'
import assert from 'node:assert/strict'

import type { ISessions, SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { IWorkspaces } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

import {
  createCommandsProvider,
  createConversationHitsProvider,
  createModelsProvider,
  createSessionsProvider,
} from '../../src/client/adapters.ts'

const sid = (value: string): SessionId => value as SessionId
const input = { query: '', actionsHint: false, context: {}, limit: 20 } as const

function snapshot<T>(value: T) {
  return { getSnapshot: () => value, subscribe: () => () => {} }
}

function sessionState(): SessionListState {
  const main = sid('main-session')
  const child = sid('child-session')
  return {
    ids: [main, child],
    byId: {
      [main]: {
        id: main,
        title: 'Main work',
        displayTitle: 'Main work',
        cwd: 'E:\\work\\main',
        running: false,
        blank: false,
        updatedAt: 1_700_000_000_000,
      },
      [child]: {
        id: child,
        displayTitle: 'Child work',
        cwd: 'E:\\work\\main',
        parentId: main,
        origin: 'subagent',
        running: true,
        blank: false,
        updatedAt: 1_700_000_000_100,
      },
    },
    current: main,
    phase: 'ready',
    subagentsByParent: {},
    jobsBySession: {},
    currentAddress: undefined,
  }
}

function sessions(overrides: Partial<ISessions> = {}): ISessions {
  const state = sessionState()
  return {
    list: snapshot(state),
    searchResultLimit: 50,
    create: async () => sid('created'),
    open: () => {},
    openSubagent: () => {},
    subagentAddress: () => undefined,
    setSubagentCatalogOpen: () => {},
    refreshSubagents: async () => {},
    clear: () => {},
    refresh: async () => {},
    search: async () => ({ ok: true, value: { items: [], hasMore: false } }),
    fork: async () => sid('fork'),
    scope: () => undefined,
    scopeOf: () => undefined,
    sessionOf: () => undefined,
    binding: () => undefined,
    ...overrides,
  }
}

function workspaces(): IWorkspaces {
  return {
    list: snapshot({
      items: [{
        workspaceId: 'workspace-1',
        path: 'E:\\work\\main',
        title: 'Main workspace',
        sessionIds: [sid('main-session'), sid('child-session')],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }],
      archivedSessionIds: [sid('child-session')],
      state: 'idle',
      phase: 'ready',
      error: null,
    }),
    create: async () => { throw new Error('unused') },
    rename: async () => { throw new Error('unused') },
    delete: async () => {},
    insertBefore: async () => {},
    archiveSession: async () => {},
    insertSessionBefore: async () => { throw new Error('unused') },
  } as unknown as IWorkspaces
}

test('commands use the selected top-level session and surface remote failures', async () => {
  const calls: unknown[][] = []
  const remote = {
    list: async (sessionId: SessionId) => {
      calls.push(['list', sessionId])
      return { ok: true as const, value: [{ name: 'compact', description: 'Compact' }] }
    },
    execute: async (sessionId: SessionId, line: string, images: readonly unknown[]) => {
      calls.push(['execute', sessionId, line, images])
      return { ok: false as const, error: { code: 'command-failed', message: 'denied' } }
    },
  }
  const provider = createCommandsProvider(remote as never, sessions())
  const items = await provider.collect(input, new AbortController().signal)
  assert.equal(items[0]?.title, '/compact')
  await assert.rejects(items[0]?.primary.run(new AbortController().signal), /command-failed: denied/)
  assert.deepEqual(calls, [
    ['list', sid('main-session')],
    ['execute', sid('main-session'), '/compact', []],
  ])
})

test('sessions read ids/byId and workspace membership, excluding archived rows', async () => {
  let opened: SessionId | undefined
  const provider = createSessionsProvider(sessions({ open: id => { opened = id } }), workspaces())
  const items = await provider.collect(input, new AbortController().signal)
  assert.deepEqual(items.map(item => [item.title, item.context?.workspaceId]), [
    ['Main work', 'workspace-1'],
  ])
  await items[0]?.primary.run(new AbortController().signal)
  assert.equal(opened, sid('main-session'))
})

test('models load the selected session directory and select the complete real selection', async () => {
  const selected: unknown[] = []
  const directory = {
    load: async () => ({
      current: { provider: 'deepseek', model: 'chat' },
      routable: true,
      groups: [{
        id: 'deepseek',
        name: 'DeepSeek',
        models: [{
          id: 'reasoner',
          name: 'Reasoner',
          reasoning: { efforts: [{ id: 'high', name: 'High' }], defaultEffort: 'high' },
        }],
      }],
      failures: [],
      status: 'ready',
      error: null,
    }),
    select: async (selection: unknown) => { selected.push(selection) },
  }
  const provider = createModelsProvider(sessions(), { directoryFor: () => directory } as never)
  const items = await provider.collect(input, new AbortController().signal)
  assert.equal(items[0]?.title, 'Reasoner')
  await items[0]?.primary.run(new AbortController().signal)
  assert.deepEqual(selected, [{ provider: 'deepseek', model: 'reasoner', reasoningEffort: 'high' }])
})

test('conversation hits use sessions.search and open the matched session', async () => {
  let opened: SessionId | undefined
  const provider = createConversationHitsProvider(sessions({
    search: async (query) => ({
      ok: true,
      value: { items: [{ sessionId: sid('main-session'), snippet: `found ${query}` }], hasMore: false },
    }),
    open: id => { opened = id },
  }))
  const items = await provider.collect({ ...input, query: 'needle' }, new AbortController().signal)
  assert.equal(items[0]?.snippet, 'found needle')
  assert.deepEqual(items[0]?.keywords, ['found needle'])
  await items[0]?.primary.run(new AbortController().signal)
  assert.equal(opened, sid('main-session'))
})

test('official client /model contribution uses the public input-trigger adjudication, not Host execute', async () => {
  const calls: unknown[] = []
  const scope = {}
  const triggers = { sessionOf(actual: unknown) { assert.equal(actual, scope); return { adjudicate: async (...args: unknown[]) => { calls.push(args); return 'handled' } } } }
  const remote = { list: async () => ({ ok: true, value: [{ name: 'goal', description: 'Goal' }] }), execute: async () => { throw Error('must not execute model on Host') } }
  const rows = await createCommandsProvider(remote as never, sessions({ scope: () => scope as never }), triggers as never).collect(input, new AbortController().signal)
  const model = rows.find(row => row.title === '/model')
  assert.ok(model)
  await model.primary.run(new AbortController().signal)
  assert.equal(calls[0][0], '/model')
  assert.deepEqual(calls[0][2], { images: 0 })
})
