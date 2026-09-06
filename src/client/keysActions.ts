/**
 * Optional Keys Palette bridge over the public `keys.actions` service.
 *
 * dsh-keys-palette publishes a client service through `ctx.reflect.provide`
 * (`ctx.get('keys.actions')`); registered actions become bindable shortcuts in
 * its palette and in Settings → 快捷键. This module contributes exactly one
 * action — opening Universal Palette — and nothing else:
 *
 * - capability-detected: when the service is absent the module registers one
 *   event listener and touches nothing else, so an install without
 *   dsh-keys-palette behaves exactly like V1;
 * - late-safe: the service may be provided after this plugin's apply, so a
 *   missing service is re-checked through the public `internal/service`
 *   Cordis event instead of a blocking inject;
 * - lifecycle-safe: the current registration disposer and the listener are
 *   released through one `ctx.effect`, and locale changes re-register the
 *   action so the label follows DSH's active locale like all owned copy.
 */

export interface KeysActionDefinition {
  id: string
  label?: string
  description?: string
  source?: string
  run: () => void
}

export interface KeysActionsService {
  register(definition: KeysActionDefinition): () => void
  list(): { id: string; label: string; description: string; source: string }[]
  subscribe(fn: () => void): () => void
}

export const OPEN_ACTION_ID = 'universal-palette.open'

export interface KeysActionBridgeOptions {
  /** Current label; re-evaluated on every (re)registration. */
  label: () => string
  /** Current description; re-evaluated on every (re)registration. */
  description: () => string
  /** Opens (or toggles) the Palette surface. */
  toggle: () => void
  /** Public locale-change notification; absent only in tests without a locale service. */
  onLocaleChange?: (fn: () => void) => () => void
}

/**
 * Watch the public service and keep exactly one action registered while it
 * exists. Returns a disposer for tests; production callers wrap it in
 * `ctx.effect`. Never reads Keys Palette internals: bindings, sources and the
 * built-in actions stay owned by dsh-keys-palette.
 */
export function bridgeKeysActions(
  ctx: { get?(name: string): unknown; on?(event: string, fn: (...args: unknown[]) => void): () => void },
  options: KeysActionBridgeOptions,
): () => void {
  let unregister: (() => void) | undefined
  let service: KeysActionsService | undefined
  const attach = (next: KeysActionsService) => {
    unregister?.()
    unregister = next.register({
      id: OPEN_ACTION_ID,
      label: options.label(),
      description: options.description(),
      run: options.toggle,
    })
    service = next
  }

  // A minimal host context without the reflection layer means no community
  // service can exist; stay fully inert instead of assuming ctx.get/ctx.on.
  const readService = (): KeysActionsService | undefined =>
    typeof ctx.get === 'function' ? (ctx.get('keys.actions') as KeysActionsService | undefined) : undefined
  const existing = readService()
  if (existing) attach(existing)
  let offService: (() => void) | undefined
  if (!existing && typeof ctx.on === 'function') {
    offService = ctx.on('internal/service', (name, value) => {
      if (name !== 'keys.actions') return
      if (value) { if (!service) attach(value as KeysActionsService) }
      // The Keys Palette plugin unloaded; its registry (and our action) died
      // with it. Forget it so a later re-provide re-attaches without a reload.
      else if (service) { service = undefined; unregister = undefined }
    })
  }

  const offLocale = options.onLocaleChange?.(() => {
    if (service) attach(service)
  })

  return () => {
    unregister?.()
    unregister = undefined
    service = undefined
    offService?.()
    offLocale?.()
  }
}
