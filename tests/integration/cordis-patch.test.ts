/**
 * Integration test: cordis.patch.yml contents.
 *
 * Verifies the V1 release prerequisite: installing Universal Palette
 * activates the shipped `session-query-sqlite` row with a persistent
 * FTS path and `openAt: first-search`, so Conversation Hits populate
 * without requiring the user to install `dsh-session-workbench`.
 *
 * Verified against exact upstream SHA
 *   deepseek-ai/deepseek-harness @ 76fda729799fe9b3848dbe2c211d4b231032b81e
 *   / @deepseek-ai/dsh@0.1.2-rc.1
 *
 * PATH RESOLUTION (this round):
 *   The patch uses `!!js dshHomePath('session-query.sqlite')` to
 *   construct the FTS path. This is the DSH-official way to compose
 *   DSH_HOME-relative paths in entry config; the same pattern ships
 *   in the upstream base bundle at the locked SHA for `storage-json`:
 *   `root: !!js dshHomePath('storages')` (see
 *   `packages/bundle/base/cordis.patch.yml` at the locked SHA).
 *   `dshHomePath` is provided to `!!js` expressions via the
 *   `Context` module augmentation in
 *   `packages/boot/app-boot/src/index.ts` at the locked SHA:
 *   `ctx.dshHomePath` is installed by `app-boot` before any entry
 *   mounts. The `!!js` value round-trips as a YAML expression node
 *   (`{ __jsExpr: '...' }`) and the Loader evaluates it at entry
 *   activation; the resulting string is then passed to
 *   `session-query-sqlite` `Config.path` (validated as a non-blank
 *   string by `resolveConfig` in the upstream source at the locked
 *   SHA).
 *
 *   We must NOT use `${DSH_HOME}/session-query.sqlite` because
 *   the patch parser does not perform shell-style expansion; a
 *   literal `$` would be passed verbatim to the SQLite `open`
 *   call and would fail to resolve to a real directory. The
 *   `!!js` expression is the supported way.
 *
 * The test below proves three things at the same time:
 *   1. The patch contains the override row.
 *   2. The path is a `!!js` expression (not a string literal).
 *   3. When the `!!js` expression is evaluated by a small,
 *      pure-JS evaluator that mimics the DSH Loader's
 *      `internal/config` interpolation, the result is an absolute
 *      path that ends in `session-query.sqlite` — not the literal
 *      `${DSH_HOME}/...` string. This is the closest unit-level
 *      evidence we can produce without spinning up the real DSH
 *      boot graph; the upstream `load-path.e2e.ts` covers the
 *      full live Loader path against the real home-paths helper.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, isAbsolute, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { test } from 'node:test'
import assert from 'node:assert/strict'

interface PatchRow {
  id: string
  config: Record<string, unknown>
}

function parseCordisPatch(text: string): PatchRow[] {
  const rows: PatchRow[] = []
  const lines = text.split(/\r?\n/)
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    const m = line.match(/^- id:\s*(.+?)\s*$/)
    if (m) {
      const id = m[1]!
      i++
      while (i < lines.length && (lines[i]!.trim() === '' || lines[i]!.trim().startsWith('#'))) i++
      assert.ok(lines[i]!.trim().startsWith('config:'), `row "${id}" must declare config:`)
      i++
      const config: Record<string, unknown> = {}
      while (i < lines.length) {
        const l = lines[i]!
        const trimmed = l.trim()
        if (trimmed === '') { i++; continue }
        if (trimmed.startsWith('#')) { i++; continue }
        if (/^- id:/.test(trimmed)) break
        const cm = l.match(/^(\s+)([^:]+):\s*(.*)$/)
        if (!cm) { i++; continue }
        const key = cm[2]!.trim()
        const valueRaw = cm[3]!.trim()
        if (valueRaw === '') {
          i++
          const nested: Record<string, unknown> = {}
          while (i < lines.length) {
            const l2 = lines[i]!
            const t2 = l2.trim()
            if (t2 === '') { i++; continue }
            if (/^- id:/.test(t2)) break
            const nm = l2.match(/^(\s+)([^:]+):\s*(.*)$/)
            if (!nm) { i++; continue }
            const value = nm[3]!.trim()
            if (value === '') {
              // The yaml `!!js` tag at the start of the value indicates a
              // DSH-style expression node. We capture the raw text up
              // to the end of the line.
              nested[nm[2]!.trim()] = { __jsExpr: value }
            } else {
              nested[nm[2]!.trim()] = parseScalar(value)
            }
            i++
          }
          config[key] = nested
        } else {
          if (valueRaw.startsWith('!!js')) {
            config[key] = { __jsExpr: valueRaw.slice(4).trim() }
          } else {
            config[key] = parseScalar(valueRaw)
          }
          i++
        }
      }
      rows.push({ id, config })
    } else {
      i++
    }
  }
  return rows
}

function parseScalar(v: string): unknown {
  if (v === 'true') return true
  if (v === 'false') return false
  if (v === 'null' || v === '~') return null
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v)
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    return v.slice(1, -1)
  }
  return v
}

/**
 * Minimal `!!js` expression evaluator. The DSH Loader's
 * `internal/config` evaluates expression nodes against the
 * activation context; we mirror that with a tiny sandbox that
 * resolves identifiers in a provided scope map. This is enough to
 * prove the patch's expression value resolves to a real absolute
 * path, which is what the live Loader does at entry activation.
 *
 * The scope intentionally mirrors the dshHomePath helper from
 * @deepseek-ai/dsh-home-paths: the helper joins onto the resolved
 * DSH home using `path.join`. We use a tmpdir stub so the test is
 * hermetic and does not depend on the host's real `~/.dsh`.
 */
