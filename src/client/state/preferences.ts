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

export const DEFAULT_PREFERENCES: PalettePreferences = {
  pins: {},
  frecency: {},
  glassIntensity: 'soft',
  shortcut: 'Ctrl+Shift+K',
}

export interface PreferencesBackend {
  /** Load the persisted shape, or `null` when the backend has never
   *  written anything yet. Returning a fully-formed DEFAULT_PREFERENCES
   *  would force the migration layer to read a "default" that the user
   *  never chose; null preserves the fresh-install branch. */
  load(): Promise<PalettePreferences | null>
  save(prefs: PalettePreferences): Promise<void>
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
  private current: PalettePreferences = DEFAULT_PREFERENCES
  private listeners = new Set<() => void>()
  /** Tracks whether the storage backend has ever returned a saved value;
   *  a `false` value here means the running PreferencesStore is still on
   *  DEFAULT_PREFERENCES, so the migration layer can decide whether to
   *  honor an "existing Ctrl+Shift+K" (Prompt §6) or to fall back to the
   *  platform default for a fresh install. */
  private backendHasSavedValue = false

  constructor(backend: PreferencesBackend) {
    this.backend = backend
  }

  async load(): Promise<void> {
    const loaded = await this.backend.load()
    this.backendHasSavedValue = loaded !== null
    this.current = loaded ?? DEFAULT_PREFERENCES
    this.notify()
  }

  /** True once the storage backend has confirmed a saved value (a fresh
   *  install that never wrote anything reports `false`). */
  hasSavedValue(): boolean {
    return this.backendHasSavedValue
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
    await this.backend.save(this.current)
    this.notify()
  }

  private notify(): void {
    for (const l of this.listeners) l()
  }
}

export function createLocalStorageBackend(): PreferencesBackend {
  return {
    async load() {
      if (typeof localStorage === 'undefined') return null
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw) as Partial<PalettePreferences>
        return { ...DEFAULT_PREFERENCES, ...parsed }
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
