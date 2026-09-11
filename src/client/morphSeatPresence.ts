/** Slot-lifecycle signal used to prefer the additive Hero dock over the shared overlay seat. */
export interface HeroSeatPresence {
  readonly getSnapshot: () => boolean
  readonly subscribe: (listener: () => void) => () => void
  readonly mount: () => () => void
}

export function createHeroSeatPresence(): HeroSeatPresence {
  const mounts = new Set<symbol>()
  const listeners = new Set<() => void>()
  const emit = () => { for (const listener of [...listeners]) listener() }
  return {
    getSnapshot: () => mounts.size > 0,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    mount() {
      const token = Symbol('hero-composer-dock')
      const wasMounted = mounts.size > 0
      mounts.add(token)
      if (!wasMounted) emit()
      let disposed = false
      return () => {
        if (disposed) return
        disposed = true
        const wasLast = mounts.size === 1 && mounts.has(token)
        mounts.delete(token)
        if (wasLast) emit()
      }
    },
  }
}
