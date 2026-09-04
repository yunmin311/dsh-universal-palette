/**
 * Pure-React (or DOM) renderable palette component.
 *
 * No DSH imports, no Cordis imports — only the aggregator and shared
 * contract. The client face's `apply(ctx)` instantiates this with
 * data it has wired from real DSH services.
 */

import type { PaletteItem, PaletteAction } from '../shared/contract.ts'

export interface UniversalPaletteRenderOptions {
  readonly query: string
  readonly isLoading: boolean
  readonly isEmpty: boolean
  readonly items: readonly { item: PaletteItem; score: number; matchRanges: readonly { start: number; end: number }[] }[]
  readonly selectedIndex: number
  readonly onSelectedIndexChange: (next: number) => void
  readonly onQueryChange: (next: string) => void
  readonly onRunPrimary: () => void
  readonly onRunSecondary: (item: PaletteItem, action: PaletteAction) => void
  readonly onOpenActionPanel: () => void
  readonly onCloseActionPanel: () => void
  readonly actionPanelOpen: boolean
  readonly actionPanelSelectedIndex: number
  readonly onActionPanelIndexChange: (next: number) => void
  readonly conflicts: readonly string[]
}

export interface PaletteActionResult {
  readonly element: HTMLElement
  readonly dispose: () => void
}

/**
 * Construct the palette DOM root and wire the keyboard layer.
 * The component does NOT touch `document.body`; the caller passes in
 * the slot-rendered mount element from `ctx.slots.renderSlot(...)`.
 */
export function createPaletteDom(
  mountRoot: HTMLElement,
  options: UniversalPaletteRenderOptions,
): PaletteActionResult {
  mountRoot.innerHTML = ''
  mountRoot.dataset['plugin'] = 'dsh-universal-palette'

  const overlay = document.createElement('div')
  overlay.className = 'dsh-up-overlay'
  overlay.style.pointerEvents = 'auto'
  overlay.style.display = 'flex'
  overlay.style.alignItems = 'flex-start'
  overlay.style.justifyContent = 'center'
  overlay.style.paddingTop = '14vh'
  overlay.style.height = '100%'
  overlay.style.width = '100%'
  mountRoot.appendChild(overlay)

  const surface = document.createElement('div')
  surface.className = 'dsh-up-surface dsh-up-soft'
  surface.setAttribute('role', 'dialog')
  surface.setAttribute('aria-label', 'Universal Palette')
  surface.style.width = '600px'
  surface.style.maxWidth = 'min(680px, calc(100vw - 32px))'
  surface.style.minWidth = '520px'
  surface.style.maxHeight = 'min(68vh, 620px)'
  surface.style.display = 'flex'
  surface.style.flexDirection = 'column'
  surface.style.borderRadius = '14px'
  surface.style.overflow = 'hidden'
  surface.style.fontFamily = 'inherit'
  surface.style.color = 'var(--dsh-content-text, inherit)'
  overlay.appendChild(surface)

  const searchRow = document.createElement('div')
  searchRow.className = 'dsh-up-search'
  const search = document.createElement('input')
  search.className = 'dsh-up-search-input'
  search.type = 'text'
  search.value = options.query
  search.placeholder = options.query.startsWith('>') ? 'Run a command…' : 'Search…'
  search.setAttribute('aria-label', 'Search Universal Palette')
  search.spellcheck = false
  search.autocomplete = 'off'
  let composing = false
  search.addEventListener('compositionstart', () => {
    composing = true
  })
  search.addEventListener('compositionend', () => {
    composing = false
  })
  search.addEventListener('input', () => {
    options.onQueryChange(search.value)
  })
  search.addEventListener('keydown', (e) => {
    if (composing) return
    onSearchKeydown(e, options)
  })
  searchRow.appendChild(search)
  surface.appendChild(searchRow)

  const list = document.createElement('div')
  list.className = 'dsh-up-list'
  list.setAttribute('role', 'listbox')
  surface.appendChild(list)

  if (options.isEmpty) {
    const empty = document.createElement('div')
    empty.className = 'dsh-up-empty'
    empty.textContent = options.isLoading
      ? 'Searching…'
      : options.conflicts.length > 0
        ? `Shortcut conflicts with: ${options.conflicts.join(', ')}`
        : 'No matching results'
    list.appendChild(empty)
  } else {
    options.items.forEach((ranked, idx) => {
      const row = renderRow(ranked, idx === options.selectedIndex)
      row.addEventListener('mousedown', (e) => {
        e.preventDefault()
        options.onSelectedIndexChange(idx)
        options.onRunPrimary()
      })
      row.addEventListener('mouseenter', () => {
        if (options.selectedIndex !== idx) options.onSelectedIndexChange(idx)
      })
      list.appendChild(row)
    })
  }

  if (options.actionPanelOpen && options.items[options.selectedIndex]) {
    const panel = renderActionPanel(options)
    surface.appendChild(panel)
  }

  // Inline stylesheet (we keep them as a string constant so the bundle
  // does not depend on a separate CSS loader)
  const style = document.createElement('style')
  style.dataset['plugin'] = 'dsh-universal-palette'
  style.textContent = PALETTE_CSS
  mountRoot.appendChild(style)

  // Auto-focus the search input
  setTimeout(() => search.focus(), 0)

  function onSearchKeydown(e: KeyboardEvent, opts: UniversalPaletteRenderOptions): void {
    const items = opts.items
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        if (opts.actionPanelOpen) {
          const cur = items[opts.selectedIndex]
          const count = cur?.item.secondary?.length ?? 0
          if (count > 0) {
            opts.onActionPanelIndexChange((opts.actionPanelSelectedIndex + 1) % count)
          }
        } else {
          opts.onSelectedIndexChange(
            Math.min(opts.selectedIndex + 1, Math.max(0, items.length - 1)),
          )
        }
        break
      case 'ArrowUp':
        e.preventDefault()
        if (opts.actionPanelOpen) {
          const cur = items[opts.selectedIndex]
          const count = cur?.item.secondary?.length ?? 0
          if (count > 0) {
            opts.onActionPanelIndexChange(
              (opts.actionPanelSelectedIndex - 1 + count) % count,
            )
          }
        } else {
          opts.onSelectedIndexChange(Math.max(0, opts.selectedIndex - 1))
        }
        break
      case 'Enter':
        e.preventDefault()
        if (opts.actionPanelOpen) {
          const cur = items[opts.selectedIndex]
          const sec = cur?.item.secondary?.[opts.actionPanelSelectedIndex]
          if (sec && cur) {
            opts.onRunSecondary(cur.item, sec)
            opts.onCloseActionPanel()
          }
        } else {
          opts.onRunPrimary()
        }
        break
      case 'Tab':
        e.preventDefault()
        if (opts.actionPanelOpen) {
          opts.onCloseActionPanel()
        } else {
          const cur = items[opts.selectedIndex]
          if (cur && cur.item.secondary && cur.item.secondary.length > 0) {
            opts.onOpenActionPanel()
            opts.onActionPanelIndexChange(0)
          }
        }
        break
      case 'Escape':
        e.preventDefault()
        if (opts.actionPanelOpen) {
          opts.onCloseActionPanel()
        }
        break
      default:
        break
    }
  }

  return {
    element: mountRoot,
    dispose() {
      mountRoot.innerHTML = ''
    },
  }
}

