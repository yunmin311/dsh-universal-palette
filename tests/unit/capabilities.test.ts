/**
 * Unit tests: capability detection.
 *
 * Spec §13 Phase A: the probe must record what is actually present and
 * providers must opt out of missing services.
 *
 * V1 P0 set: Commands + Sessions + Models + Conversation Hits +
 * shellOverlaySlot. Skills / References are detected but optional.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { probe, capabilityReport, type HostSurface } from '../../src/client/capabilities.ts'

test('capability report with no services marks everything false', () => {
  const host: HostSurface = {}
  const p = probe(host)
  const report = capabilityReport(p)
  assert.equal(report.commands, false)
  assert.equal(report.sessions, false)
  assert.equal(report.workspaces, false)
  assert.equal(report.modelDirectory, false)
  assert.equal(report.sessionQuery, false)
  assert.equal(report.skills, false)
  assert.equal(report.referenceSource, false)
  assert.equal(report.theme, false)
  assert.equal(report.shellOverlaySlot, false)
})

test('capability report records version when present', () => {
  const host: HostSurface = { version: '0.1.2-rc.1' }
  const report = capabilityReport(probe(host))
  assert.equal(report.dshVersion, '0.1.2-rc.1')
})

test('capability report flags shell.overlay when host has it', () => {
  const host: HostSurface = { hasShellOverlaySlot: true }
  const report = capabilityReport(probe(host))
  assert.equal(report.shellOverlaySlot, true)
})

test('capability report marks sessionQuery true when session_query host surface is wired', () => {
  const host: HostSurface = {
    sessionQuery: {
      searchSessions: async () => [],
      searchEvents: async () => [],
    },
  }
  const report = capabilityReport(probe(host))
  assert.equal(report.sessionQuery, true)
})
