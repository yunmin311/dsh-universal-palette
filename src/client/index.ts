/** DSH Universal Palette browser plugin for the locked public Client API. */

import { type Context } from '@deepseek-ai/cordis'
import { createElement, useEffect, useState } from 'react'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { NS, en, zh } from './locales.ts'

import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'

import { PaletteAggregator } from './aggregator.ts'
import {
  createCommandsProvider,
  createConversationHitsProvider,
  createModelsProvider,
  createSessionsProvider,
} from './adapters.ts'
import { bridgeKeysActions } from './keysActions.ts'
import {
  createLocalStorageBackend,
  PreferencesStore,
} from './state/preferences.ts'
import { SearchController } from './search-controller.ts'
import { subscribeCold, readCold, verdictFromSessions } from './cold.ts'
import { createSidebarObservable } from './sidebarState.ts'
import { attachKeyboard, type ShortcutReport } from './keyboard.ts'
import { defaultShortcut } from './shortcut.ts'
import { Floating } from './floating.tsx'
import { Morph } from './morph.tsx'
import { SearchButton, SEARCH_BUTTON_ID } from './searchButton.tsx'
import { registerFindSource, PublicSlashFindCollision } from './findSource.ts'

export const inject = [
  'remote',
  'remote.commands',
  'sessions',
  'workspaces',
  'modelDirectories',
  'slots',
  'uiWorkspace',
  'inputTriggers',
  'locale',
] as const

interface PaletteOverlayProps {
  readonly ctx: Context
  readonly sidebar: { getSnapshot: () => boolean; subscribe: (fn: () => void) => () => void }
  readonly aggregator: PaletteAggregator
  readonly preferences: PreferencesStore
  readonly paletteControl: { toggle: () => void }
}

/**
 * Backwards-compatible verdict helper. The implementation moved to
 * `cold.ts` for live subscription support; this re-export preserves the
 * public name and pure-function semantics, so unit tests that target the
 * `sessionCold` symbol keep working.
 */
export function sessionCold(ctx: Context): boolean {
  return verdictFromSessions(ctx.sessions as never)
}

interface MorphSlotProps {
  readonly ctx: Context
  readonly sessionId: string
  readonly controller: SearchController
  readonly sidebar: ReturnType<typeof createSidebarObservable>['observable']
  readonly aggregator: PaletteAggregator
  readonly preferences: PreferencesStore
  readonly cold: ReturnType<typeof subscribeCold>
}

function detectBrowserPlatform(): NodeJS.Platform {
  const proc = (globalThis as { process?: { platform?: NodeJS.Platform } }).process
  if (proc && typeof proc.platform === 'string') return proc.platform
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent ?? '' : ''
  return /Mac|iPhone|iPad/i.test(ua) ? 'darwin' : 'win32'
}

/**
 * Migrate the stored shortcut value. Prompt §6: existing storage values
 * (including `Ctrl+Shift+K`) are preserved verbatim; a fresh install that
 * never wrote a preference falls back to the platform default. The
 * PreferencesStore reports `hasSavedValue()` to distinguish the two.
 */
function migrateShortcut(stored: unknown): string {
  if (typeof stored !== 'string' || stored.trim().length === 0) {
    return defaultShortcut(detectBrowserPlatform())
  }
  return stored
}

function MorphSlot(props: MorphSlotProps) {
  return createElement(Morph, {
    ctx: props.ctx,
    sessionId: props.sessionId,
    sidebar: props.sidebar,
    aggregator: props.aggregator,
    preferences: props.preferences,
    cold: props.cold,
    controller: props.controller,
  })
}

interface SearchButtonSlotProps {
  readonly ctx: Context
  readonly controller: SearchController
}

function SearchButtonSlot(props: SearchButtonSlotProps) {
  return createElement(SearchButton, { ctx: props.ctx, controller: props.controller })
}

/** Register only after ui-layout has declared shell.overlay. */
export function apply(ctx: Context): void {
  try {
    return applyInternal(ctx)
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[dsh-universal-palette] apply failed:', error)
    throw error
  }
}

