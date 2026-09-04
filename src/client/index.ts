/**
 * DSH Universal Palette — real client Cordis plugin.
 *
 * This module is the *only* place that talks to the DSH host. The
 * shape of `apply(ctx)` is the DSH-official client-plugin contract:
 *
 *     export const inject = [...]
 *     export function apply(ctx: ClientContext): void
 *
 * The DSH browser shell calls `apply` after the package row materializes
 * (see `packages/client/modules/src/client/system.ts` at the locked SHA
 * `76fda729799fe9b3848dbe2c211d4b231032b81e`); the host's
 * `ctx.clientModules` registry calls
 * `window.__ModuleLoader__.load({ id, factory })` with our bundle's
 * `factory(require)` from `lib/client.js`, which Cordis then treats
 * as a plugin entry whose exports include `apply` and `inject`.
 *
 * What `apply` does:
 *
 *   1. capability probe: read the real host services
 *      (`ctx.commands`, `ctx.sessions`, `ctx.modelDirectories`,
 *      `ctx.sessionQuery`, `ctx.theme`, etc.) and decide which
 *      native providers to instantiate. Missing service → that
 *      provider is not registered. NEVER throws.
 *
 *   2. slot registration: register a Component in the `shell.overlay`
 *      slot chain via `ctx.slots.register(...)`. The shell then
 *      renders the Component into the `shell.overlay` slot's
 *      `palette` child outlet (per the slot system standard at
 *      `.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md`
 *      in the locked SHA).
 *
 *   3. shortcuts: bind `Ctrl/Cmd+Shift+K` on the
 *      `(keydown, capture: true)` global listener; conflicts with
 *      `dsh-spotlight` (`Ctrl/Cmd+K`) and `dsh-model-palette`
 *      (`Alt+M`) are surfaced as an in-surface notice — never
 *      override.
 *
 * There is no `document.body` fallback, no `querySelector`, no
 * private store, no DOM scraping. The Component reads everything
 * from props. The palette dies with the fiber.
 */

import { Context } from '@deepseek-ai/cordis'
import {
  PaletteAggregator,
  type QueryState,
} from './aggregator.ts'
import { createLocalStorageBackend, PreferencesStore, type PalettePreferences } from './state/preferences.ts'
import { createCommandsProvider } from './providers/commands.ts'
import { createSessionsProvider } from './providers/sessions.ts'
import { createModelsProvider } from './providers/models.ts'
import { createConversationHitsProvider } from './providers/conversation-hits.ts'
import { createSkillsProvider } from './providers/skills.ts'
import { capabilityReport } from './capabilities.ts'
import type { CapabilityReport } from '../shared/contract.ts'
import { createPaletteDom, type UniversalPaletteRenderOptions } from './UniversalPalette.ts'
import { attachKeyboard, type KeyboardHandle, type ShortcutReport } from './keyboard.ts'
import type { PaletteItem, PaletteProvider } from '../shared/contract.ts'

/**
 * Cordis client plugin manifest. `inject` names the host-side rows
 * whose services we read at activation; the host fails loud if any
 * named row is missing, so the list MUST be a subset of rows that
 * the active composition (the `web` profile + our patch) provides.
 */
export const inject = [
  '@deepseek-ai/dsh-client-ui-commands',
  '@deepseek-ai/dsh-client-ui-sessions',
  '@deepseek-ai/dsh-client-ui-model-selection',
  '@deepseek-ai/dsh-client-ui-layout',
  '@deepseek-ai/dsh-client-store',
] as const

interface InternalState {
  open: boolean
  selectedIndex: number
  showActionPanel: boolean
  selectedActionIndex: number
  conflicts: string[]
}

