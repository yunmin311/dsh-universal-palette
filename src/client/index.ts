/**
 * Client entry point.
 *
 * Loaded by the DSH browser shell as `lib/client.js`. Responsible for:
 *   1. running the capability probe
 *   2. instantiating the providers that the probe supports
 *   3. building the aggregator + preferences store
 *   4. mounting the UniversalPalette into `shell.overlay` if available
 *   5. registering the third-party `paletteRegistry` service into ctx
 *   6. returning a cleanup disposer for HMR / plugin unload
 *
 * Implementation note: the activator never throws if the DSH contract
 * is incomplete. Any missing service drops a provider (degrades
 * silently). The overlay mount degrades to a no-op when the slot is
 * absent — spec §8.2.
 */

import { mountUniversalPalette, type UniversalPaletteHandle } from './UniversalPalette.ts'
import { PaletteAggregator } from './aggregator.ts'
import { probe, capabilityReport, type HostSurface } from './capabilities.ts'
import { PreferencesStore } from './ranking/frecency.ts'
import { createLocalStorageBackend } from './state/preferences-backend.ts'
import { createCommandsProvider } from './providers/commands.ts'
import { createSessionsProvider } from './providers/sessions.ts'
import { createModelsProvider } from './providers/models.ts'
import { createConversationHitsProvider } from './providers/conversation-hits.ts'
import { createSkillsProvider } from './providers/skills.ts'
import { createPaletteRegistry, type PaletteRegistry } from './providers/registry.ts'
import type { CapabilityReport, PaletteProvider } from '../shared/contract.ts'

export interface ClientCtx {
  readonly host: HostSurface
  /** DOM container for fallback mount when shell.overlay is unavailable. */
  readonly fallbackContainer?: HTMLElement | null
  /** Optional exposed capability report (used by tests + diagnostics). */
  readonly onReady?: (report: CapabilityReport, registry: PaletteRegistry) => void
}

export interface ClientHandle {
  dispose(): void
  isReady(): boolean
  capabilityReport(): CapabilityReport | null
}

export function activateClient(ctx: ClientCtx): ClientHandle {
  let ready = false
  let handle: UniversalPaletteHandle | null = null
  const capabilities = probe(ctx.host)
  const report = capabilityReport(capabilities)

  const preferencesBackend = createLocalStorageBackend()
  const preferences = new PreferencesStore(preferencesBackend)

  void preferences.load().then(() => {
    const registry = createPaletteRegistry()
    const providers: PaletteProvider[] = []
    const c = createCommandsProvider(capabilities)
    const s = createSessionsProvider(capabilities)
    const m = createModelsProvider(capabilities)
    const h = createConversationHitsProvider(capabilities)
    const sk = createSkillsProvider(capabilities)
    if (c) providers.push(c)
    if (s) providers.push(s)
    if (m) providers.push(m)
    if (h) providers.push(h)
    if (sk) providers.push(sk)

    const aggregator = new PaletteAggregator({
      providers,
      preferences,
      capabilityProbe: capabilities,
    })

    handle = mountUniversalPalette({
      aggregator,
      preferences,
      rootContainer: ctx.fallbackContainer ?? (typeof document !== 'undefined' ? document.body : null),
    })

    ready = true
    if (ctx.onReady) {
      ctx.onReady(report, registry)
    }
  })

  return {
    dispose() {
      handle?.dispose()
      preferences.dispose()
    },
    isReady: () => ready,
    capabilityReport: (): CapabilityReport => {
      if (!report) throw new Error('capability report not initialized')
      return report
    },
  }
}

export default activateClient
