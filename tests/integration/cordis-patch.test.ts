/**
 * Integration test: cordis.patch.yml contents.
 *
 * Verifies the V1 release prerequisite: installing Universal Palette
 * activates the shipped `dsh-session-query-sqlite` row with a
 * persistent FTS path and `openAt: first-search`, so Conversation
 * Hits are populated without requiring the user to install
 * `dsh-session-workbench`.
 *
 * The patch file is plain YAML; we parse it with a minimal
 * structure-aware reader (line-based, list-of-maps shape) so we do
 * not introduce a YAML dependency.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
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
      // next non-comment, non-blank line must start with `config:`
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
          // nested map
          i++
          const nested: Record<string, unknown> = {}
          while (i < lines.length) {
            const l2 = lines[i]!
            const t2 = l2.trim()
            if (t2 === '') { i++; continue }
            if (/^- id:/.test(t2)) break
            const nm = l2.match(/^(\s+)([^:]+):\s*(.*)$/)
            if (!nm) { i++; continue }
            nested[nm[2]!.trim()] = parseScalar(nm[3]!.trim())
            i++
          }
          config[key] = nested
        } else {
          config[key] = parseScalar(valueRaw)
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

const here = dirname(fileURLToPath(import.meta.url))
const patchPath = resolve(here, '../../cordis.patch.yml')
const patchText = readFileSync(patchPath, 'utf8')

test('cordis.patch.yml: session-query-sqlite is overridden to a persistent FTS index', () => {
  const rows = parseCordisPatch(patchText)
  const fts = rows.find((r) => r.id === 'session-query-sqlite')
  assert.ok(fts, 'patch must override session-query-sqlite')
  assert.ok(typeof fts!.config.path === 'string' && fts!.config.path.length > 0,
    'session-query-sqlite.path must be a non-empty string')
  assert.notEqual(
    fts!.config.path,
    ':memory:',
    'path must not be :memory: (would force rebuild-on-every-search)',
  )
  assert.equal(
    fts!.config.openAt,
    'first-search',
    'session-query-sqlite.openAt must be first-search so Conversation Hits populate without user setup',
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