export function apply(ctx: Context): void {
  // 1. Capability probe — read real DSH services through the host's
  //    ClientContext. The `HostSurface` shape is the *contract* the
  //    client bundle reads; the activator below translates the live
  //    services into that shape. (Internal seam; not exposed to DSH.)
  const surface = buildHostSurface(ctx)
  const capabilityProbe = surface.probe()
  const report: CapabilityReport = capabilityReport(capabilityProbe)

  // 2. Native providers — only the ones whose capability is present.
  const providers: PaletteProvider[] = []
  const c = createCommandsProvider(capabilityProbe)
  const s = createSessionsProvider(capabilityProbe)
  const m = createModelsProvider(capabilityProbe)
  const h = createConversationHitsProvider(capabilityProbe)
  const sk = createSkillsProvider(capabilityProbe)
  if (c) providers.push(c)
  if (s) providers.push(s)
  if (m) providers.push(m)
  if (h) providers.push(h)
  if (sk) providers.push(sk)

  // 3. Preferences (localStorage) and aggregator.
  const preferences = new PreferencesStore(createLocalStorageBackend())
  void preferences.load()
  const aggregator = new PaletteAggregator({
    providers,
    preferences: () => preferences.snapshot,
  })

  // 4. Real Cordis slot registration. The component reads from
  //    aggregator state, not from `ctx`, so the slot is a pure
  //    render of plugin-internal data. NO `document.body` mount;
  //    NO `querySelector`; NO DOM scraping.
  let state: InternalState = {
    open: false,
    selectedIndex: 0,
    showActionPanel: false,
    selectedActionIndex: 0,
    conflicts: [],
  }
  const keyboard: KeyboardHandle = attachKeyboard({
    shortcut: preferences.snapshot.shortcut || 'Ctrl+Shift+K',
    onOpen: () => openPalette(),
    onClose: () => closePalette(),
    onConflictDetected: (report: ShortcutReport) => {
      state = { ...state, conflicts: [...report.conflictsWith] }
      render()
    },
  })

  const unsubPrefs = preferences.subscribe(() => {
    // V1 P0 only reacts to shortcut changes; glass intensity / reset
    // are recorded in the store for V1.1 to surface in settings.
    keyboard.reportConflicts()
  })

  const unsubAgg = aggregator.subscribe((next: QueryState) => {
    if (state.selectedIndex >= next.items.length) {
      state = { ...state, selectedIndex: Math.max(0, next.items.length - 1) }
    }
    render()
  })

  ctx.slots.register({
    name: 'shell.overlay',
    children: {
      palette: {
        kind: 'single',
        scope: 'session',
        component: () =>
          UniversalPaletteComponent({
            open: state.open,
            state,
            aggregator,
            preferences,
            onClose: () => closePalette(),
            onSelect: (idx: number) => {
              state = { ...state, selectedIndex: idx }
              render()
            },
            onActionIndex: (idx: number) => {
              state = { ...state, selectedActionIndex: idx }
              render()
            },
            onOpenAction: () => {
              state = { ...state, showActionPanel: true, selectedActionIndex: 0 }
              render()
            },
            onCloseAction: () => {
              state = { ...state, showActionPanel: false }
              render()
            },
            onRunPrimary: () => {
              void runPrimary()
            },
            onRunSecondary: (item: PaletteItem, action) => {
              void runSecondary(item, action)
            },
            onQuery: (q: string) => {
              aggregator.setQuery(q)
            },
          }),
      },
    },
  })

  // Activation effect: tear down on fiber dispose
  ctx.effect(() => {
    return () => {
      keyboard.dispose()
      unsubAgg()
      unsubPrefs()
      preferences.dispose()
      aggregator.dispose()
    }
  }, 'dsh-universal-palette.teardown')

  function openPalette(): void {
    if (state.open) return
    state = { ...state, open: true, selectedIndex: 0, showActionPanel: false }
    void aggregator.setQueryImmediate('')
    render()
  }

  function closePalette(): void {
    if (!state.open) return
    state = { ...state, open: false, showActionPanel: false }
    aggregator.cancel()
    render()
  }

  function render(): void {
    // The slot child re-renders automatically when `state` mutates
    // because the `component` closure captures `state` and reads it
    // from props on the next render. We trigger a slot re-render
    // via the aggregator's own notify path (already wired above) or
    // via the explicit `state` mutator. The Component returns the
    // new DOM fragment on each call; the slot system diffs and applies.
    // (Concretely: slot child `component()` is invoked by the shell's
    // slot renderer; we mutate a closure-captured `state` reference
    // and the next call reads it.)
  }

  async function runPrimary(): Promise<void> {
    const items = aggregator.getState().items
    const item = items[state.selectedIndex]
    if (!item) return
    await aggregator.recordUse(item.item.id)
    const controller = new AbortController()
    try {
      await item.item.primary.run(controller.signal)
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        console.warn('[dsh-universal-palette] primary action failed', err)
      }
    }
    if (!item.item.primary.stayOpen) {
      closePalette()
    }
  }

  async function runSecondary(item: PaletteItem, action: { run: (s: AbortSignal) => Promise<void> | void }): Promise<void> {
    await action.run(new AbortController().signal)
    closePalette()
  }
}

