/**
 * Unit tests: capability detection.
 *
 * Spec §13 Phase A: the probe must record what is actually present and
 * providers must opt out of missing services.
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
  assert.equal(report.thirdPartyProviders, false)
})

test('capability report records version when present', () => {
  const host: HostSurface = { version: '0.1.2-alpha.3' }
  const report = capabilityReport(probe(host))
  assert.equal(report.dshVersion, '0.1.2-alpha.3')
})

test('capability report flags overlay slot + registry when host has them', () => {
  const host: HostSurface = { hasShellOverlaySlot: true, hasPaletteRegistry: true }
  const report = capabilityReport(probe(host))
  assert.equal(report.shellOverlaySlot, true)
  assert.equal(report.thirdPartyProviders, true)
})
