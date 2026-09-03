/**
 * Client entry point.
 *
 * Loaded by the DSH browser shell as `lib/client.js`. Responsible for:
 *   1. running the capability probe
 *   2. instantiating the providers that the probe supports
 *   3. building the aggregator + preferences store
 *   4. mounting the UniversalPalette ONLY through the public
 *      `shell.overlay` Slot system. If the slot is not declared in
 *      this DSH version, the activator fails closed — palette disabled,
 *      capability report still exposed for diagnostics. There is no
 *      `document.body` fallback (release-blocker closure, item 5).
 *   5. returning a cleanup disposer for HMR / plugin unload
 *
 * The activator does NOT expose a public registerProvider() contract.
 * Third-party plugins extend DSH native services instead. The internal
 * `paletteRegistry` exists only as a private implementation detail for
 * the aggregator (release-blocker closure, item 4).
 *
 * Provider registration order matches the V1 P0 priority:
 *   Commands + Sessions + Models + Conversation Hits.
 * Skills + References remain available but are optional surfaces.
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
import { createInternalProviderRegistry } from './providers/registry.ts'
import type { CapabilityReport, PaletteProvider } from '../shared/contract.ts'

export interface OverlayMount {
  /**
   * Mount the palette root element through the DSH public Slot system.
   * Returns the element the activator should append its DOM root to.
   * Implementations MUST resolve through `ctx.slots` + the `shell.overlay`
   * child slot — never `document.body`, never a hard-coded selector.
   */
  readonly shellOverlayRoot: HTMLElement | null
}

export interface ClientCtx {
  readonly host: HostSurface
  /**
   * The activator hands the overlay mount seam to Universal Palette.
   * The activator (test or production) resolves this from `ctx.slots`.
   * If `shellOverlayRoot` is null, the palette is disabled.
   */
  readonly overlay: OverlayMount
  /** Optional exposed capability report (used by tests + diagnostics). */
  readonly onReady?: (report: CapabilityReport) => void
}

export interface ClientHandle {
  dispose(): void
  isReady(): boolean
  capabilityReport(): CapabilityReport | null
  /** True when the palette UI mounted; false when shell.overlay was absent. */
  isMounted(): boolean
}

export function activateClient(ctx: ClientCtx): ClientHandle {
  let ready = false
  let handle: UniversalPaletteHandle | null = null
  const capabilities = probe(ctx.host)
  const report = capabilityReport(capabilities)

  const preferencesBackend = createLocalStorageBackend()
  const preferences = new PreferencesStore(preferencesBackend)

  void preferences.load().then(() => {
    // Internal registry: private implementation detail. NOT exposed as
    // a public API on ClientCtx.
    const internalRegistry = createInternalProviderRegistry()

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
    for (const p of providers) internalRegistry.add(p)

    const aggregator = new PaletteAggregator({
      providers,
      preferences,
      capabilityProbe: capabilities,
    })

    const rootContainer = ctx.overlay.shellOverlayRoot
    if (rootContainer) {
      handle = mountUniversalPalette({
        aggregator,
        preferences,
        rootContainer,
      })
    } else {
      // Fail closed: no shell.overlay, no DOM fallback (release-blocker
      // closure, item 5). Capability providers are still constructed
      // so diagnostics can inspect what would have been available.
      handle = null
    }

    ready = true
    if (ctx.onReady) {
      ctx.onReady(report)
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
    isMounted: () => handle !== null,
  }
}

export default activateClient
