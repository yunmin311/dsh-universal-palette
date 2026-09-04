/**
 * Unit tests: providers wired against a fake HostSurface.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCommandsProvider } from '../../src/client/providers/commands.ts'
import { createSessionsProvider } from '../../src/client/providers/sessions.ts'
import { createModelsProvider } from '../../src/client/providers/models.ts'
import { createConversationHitsProvider } from '../../src/client/providers/conversation-hits.ts'
import { createSkillsProvider } from '../../src/client/providers/skills.ts'
import { probe, type CapabilityProbe } from '../../src/client/capabilities.ts'

const fullProbe: CapabilityProbe = probe({
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
      { id: 's2', title: 'Archived', workspaceId: 'w1', archived: true, updatedAt: Date.now() },
    ],
    getCurrent: () => ({ id: 's1', workspaceId: 'w1' }),
    getCurrentWorkspace: () => ({ id: 'w1' }),
    open: async () => {},
  },
  modelDirectory: {
    list: async () => [
      { provider: 'deepseek', models: [{ id: 'r1', displayName: 'DeepSeek Reasoner' }] },
    ],
    select: async () => {},
  },
  sessionQuery: {
    searchSessions: async () => [
      { sessionId: 's2', title: 'Old design', snippet: 'we discussed OAuth...' },
    ],
    searchEvents: async () => [],
  },
  skills: {
    list: async () => [
      { name: 'review', description: 'Run a code review', userInvocable: true },
      { name: 'hidden', description: 'Model-only', userInvocable: false },
    ],
  },
})

const minimalProbe: CapabilityProbe = probe({
  sessionQuery: undefined,
  skills: undefined,
  modelDirectory: undefined,
  sessions: undefined,
})

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

test('sessions provider excludes archived', async () => {
  const p = createSessionsProvider(fullProbe)
  assert.ok(p)
  const items = await p!.collect(
    { query: '', actionsHint: false, context: {}, limit: 10 },
    new AbortController().signal,
  )
  assert.equal(items.find((i) => i.id === 'sessions:s2'), undefined)
  assert.equal(items.find((i) => i.id === 'sessions:s1')?.title, 'Auth refactor')
})

test('models provider emits one PaletteItem per model', async () => {
  const p = createModelsProvider(fullProbe)
  assert.ok(p)
  const items = await p!.collect(
    { query: '', actionsHint: false, context: { sessionId: 's1' }, limit: 10 },
    new AbortController().signal,
  )
  assert.equal(items.length, 1)
  assert.equal(items[0]!.kind, 'model')
})

test('conversation-hits provider degrades when sessionQuery missing', () => {
  const p = createConversationHitsProvider(minimalProbe)
  assert.equal(p, null)
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
