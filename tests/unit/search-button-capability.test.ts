/**
 * Search button fail-closed rendering:
 *  - Hero + no capability -> the button renders disabled;
 *  - active session or declared dock -> enabled.
 * Rendered with react-dom/server so no browser is required.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
const compile = (file: string) => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
}).outputText

function loadSearchButton() {
  const code = compile('../../src/client/searchButton.tsx')
  const module = { exports: {} }
  // JsxEmit.React emits `React.createElement`, and the component body reads
  // hooks off the same React copy react-dom/server uses.
  new Function('require', 'module', 'exports', 'React', code)((id: string) => {
    if (id === 'react') return React
    if (id.endsWith('search-controller.ts')) return { SearchController: class {} }
    if (id.endsWith('heroDock.ts')) return {}
    // @deepseek-ai/dsh-client-ui-primitives and friends: stub the icon.
    return { IconSearchOutline16: () => null }
  }, module, module.exports, React)
  return module.exports as typeof import('../../src/client/searchButton.tsx')
}

const fakeCtx = { locale: { bind: () => () => 'Universal Palette' } } as never

function renderButton(allowed: boolean): string {
  const { SearchButton } = loadSearchButton()
  return renderToStaticMarkup(React.createElement(SearchButton, {
    ctx: fakeCtx,
    controller: { openComposerSearch() {} } as never,
    allowed: { getSnapshot: () => allowed, subscribe: () => () => undefined },
  }))
}

test('STOCK Hero: Search button renders disabled', () => {
  const html = renderButton(false)
  assert.match(html, /disabled=""/)
  assert.match(html, /data-search-button="true"/)
})

test('active session or declared dock: Search button renders enabled', () => {
  assert.doesNotMatch(renderButton(true), /disabled/)
})
