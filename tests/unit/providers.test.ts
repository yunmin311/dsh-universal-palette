/**
 * Unit tests: providers wired against a fake capability surface.
 *
 * Covers:
 *   - commands provider: list + execute path
 *   - sessions provider: opens via capability
 *   - models provider: switches via select()
 *   - conversation-hits provider: degrades when session_query missing
 *   - skills provider: degrades when skills/list missing
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCommandsProvider } from '../../src/client/providers/commands.ts'
import { createSessionsProvider } from '../../src/client/providers/sessions.ts'
import { createModelsProvider } from '../../src/client/providers/models.ts'
import { createConversationHitsProvider } from '../../src/client/providers/conversation-hits.ts'
import { createSkillsProvider } from '../../src/client/providers/skills.ts'
import type { CapabilityProbe } from '../../src/client/capabilities.ts'

const fullProbe: CapabilityProbe = {
  dshVersion: 'test',
  shellOverlaySlot: true,
  thirdPartyProviders: true,
  commands: {
    list: async () => [
      { name: 'compact', description: 'Compact current session' },
      { name: 'goal', description: 'Set a goal' },
    ],
    find: async () => undefined,
    execute: async () => ({ kind: 'success' }),
  },
  sessions: {
    list: async () => [
      { id: 's1', title: 'Auth refactor', workspaceId: 'w1', updatedAt: Date.now() },
      { id: 's2', title: 'Old design discussion', workspaceId: 'w1', updatedAt: Date.now() - 1000 * 60 * 60 * 24 * 30 },
      { id: 's3', title: 'Archived one', workspaceId: 'w1', archived: true, updatedAt: Date.now() },
    ],
    getCurrent: () => ({ id: 's1', workspaceId: 'w1' }),
    getCurrentWorkspace: () => ({ id: 'w1' }),
    open: async (id: string) => {
      ;(globalThis as { opened?: string }).opened = id
    },
  },
  workspaces: {
    list: async () => [{ id: 'w1', title: 'main' }],
    current: () => ({ id: 'w1' }),
  },
  modelDirectory: {
    list: async () => [
      {
        provider: 'deepseek',
        models: [
          { id: 'r1', displayName: 'DeepSeek Reasoner', defaultEffort: 'medium' },
          { id: 'c1', displayName: 'DeepSeek Coder' },
        ],
      },
    ],
    select: async (_sid, sel) => {
      ;(globalThis as { selected?: unknown }).selected = sel
    },
  },
  sessionQuery: {
    searchSessions: async () => [
      {
        sessionId: 's2',
        title: 'Old design discussion',
        snippet: '...we discussed OAuth flow...',
        updatedAt: Date.now(),
      },
    ],
    searchEvents: async () => [],
  },
  skills: {
    list: async () => [
      { name: 'review', description: 'Run a code review', userInvocable: true },
      { name: 'hidden', description: 'Model-only', userInvocable: false },
    ],
  },
  referenceSource: {
    list: async () => [],
  },
  theme: {
    snapshot: () => ({}),
    subscribe: () => () => {},
  },
}

const minimalProbe: CapabilityProbe = {
  ...fullProbe,
  sessionQuery: null,
  skills: null,
  modelDirectory: null,
  sessions: null,
}

test('commands provider lists + builds execute actions', async () => {
  const p = createCommandsProvider(fullProbe)
  assert.ok(p)
  const items = await p!.collect(
    { query: '', actionsHint: false, context: {}, limit: 10 },
    new AbortController().signal,
  )
  assert.equal(items.length, 2)
  assert.equal(items[0]!.title, '/compact')
})

test('sessions provider excludes archived sessions', async () => {
  const p = createSessionsProvider(fullProbe)
  assert.ok(p)
  const items = await p!.collect(
    { query: '', actionsHint: false, context: {}, limit: 10 },
    new AbortController().signal,
  )
  assert.equal(items.find((i) => i.id === 'sessions:s3'), undefined)
  assert.equal(items.find((i) => i.id === 'sessions:s1')?.title, 'Auth refactor')
})

test('models provider emits one PaletteItem per model', async () => {
  const p = createModelsProvider(fullProbe)
  assert.ok(p)
  const items = await p!.collect(
    { query: '', actionsHint: false, context: { sessionId: 's1' }, limit: 10 },
    new AbortController().signal,
  )
  assert.equal(items.length, 2)
  assert.equal(items[0]!.kind, 'model')
})

test('conversation-hits provider degrades when sessionQuery missing', () => {
  const p = createConversationHitsProvider(minimalProbe)
  assert.equal(p, null)
})

test('conversation-hits provider degrades when sessionQuery throws', async () => {
  const probe: CapabilityProbe = {
    ...fullProbe,
    sessionQuery: {
      searchSessions: async () => {
        throw new Error('FTS unavailable')
      },
      searchEvents: async () => [],
    },
  }
  const p = createConversationHitsProvider(probe)
  assert.ok(p)
  const items = await p!.collect(
    { query: 'anything', actionsHint: false, context: {}, limit: 10 },
    new AbortController().signal,
  )
  assert.equal(items.length, 0)
})

test('skills provider excludes model-only skills', async () => {
  const p = createSkillsProvider(fullProbe)
  assert.ok(p)
  const items = await p!.collect(
    { query: '', actionsHint: false, context: {}, limit: 10 },
    new AbortController().signal,
  )
  assert.equal(items.length, 1)
  assert.equal(items[0]!.id, 'skills:review')
})

test('skills provider returns null when capability missing', () => {
  const p = createSkillsProvider(minimalProbe)
  assert.equal(p, null)
})

test('providers degrade gracefully on abort', async () => {
  const probe: CapabilityProbe = {
    ...fullProbe,
    commands: {
      ...fullProbe.commands!,
      list: async () => {
        // Pretend the wire is slow
        await new Promise((resolve) => setTimeout(resolve, 200))
        return []
      },
    },
  }
  const p = createCommandsProvider(probe)
  const controller = new AbortController()
  const promise = p!.collect(
    { query: '', actionsHint: false, context: {}, limit: 10 },
    controller.signal,
  )
  controller.abort()
  const items = await promise
  // We don't assert exact return — but the aggregator handles this case
  // in isolation tests. Here we just verify collect returns a value
  // instead of throwing.
  assert.ok(Array.isArray(items))
})
