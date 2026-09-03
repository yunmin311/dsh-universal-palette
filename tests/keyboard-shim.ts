/**
 * Polyfill KeyboardEvent BEFORE any imports that use it.
 * Side-effecting module.
 *
 * The shim mirrors the real DOM API: `new KeyboardEvent(type, init)`,
 * not `new KeyboardEvent(init)`.
 */

class FakeKeyboardEvent {
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
  key: string
  constructor(
    _type: string,
    init: {
      ctrlKey?: boolean
      metaKey?: boolean
      shiftKey?: boolean
      altKey?: boolean
      key?: string
    } = {},
  ) {
    this.ctrlKey = init.ctrlKey ?? false
    this.metaKey = init.metaKey ?? false
    this.shiftKey = init.shiftKey ?? false
    this.altKey = init.altKey ?? false
    this.key = init.key ?? ''
  }
}

;(globalThis as unknown as Record<string, unknown>).KeyboardEvent = FakeKeyboardEvent

export {}
