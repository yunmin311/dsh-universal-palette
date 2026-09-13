/**
 * Conflict verdict for the effective palette shortcut, as a small
 * observable the Floating surface can render. The verdict is recomputed
 * from `keyboard.reportConflicts()` on every keyboard attach (initial and
 * runtime rebind), so a shortcut change updates the notice without any
 * new settings UI. Detection stays inside keyboard.ts (KNOWN_SHORTCUTS).
 */

export interface ShortcutConflict {
  /** The effective shortcut that triggered the verdict. */
  readonly shortcut: string
  /** Known owners that also bind this shortcut (e.g. `dsh-spotlight`). */
  readonly owners: readonly string[]
}

export interface ConflictObservable {
  getSnapshot(): ShortcutConflict | null
  subscribe(fn: () => void): () => void
  set(next: ShortcutConflict | null): void
}

export function createConflictObservable(initial: ShortcutConflict | null = null): ConflictObservable {
  let current = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => current,
    subscribe(fn) {
      listeners.add(fn)
      return () => { listeners.delete(fn) }
    },
    set(next) {
      if (current?.shortcut === next?.shortcut
        && current?.owners.length === next?.owners.length
        && (current?.owners ?? []).every((owner, i) => next?.owners[i] === owner)) return
      current = next
      for (const fn of [...listeners]) fn()
    },
  }
}
