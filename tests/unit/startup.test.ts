import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createStartupItems, contextualItems } from '../../src/client/startup.ts'

test('cold start actions use the native picker, workspace registration and session navigation', async () => {
  const calls: unknown[] = []
  const deps = {
    sessions: { open: (id: string) => calls.push(['open', id]) },
    workspaces: { list: { getSnapshot: () => ({ items: [] }) }, create: async (input: unknown) => { calls.push(input); return { workspaceId: 'w1' } } },
    uiWorkspace: { pickDirectory: async () => 'E:/test', connectWorkspace: async (id: string) => { calls.push(['connect', id]); return 's1' }, startSession: () => calls.push('start') },
  }
  const items = createStartupItems(deps as never, () => calls.push('workspace-list'), () => calls.push('recent'))
  assert.deepEqual(items.map(i => i.title), ['Select workspace', 'New session', 'Recent sessions'])
  await items[0]!.primary.run(new AbortController().signal)
  assert.deepEqual(calls, [{ path: 'E:/test' }, ['connect', 'w1'], ['open', 's1']])
  await items[2]!.primary.run(new AbortController().signal)
  assert.equal(calls.at(-1), 'recent')
})

test('empty query keeps Commands, Models and Sessions in the first eight rows', () => {
  const input = ['command', 'model', 'session'].flatMap(kind => Array.from({ length: 10 }, (_, n) => ({ item: { kind, id: `${kind}${n}` } })))
  const rows = contextualItems(input as never)
  assert.equal(rows.length, 8)
  assert.deepEqual(new Set(rows.map(r => r.item.kind)), new Set(['command', 'model', 'session']))
})

test('empty query deduplicates stable session identities before limiting, keeps Current and backfills other sessions', () => {
  const row = (id: string, kind: string, sessionId?: string, isCurrent=false) => ({
    item:{id,kind,title:'Same title',context:sessionId ? {sessionId} : undefined,isCurrent},score:0,
  })
  const input = [
    row('recent:s1','session','s1'), row('current:s1','session','s1',true),
    row('other-source:s1','session','s1'), row('recent:s2','session','s2'), row('recent:s3','session','s3'),
    row('commands:model','command'),row('commands:model','command'),row('commands:goal','command'),row('commands:permission','command'),
    row('models:model','model'),row('models:flash','model'),row('models:pro','model'),
  ]
  const rows = contextualItems(input as never)
  assert.equal(rows.length,8)
  const sessions = rows.filter(r=>r.item.kind==='session')
  assert.deepEqual(sessions.map(r=>r.item.context?.sessionId),['s1','s2','s3'])
  assert.equal(sessions[0]!.item.id,'current:s1')
  assert.equal(rows.filter(r=>r.item.id==='commands:model').length,1)
  assert.ok(rows.some(r=>r.item.id==='models:model')) // Same label across types stays distinct.
})
