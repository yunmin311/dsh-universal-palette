/**
 * Preferences backend (spec §9, §7.2).
 *
 * In production, the browser half writes to the host's settings store
 * via `ctx.settings.write(namespace, key, value)`. We don't have a
 * stable browser-side settings service name across DSH versions, so
 * the activator wraps whichever one exists and passes a thin backend
 * interface here. In tests we use an in-memory backend.
 */

import { DEFAULT_PREFERENCES, type PalettePreferences, type PreferencesBackend } from '../ranking/frecency.ts'

const STORAGE_KEY = 'dsh-universal-palette/preferences'

export function createLocalStorageBackend(): PreferencesBackend {
  return {
    async load() {
      if (typeof localStorage === 'undefined') return DEFAULT_PREFERENCES
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return DEFAULT_PREFERENCES
        const parsed = JSON.parse(raw) as Partial<PalettePreferences>
        return { ...DEFAULT_PREFERENCES, ...parsed }
      } catch {
        return DEFAULT_PREFERENCES
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

export function createInMemoryBackend(): PreferencesBackend & {
  state: PalettePreferences
} {
  let state: PalettePreferences = DEFAULT_PREFERENCES
  return {
    get state() {
      return state
    },
    async load() {
      return state
    },
    async save(prefs) {
      state = prefs
    },
  }
}
