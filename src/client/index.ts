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
  // over `keys.actions`; capability-detected; lifecycle-safe.
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
  // state. Migration rules live in `shortcut.ts`; storage value wins,
  // empty storage falls back to platform default.
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

  // Watch the preferences shortcut so a runtime change updates the
  // keyboard listener with the migrated value. The listener is the same
  // function identity across changes; we dispose and replace it.
  ctx.effect(() => preferences.subscribe(() => {
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

  // Active Morph — public overlay anchor inside the composer card. Its CSS
  // follows DSH MenuView's bottom-anchored popup pattern to sit above the card.
  // The component stays null for cold hero Sessions; their Search button and
  // /find route through the shared controller to compact Floating instead.
  ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
    name: 'conversation.input.overlay',
    id: 'dsh-universal-palette-morph-active',
  }, (props: { sessionId: string }) => createElement(Morph, {
    ctx, sessionId: props.sessionId, controller, sidebar, aggregator, preferences, cold,
  })))

  // Composer Search button — strict per-Session scope, list-kind. When
  // there is no current Session the slot itself does not exist (the
  // Conversation UI is inert without one), so we never render the
  // button outside an active Session.
  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left',
    id: SEARCH_BUTTON_ID,
  }, () => createElement(SearchButtonSlot, { ctx, controller })
  ))

  // Public slash-pipeline source for `/find`. Registered once in apply
  // lifecycle against the locked InputTriggerService; aborts loudly if
  // the Host command catalog already exposes an exact `find` command.
  // Upstream service.ts supports late registration: a source arriving
  // after scope birth notifies existing controllers and joins lexicon.
  // `registerFindSource` preserves `this` via `.call(triggers, ...)`.
  ctx.effect(() => {
    let cancelled = false
    let disposer: (() => void) | null = null
    registerFindSource({ ctx, controller }).then((d) => {
      if (cancelled) { try { d() } catch { /* ignore */ } return }
      disposer = d
    }).catch((error) => {
      if (error instanceof PublicSlashFindCollision) {
        // eslint-disable-next-line no-console
        console.error('[dsh-universal-palette]', error.message)
      } else {
        // eslint-disable-next-line no-console
        console.error('[dsh-universal-palette] /find source registration failed:', error)
      }
    })
    return () => { cancelled = true; try { disposer?.() } catch { /* ignore */ } }
  }, 'universal-palette: /find source lifecycle')
}

export default { inject, apply }