function renderRow(
  ranked: { item: PaletteItem; score: number; matchRanges: readonly { start: number; end: number }[] },
  selected: boolean,
): HTMLElement {
  const pi = ranked.item
  const row = document.createElement('div')
  row.className = `dsh-up-row${selected ? ' dsh-up-row-selected' : ''}`
  row.setAttribute('role', 'option')
  row.setAttribute('aria-selected', String(selected))
  row.style.display = 'flex'
  row.style.alignItems = 'center'
  row.style.gap = '10px'
  row.style.padding = '0 14px'
  row.style.minHeight = pi.kind === 'conversation-hit' ? '62px' : '44px'
  row.style.cursor = 'default'

  const kind = document.createElement('span')
  kind.className = 'dsh-up-kind'
  kind.textContent = pi.kind
  row.appendChild(kind)

  const body = document.createElement('div')
  body.className = 'dsh-up-row-body'
  const title = document.createElement('div')
  title.className = 'dsh-up-row-title'
  title.textContent = pi.title
  body.appendChild(title)

  const meta = document.createElement('div')
  meta.className = 'dsh-up-row-meta'
  if (pi.subtitle) {
    const sub = document.createElement('span')
    sub.className = 'dsh-up-row-sub'
    sub.textContent = pi.subtitle
    meta.appendChild(sub)
  }
  if (pi.snippet) {
    const snip = document.createElement('div')
    snip.className = 'dsh-up-row-snippet'
    snip.textContent = pi.snippet.slice(0, 200)
    meta.appendChild(snip)
  }
  if (pi.badges) {
    for (const b of pi.badges) {
      const badge = document.createElement('span')
      badge.className = 'dsh-up-badge'
      badge.textContent = b
      meta.appendChild(badge)
    }
  }
  if (meta.childNodes.length > 0) body.appendChild(meta)
  row.appendChild(body)

  if (pi.secondary && pi.secondary.length > 0) {
    const dots = document.createElement('span')
    dots.className = 'dsh-up-row-actions'
    dots.textContent = '…'
    row.appendChild(dots)
  }
  return row
}

function renderActionPanel(options: UniversalPaletteRenderOptions): HTMLElement {
  const cur = options.items[options.selectedIndex]
  if (!cur) return document.createElement('div')
  const panel = document.createElement('div')
  panel.className = 'dsh-up-action-panel'
  panel.setAttribute('role', 'listbox')
  for (let i = 0; i < (cur.item.secondary?.length ?? 0); i++) {
    const action = cur.item.secondary![i]!
    const row = document.createElement('div')
    row.className = `dsh-up-action${i === options.actionPanelSelectedIndex ? ' dsh-up-action-selected' : ''}`
    row.setAttribute('role', 'option')
    row.setAttribute('aria-selected', String(i === options.actionPanelSelectedIndex))
    row.textContent = action.title
    row.addEventListener('mousedown', (e) => {
      e.preventDefault()
      options.onActionPanelIndexChange(i)
      options.onRunSecondary(cur.item, action)
      options.onCloseActionPanel()
    })
    panel.appendChild(row)
  }
  return panel
}

