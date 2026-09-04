import { test } from 'node:test'
import assert from 'node:assert/strict'

import { apply, inject } from '../../src/client/index.ts'

test('client activation waits for shell.overlay and registers a two-argument list entry', () => {
  const calls: unknown[][] = []
  const ctx = {
    remote: { commands: {} },
    sessions: {},
    workspaces: {},
    modelDirectories: {},
    slots: {
      inject(name: string, callback: () => unknown) {
        calls.push(['inject', name])
        callback()
        return () => {}
      },
      register(options: unknown, component: unknown) {
        calls.push(['register', options, component])
        return () => {}
      },
    },
  }
  apply(ctx as never)
  assert.deepEqual(inject, [
    'remote',
    'remote.commands',
    'sessions',
    'workspaces',
    'modelDirectories',
    'slots',
  ])
  assert.equal(calls[0]?.[0], 'inject')
  assert.equal(calls[0]?.[1], 'shell.overlay')
  assert.equal(calls[1]?.[0], 'register')
  assert.deepEqual(calls[1]?.[1], { name: 'shell.overlay', id: 'dsh-universal-palette' })
  assert.equal(typeof calls[1]?.[2], 'function')
})