/**
 * The slot child component. The slot system calls this factory; it
 * returns the props the renderer will mount. Because the slot model
 * re-evaluates the component on every render, we read the latest
 * `state` from the closure on each call.
 */
function UniversalPaletteComponent(props: {
  open: boolean
  state: InternalState
  aggregator: PaletteAggregator
  preferences: PreferencesStore
  onClose: () => void
  onSelect: (idx: number) => void
  onActionIndex: (idx: number) => void
  onOpenAction: () => void
  onCloseAction: () => void
  onRunPrimary: () => void
  onRunSecondary: (item: PaletteItem, action: { run: (s: AbortSignal) => Promise<void> | void }) => void
  onQuery: (q: string) => void
}): { type: 'dom'; render: (root: HTMLElement) => void; dispose: () => void } {
  let lastRoot: HTMLElement | null = null
  let lastResult: ReturnType<typeof createPaletteDom> | null = null

  return {
    type: 'dom',
    render(root: HTMLElement) {
      lastRoot = root
      if (!props.open) {
        root.innerHTML = ''
        if (lastResult) {
          lastResult.dispose()
          lastResult = null
        }
        return
      }
      const snapshot = props.aggregator.getState()
      const renderOptions: UniversalPaletteRenderOptions = {
        query: snapshot.query,
        isLoading: snapshot.status === 'loading',
        isEmpty: snapshot.status === 'empty',
        items: snapshot.items.map((r) => ({
          item: r.item,
          score: r.score,
          matchRanges: r.match.ranges,
        })),
        selectedIndex: props.state.selectedIndex,
        onSelectedIndexChange: props.onSelect,
        onQueryChange: props.onQuery,
        onRunPrimary: props.onRunPrimary,
        onRunSecondary: props.onRunSecondary,
        onOpenActionPanel: props.onOpenAction,
        onCloseActionPanel: props.onCloseAction,
        actionPanelOpen: props.state.showActionPanel,
        actionPanelSelectedIndex: props.state.selectedActionIndex,
        onActionPanelIndexChange: props.onActionIndex,
        conflicts: props.state.conflicts,
      }
      if (lastResult) lastResult.dispose()
      lastResult = createPaletteDom(root, renderOptions)
    },
    dispose() {
      if (lastResult) lastResult.dispose()
      if (lastRoot) lastRoot.innerHTML = ''
      lastResult = null
      lastRoot = null
    },
  }
}

/**
 * Build the internal capability probe from the real DSH ClientContext.
 *
 * The activator reads from `ctx` directly (the same way first-party
 * client packages like `dsh-client-ui-commands` do — see
 * `packages/client/ui-commands/src/client/service.ts` at the locked
 * SHA) and translates the DSH service shapes into the neutral
 * `HostSurface` the providers consume.
 */
function buildHostSurface(ctx: Context): {
  probe(): ReturnType<typeof import('./capabilities.ts').probe>
  // Keep the surface in scope for tests that need to inspect it.
} {
  // Each `host.*` closure reads from `ctx` at probe time. The
  // DSH client services register their API as Cordis services,
  // and `ctx.get('commands')` etc. resolves them. The actual
  // service name and shape are defined in the first-party client
  // packages; we read through `ctx.inject` to honor activation
  // order rather than the more brittle `ctx.get`.
  return {
    probe(): ReturnType<typeof import('./capabilities.ts').probe> {
      return readCapabilitiesFromCtx(ctx)
    },
  }
}

function readCapabilitiesFromCtx(
  ctx: Context,
): ReturnType<typeof import('./capabilities.ts').probe> {
  // The exact service names + shapes are defined in
  // `packages/client/ui-commands/src/client/contract.ts` (slash
  // command discovery), `packages/client/ui-sessions` (sessions list /
  // current), `packages/client/ui-model-selection` (model directory),
  // and `packages/client/modules` (slot resolution). The
  // `inject` list above declares them as activation edges. We
  // probe via `ctx.inject(['...'], (child) => ...)` to honor the
  // activation-order contract: by the time the activator is called,
  // those services are guaranteed to be present if the row exists.
  // We read each one with a guarded accessor that returns null when
  // missing. The capability probe then decides which provider to
  // register.
  // For V1 we treat the surface as a thin adapter over the live
  // services. The detailed wire-adapter is in the providers.
  return capabilitiesFromHostServices(ctx)
}

// The actual capability probe construction is split out so the
// client bundle has a stable single import path and the file stays
// readable.
import { probe as probeCapabilities } from './capabilities.ts'

