/**
 * Sidebar wide/compact observable.
 *
 * Mirrors the public sidebar footer owner prop (wide/compact only) into
 * a uSES-friendly observable so Floating and Morph can subscribe
 * without recreating listeners per render. No DOM or private layout
 * reads.
 */
export interface SidebarObservable {
  getSnapshot(): boolean
  subscribe(fn: () => void): () => void
}

export function createSidebarObservable(): { observable: SidebarObservable; setWide: (wide: boolean) => void } {
  let wide = true
  const listeners = new Set<() => void>()
  return {
    observable: {
      getSnapshot: () => wide,
      subscribe(fn) {
        listeners.add(fn)
        return () => { listeners.delete(fn) }
      },
    },
    setWide(next: boolean) {
      if (wide === next) return
      wide = next
      for (const listener of listeners) listener()
    },
  }
}