/**
 * Universal Palette UI (spec §4, §5).
 *
 * Rendered into `shell.overlay` slot when available. The activator
 * mounts this component and tears it down on plugin dispose.
 *
 * Self-contained: no React, no JSX runtime, no third-party CSS.
 * The component uses host theme tokens (`--dsw-*` / `--dsh-*`) so it
 * inherits DSH's dark/light appearance automatically.
 *
 * Spec §5.2 glass treatment:
 *   background: color-mix(in srgb, var(--surface-bg) 78%, transparent);
 *   backdrop-filter: blur(18px) saturate(1.05);
 * Falls back to solid surface when backdrop-filter is unsupported.
 */

import { h, type Ref } from './ui/h.ts'
import { attachKeyboard, type KeyboardHandle } from './keyboard.ts'
import type { PaletteAggregator, QueryState } from './aggregator.ts'
import type { PreferencesStore } from './ranking/frecency.ts'
import type { PaletteItem } from '../shared/contract.ts'
import { PALETTE_CSS } from './ui/styles/palette-css.ts'

export interface UniversalPaletteProps {
  readonly aggregator: PaletteAggregator
  readonly preferences: PreferencesStore
  readonly initialShortcut?: string
  readonly rootContainer?: HTMLElement | null
}

export interface UniversalPaletteHandle {
  dispose(): void
  isOpen(): boolean
  openPalette(): void
  closePalette(): void
}

interface InternalState {
  open: boolean
  selectedIndex: number
  showActionPanel: boolean
  selectedActionIndex: number
  composing: boolean
  conflicts: string[]
  glassIntensity: 'solid' | 'soft' | 'glass'
}

const EMPTY_QUERY_CAP = 7
const SEARCH_QUERY_CAP = 8

