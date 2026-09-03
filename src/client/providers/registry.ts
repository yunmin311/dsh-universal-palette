/**
 * Third-party provider registry (spec §6.2).
 *
 * Public contract: any plugin can call `registerProvider(provider)` to
 * contribute PaletteItems without owning a DSH command. This is the
 * ONLY surface we expose to third parties in V1 — we deliberately do
 * not build an SDK (spec §6.2: "V1 only: register, unregister, collect,
 * optional invalidate subscription").
 *
 * Provider isolation (spec §3): each provider's failure surfaces
 * independently. The aggregator wraps `collect()` in a try/catch and
 * treats thrown errors as zero-result for that provider.
 */

import type {
  PaletteProvider,
} from '../../shared/contract.ts'

export interface PaletteRegistry {
  register(provider: PaletteProvider): () => void
  list(): readonly PaletteProvider[]
}

export function createPaletteRegistry(): PaletteRegistry {
  const providers = new Set<PaletteProvider>()
  return {
    register(provider) {
      providers.add(provider)
      return () => {
        providers.delete(provider)
      }
    },
    list() {
      return Array.from(providers)
    },
  }
}