function applyInternal(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'universal-palette: dictionaries')
  const preferences = new PreferencesStore(createLocalStorageBackend())
  void preferences.load()
  const aggregator = new PaletteAggregator({
    providers: [
      createCommandsProvider(ctx.remote.commands, ctx.sessions, ctx.inputTriggers),
      createSessionsProvider(ctx.sessions, ctx.workspaces),
      createModelsProvider(ctx.sessions, ctx.modelDirectories),
      createConversationHitsProvider(ctx.sessions),
    ],
    preferences: () => preferences.snapshot,
    context: () => ({}),
  })

// Shared SearchController — single source of truth for presentation,
  // query, and result state. Floating and Morph both subscribe to it.
  // The controller is created here so paletteControl.toggle (which the
  // Keys Palette bridge invokes) and the Floating wrapper's keyboard
  // listener share one instance.
  const controller = new SearchController({
    aggregator,
    preferences: () => preferences.snapshot,
    cold: () => readCold(ctx),
  })
  // Live cold verdict observable. The Float/Morph wrappers subscribe to
  // it so a real-time `blank` flip mid-open updates the layout height
  // without restarting the surface. Defensive: a missing list/binding
  // or partial Session Controller (test mocks) reports cold rather
  // than throwing — the public surface must remain bootable.
  let cold
  try {
    cold = subscribeCold(ctx)
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[dsh-universal-palette] subscribeCold failed, defaulting to active:', error)
    cold = {
      getSnapshot: () => false,
      subscribe: () => () => undefined,
    }
  }
  // Public sidebar footer owner prop supplies wide/compact only.
  const sidebarState = createSidebarObservable()
  const sidebar = sidebarState.observable

  let wide = true
  const SidebarState = (props: { wide: boolean }) => {
    useEffect(() => { sidebarState.setWide(props.wide) }, [props.wide])
    return null
  }
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action', id: 'dsh-universal-palette-layout-state',
  }, SidebarState))

  // Public Keys Palette bridge (unchanged): one bindable open action
  // over `keys.actions`; capability-detected; lifecycle-safe. The toggle
  // closes the surface when the Floating presentation is already open,
  // otherwise it opens a fresh Floating surface — the same behavior the
  // shared keyboard handler provides.
  const paletteControl = { toggle: () => {
    if (controller.getState().presentation === 'floating') controller.close()
    else controller.openFloating()
  } }
  ctx.effect(() => bridgeKeysActions(ctx, {
    label: () => (ctx.locale.getSnapshot().active.startsWith('zh') ? '打开 Universal Palette' : 'Open Universal Palette'),
    description: () => (ctx.locale.getSnapshot().active.startsWith('zh')
      ? '搜索命令、会话、模型与历史' : 'Search commands, sessions, models, and history'),
    toggle: () => paletteControl.toggle(),
    onLocaleChange: fn => (typeof ctx.locale.subscribe === 'function' ? ctx.locale.subscribe(fn) : () => {}),
  }), 'universal-palette: keys-actions bridge')

  // Register the Alt+Q / Cmd+Shift+K keyboard listener once, at apply
  // time, so it works before the Floating surface body mounts. The
  // listener dispatches into the shared controller, so the Floating
  // wrapper and the Keys Palette bridge share the same presentation
  // state. Migration rules live in `shortcut.ts` + `migrateShortcut`:
  // existing storage values are preserved verbatim (Prompt §6); a
  // fresh install that never wrote a preference falls back to the
  // platform default.
  const activeShortcut = preferences.hasSavedValue()
    ? migrateShortcut(preferences.snapshot.shortcut)
    : defaultShortcut(detectBrowserPlatform())
  const keyboard = attachKeyboard({
    shortcut: activeShortcut,
    isOpen: () => controller.getState().presentation === 'floating',
    onOpen: () => controller.openFloating(),
    onClose: () => controller.close(),
    onEscape: () => controller.close(),
    onConflictDetected: (report: ShortcutReport) => {
      // eslint-disable-next-line no-console
      console.warn('[dsh-universal-palette] shortcut conflict:', report)
    },
  })
  ctx.effect(() => () => keyboard.dispose(), 'universal-palette: keyboard listener')

  // Floating surface — registers through `shell.overlay`. The Floating
  // wrapper receives the shared controller so its keyboard handler and
  // paletteControl.toggle drive the same presentation state.
  const FloatingEntry = () => createElement(Floating, {
    ctx, sidebar, aggregator, preferences, cold, paletteControl, controller,
  })
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'dsh-universal-palette',
  }, FloatingEntry))

  // Watch the preferences shortcut so a runtime change updates the
  // keyboard listener with the migrated value. The listener is the same
  // function identity across changes; we dispose and replace it.
  ctx.effect(() => preferences.subscribe(() => {
    // Fresh installs never wrote a preference — the shortcut must follow
    // the platform default, not the DEFAULT_PREFERENCES sentinel that
    // PreferencesStore returns when the backend has no saved value.
    const nextActive = preferences.hasSavedValue()
      ? migrateShortcut(preferences.snapshot.shortcut)
      : defaultShortcut(detectBrowserPlatform())
    if (nextActive === activeShortcut) return
    keyboard.dispose()
    const replacement = attachKeyboard({
      shortcut: nextActive,
      isOpen: () => controller.getState().presentation === 'floating',
      onOpen: () => controller.openFloating(),
      onClose: () => controller.close(),
      onEscape: () => controller.close(),
      onConflictDetected: (report: ShortcutReport) => {
        // eslint-disable-next-line no-console
        console.warn('[dsh-universal-palette] shortcut conflict:', report)
      },
    })
    ;(keyboard as { dispose: () => void }).dispose = replacement.dispose.bind(replacement)
  }), 'universal-palette: shortcut migration watcher')

  // Conversation overlay slot — Composer Morph surface, strict per-
  // Session scope, list-kind. The slot's per-session disposer is the
  // Session lifecycle, so a Session switch or clear tears the entry
  // down automatically.
  ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
    name: 'conversation.input.overlay',
    id: 'dsh-universal-palette-morph',
  }, (props: { sessionId: string }) =>
    createElement(MorphSlot, {
      ctx, sessionId: props.sessionId, controller, sidebar, aggregator, preferences, cold,
    })
  ))

  // Composer Search button — strict per-Session scope, list-kind. When
  // there is no current Session the slot itself does not exist (the
  // Conversation UI is inert without one), so we never render the
  // button outside an active Session.
  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left',
    id: SEARCH_BUTTON_ID,
  }, () => createElement(SearchButtonSlot, { ctx, controller })
  ))

  // Public slash-pipeline source for `/find`. Registered against the
  // locked InputTriggerService; aborts loudly if the Host command
  // catalog already exposes an exact `find` command. Wait until a
  // current Session exists before registering so the controller can
  // warm the source into its per-session lexicon (InputTriggerService
  // constructs controllers lazily at session-scope birth, so a source
  // registered before any session exists is not prewarmed and only
  // applies to the first controller born after registration).
  let findSourceDisposer: (() => void) | null = null
  const listSub = ctx.sessions?.list
  if (listSub && typeof listSub.subscribe === 'function' && typeof listSub.getSnapshot === 'function') {
    const stopFindWatch = listSub.subscribe(() => {
      if (findSourceDisposer) return
      if (listSub.getSnapshot().current === undefined) return
      void registerFindSource({ ctx, controller }).then((disposer) => {
        findSourceDisposer = () => { try { disposer() } catch { /* ignore */ } }
      }).catch((error) => {
        if (error instanceof PublicSlashFindCollision) {
          // eslint-disable-next-line no-console
          console.error('[dsh-universal-palette]', error.message)
        } else {
          // eslint-disable-next-line no-console
          console.error('[dsh-universal-palette] /find source registration failed:', error)
        }
      })
    })
    ctx.effect(() => () => { stopFindWatch(); findSourceDisposer?.() }, 'universal-palette: /find source lifecycle')
  }
}

export default { inject, apply }