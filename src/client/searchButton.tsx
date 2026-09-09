/**
 * Composer Search button.
 *
 * Registered into the public `conversation.input.left` slot — strict
 * per-Session, list-kind. The component is a button that opens the
 * best public Host surface through the shared SearchController. Cold
 * hero Sessions fall back to compact Floating; active Sessions use Morph. On
 * Session switch the slot disposer automatically removes the entry.
 *
 * Zero access to package-private composer APIs.
 */
import { useMemo, useSyncExternalStore } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { IconSearchOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SearchController } from './search-controller.ts'

export interface SearchButtonProps {
  readonly ctx: Context
  readonly controller: SearchController
}

export const SEARCH_BUTTON_ID = 'dsh-universal-palette.search'

export function SearchButton(props: SearchButtonProps) {
  const t = useMemo(() => bindLocale(props.ctx.locale, 'universal-palette'), [props.ctx.locale])
  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    // Keep the resident Composer focused: it remains the sole Morph input.
    event.preventDefault()
  }
  return (
    <button
      type="button"
      data-plugin="dsh-universal-palette"
      data-search-button="true"
      aria-label={t('palette')}
      title={t('palette')}
      onPointerDown={onPointerDown}
      onClick={() => {
        const id = props.ctx.sessions.list.getSnapshot().current
        if (id === undefined) return
        props.controller.openComposerSearch(String(id))
      }}
      style={{
        background: 'transparent',
        border: 0,
        padding: '4px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        cursor: 'pointer',
        color: 'inherit',
      }}
    >
      <IconSearchOutline16 />
    </button>
  )
}

function bindLocale(locale: LocaleRuntime, ns: string): (key: string, params?: Record<string, unknown>) => string {
  return (locale.bind as unknown as (namespace: string) => (key: string, params?: Record<string, unknown>) => string)(ns)
}