export function mountUniversalPalette(props: UniversalPaletteProps): UniversalPaletteHandle {
  const {
    aggregator,
    preferences,
    initialShortcut = 'Ctrl+Shift+K',
    rootContainer = typeof document !== 'undefined' ? document.body : null,
  } = props

  if (!rootContainer) {
    throw new Error('UniversalPalette requires a DOM container')
  }

  let state: InternalState = {
    open: false,
    selectedIndex: 0,
    showActionPanel: false,
    selectedActionIndex: 0,
    composing: false,
    conflicts: [],
    glassIntensity: preferences.snapshot.glassIntensity,
  }

  let host: HTMLDivElement | null = null

  const unsubPrefs = preferences.subscribe(() => {
    state = { ...state, glassIntensity: preferences.snapshot.glassIntensity }
    render()
  })

  const unsubAgg = aggregator.subscribe((next: QueryState) => {
    if (state.selectedIndex >= next.items.length) {
      state = { ...state, selectedIndex: Math.max(0, next.items.length - 1) }
    }
    render()
  })

  host = document.createElement('div')
  host.dataset['plugin'] = 'dsh-universal-palette'
  host.style.position = 'fixed'
  host.style.inset = '0'
  host.style.pointerEvents = 'none'
  host.style.zIndex = '2147483000'
  rootContainer.appendChild(host)

  // inject stylesheet once
  let styleInjected = false

  let storedFocus: HTMLElement | null = null

  function render(): void {
    if (!host) return
    if (!state.open) {
      host.replaceChildren()
      return
    }
    const ui = renderPalette()
    host.replaceChildren(ui)
    if (!styleInjected) {
      const style = document.createElement('style')
      style.dataset['plugin'] = 'dsh-universal-palette'
      style.textContent = PALETTE_CSS
      host.appendChild(style)
      styleInjected = true
    }
  }

  function renderPalette(): HTMLElement {
    const overlay = h('div', {
      class: 'dsh-up-overlay',
      style: 'pointer-events:auto;display:flex;align-items:flex-start;justify-content:center;padding-top:14vh;height:100%;width:100%;',
      onMousedown: (e: MouseEvent) => {
        if (e.target === overlay) closePalette()
      },
    })

    const surface = h('div', {
      class: `dsh-up-surface dsh-up-${state.glassIntensity}`,
      role: 'dialog',
      'aria-label': 'Universal Palette',
      style:
        'width:600px;max-width:min(680px, calc(100vw - 32px));min-width:520px;' +
        'max-height:min(68vh, 620px);display:flex;flex-direction:column;border-radius:14px;' +
        'overflow:hidden;font-family:inherit;color:var(--dsh-content-text, inherit);',
    })

    const searchRow = h('div', { class: 'dsh-up-search' })
    const searchRef: Ref<HTMLInputElement> = (el) => {
      if (el && document.activeElement !== el) el.focus()
    }
    const search = h(
      'input',
      {
        ref: searchRef,
        class: 'dsh-up-search-input',
        type: 'text',
        value: aggregator.getState().query,
        placeholder: aggregator.getState().actionsHint ? 'Run a command…' : 'Search…',
        'aria-label': 'Search Universal Palette',
        onInput: (e: Event) => {
          const value = (e.target as HTMLInputElement).value
          aggregator.setQuery(value)
        },
        onKeydown: (e: KeyboardEvent) => {
          void onSearchKeydown(e)
        },
        onCompositionstart: () => {
          state = { ...state, composing: true }
        },
        onCompositionend: () => {
          state = { ...state, composing: false }
        },
      },
    ) as HTMLInputElement
    search.value = aggregator.getState().query
    searchRow.appendChild(search)
    surface.appendChild(searchRow)

    surface.appendChild(renderList())

    if (aggregator.getState().failures.length > 0) {
      const status = h('div', { class: 'dsh-up-status' })
      for (const f of aggregator.getState().failures) {
        status.appendChild(
          h('div', { class: 'dsh-up-status-line' }, `${f.providerId}: ${f.reason}`),
        )
      }
      surface.appendChild(status)
    }

    overlay.appendChild(surface)
    return overlay
  }

  function renderList(): HTMLElement {
    const wrap = h('div', { class: 'dsh-up-list', role: 'listbox' })
    const query = aggregator.getState().query
    const items = aggregator.getState().items
    const cap = query.length === 0 ? EMPTY_QUERY_CAP : SEARCH_QUERY_CAP
    const visible = items.slice(0, cap)

    if (visible.length === 0) {
      const msg =
        aggregator.getState().status === 'loading'
          ? 'Searching…'
          : state.conflicts.length > 0
            ? `Shortcut conflicts with: ${state.conflicts.join(', ')}`
            : 'No matching results'
      wrap.appendChild(h('div', { class: 'dsh-up-empty' }, msg))
      return wrap
    }

    visible.forEach((item, idx) => {
      const selected = idx === state.selectedIndex
      const row = renderRow(item.item, selected)
      row.addEventListener('mousedown', (e: MouseEvent) => {
        e.preventDefault()
        state = { ...state, selectedIndex: idx }
        void runPrimary()
      })
      row.addEventListener('mouseenter', () => {
        if (state.selectedIndex !== idx) {
          state = { ...state, selectedIndex: idx }
          render()
        }
      })
      wrap.appendChild(row)
    })

    return wrap
  }

  function renderRow(pi: PaletteItem, selected: boolean): HTMLElement {
    const row = h('div', {
      class: `dsh-up-row${selected ? ' dsh-up-row-selected' : ''}`,
      role: 'option',
      'aria-selected': String(selected),
      style:
        `display:flex;align-items:center;gap:10px;padding:0 14px;` +
        `min-height:${pi.kind === 'conversation-hit' ? '62px' : '44px'};` +
        `cursor:default;`,
    })
    const kind = h('span', { class: 'dsh-up-kind' }, pi.kind)
    row.appendChild(kind)
    const body = h('div', { class: 'dsh-up-row-body' })
    body.appendChild(h('div', { class: 'dsh-up-row-title' }, pi.title))
    const meta = h('div', { class: 'dsh-up-row-meta' })
    if (pi.subtitle) meta.appendChild(h('span', { class: 'dsh-up-row-sub' }, pi.subtitle))
    if (pi.snippet) {
      meta.appendChild(h('div', { class: 'dsh-up-row-snippet' }, pi.snippet.slice(0, 200)))
    }
    if (pi.badges) {
      for (const b of pi.badges) {
        meta.appendChild(h('span', { class: 'dsh-up-badge' }, b))
      }
    }
    if (meta.childNodes.length > 0) body.appendChild(meta)
    row.appendChild(body)
    if (pi.secondary && pi.secondary.length > 0) {
      row.appendChild(h('span', { class: 'dsh-up-row-actions' }, '…'))
    }
    return row
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

  function openPalette(): void {
    if (state.open) return
    storedFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    state = { ...state, open: true, selectedIndex: 0, showActionPanel: false }
    void aggregator.setQueryImmediate('')
    render()
  }

  function closePalette(): void {
    if (!state.open) return
    state = { ...state, open: false, showActionPanel: false }
    aggregator.cancel()
    if (storedFocus && typeof storedFocus.focus === 'function') {
      storedFocus.focus()
      storedFocus = null
    }
    render()
  }

  async function onSearchKeydown(e: KeyboardEvent): Promise<void> {
    if (state.composing) return
    const items = aggregator.getState().items
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        if (state.showActionPanel) {
          const cur = items[state.selectedIndex]
          const count = cur?.item.secondary?.length ?? 0
          if (count > 0) {
            state = {
              ...state,
              selectedActionIndex: (state.selectedActionIndex + 1) % count,
            }
            render()
          }
        } else {
          state = {
            ...state,
            selectedIndex: Math.min(state.selectedIndex + 1, Math.max(0, items.length - 1)),
          }
          render()
        }
        break
      case 'ArrowUp':
        e.preventDefault()
        if (state.showActionPanel) {
          const cur = items[state.selectedIndex]
          const count = cur?.item.secondary?.length ?? 0
          if (count > 0) {
            state = {
              ...state,
              selectedActionIndex: (state.selectedActionIndex - 1 + count) % count,
            }
            render()
          }
        } else {
          state = { ...state, selectedIndex: Math.max(0, state.selectedIndex - 1) }
          render()
        }
        break
      case 'Enter':
        e.preventDefault()
        if (state.showActionPanel) {
          const cur = items[state.selectedIndex]
          const sec = cur?.item.secondary?.[state.selectedActionIndex]
          if (sec) {
            await sec.run(new AbortController().signal)
            closePalette()
          }
        } else {
          await runPrimary()
        }
        break
      case 'Tab':
        e.preventDefault()
        if (state.showActionPanel) {
          state = { ...state, showActionPanel: false }
        } else {
          const cur = items[state.selectedIndex]
          if (cur && cur.item.secondary && cur.item.secondary.length > 0) {
            state = { ...state, showActionPanel: true, selectedActionIndex: 0 }
          }
        }
        render()
        break
      case 'ArrowRight':
        if (!state.showActionPanel) {
          const cur = items[state.selectedIndex]
          if (cur && cur.item.secondary && cur.item.secondary.length > 0) {
            e.preventDefault()
            state = { ...state, showActionPanel: true, selectedActionIndex: 0 }
            render()
          }
        }
        break
      case 'Escape':
        e.preventDefault()
        if (state.showActionPanel) {
          state = { ...state, showActionPanel: false }
          render()
        } else {
          closePalette()
        }
        break
      default:
        break
    }
  }

  const keyboard: KeyboardHandle = attachKeyboard({
    shortcut: initialShortcut,
    onOpen: () => openPalette(),
    onClose: () => closePalette(),
    onConflictDetected: (report) => {
      state = { ...state, conflicts: [...report.conflictsWith] }
      render()
    },
  })

  render()

  return {
    dispose() {
      keyboard.dispose()
      unsubAgg()
      unsubPrefs()
      if (host && host.parentNode) {
        host.parentNode.removeChild(host)
      }
      host = null
    },
    isOpen: () => state.open,
    openPalette,
    closePalette,
  }
}
