/**
 * Platform default shortcut for fresh installs.
 *
 * Legacy default (`Ctrl+Shift+K`) is preserved verbatim by storage
 * migration — only an empty/missing preference triggers this lookup,
 * so existing customizations (including `Ctrl+Shift+K`) are kept.
 *
 * Windows / Linux: `Alt+Q`. macOS: `Cmd+Shift+K`. The legacy binding
 * was deliberately not Option+Q on macOS — the keyboard handler
 * rejects plain Alt as a host shortcut, so the only way to keep macOS
 * parity with the previous default is to migrate it forward to
 * `Cmd+Shift+K`.
 *
 * The same function backs the `preferences.snapshot.shortcut` fallback
 * in `index.ts` so the keyboard listener and the persistence default
 * always agree.
 */
export type SupportedPlatform = NodeJS.Platform

export function defaultShortcut(platform: SupportedPlatform): string {
  return platform === 'darwin' ? 'Cmd+Shift+K' : 'Alt+Q'
}