/**
 * Internal provider registry.
 *
 * NOT a public extension surface. V1 federates only the DSH-native
 * capability set (Commands, Sessions, Models, Conversation Hits);
 * third-party plugins MUST add their own capabilities by registering
 * native DSH services (commands, etc.). Universal Palette does not
 * ship a public registerProvider() API in V1 — that contract was
 * deliberately removed during release-blocker closure to avoid
 * duplicating `dsh-command-palette`'s register/collect/subscribe
 * service surface.
 *
 * Provider isolation is enforced by the aggregator: each provider's
 * `collect()` is wrapped in a try/catch and treated as zero-result on
 * throw / abort / timeout (see `aggregator.ts`).
 */

import type { PaletteProvider } from '../../shared/contract.ts'

export function createInternalProviderRegistry(): {
  add(provider: PaletteProvider): () => void
  list(): readonly PaletteProvider[]
} {
  const providers = new Set<PaletteProvider>()
  return {
    add(provider) {
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
