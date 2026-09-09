import { useLayoutEffect, useRef } from 'react'
import {
  IconAgentPresetOutline16,
  IconClockOutline16,
  IconFolderOpenOutline16,
  IconNewChatOutline16,
  IconSkillOutline16,
  IconSparkle16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PaletteItem } from '../shared/contract.ts'
import { conciseMorphDescription, morphTypeLabel } from './morphPresentation.ts'
import css, { cssText } from './MorphResults.module.css'

export interface MorphResultsProps {
  readonly label: string
  readonly loadingText: string
  readonly emptyText: string
  readonly error?: string
  readonly loading: boolean
  readonly items: readonly { item: PaletteItem }[]
  readonly selectedIndex: number
  readonly onSelectedIndexChange: (index: number) => void
  readonly onRun: (index: number) => void
}

/** Result-only renderer: the resident DSH Composer remains the sole input. */
export function MorphResults(props: MorphResultsProps) {
  const selected = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => { selected.current?.scrollIntoView({ block: 'nearest' }) }, [props.selectedIndex])
  return <div className={css.root} data-plugin="dsh-universal-palette" data-presentation="morph">
    <style data-plugin="dsh-universal-palette-morph">{cssText}</style>
    <div className={css.surface}>
      <div className={css.list} role="listbox" aria-label={props.label}>
        {props.error ? <div className={`${css.state} ${css.error}`} role="alert">{props.error}</div>
          : props.items.length === 0 ? <div className={css.state} role="status">{props.loading ? props.loadingText : props.emptyText}</div>
          : props.items.map(({ item }, index) => {
            const description = conciseMorphDescription(item.subtitle ?? item.snippet)
            const type = morphTypeLabel(item.kind)
            const Icon = item.kind === 'model' ? IconSparkle16
              : item.kind === 'conversation-hit' ? IconClockOutline16
              : item.kind === 'skill' ? IconSkillOutline16
              : item.kind === 'workspace' ? IconFolderOpenOutline16
              : item.kind === 'command' ? IconAgentPresetOutline16
              : IconNewChatOutline16
            return <div
              key={item.id}
              ref={index === props.selectedIndex ? selected : undefined}
              className={`${css.row} ${index === props.selectedIndex ? css.selected : ''}`}
              role="option"
              aria-selected={index === props.selectedIndex}
              data-kind={item.kind}
              onPointerMove={() => props.onSelectedIndexChange(index)}
              onMouseDown={event => event.preventDefault()}
              onClick={() => props.onRun(index)}
            >
              <span className={css.icon} aria-hidden="true">{item.kind === 'command' ? <span className={css.commandIcon}>/</span> : <Icon />}</span>
              <span className={css.title}>{item.title}</span>
              {description && <span className={css.description}>{description}</span>}
              {type && <span className={css.type}>{type}</span>}
            </div>
          })}
      </div>
    </div>
  </div>
}
