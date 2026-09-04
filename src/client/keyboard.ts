/**
 * Global keyboard handler.
 *
 * Captures `keydown` at the capture phase so we beat the input
 * element. Default shortcut is `Ctrl/Cmd+Shift+K` — deliberately
 * off `Ctrl/Cmd+K` (taken by `dsh-spotlight`) and `Alt+M` (taken
 * by `dsh-model-palette`). On known-conflict we surface a notice
 * in the palette surface; we never silently override.
 */

export interface ShortcutReport {
  readonly shortcut: string
  readonly conflictsWith: readonly string[]
}

export const KNOWN_SHORTCUTS: Record<string, string> = {
  'Ctrl+K': 'dsh-spotlight',
  'Cmd+K': 'dsh-spotlight',
  'Alt+M': 'dsh-model-palette',
  'Shift+Shift': 'dsh-command-palette',
}

function normalizeMac(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.metaKey) parts.push('Cmd')
  else if (e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey && !(e.key === 'Shift' && !e.ctrlKey && !e.altKey && !e.metaKey)) parts.push('Shift')
  const key = e.key.length === 1 ? e.key.toUpperCase() : e.key
  if (!['Control', 'Shift', 'Alt', 'Meta'].includes(key)) parts.push(key)
  return parts.join('+')
}

export function detectShortcut(e: KeyboardEvent): string {
  return normalizeMac(e)
}

export function checkConflicts(shortcut: string): ShortcutReport {
  const conflicts: string[] = []
  for (const [key, owner] of Object.entries(KNOWN_SHORTCUTS)) {
    if (key === shortcut) conflicts.push(owner)
  }
  return { shortcut, conflictsWith: conflicts }
}

export interface KeyboardOptions {
  readonly shortcut: string
  readonly onOpen: () => void
  readonly onClose: () => void
  readonly onConflictDetected?: (report: ShortcutReport) => void
}

export interface KeyboardHandle {
  dispose(): void
  reportConflicts(): ShortcutReport
}

export function attachKeyboard(opts: KeyboardOptions): KeyboardHandle {
  function isComposing(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false
    return target.dataset['composing'] === 'true'
  }

  function handler(e: KeyboardEvent): void {
    if (isComposing(e.target)) return
    const detected = detectShortcut(e)
    if (detected === opts.shortcut) {
      e.preventDefault()
      e.stopPropagation()
      opts.onOpen()
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handler, { capture: true })
  }
  const report = checkConflicts(opts.shortcut)
  if (report.conflictsWith.length > 0 && opts.onConflictDetected) {
    opts.onConflictDetected(report)
  }
  return {
    dispose() {
      if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', handler, { capture: true } as EventListenerOptions)
      }
    },
    reportConflicts() {
      return report
    },
  }
}
