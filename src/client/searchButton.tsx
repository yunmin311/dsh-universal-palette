/**
 * Composer Search button.
 *
 * Registered into the public `conversation.input.left` slot — strict
 * per-Session, list-kind. The component is a button that opens the
 * Composer Morph through the shared SearchController. The Host-selected slot
 * controls whether results render below Hero or above active Composer. On
 * Session switch the slot disposer automatically removes the entry.
 *
 * Fail-closed compatibility: the live availability observable
 * (`!cold || hero dock declared`) disables the button on a Hero surface
 * whose host does not declare the dock — the click-time controller gate
 * remains as the second line of defense.
 *
 * Zero access to package-private composer APIs.
 */
import { useMemo, useSyncExternalStore } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { IconSearchOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SearchController } from './search-controller.ts'
import type { AvailabilityObservable } from './heroDock.ts'

export interface SearchButtonProps {
  readonly ctx: Context
  readonly controller: SearchController
  /** Live fail-closed availability (`!cold || hero dock declared`); drives the disabled state. */
  readonly allowed?: AvailabilityObservable
}

export const SEARCH_BUTTON_ID = 'dsh-universal-palette.search'

const subscribeNever = () => () => undefined
const snapshotTrue = () => true

export function SearchButton(props: SearchButtonProps) {
  const t = useMemo(() => bindLocale(props.ctx.locale, 'universal-palette'), [props.ctx.locale])
  const allowed = useSyncExternalStore(
    props.allowed?.subscribe ?? subscribeNever,
    props.allowed?.getSnapshot ?? snapshotTrue,
    props.allowed?.getSnapshot ?? snapshotTrue,
  )
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
      disabled={!allowed}
      onPointerDown={onPointerDown}
      onClick={() => {
        if (!allowed) return
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
        cursor: allowed ? 'pointer' : 'default',
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
