/**
 * Frecency store (spec §7.2): frequency × recency decay.
 *
 * Persistence: localStorage under the `dsh-universal-palette` namespace.
 * The store is the V1 P0 surface (frecency + pin). Hide / alias / per-
 * provider toggle remain in the code as optional / non-blocking.
 */

export interface PalettePreferences {
  readonly pins: Record<string, number>
  readonly frecency: Record<string, { readonly count: number; readonly lastUsedAt: number }>
  readonly glassIntensity: 'solid' | 'soft' | 'glass'
  readonly shortcut: string
}

const BASE_PREFERENCES = {
  pins: {},
  frecency: {},
  glassIntensity: 'soft',
} as const

const PREFERENCES_SCHEMA_VERSION = 1
const LEGACY_DEFAULT_SHORTCUT = 'Ctrl+Shift+K'

export type StoredPalettePreferences = Partial<PalettePreferences> & {
  readonly schemaVersion?: number
  readonly shortcutCustomized?: boolean
}

export interface PreferencesBackend {
  /** Load the persisted shape, or `null` when the backend has never
   *  written anything yet. Returning a synthesized runtime preference
   *  would force migration to read a "default" the user never chose;
   *  null preserves the fresh-install branch. */
  load(): Promise<StoredPalettePreferences | null>
  save(prefs: StoredPalettePreferences): Promise<void>
}

const STORAGE_KEY = 'dsh-universal-palette/preferences'
const DECAY_HALF_LIFE_MS = 1000 * 60 * 60 * 24 * 7

export function frecencyScore(
  record: { count: number; lastUsedAt: number } | undefined,
  now: number,
): number {
  if (!record) return 0
  const ageMs = Math.max(0, now - record.lastUsedAt)
  const halfLives = ageMs / DECAY_HALF_LIFE_MS
  const decay = Math.pow(0.5, halfLives)
  return Math.log10(1 + record.count) * decay
}

export class PreferencesStore {
  private readonly backend: PreferencesBackend
  private readonly platformDefaultShortcut: string
  private current: PalettePreferences
  private shortcutCustomized = false
  private listeners = new Set<() => void>()

  constructor(backend: PreferencesBackend, platformDefaultShortcut: string) {
    this.backend = backend
    this.platformDefaultShortcut = platformDefaultShortcut
    this.current = { ...BASE_PREFERENCES, shortcut: platformDefaultShortcut }
  }

  async load(): Promise<void> {
    const loaded = await this.backend.load()
    const normalized = normalizeStoredPreferences(loaded, this.platformDefaultShortcut)
    this.current = normalized.preferences
    this.shortcutCustomized = normalized.shortcutCustomized
    this.notify()
  }

  get snapshot(): PalettePreferences {
    return this.current
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async togglePin(itemId: string): Promise<boolean> {
    const next: Record<string, number> = { ...this.current.pins }
    if (next[itemId]) {
      delete next[itemId]
    } else {
      next[itemId] = Date.now()
    }
    this.current = { ...this.current, pins: next }
    await this.persist()
    return Boolean(next[itemId])
  }

  async recordUse(itemId: string): Promise<void> {
    const now = Date.now()
    const prev = this.current.frecency[itemId]
    const next: Record<string, { count: number; lastUsedAt: number }> = {
      ...this.current.frecency,
    }
    next[itemId] = {
      count: (prev?.count ?? 0) + 1,
      lastUsedAt: now,
    }
    this.current = { ...this.current, frecency: next }
    await this.persist()
  }

  async resetRanking(): Promise<void> {
    this.current = { ...this.current, frecency: {} }
    await this.persist()
  }

  dispose(): void {
    this.listeners.clear()
  }

  private async persist(): Promise<void> {
    await this.backend.save({
      schemaVersion: PREFERENCES_SCHEMA_VERSION,
      shortcutCustomized: this.shortcutCustomized,
      ...this.current,
    })
    this.notify()
  }

  private notify(): void {
    for (const l of this.listeners) l()
  }
}

function normalizeStoredPreferences(
  stored: StoredPalettePreferences | null,
  platformDefaultShortcut: string,
): { preferences: PalettePreferences; shortcutCustomized: boolean } {
  const storedShortcut = typeof stored?.shortcut === 'string' && stored.shortcut.trim().length > 0
    ? stored.shortcut
    : undefined
  const hasCurrentMetadata = stored?.schemaVersion === PREFERENCES_SCHEMA_VERSION
    && typeof stored.shortcutCustomized === 'boolean'

  // The legacy schema cannot distinguish its automatic Ctrl+Shift+K default
  // from a user who deliberately chose the same value. Before v0.2 is
  // published, migrate that ambiguous value as the legacy default. Every
  // other non-empty legacy value is treated as an explicit customization.
  const shortcutCustomized = hasCurrentMetadata
    ? stored.shortcutCustomized === true && storedShortcut !== undefined
    : storedShortcut !== undefined && storedShortcut !== LEGACY_DEFAULT_SHORTCUT
  const shortcut = shortcutCustomized ? storedShortcut! : platformDefaultShortcut
  const glassIntensity = stored?.glassIntensity === 'solid'
    || stored?.glassIntensity === 'glass'
    || stored?.glassIntensity === 'soft'
    ? stored.glassIntensity
    : BASE_PREFERENCES.glassIntensity

  return {
    preferences: {
      pins: stored?.pins ?? {},
      frecency: stored?.frecency ?? {},
      glassIntensity,
      shortcut,
    },
    shortcutCustomized,
  }
}

export function createLocalStorageBackend(): PreferencesBackend {
  return {
    async load() {
      if (typeof localStorage === 'undefined') return null
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return null
        return JSON.parse(raw) as StoredPalettePreferences
      } catch {
        return null
      }
    },
    async save(prefs) {
      if (typeof localStorage === 'undefined') return
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
      } catch {
        // quota / private mode — keep in-memory state
      }
    },
  }
}
