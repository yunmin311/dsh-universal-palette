/**
 * Frecency store (spec §7.2): frequency × recency decay.
 *
 * Persistence: stored under one host settings namespace
 * `dsh-universal-palette` via `ctx.settings` (DSH host-backed preferences).
 * On the browser side we treat persistence as a best-effort seam: if the
 * host exposes a `localStorage`-backed namespace, we use it; otherwise we
 * fall back to in-memory for the lifetime of the page. The frecency
 * store also serves as the backing store for `pin`, `hide`, `alias`
 * (spec §9, Phase D — Personalization).
 *
 * This module is the ONLY writer to those records. Providers must not
 * mutate it directly.
 */

export interface PalettePreferences {
  readonly pins: Record<string, number>
  readonly hides: Record<string, true>
  readonly aliases: Record<string, string>
  readonly frecency: Record<string, { readonly count: number; readonly lastUsedAt: number }>
  readonly providers: Record<string, { enabled: boolean; order: number }>
  readonly glassIntensity: 'solid' | 'soft' | 'glass'
  readonly shortcut: string
}

export const DEFAULT_PREFERENCES: PalettePreferences = {
  pins: {},
  hides: {},
  aliases: {},
  frecency: {},
  providers: {},
  glassIntensity: 'soft',
  shortcut: 'Ctrl+Shift+K',
}

export interface PreferencesBackend {
  load(): Promise<PalettePreferences>
  save(prefs: PalettePreferences): Promise<void>
  /** Invalidate when external writes happen (e.g. settings page edit). */
  subscribe?(onChange: () => void): () => void
}

const DECAY_HALF_LIFE_MS = 1000 * 60 * 60 * 24 * 7 // 7 days

export function frecencyScore(
  record: { count: number; lastUsedAt: number } | undefined,
  now: number,
): number {
  if (!record) return 0
  const ageMs = Math.max(0, now - record.lastUsedAt)
  const halfLives = ageMs / DECAY_HALF_LIFE_MS
  const decay = Math.pow(0.5, halfLives)
  // log10 so a count of 1000 doesn't drown out context ranking
  return Math.log10(1 + record.count) * decay
}

export class PreferencesStore {
  private readonly backend: PreferencesBackend
  private current: PalettePreferences = DEFAULT_PREFERENCES
  private listeners = new Set<() => void>()

  constructor(backend: PreferencesBackend) {
    this.backend = backend
  }

  async load(): Promise<void> {
    this.current = await this.backend.load()
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

  /**
   * V1 P0: Pin is wired to ranking AND to the UI's secondary action
   * surface (Pin on Action Panel). This is part of the release gate.
   */
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

  /**
   * Optional surface, not part of V1 P0 gate. The store accepts hides
   * for any third-party caller, but the V1 UI does not surface a
   * Hide action. Kept on the PreferencesStore so the data path is
   * stable for a future release that wants it.
   */
  async setHide(itemId: string, hide: boolean): Promise<void> {
    const next: Record<string, true> = { ...this.current.hides }
    if (hide) next[itemId] = true
    else delete next[itemId]
    this.current = { ...this.current, hides: next }
    await this.persist()
  }

  /**
   * Optional surface, not part of V1 P0 gate. The matcher in
   * ranking/fuzzy.ts still honors user aliases when present, but no
   * UI ships in V1 to record them.
   */
  async setAlias(itemId: string, alias: string): Promise<void> {
    const next: Record<string, string> = { ...this.current.aliases }
    if (alias.length === 0) delete next[itemId]
    else next[itemId] = alias
    this.current = { ...this.current, aliases: next }
    await this.persist()
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

  /**
   * Optional surface, not part of V1 P0 gate. All shipped providers
   * are active by default; the UI does not surface a per-provider
   * toggle in V1.
   */
  async setProviderEnabled(providerId: string, enabled: boolean): Promise<void> {
    const prev = this.current.providers[providerId] ?? { enabled: true, order: 0 }
    const next: Record<string, { enabled: boolean; order: number }> = {
      ...this.current.providers,
    }
    next[providerId] = { ...prev, enabled }
    this.current = { ...this.current, providers: next }
    await this.persist()
  }

  async setGlassIntensity(intensity: 'solid' | 'soft' | 'glass'): Promise<void> {
    this.current = { ...this.current, glassIntensity: intensity }
    await this.persist()
  }

  async setShortcut(shortcut: string): Promise<void> {
    this.current = { ...this.current, shortcut }
    await this.persist()
  }

  async resetRanking(): Promise<void> {
    this.current = { ...this.current, frecency: {} }
    await this.persist()
  }

  /** Free in-memory data when the plugin unloads (spec §11). */
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