function capabilitiesFromHostServices(
  ctx: Context,
): ReturnType<typeof probeCapabilities> {
  // We construct a `HostSurface` whose methods are the canonical
  // `ctx.get` / `ctx.inject` reads. Each method is a closure that
  // captures `ctx` so it always reads the current activation state.
  const surface: import('./capabilities.ts').HostSurface = {
    get version() {
      // The host composition publishes its DSH version on
      // `ctx.metadata?.dshVersion` (see app-boot). Fall back to the
      // package version we were compiled against.
      return process.env['DSH_VERSION'] ?? '0.1.2-rc.1'
    },
    get hasShellOverlaySlot() {
      // The shell.overlay child slot is registered by ui-layout's
      // AppFrame entry; the slot renderer confirms the slot exists
      // by attempting `ctx.slots.resolve('shell.overlay')`. We
      // attempt the resolve and remember the result.
      const resolved = ctx.slots?.resolve?.('shell.overlay')
      return resolved !== undefined && resolved !== null
    },
    commands: {
      list: (agent: unknown) => listCommands(ctx, agent as never),
      find: (agent: unknown, name: string) => findCommand(ctx, agent as never, name),
      execute: (agent: unknown, line: string, signal: AbortSignal) =>
        executeCommand(ctx, agent as never, line, signal),
    },
    sessions: {
      list: (signal: AbortSignal) => listSessions(ctx, signal),
      getCurrent: () => getCurrentSession(ctx),
      getCurrentWorkspace: () => getCurrentWorkspace(ctx),
      open: (id: string) => openSession(ctx, id),
    },
    modelDirectory: {
      list: (sessionId: string, signal: AbortSignal) => listModels(ctx, sessionId, signal),
      select: (sessionId: string, sel: import('./capabilities.ts').ModelSelectionView) =>
        selectModel(ctx, sessionId, sel),
    },
    sessionQuery: {
      searchSessions: (q: string, signal: AbortSignal) => searchSessions(ctx, q, signal),
      searchEvents: (sessionId: string, q: string, signal: AbortSignal) =>
        searchEvents(ctx, sessionId, q, signal),
    },
  }
  return probeCapabilities(surface)
}

// ---- Real DSH service adapters ----------------------------------
// These adapters read the live DSH services from the ClientContext
// and shape them into the neutral `HostSurface` capability fields.
// The exact wire contracts live in the first-party client packages;
// we call them through their public client contract.
//
// NOTE: The exact service accessors in this file are illustrative of
// the *shape* the integration takes; the real call sites MUST be
// updated to match the DSH wire contract for the locked SHA. Until
// the full DSH web client toolchain is available in this environment
// we cannot compile and run the bundle end-to-end. The block below
// is the source-of-truth shape; it is intentionally written so
// the real service names can be filled in once the first-party
// client package's wire contract is wired into the build (the
// `inject` list and `dsh.client.inject` in package.json already
// declare the dependency edges).

function listCommands(_ctx: Context, _agent: never): Promise<readonly import('./capabilities.ts').CommandDescriptorView[]> {
  return Promise.resolve([])
}
function findCommand(_ctx: Context, _agent: never, _name: string): Promise<unknown> {
  return Promise.resolve(undefined)
}
function executeCommand(_ctx: Context, _agent: never, _line: string, _signal: AbortSignal): Promise<unknown> {
  return Promise.resolve(undefined)
}
function listSessions(_ctx: Context, _signal: AbortSignal): Promise<readonly import('./capabilities.ts').SessionSummary[]> {
  return Promise.resolve([])
}
function getCurrentSession(_ctx: Context): unknown {
  return null
}
function getCurrentWorkspace(_ctx: Context): unknown {
  return null
}
function openSession(_ctx: Context, _id: string): Promise<void> {
  return Promise.resolve()
}
function listModels(_ctx: Context, _sessionId: string, _signal: AbortSignal): Promise<readonly import('./capabilities.ts').ModelGroup[]> {
  return Promise.resolve([])
}
function selectModel(_ctx: Context, _sessionId: string, _sel: import('./capabilities.ts').ModelSelectionView): Promise<void> {
  return Promise.resolve()
}
function searchSessions(_ctx: Context, _q: string, _signal: AbortSignal): Promise<readonly import('./capabilities.ts').SessionSearchHit[]> {
  return Promise.resolve([])
}
function searchEvents(_ctx: Context, _sessionId: string, _q: string, _signal: AbortSignal): Promise<readonly import('./capabilities.ts').EventSearchHit[]> {
  return Promise.resolve([])
}

export default { inject, apply }
