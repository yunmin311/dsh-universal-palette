/**
 * Shared contract types for DSH Universal Palette.
 *
 * V1 contract surface (locked during release-blocker closure):
 *   - The internal item model every native provider emits (`PaletteItem`)
 *   - The internal `PaletteProvider` shape used by the aggregator to
 *     organize native providers (Commands, Sessions, Models, Conversation
 *     Hits) — NOT a public extension surface. Third-party plugins MUST
 *     extend DSH native services instead.
 *   - The capability-detection shape (`CapabilityReport`)
 *
 * The V1 P0 set is: Commands + Sessions + Models + Conversation Hits +
 * Action Panel + deterministic context/frecency ranking.
 *
 * Skills, References, Alias, Hide remain in the code as optional /
 * non-blocking surfaces; they are NOT part of the V1 release gate.
 */

export type PaletteItemKind =
  | 'action'
  | 'command'
  | 'session'
  | 'conversation-hit'
  | 'model'
  /** Optional; not part of V1 P0 release gate. */
  | 'skill'
  /** Optional; not part of V1 P0 release gate. */
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

/**
 * Internal provider shape. NOT a public API: third-party plugins do NOT
 * extend Universal Palette directly. They extend DSH native services
 * (commands, etc.) and Universal Palette picks them up via the same
 * native provider pipeline.
 */
export interface PaletteProvider {
  readonly id: string
  readonly label: string
  /** Display a small status row when the provider partially failed. */
  readonly availability?: 'ready' | 'degraded' | 'unavailable'
  collect(input: PaletteCollectInput, signal: AbortSignal): Promise<PaletteItem[]> | PaletteItem[]
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
  /** Optional surface, not part of V1 P0 gate. */
  readonly skills: boolean
  /** Optional surface, not part of V1 P0 gate. */
  readonly referenceSource: boolean
  readonly theme: boolean
}
