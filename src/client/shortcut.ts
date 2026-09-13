/**
 * Platform default shortcut for fresh installs.
 *
 * Storage migration also uses this value when no shortcut was saved or
 * when the legacy schema contains its ambiguous `Ctrl+Shift+K` default.
 * Explicit custom shortcuts in the current schema are preserved.
 *
 * Windows / Linux: `Alt+Q`. macOS: `Cmd+Shift+K`. The legacy binding
 * was deliberately not Option+Q on macOS — the keyboard handler
 * rejects plain Alt as a host shortcut, so the only way to keep macOS
 * parity with the previous default is to migrate it forward to
 * `Cmd+Shift+K`.
 *
 * PreferencesStore receives this value during construction so its initial
 * snapshot, keyboard listener, and persisted value always agree.
 */
export type SupportedPlatform = NodeJS.Platform

export function defaultShortcut(platform: SupportedPlatform): string {
  return platform === 'darwin' ? 'Cmd+Shift+K' : 'Alt+Q'
}
