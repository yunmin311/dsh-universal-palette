import { Fragment, useEffect, useLayoutEffect, useRef, type KeyboardEvent } from 'react'
import { ageText, type PaletteTranslate } from './locales.ts'
import { IconSearchOutline16, IconNewChatOutline16, IconFolderOpenOutline16, IconClockOutline16, IconSparkle16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PaletteItem, PaletteAction } from '../shared/contract.ts'
import css, { cssText } from './UniversalPalette.module.css'

export interface UniversalPaletteProps {
  readonly t: PaletteTranslate
  readonly sections?: boolean
  readonly emptyMessage?: string
  readonly onClose: () => void
  readonly guidance?: string
  readonly contextHint?: string
  readonly error?: string
  readonly sidebarWide: boolean
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


/** Stable React input; DSH retains ownership of all catalog and navigation data. */
export function UniversalPalette(props: UniversalPaletteProps) {
  const t = props.t
  const surface = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const selectedRow = useRef<HTMLDivElement>(null)
  const composing = useRef(false)
  const close = useRef(props.onClose)
  close.current = props.onClose
  useLayoutEffect(() => { search.current?.focus({ preventScroll: true }) }, [])
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !surface.current?.contains(event.target)) close.current()
      // Do not cancel/bubble-stop: the same pointer gesture must reach DSH.
    }
    document.addEventListener('pointerdown', outside, true)
    return () => document.removeEventListener('pointerdown', outside, true)
  }, [])
  useLayoutEffect(() => { selectedRow.current?.scrollIntoView({ block: 'nearest' }) }, [props.selectedIndex])
  const current = props.items[props.selectedIndex]?.item
  const actions = current?.secondary ?? []
  const keydown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || composing.current) return
    switch (event.key) {
      case 'Escape':
        event.preventDefault(); event.stopPropagation()
        if (props.actionPanelOpen) props.onCloseActionPanel()
        else props.onClose()
        break
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault()
        const step = event.key === 'ArrowDown' ? 1 : -1
        if (props.actionPanelOpen && actions.length) props.onActionPanelIndexChange((props.actionPanelSelectedIndex + step + actions.length) % actions.length)
        else props.onSelectedIndexChange(Math.max(0, Math.min(props.items.length - 1, props.selectedIndex + step)))
        break
      }
      case 'Enter':
        event.preventDefault()
        if (props.actionPanelOpen) {
          const action = actions[props.actionPanelSelectedIndex]
          if (current && action) props.onRunSecondary(current, action)
        } else props.onRunPrimary()
        break
      case 'Tab':
        event.preventDefault()
        if (props.actionPanelOpen) props.onCloseActionPanel()
        else if (actions.length) { props.onActionPanelIndexChange(0); props.onOpenActionPanel() }
        break
    }
  }
  return <div className={css.root} data-plugin="dsh-universal-palette" data-sidebar-wide={props.sidebarWide}>
    <style data-plugin="dsh-universal-palette">{cssText}</style>
    <div ref={surface} className={css.surface} role="dialog" aria-label={t('palette')}>
      <div className={css.search}>
        <IconSearchOutline16 className={css.searchIcon} />
        <input ref={search} className={css.searchInput} aria-label={t('search')} role="combobox"
          aria-expanded="true" aria-controls="up-results" aria-autocomplete="list"
          aria-activedescendant={current ? `up-result-${props.selectedIndex}` : undefined}
          placeholder={t('search')} value={props.query}
          spellCheck={false} autoComplete="off" onKeyDown={keydown}
          onCompositionStart={() => { composing.current = true }}
          onCompositionEnd={event => { composing.current = false; props.onQueryChange(event.currentTarget.value) }}
          onChange={event => props.onQueryChange(event.currentTarget.value)} />
      </div>
      {(props.guidance || props.contextHint) && <div className={css.guidance}>
        {props.guidance && <div className={css.heading}>{props.guidance}</div>}
        {props.contextHint && <div className={css.hint}>{props.contextHint}</div>}
      </div>}
      {props.error && <div className={css.error} role="alert">{props.error}</div>}
      <div className={css.list} id="up-results" role="listbox" aria-label={t('results')}>
        {props.items.length === 0 ? <div className={css.empty} role="status">
          {props.isLoading ? t('searching') : props.query.trim() ? <>{t('noResults', {query:props.query})}<span>{t('tryAgain')}</span></>
            : props.emptyMessage ?? t('empty')}
        </div> : props.items.map(({ item }, index) => {
          const Icon = item.kind === 'model' ? IconSparkle16 : item.kind === 'workspace' || item.id === 'startup:workspace' ? IconFolderOpenOutline16
            : item.kind === 'conversation-hit' || item.id === 'startup:recent' ? IconClockOutline16 : IconNewChatOutline16
          const section = item.kind === 'session' ? 'current' : item.kind === 'model' ? 'models' : 'commands'
          const metadata = item.kind === 'conversation-hit' ? [t('history'), ageText(item.updatedAt,t), item.workspaceTitle].filter(Boolean).join(' · ') : undefined
          return <Fragment key={item.id}>
            {props.sections && (index === 0 || props.items[index-1]?.item.kind !== item.kind) && <div className={css.section} role="presentation">{t(section)}</div>}
            <div ref={index === props.selectedIndex ? selectedRow : undefined}
            id={`up-result-${index}`} className={`${css.row} ${index === props.selectedIndex ? css.selected : ''} ${item.snippet ? css.historyRow : ''}`}
            role="option" aria-selected={index === props.selectedIndex} data-kind={item.kind}
            data-session-id={item.kind === 'session' ? item.context?.sessionId : undefined}
            onPointerMove={() => { if (props.selectedIndex !== index) props.onSelectedIndexChange(index) }}
            onMouseDown={event => event.preventDefault()}
            onClick={() => { props.onSelectedIndexChange(index); props.onRunSecondary(item, item.primary) }}>
            <span className={css.icon} aria-hidden="true">{item.kind === 'command' ? <span className={css.commandIcon}>/</span> : <Icon />}</span>
            <div className={css.rowBody}>
              <div className={css.titleLine}><div className={css.title}>{item.title}</div>{metadata && <span className={css.historyMeta}>{metadata}</span>}</div>
              {item.snippet ? <div className={css.snippet}>{item.snippet}</div>
                : item.subtitle && <div className={css.meta}>{item.subtitle}</div>}
            </div>
            {item.badges?.length ? <span className={css.badge}>{item.badges.join(' · ')}</span> : null}
            {actions.length > 0 && index === props.selectedIndex && <span className={css.badge}>Tab</span>}
          </div></Fragment>
        })}
      </div>
      {props.actionPanelOpen && current && <div className={css.actionPanel} role="listbox" aria-label={t('actions')}>
        {actions.map((action, index) => <button key={action.id} className={`${css.action} ${index === props.actionPanelSelectedIndex ? css.selected : ''}`}
          role="option" aria-selected={index === props.actionPanelSelectedIndex} onMouseDown={event => event.preventDefault()}
          onClick={() => props.onRunSecondary(current, action)}>{action.title}</button>)}
      </div>}
      <div className={css.footer}>{t('footer')}</div>
    </div>
  </div>
}
