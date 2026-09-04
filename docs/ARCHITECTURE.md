# Architecture

DSH Universal Palette follows the DSH dual-face plugin contract at
the locked upstream SHA
`deepseek-ai/deepseek-harness@76fda729799fe9b3848dbe2c211d4b231032b81e`
(`@deepseek-ai/dsh@0.1.2-rc.1`).

## Locked baseline

| | |
|---|---|
| Upstream | `deepseek-ai/deepseek-harness` |
| SHA | `76fda729799fe9b3848dbe2c211d4b231032b81e` |
| Root package version | `0.1.2-rc.1` |

Other DSH versions are best-effort / unverified. The plugin targets
this single SHA.

## Host / Browser split

```
┌─ Host ──────────────────────┐   ┌─ Browser ────────────────────────────────────────┐
│ Cordis tree                │   │ client cordis root ctx                             │
│ sessions/agents/SessionLog │◀─▶│  ├ dsh-universal-palette plugin                    │
│ Connection + Gateway       │   │  │  ├ host (empty apply)                            │
│ webserver                  │   │  │  └ client (mounted as `lib/client.js`)          │
│ session-query-sqlite       │   │  │     ├ apply(ctx) + inject                         │
│   (overridden by patch)    │   │  │     ├ Capability probe                           │
└────────────────────────────┘   │  │     ├ Providers (one per native capability)      │
                                 │  │     ├ Aggregator (query, abort, debounce, rank)  │
                                 │  │     ├ Preferences store (frecency, pin)          │
                                 │  │     └ UniversalPalette component (DOM)          │
                                 │           mounted into shell.overlay slot chain   │
                                 │           via ctx.slots.register(...)              │
                                 └────────────────────────────────────────────────────┘
```

## Bundle contract

The browser half is produced by `tsdown.client.ts` exactly along the
upstream `packages/client/tsdown.client.ts` lines (locked SHA). It
emits two artifacts:

- `lib/index.js` — Node half, ESM. The host apply (empty).
- `lib/client.js` — Browser half, CJS, wrapped with:

  ```js
  window.__ModuleLoader__.load({
    id: "@yunmin311/dsh-universal-palette",
    factory: (require) => {
      var module = { exports: {} };
      var exports = module.exports;
      // … plugin body, including exports.apply = apply;
      //                            exports.inject = inject;
      //                            exports.default = { inject, apply };
      return module.exports;
    }
  });
  ```

The DSH browser shell (the `apps/web` host's `lib/client/index.ts`
+ `@deepseek-ai/dsh-client-modules`) consumes the bundle, calls
`window.__ModuleLoader__.load(...)` per `BootModuleRow`, materializes
the module into its lazy-CJS module table, and treats the resolved
`module.exports` as a Cordis plugin entry whose `apply` and
`inject` fields the host's Cordis activator consumes.

The bundle config pins:
- `format: 'cjs'` (NOT `'esm'` — the previous round's ESM bundle
  produced `SyntaxError: Unexpected token 'export'` in the real
  browser).
- `outDir: 'lib'` (NOT `'dist/'`).
- `entryFileNames: 'client.js'` so the manifest scan matches
  `exports["./client"]: "./lib/client.js"`.
- `dts: false` — the types live in `lib/types/...` from a separate
  `tsc` run.
- `clean: false` — a default clean would wipe the Node-half output.
- `define` for `process.env.NODE_ENV` + `import.meta.env.MODE` so
  inline dep packages (zustand / immer) work.
- The `dsh-client-bundle-purity` plugin: any `@deepseek-ai/*` value
  import not in the shared-inject list throws at build time. This
  matches the upstream rule (per `packages/client/tsdown.client.ts`
  at the locked SHA) and prevents cross-plugin value imports.

## Plugin contract (browser half)

```ts
export const inject = [
  '@deepseek-ai/dsh-client-ui-commands',
  '@deepseek-ai/dsh-client-ui-sessions',
  '@deepseek-ai/dsh-client-ui-model-selection',
  '@deepseek-ai/dsh-client-ui-layout',
  '@deepseek-ai/dsh-client-store',
] as const

export function apply(ctx: Context): void {
  // 1. Capability probe (read real DSH services through `ctx.inject`).
  // 2. Build providers from the live capability surface.
  // 3. Build the aggregator + preferences store.
  // 4. Register the Component into the `shell.overlay` slot chain
  //    via `ctx.slots.register({ name, children: { palette: ... } })`.
  // 5. Bind `Ctrl/Cmd+Shift+K`; surface conflicts as a notice.
}
```

The activator reads from `ctx` directly (not from a custom
`ClientCtx` shape). Capability probe is a single-pass read of each
named service; missing service → that provider is not registered →
that category does not surface items → the UI hides it.

## Slot mount

The activator does NOT touch `document.body`. The component
returned from `apply`'s slot registration is mounted by the shell's
slot renderer into the `shell.overlay` slot's `palette` child
outlet (per the slot system standard at
`.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md`
at the locked SHA). The Component reads aggregator state through
`props` and renders into a `HTMLElement` via `root` passed in by the
slot renderer. There is no DOM scraping, no `querySelector`, no
private store.

## Provider set (V1 P0)

| Provider | Source | Required? |
|---|---|:---:|
| `commands` | `host.commands.list({sessionId})` | ✅ P0 |
| `sessions` | `host.sessions.list` | ✅ P0 |
| `models` | `host.modelDirectory.list({sessionId, signal})` | ✅ P0 |
| `conversation-hits` | `host.sessionQuery.searchSessions` | ✅ P0 |
| `skills` | `host.skills.list` | optional |

## Ranking

`final = 0.46·text + 0.19·context + 0.15·frecency + 0.10·pin + 0.10·hint`

- `text`: deterministic subsequence + prefix + alias match.
- `context`: same workspace (+0.55), same session (+0.25), same model
  provider (+0.20), normalized to [0, 1].
- `frecency`: `log10(1 + count) · 0.5^(age / 7d)`.
- `pin`: 1.0 when pinned, else 0.
- `hint`: 1.0 for command/action kinds when `>` prefix is on, else 0.

Exact title / exact alias override bumps a result to positions 1-2
even when the weighted score would put it lower.

## Persistence

V1 P0 preferences (frecency, pin) persist to `localStorage` under
the `dsh-universal-palette` namespace. The store does not own a
custom database. The hide / alias / per-provider toggle records
remain in the code as optional / non-blocking surfaces (V1.1).

## Disposal

`ctx.effect(() => async () => ..., 'dsh-universal-palette.teardown')`
runs when the plugin fiber disposes. It tears down the keyboard
listener, the aggregator listener, the preferences subscriber,
the preferences store, and the aggregator — in that order. There
is no DOM element ownership to clean up; the slot chain owns the
component, the shell tears it down on fiber dispose.

## Performance characteristics

- Warm open target: < 100 ms (browser only; not measured here).
- Local provider collect (commands, sessions, models): synchronous
  in tests; in the wire the browser-side adapter pre-warms the
  cache on activation.
- Provider with FTS (session query): hard-capped by
  `maxSearchResults` on the host side; aggregator caps at 40.
- Soft deadline: 600 ms by default.
- Bundle size: `lib/client.js` 45 kB ungzipped / 11 kB gzipped,
  with source map.
