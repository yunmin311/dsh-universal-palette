/**
 * Unit tests: capability probe degrades on missing services.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { probe, capabilityReport, type HostSurface } from '../../src/client/capabilities.ts'

test('empty surface reports every capability false', () => {
  const report = capabilityReport(probe({}))
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

test('records shell.overlay flag when host exposes it', () => {
  const host: HostSurface = { hasShellOverlaySlot: true }
  const report = capabilityReport(probe(host))
  assert.equal(report.shellOverlaySlot, true)
})

test('records dshVersion when host exposes it', () => {
  const host: HostSurface = { version: '0.1.2-rc.1' }
  const report = capabilityReport(probe(host))
  assert.equal(report.dshVersion, '0.1.2-rc.1')
})

test('records sessionQuery when host exposes it', () => {
  const host: HostSurface = {
    sessionQuery: {
      searchSessions: async () => [],
      searchEvents: async () => [],
    },
  }
  const report = capabilityReport(probe(host))
  assert.equal(report.sessionQuery, true)
})