const PALETTE_CSS = `
.dsh-up-overlay { font-family: var(--dsh-content-font-family, inherit); font-size: var(--dsh-content-font-size, 14px); line-height: 1.4; }
.dsh-up-surface.dsh-up-solid { background: var(--dsh-surface-bg, #1a1a1a); border: 1px solid var(--dsh-border, rgba(255,255,255,0.08)); }
.dsh-up-surface.dsh-up-soft  { background: color-mix(in srgb, var(--dsh-surface-bg, #1a1a1a) 78%, transparent); backdrop-filter: blur(18px) saturate(1.05); -webkit-backdrop-filter: blur(18px) saturate(1.05); border: 1px solid color-mix(in srgb, var(--dsh-border, rgba(255,255,255,0.16)) 72%, transparent); box-shadow: 0 18px 48px rgb(0 0 0 / 0.24), 0 2px 8px rgb(0 0 0 / 0.12); }
.dsh-up-surface.dsh-up-glass { background: color-mix(in srgb, var(--dsh-surface-bg, #1a1a1a) 60%, transparent); backdrop-filter: blur(28px) saturate(1.1); -webkit-backdrop-filter: blur(28px) saturate(1.1); border: 1px solid color-mix(in srgb, var(--dsh-border, rgba(255,255,255,0.2)) 64%, transparent); box-shadow: 0 22px 64px rgb(0 0 0 / 0.3), 0 2px 10px rgb(0 0 0 / 0.15); }
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .dsh-up-surface.dsh-up-soft, .dsh-up-surface.dsh-up-glass { background: var(--dsh-surface-bg, #1a1a1a); }
}
@media (prefers-reduced-motion: reduce) { .dsh-up-surface, .dsh-up-row { transition: none !important; } }
.dsh-up-search { display: flex; align-items: center; padding: 0 14px; height: 46px; border-bottom: 1px solid var(--dsh-divider, rgba(255,255,255,0.06)); }
.dsh-up-search-input { flex: 1; background: transparent; border: none; outline: none; font: inherit; color: inherit; caret-color: var(--dsh-accent, #5b9eff); }
.dsh-up-search-input::placeholder { color: var(--dsh-text-muted, rgba(255,255,255,0.45)); }
.dsh-up-list { overflow-y: auto; padding: 6px 0; }
.dsh-up-row { transition: background-color 80ms ease; border-radius: 6px; margin: 2px 6px; }
.dsh-up-row:hover { background: color-mix(in srgb, var(--dsh-surface-hover, rgba(255,255,255,0.06)) 70%, transparent); }
.dsh-up-row-selected { background: color-mix(in srgb, var(--dsh-accent, #5b9eff) 14%, transparent); box-shadow: inset 2px 0 0 var(--dsh-accent, #5b9eff); }
.dsh-up-kind { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--dsh-text-muted, rgba(255,255,255,0.45)); min-width: 64px; padding: 2px 6px; border-radius: 4px; background: color-mix(in srgb, var(--dsh-surface-bg, transparent) 50%, transparent); }
.dsh-up-row-body { flex: 1; min-width: 0; }
.dsh-up-row-title { font-size: 13.5px; font-weight: 550; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dsh-up-row-meta { display: flex; gap: 8px; font-size: 11.5px; color: var(--dsh-text-muted, rgba(255,255,255,0.55)); margin-top: 2px; }
.dsh-up-row-snippet { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: var(--dsh-mono-font, ui-monospace, SFMono-Regular, monospace); }
.dsh-up-row-actions { color: var(--dsh-text-muted, rgba(255,255,255,0.4)); font-size: 16px; line-height: 1; }
.dsh-up-badge { font-size: 11px; padding: 1px 5px; border-radius: 3px; background: color-mix(in srgb, var(--dsh-surface-bg, transparent) 50%, transparent); border: 1px solid var(--dsh-divider, rgba(255,255,255,0.06)); }
.dsh-up-empty { padding: 18px 14px; color: var(--dsh-text-muted, rgba(255,255,255,0.5)); font-size: 13px; text-align: center; }
.dsh-up-action-panel { border-top: 1px solid var(--dsh-divider, rgba(255,255,255,0.06)); padding: 6px 0; }
.dsh-up-action { padding: 6px 14px; cursor: default; font-size: 12.5px; }
.dsh-up-action:hover, .dsh-up-action-selected { background: color-mix(in srgb, var(--dsh-accent, #5b9eff) 10%, transparent); }
@media (max-width: 600px) { .dsh-up-surface { width: calc(100vw - 20px) !important; min-width: 0 !important; } }
@media (prefers-contrast: more) { .dsh-up-surface.dsh-up-soft, .dsh-up-surface.dsh-up-glass { background: var(--dsh-surface-bg, #1a1a1a); } }
`
