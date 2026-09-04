/**
 * Integration test: cordis.patch.yml contents.
 *
 * Verifies the V1 release prerequisite: the plugin patch enables a
 * persistent FTS index with `openAt: first-search`, uses the
 * DSH-official `!!js dshHomePath(...)` expression, and uses the
 * DSH-official `insert` form for the new plugin row (per
 * `packages/bundle/web-app/cordis.patch.yml` at the locked SHA).
 *
 * PATH RESOLUTION — locked-SHA verified:
 *   The DSH patch parser does not perform shell-style variable
 *   expansion. The `session-query-sqlite` Config schema validates
 *   `path` as a plain non-blank string (resolveConfig at
 *   packages/session-query/session-query-sqlite/src/index.ts in the
 *   locked SHA), then passes it to `openSearchDatabase(path, ...)`
 *   which calls `path.resolve(path)` without further substitution.
 *   The DSH-official way to compose a DSH_HOME-relative path in
 *   entry config is the `!!js dshHomePath(...)` expression, which
 *   resolves to an absolute path via the helper from
 *   @deepseek-ai/dsh-home-paths. `ctx.dshHomePath` is installed
 *   by app-boot before any entry mounts (app-boot/src/index.ts
 *   in the locked SHA: `ctx.provide('dshHomePath', dshHomePath)`).
 *
 *   The same pattern ships in the upstream base bundle at
 *   packages/bundle/base/cordis.patch.yml line 113:
 *     `root: !!js dshHomePath('storages')` for the `storage-json` row.
 *
 *   This test proves:
 *     1. The patch's `session-query-sqlite.config.path` is a `!!js`
 *        expression node, not a string literal.
 *     2. The expression source text contains no `$` shell variable
 *        reference and starts with `dshHomePath(`.
 *     3. Evaluating the expression against a small sandboxed helper
 *        that mirrors `dshHomePath` from @deepseek-ai/dsh-home-paths
 *        produces an absolute path ending in `session-query.sqlite`
 *        that starts with the resolved home — NOT the literal
 *        `${DSH_HOME}/...` string.
 *     4. The new `dsh-universal-palette` row is registered via the
 *        DSH-official `insert:` form, NOT a top-level `- id:` (which
 *        would error out at composition with `entry not found`).
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, isAbsolute } from 'node:path'
import { tmpdir } from 'node:os'
import { test } from 'node:test'
import assert from 'node:assert/strict'

interface JsExpr { __jsExpr: string }
type Node = string | number | boolean | null | JsExpr | Node[] | { [k: string]: Node }

interface PatchRow {
  id?: string
  name?: string
  config?: Record<string, Node>
  insert?: PatchRow[]
}

function parseCordisPatch(text: string): PatchRow[] {
  const rows: PatchRow[] = []
  const lines = text.split(/\r?\n/)
  let i = 0
  function readMapBody(indent: number): Record<string, Node> {
    const body: Record<string, Node> = {}
    while (i < lines.length) {
      const l = lines[i]!
      const t = l.trim()
      if (t === '' || t.startsWith('#')) { i++; continue }
      const leading = l.match(/^(\s*)/)![1]!.length
      if (leading < indent) break
      if (leading > indent) {
        // nested map value: read one more level
        const kv = l.match(/^(\s+)([^:]+):\s*(.*)$/)!
        const key = kv[2]!.trim()
        const valueRaw = kv[3]!.trim()
        i++
        if (valueRaw === '') {
          body[key] = readMapBody(leading + 2)
        } else {
          body[key] = parseScalarOrExpr(valueRaw)
        }
        continue
      }
      const kv = l.match(/^(\s*)([^:]+):\s*(.*)$/)!
      const key = kv[2]!.trim()
      const valueRaw = kv[3]!.trim()
      i++
      if (valueRaw === '') {
        body[key] = readMapBody(leading + 2)
      } else {
        body[key] = parseScalarOrExpr(valueRaw)
      }
    }
    return body
  }
  function parseScalarOrExpr(v: string): Node {
    if (v.startsWith('!!js')) return { __jsExpr: v.slice(4).trim() }
    return parseScalar(v)
  }
  function parseScalar(v: string): Node {
    if (v === 'true') return true
    if (v === 'false') return false
    if (v === 'null' || v === '~') return null
    if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v)
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      return v.slice(1, -1)
    }
    return v
  }

  while (i < lines.length) {
    const line = lines[i]!
    const t = line.trim()
    if (t === '' || t.startsWith('#')) { i++; continue }
    if (t.startsWith('- id:')) {
      const m = t.match(/^- id:\s*(.+?)\s*$/)!
      const id = m[1]!
      i++
      const row: PatchRow = { id }
      while (i < lines.length) {
        const l = lines[i]!
        const t2 = l.trim()
        if (t2 === '' || t2.startsWith('#')) { i++; continue }
        if (/^- /.test(t2)) break
        const leading = l.match(/^(\s*)/)![1]!.length
        if (leading === 0) break
        const kv = l.match(/^(\s+)([^:]+):\s*(.*)$/)!
        const key = kv[2]!.trim()
        const valueRaw = kv[3]!.trim()
        i++
        if (valueRaw === '') {
          if (key === 'config') row.config = readMapBody(leading + 2)
          else if (key === 'insert') row.insert = readListBody(leading + 2)
          else readMapBody(leading + 2)
        } else {
          if (key === 'name') row.name = parseScalarOrExpr(valueRaw) as string
          else (row as Record<string, unknown>)[key] = parseScalarOrExpr(valueRaw)
        }
      }
      rows.push(row)
    } else if (t.startsWith('- insert:')) {
      i++
      const indent = line.match(/^(\s*)/)![1]!.length + 2
      const insert = readListBody(indent)
      const row: PatchRow = { insert }
      rows.push(row)
    } else {
      i++
    }
  }
  function readListBody(indent: number): PatchRow[] {
    const out: PatchRow[] = []
    while (i < lines.length) {
      const l = lines[i]!
      const t = l.trim()
      if (t === '' || t.startsWith('#')) { i++; continue }
      const leading = l.match(/^(\s*)/)![1]!.length
      if (leading < indent) break
      if (!t.startsWith('- id:')) break
      const m = t.match(/^- id:\s*(.+?)\s*$/)!
      const id = m[1]!
      i++
      const row: PatchRow = { id }
      while (i < lines.length) {
        const l2 = lines[i]!
        const t2 = l2.trim()
        if (t2 === '' || t2.startsWith('#')) { i++; continue }
        if (/^- /.test(t2)) break
        const leading2 = l2.match(/^(\s*)/)![1]!.length
        if (leading2 <= indent) break
        const kv = l2.match(/^(\s+)([^:]+):\s*(.*)$/)!
        const key = kv[2]!.trim()
        const valueRaw = kv[3]!.trim()
        i++
        if (valueRaw === '') {
          if (key === 'config') row.config = readMapBody(leading2 + 2)
          else readMapBody(leading2 + 2)
        } else {
          row.name = parseScalarOrExpr(valueRaw) as string
        }
      }
      out.push(row)
    }
    return out
  }
  return rows
}

function evalJsExpr(node: Node, scope: Record<string, unknown>): unknown {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return node
  const rec = node as Record<string, unknown>
  if (typeof rec['__jsExpr'] !== 'string') return node
  const expr = rec['__jsExpr'] as string
  const m = expr.match(/^([A-Za-z_$][\w$]*)\s*\((.*)\)\s*$/)
  if (!m) throw new Error(`only call expressions supported, got: ${expr}`)
  const fn = scope[m[1]!]
  if (typeof fn !== 'function') throw new Error(`identifier "${m[1]}" not in scope`)
  const argsRaw = m[2]!.trim()
  const args = argsRaw === '' ? [] : [argsRaw.replace(/^['"]|['"]$/g, '')]
  return (fn as (...args: unknown[]) => unknown)(...args)
}

const here = dirname(fileURLToPath(import.meta.url))
const patchPath = resolve(here, '../../cordis.patch.yml')
const patchText = readFileSync(patchPath, 'utf8')

test('cordis.patch.yml: session-query-sqlite is overridden to a persistent FTS index', () => {
  const rows = parseCordisPatch(patchText)
  const fts = rows.find((r) => r.id === 'session-query-sqlite')
  assert.ok(fts, 'patch must override session-query-sqlite')
  const pathNode = fts!.config!.path
  assert.ok(
    pathNode !== null && typeof pathNode === 'object' && '__jsExpr' in (pathNode as object),
    'session-query-sqlite.path must be a !!js expression node, not a string literal',
  )
  const expr = (pathNode as JsExpr).__jsExpr
  assert.ok(
    !expr.includes('$' + '{'),
    `path must not use shell interpolation; got expression: ${expr}`,
  )
  assert.ok(
    expr.startsWith('dshHomePath('),
    `path expression must use the dshHomePath helper, got: ${expr}`,
  )
  assert.equal(
    fts!.config!.openAt,
    'first-search',
    'session-query-sqlite.openAt must be first-search',
  )
})

test('cordis.patch.yml: !!js path expression resolves to an absolute path under DSH_HOME', () => {
  const fakeHome = tmpdir()
  function dshHomePath(...segments: string[]): string {
    return resolve(fakeHome, ...segments)
  }
  const rows = parseCordisPatch(patchText)
  const fts = rows.find((r) => r.id === 'session-query-sqlite')!
  const resolved = evalJsExpr(fts.config!.path, { dshHomePath })
  assert.equal(typeof resolved, 'string')
  assert.ok(isAbsolute(resolved as string), `resolved path must be absolute, got: ${resolved}`)
  assert.ok(
    (resolved as string).endsWith(`session-query.sqlite`),
    `resolved path must end in session-query.sqlite, got: ${resolved}`,
  )
  assert.ok(
    (resolved as string).startsWith(fakeHome),
    `resolved path must be under DSH_HOME (${fakeHome}), got: ${resolved}`,
  )
})

test('cordis.patch.yml: new plugin row is registered via the DSH insert: form (NOT top-level - id:)', () => {
  const rows = parseCordisPatch(patchText)
  // The DSH-official pattern for adding a NEW row is to put it inside
  // an `- insert:` block (per packages/bundle/web-app/cordis.patch.yml
  // at the locked SHA). A top-level `- id: dsh-universal-palette` would
  // fail at composition with `entry "dsh-universal-palette" not found`.
  const topLevel = rows.find((r) => r.id === 'dsh-universal-palette')
  assert.equal(topLevel, undefined, 'must not register plugin as top-level row')
  const insertBlock = rows.find((r) => r.insert && r.insert.some((i) => i.id === 'dsh-universal-palette'))
  assert.ok(insertBlock, 'patch must register dsh-universal-palette inside an - insert: block')
  const pluginRow = insertBlock!.insert!.find((i) => i.id === 'dsh-universal-palette')!
  assert.equal(pluginRow.name, '@yunmin311/dsh-universal-palette')
})

test('cordis.patch.yml: no public third-party provider row is registered', () => {
  const rows = parseCordisPatch(patchText)
  const allIds = new Set<string>()
  for (const r of rows) {
    if (r.id) allIds.add(r.id)
    if (r.insert) for (const i of r.insert) if (i.id) allIds.add(i.id)
  }
  for (const bad of ['palette-registry', 'palette-registry-client', 'up-registry']) {
    assert.equal(allIds.has(bad), false, `patch must NOT register "${bad}"`)
  }
})
