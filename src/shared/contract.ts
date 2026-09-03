/**
 * Shared contract types for DSH Universal Palette.
 *
 * This module is the single source of truth for:
 *   - The internal item model every provider emits (`PaletteItem`)
 *   - The public third-party provider extension contract
 *     (`PaletteProvider`, `registerProvider`, `PaletteAction`)
 *   - The capability-detection shape (`CapabilityReport`)
 *
 * Implementation note (deviation from spec §6):
 *   The spec sketches a single file with all three. The real DSH plugin
 *   architecture splits the wire vocabulary from the runtime surface, so
 *   we keep these in one self-contained file to avoid forcing a deep
 *   package boundary on third-party plugins; this keeps the V1 SDK
 *   surface intentionally tiny (spec §6.2: "must not expand into an SDK").
 */

export type PaletteItemKind =
  | 'action'
  | 'command'
  | 'session'
  | 'conversation-hit'
  | 'model'
  | 'skill'
  | 'reference'
  | 'workspace'

export type ImageAttachment = {
  readonly id: string
  readonly mime: string
  readonly dataUrl: string
}

export interface PaletteAction {
  readonly id: string
  readonly title: string
  readonly shortcut?: string
  readonly run: (signal: AbortSignal) => Promise<void> | void
  /** When true the palette stays open after a successful run. */
  readonly stayOpen?: boolean
  /** Free-form hint about whether this action mutates or only references. */
  readonly kind?: 'primary' | 'secondary'
}

export interface PaletteContext {
  readonly workspaceId?: string
  readonly sessionId?: string
  readonly provider?: string
}

export interface PaletteItem {
  /** Globally stable id; collision-free per provider (see PaletteProvider.id). */
  readonly id: string
  readonly providerId: string
  readonly kind: PaletteItemKind
  readonly title: string
  readonly subtitle?: string
  /** Compact excerpt for Conversation Hit rows; trimmed client-side. */
  readonly snippet?: string
  readonly keywords?: readonly string[]
  readonly badges?: readonly string[]
  readonly primary: PaletteAction
  readonly secondary?: readonly PaletteAction[]
  readonly context?: PaletteContext
  /** Optional pre-computed frecency record (count + lastUsedAt). */
  readonly frecency?: { readonly count: number; readonly lastUsedAt: number }
}

export interface PaletteCollectInput {
  /** Raw user query (already trimmed). Empty string = empty query state. */
  readonly query: string
  /**
   * True when the user typed `>` at the start. The aggregator uses this
   * as a hint, not as a hard filter: every provider is still consulted
   * but action-shaped items receive a small ranking boost.
   */
  readonly actionsHint: boolean
  /** Stable context for context-ranking (workspace / session / provider). */
  readonly context: PaletteContext
  /**
   * Hard cap honored by every provider. Providers may return fewer items.
   * Aggregator enforces a final cap of 40.
   */
  readonly limit: number
}

export interface PaletteProvider {
  readonly id: string
  readonly label: string
  /** Display a small status row when the provider partially failed. */
  readonly availability?: 'ready' | 'degraded' | 'unavailable'
  collect(input: PaletteCollectInput, signal: AbortSignal): Promise<PaletteItem[]> | PaletteItem[]
  /** Optional invalidate subscription (per spec §6). */
  subscribe?(invalidate: () => void): () => void
}

/** Capability detection result, recorded once at activation. */
export interface CapabilityReport {
  readonly dshVersion: string
  readonly shellOverlaySlot: boolean
  readonly commands: boolean
  readonly sessions: boolean
  readonly workspaces: boolean
  readonly modelDirectory: boolean
  readonly sessionQuery: boolean
  readonly skills: boolean
  readonly referenceSource: boolean
  readonly theme: boolean
  readonly thirdPartyProviders: boolean
}
