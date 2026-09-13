// Minimal diagnostics rendering: the conflict notice must actually render
// (the historical UniversalPalette declared a `conflicts` prop and never
// used it), the stock-Hero disabled Search button must explain WHY it is
// disabled, and the footer must not advertise a Tab capability that no
// producer can fill.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { en, zh } from '../../src/client/locales.ts'

const nodeRequire = createRequire(import.meta.url)

function loadComponent(file: string): Record<string, unknown> {
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText
  const module = { exports: {} as Record<string, unknown> }
  const shim = (id: string): unknown => {
    if (id === 'react') return React
    if (id.endsWith('.css')) {
      return { __esModule: true, default: new Proxy({}, { get: (_t, key) => String(key) }), cssText: '' }
    }
    if (id.includes('primitives')) {
      return new Proxy({}, { get: () => () => React.createElement('svg', { width: 16, height: 16 }) })
    }
    return {}
  }
  // Classic JSX emit references the React identifier directly.
  new Function('require', 'module', 'exports', 'React', code)(shim, module, module.exports, React)
  return module.exports
}

const { UniversalPalette } = loadComponent('../../src/client/UniversalPalette.tsx') as unknown as {
  UniversalPalette: (props: Record<string, unknown>) => unknown
}
const { SearchButton } = loadComponent('../../src/client/searchButton.tsx') as unknown as {
  SearchButton: (props: Record<string, unknown>) => unknown
}

const t = (key: string, params?: Record<string, unknown>): string =>
  (en[key as keyof typeof en] ?? key).replace(/\{(\w+)\}/g, (_, k) => String(params?.[k] ?? ''))

function basePaletteProps(conflicts: readonly string[], shortcut?: string): Record<string, unknown> {
  return {
    t, sidebarWide: true, cold: true, query: '', isLoading: false, isEmpty: false, sections: false,
    emptyMessage: en.empty, items: [], selectedIndex: 0,
    onSelectedIndexChange: () => {}, onQueryChange: () => {}, onRunPrimary: () => {},
    onRunSecondary: () => {}, onOpenActionPanel: () => {}, onCloseActionPanel: () => {},
    onActionPanelIndexChange: () => {}, onClose: () => {},
    actionPanelOpen: false, actionPanelSelectedIndex: 0, conflicts, shortcut,
  }
}

test('shortcut conflict renders a visible notice inside the palette', () => {
  const html = renderToString(React.createElement(UniversalPalette, {
    ...basePaletteProps(['dsh-spotlight', 'dsh-model-palette'], 'Ctrl+K'),
  }) as never) as string
  assert.match(html, /dsh-spotlight/, 'conflict owner is user-visible')
  assert.match(html, /dsh-model-palette/)
  assert.match(html, /Ctrl\+K/, 'the effective shortcut is named')
  // SSR escapes quotes/apostrophes (&quot; &#x27;), so assert on the
  // unescapable core of the localized sentence with both params filled.
  assert.match(html, /is also used by dsh-spotlight, dsh-model-palette\./, 'the localized notice renders with both params')
})

test('no conflict: no notice renders', () => {
  const html = renderToString(React.createElement(UniversalPalette, {
    ...basePaletteProps([]),
  }) as never) as string
  assert.ok(!html.includes('is also used by'), 'conflict notice absent without conflicts')
  assert.ok(!zh.footer.includes('Tab'), 'zh footer must not promise Tab Actions')
})

test('stock Hero disabled Search button states the capability reason', () => {
  const fakeCtx = { locale: { bind: () => (key: string, params?: Record<string, unknown>) =>
    (en[key as keyof typeof en] ?? key).replace(/\{(\w+)\}/g, (_, k) => String(params?.[k] ?? '')) } }
  const disabled = renderToString(React.createElement(SearchButton, {
    ctx: fakeCtx, allowed: { getSnapshot: () => false, subscribe: () => () => {} },
  }) as never) as string
  // SSR escapes the apostrophe (&#x27;); assert on the apostrophe-free prefix.
  assert.match(disabled, /Composer Search is unavailable/, 'disabled button explains why')
  const enabled = renderToString(React.createElement(SearchButton, {
    ctx: fakeCtx, allowed: { getSnapshot: () => true, subscribe: () => () => {} },
  }) as never) as string
  assert.match(enabled, /Universal Palette/, 'enabled button keeps the standard label')
})

test('footer no longer advertises the Tab Actions capability', () => {
  assert.ok(!en.footer.includes('Tab'), 'en footer must not promise Tab Actions')
})
