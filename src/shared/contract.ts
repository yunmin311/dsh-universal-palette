/**
 * Shared contract types for DSH Universal Palette.
 *
 * V1 P0 set (locked during release-blocker closure):
 *   Commands + Sessions + Models + Conversation Hits
 *   + Action Panel + deterministic context/frecency ranking.
 *
 * Skills, References, Alias, Hide remain in the code path as optional
 * surfaces; they are NOT part of the V1 release gate.
 */

export type PaletteItemKind =
  | 'action'
  | 'command'
  | 'session'
  | 'conversation-hit'
  | 'model'
  /** Optional; not part of V1 P0 gate. */
  | 'skill'
  /** Optional; not part of V1 P0 gate. */
  | 'reference'
  | 'workspace'

export interface PaletteAction {
  readonly id: string
  readonly title: string
  readonly shortcut?: string
  readonly run: (signal: AbortSignal) => Promise<void> | void
  readonly stayOpen?: boolean
  readonly kind?: 'primary' | 'secondary'
}

export interface PaletteContext {
  readonly workspaceId?: string
  readonly sessionId?: string
  readonly provider?: string
}

export interface PaletteItem {
  readonly id: string
  readonly providerId: string
  readonly kind: PaletteItemKind
  readonly title: string
  readonly subtitle?: string
  readonly snippet?: string
  readonly keywords?: readonly string[]
  readonly aliases?: readonly string[]
  /** Display provenance, independent of internal provider ids; no SDK contract. */
  readonly source?: string
  readonly updatedAt?: number
  /** Authoritative current-session row; display labels are not identity. */
  readonly isCurrent?: boolean
  readonly workspaceTitle?: string
  readonly badges?: readonly string[]
  readonly primary: PaletteAction
  readonly secondary?: readonly PaletteAction[]
  readonly context?: PaletteContext
  readonly frecency?: { readonly count: number; readonly lastUsedAt: number }
}

export interface PaletteCollectInput {
  readonly query: string
  readonly actionsHint: boolean
  readonly context: PaletteContext
  readonly limit: number
}

/**
 * Internal provider shape. NOT a public API: third-party plugins do NOT
 * extend Universal Palette directly. They extend DSH native services
 * (commands, etc.); Universal Palette picks them up via the same
 * native provider pipeline.
 */
export interface PaletteProvider {
  readonly id: string
  readonly label: string
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