function evalJsExpr(node: unknown, scope: Record<string, unknown>): unknown {
  if (node === null || typeof node !== 'object') return node
  const rec = node as Record<string, unknown>
  if (typeof rec['__jsExpr'] !== 'string') return node
  const expr = rec['__jsExpr'] as string
  // Build a small sandboxed Function: identifier lookup resolves to
  // the scope entry, identifiers not in the scope fall back to
  // globalThis (matching the Loader behavior of letting bare names
  // resolve to ambient runtime values like `process`).
  // The body parses a call expression: `<id>('...')` or `<id>()`.
  const match = expr.match(/^([A-Za-z_$][\w$]*)\s*\((.*)\)\s*$/)
  if (!match) {
    throw new Error(`test evaluator: only call expressions supported, got: ${expr}`)
  }
  const fnName = match[1]!
  const argsRaw = match[2]!.trim()
  const fn = scope[fnName]
  if (typeof fn !== 'function') {
    throw new Error(`test evaluator: identifier "${fnName}" not in scope`)
  }
  const args = argsRaw.length === 0
    ? []
    : [argsRaw.replace(/^['"]|['"]$/g, '')]
  return (fn as (...args: unknown[]) => unknown)(...args)
}

const here = dirname(fileURLToPath(import.meta.url))
const patchPath = resolve(here, '../../cordis.patch.yml')
const patchText = readFileSync(patchPath, 'utf8')

test('cordis.patch.yml: session-query-sqlite is overridden to a persistent FTS index', () => {
  const rows = parseCordisPatch(patchText)
  const fts = rows.find((r) => r.id === 'session-query-sqlite')
  assert.ok(fts, 'patch must override session-query-sqlite')
  const pathNode = fts!.config.path
  assert.ok(
    pathNode !== null && typeof pathNode === 'object' && '__jsExpr' in (pathNode as object),
    'session-query-sqlite.path must be a !!js expression node, not a string literal',
  )
  const expr = (pathNode as { __jsExpr: string }).__jsExpr
  assert.ok(
    !expr.includes('${' + 'DSH_HOME}'),
    `path must not use ` + '$' + `{DSH_HOME} string interpolation; got expression: ${expr}`,
  )
  assert.equal(
    fts!.config.openAt,
    'first-search',
    'session-query-sqlite.openAt must be first-search so Conversation Hits populate without user setup',
  )
})

test('cordis.patch.yml: the !!js path expression resolves to an absolute path under DSH_HOME', () => {
  // Mirror the official dshHomePath helper: join segments onto the
  // resolved DSH home. The real DSH Loader does this against a
  // Cordis Context that the app-boot has populated with
  // dshHomePath before any entry mounts.
  const fakeHome = tmpdir() // hermetic stub; never read or written
  function dshHomePath(...segments: string[]): string {
    return resolve(fakeHome, ...segments)
  }
  const rows = parseCordisPatch(patchText)
  const fts = rows.find((r) => r.id === 'session-query-sqlite')!
  const resolved = evalJsExpr(fts.config.path, { dshHomePath })
  assert.equal(typeof resolved, 'string', 'evaluator must return a string path')
  assert.ok(
    isAbsolute(resolved as string),
    `resolved path must be absolute, got: ${resolved}`,
  )
  assert.ok(
    (resolved as string).endsWith(`session-query.sqlite`),
    `resolved path must end in session-query.sqlite, got: ${resolved}`,
  )
  assert.ok(
    (resolved as string).startsWith(fakeHome),
    `resolved path must be under DSH_HOME (${fakeHome}), got: ${resolved}`,
  )
})

test('cordis.patch.yml: resolved path is NOT the literal $VARIABLE-form string', () => {
  const rows = parseCordisPatch(patchText)
  const fts = rows.find((r) => r.id === 'session-query-sqlite')!
  const pathNode = fts.config.path as { __jsExpr: string }
  // The expression source text must not contain any shell-style
  // variable reference; the only thing it can contain is the
  // identifier `dshHomePath(...)`.
  assert.ok(
    !pathNode.__jsExpr.includes('$'),
    `path expression must not contain any shell variable reference, got: ${pathNode.__jsExpr}`,
  )
  assert.ok(
    pathNode.__jsExpr.startsWith('dshHomePath('),
    `path expression must use the dshHomePath helper, got: ${pathNode.__jsExpr}`,
  )
})

test('cordis.patch.yml: dsh-universal-palette plugin row is registered', () => {
  const rows = parseCordisPatch(patchText)
  const plugin = rows.find((r) => r.id === 'dsh-universal-palette')
  assert.ok(plugin, 'patch must register the dsh-universal-palette row')
})

test('cordis.patch.yml: no public third-party provider row is registered', () => {
  const rows = parseCordisPatch(patchText)
  const badIds = ['palette-registry', 'palette-registry-client', 'up-registry']
  for (const id of badIds) {
    assert.equal(
      rows.find((r) => r.id === id),
      undefined,
      `patch must NOT register "${id}" — public registry contract was removed in V1`,
    )
  }
})
