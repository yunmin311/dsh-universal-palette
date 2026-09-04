/**
 * Minimal ambient type declarations for `@deepseek-ai/cordis`.
 *
 * Universal Palette's client face imports `Context` from
 * `@deepseek-ai/cordis` (the DSH plugin framework). In a real
 * DSH install, this module is supplied by the workspace via
 * `workspace:^` (see `packages/client/ui-commands/package.json`
 * at the locked SHA). We do not bundle a copy of Cordis into
 * this plugin's npm package — the host's `lib/client.js` build
 * neverBundle is configured to leave @deepseek-ai/* value
 * imports external, and the runtime module table provides the
 * real implementation at `window.__ModuleLoader__.load(...)` time.
 *
 * This file ships only the *type* signatures the plugin's
 * activator references. The runtime resolution is the host's
 * responsibility, not ours.
 */

declare module '@deepseek-ai/cordis' {
  export interface Context {
    get<T = unknown>(key: string): T | undefined
    provide(key: string, value: unknown): void
    effect(
      register: (dispose: () => void) => () => void | Promise<void>,
      name?: string,
    ): void
    slots: {
      register: (entry: unknown) => void
      resolve: (name: string) => unknown
    }
  }
}
