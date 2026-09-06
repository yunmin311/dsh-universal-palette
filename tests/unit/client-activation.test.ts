import { test } from 'node:test'
import assert from 'node:assert/strict'

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
const source = new URL('../../src/client/index.ts', import.meta.url)
const realRequire = createRequire(source)
const module = { exports: {} as typeof import('../../src/client/index.ts') }
const code = ts.transpileModule(readFileSync(source, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
// Activation does not render. Keep the JSX renderer at its actual browser boundary.
new Function('require', 'module', 'exports', code)((id: string) => id.endsWith('.tsx') ? {} : realRequire(id), module, module.exports)
const { apply, inject } = module.exports

test('client activation waits for shell.overlay and registers a two-argument list entry', () => {
  const calls: unknown[][] = []
  const ctx = {
    effect(fn: () => unknown) { fn() },
    locale: {register() { return () => {} }},
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
    'uiWorkspace',
    'inputTriggers',
    'locale',
  ])
  const overlayCalls = calls.filter(call => call[1] === 'shell.overlay' || (typeof call[1] === 'object' && call[1]?.name === 'shell.overlay'))
  assert.equal(overlayCalls[0]?.[0], 'inject')
  assert.equal(overlayCalls[0]?.[1], 'shell.overlay')
  assert.equal(overlayCalls[1]?.[0], 'register')
  assert.deepEqual(overlayCalls[1]?.[1], { name: 'shell.overlay', id: 'dsh-universal-palette' })
  assert.equal(typeof overlayCalls[1]?.[2], 'function')
})
