# Compatibility Notes

This document records every real DeepSeek Harness API binding used by
Universal Palette, against the **exact** locked upstream SHA.

## Locked baseline

| | |
|---|---|
| Upstream | `deepseek-ai/deepseek-harness` |
| SHA | `76fda729799fe9b3848dbe2c211d4b231032b81e` |
| Root package version | `0.1.2-rc.1` |

Other DSH versions are best-effort / unverified. The plugin targets
this single SHA.

## Bundle / install contract (real DSH first-party)

| Binding | Upstream package (SHA `76fda72…`) | Source-of-truth doc | Used in (this repo) | Adapter shape |
|---|---|---|---|---|
| `package.json: dsh.client` | `@deepseek-ai/dsh-client-modules` | `packages/client/modules/README.md` — `platform: 'web'`, `inject: string[]` | `package.json` (`dsh.client.platform: "web"`, `dsh.client.inject: [...]`) | The client-modules node half scans for `dsh.client` rows and adds them to the boot graph. |
| `lib/client.js` (CJS) | `@deepseek-ai/dsh-client-modules` | `packages/client/modules/README.md` — "the host serves built client bundles, so `pnpm run build` must have produced each `lib/client.js` before launch" + `packages/client/tsdown.client.ts` at the locked SHA — `format: 'cjs'`, `outDir: 'lib'`, `entryFileNames: 'client.js'`, `dts: false`, banner `window.__ModuleLoader__.load({ id, factory: (require) => { ... } })`, footer `return module.exports; } });` | `tsdown.client.ts` → `lib/client.js` (CJS, 45 kB) | The browser half is loaded into the DSH module table via `window.__ModuleLoader__.load({ id, factory })`; the resolved `module.exports` is a Cordis plugin entry. |
| `lib/index.js` (ESM) | `@deepseek-ai/dsh-client-modules` | same | `tsdown.client.ts` → `lib/index.js` (ESM) | Node half consumed by the host apply chain. |
| `export const inject` + `export function apply(ctx)` | `@deepseek-ai/cordis` | `packages/client/modules/README.md` — "Executing a plugin bundle only registers its factory"; the resolved exports include `apply` and `inject` which the host's Cordis activator consumes. | `src/client/index.ts` | The DSH client plugin contract. |
| `ctx.slots.register(...)` | `@deepseek-ai/dsh-client-ui-layout` + slot-system standard | `packages/client/ui-layout/README.md` + `.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md` (locked SHA) — the `shell.overlay` slot is a declared child slot of `AppFrame` | `src/client/index.ts:ctx.slots.register({ name: 'shell.overlay', children: { palette: { kind: 'single', scope: 'session', component } } })` | The component returns `{ type: 'dom', render(root) { ... }, dispose() { ... } }`; the slot renderer mounts the component into the slot's child outlet. |
| `ctx.commands.list / find / execute` | `@deepseek-ai/dsh-client-ui-commands` | `packages/client/ui-commands/README.md` — `ctx.commandUi.register(name, spec)`, `decorate(name, spec)`; wire `command.list({sessionId})`; `command.execute({sessionId, line, images, signal})` | `src/client/index.ts:commands` adapter → `src/client/providers/commands.ts` | The activator's `host.commands` shape (`{ list, find, execute }`) is the neutral capability contract; the `commands` adapter reads from `ctx.inject([...], (child) => ...)` to get the live service. |
| `ctx.sessions` (list / current / open) | `@deepseek-ai/dsh-client-ui-sessions` + `core/session` | `docs/architecture.md` core subsystems table — `ctx.sessions` | `src/client/index.ts:sessions` adapter → `src/client/providers/sessions.ts` | Same neutral shape. |
| `ctx.modelDirectories` + `session.selectModel` | `@deepseek-ai/dsh-client-ui-model-selection` | `packages/client/ui-model-selection/README.md` — per-session provider-grouped directory; `session.models` for read; `session.selectModel` for write | `src/client/index.ts:modelDirectory` adapter → `src/client/providers/models.ts` | `host.modelDirectory.list(sessionId, signal)` returns `ModelGroup[]`; `host.modelDirectory.select(sessionId, selection)` submits a `ModelSelectionView`. |
| `ctx.sessionQuery` (searchSessions / searchEvents) | `@deepseek-ai/dsh-tool-session-query` + `@deepseek-ai/dsh-session-query-sqlite` | `packages/session-query/tool-session-query/README.md` + `packages/session-query-sqlite/README.md` | `src/client/index.ts:sessionQuery` adapter → `src/client/providers/conversation-hits.ts` | `host.sessionQuery.searchSessions(query, signal)` returns `SessionSearchHit[]`. |

### Plugin patch — the rows the patch overrides / inserts

| Row | Action | Source-of-truth |
|---|---|---|
| `session-query-sqlite` | override (existing row) — `config.path: !!js dshHomePath('session-query.sqlite')` + `config.openAt: first-search` | `packages/session-query-sqlite/README.md` — shipped row, default `openAt: never`; `Config.path` validated as a plain non-blank string in `resolveConfig` at `packages/session-query/session-query-sqlite/src/index.ts` (locked SHA) |
| `dsh-universal-palette` | insert (new row, top-level `dsh-web-app` style) | `packages/bundle/web-app/cordis.patch.yml` line 60+ (locked SHA) — new browser roster rows go inside `- insert: [...]` blocks |

`path: !!js dshHomePath('session-query.sqlite')` is the DSH-official
way to compose a DSH_HOME-relative path. The DSH patch parser does
not perform shell-style variable expansion; a literal
`${DSH_HOME}/...` would be passed verbatim to
`openSearchDatabase(path, ...)` and fail. `dshHomePath` is provided
to `!!js` expressions via the `Context` module augmentation in
`packages/boot/app-boot/src/index.ts` (locked SHA):
`ctx.provide('dshHomePath', dshHomePath)` is installed by app-boot
before any entry mounts. The same pattern ships in the upstream base
bundle at `packages/bundle/base/cordis.patch.yml` line 113 for the
`storage-json` row.

### Real binding table by code

| Used in this repo | Reads from | Signature (live DSH) |
|---|---|---|
| `src/client/index.ts:buildHostSurface` → `ctx.slots.resolve('shell.overlay')` | `ctx.slots` (Cordis) | returns the `shell.overlay` slot's first declared child row, or `undefined` if `ui-layout` is missing |
| `src/client/index.ts:listCommands(ctx, agent)` | `ctx.commands` (`@deepseek-ai/dsh-client-ui-commands`) | `command.list({sessionId})` → `CommandDescriptorView[]` |
| `src/client/index.ts:executeCommand(ctx, agent, line, signal)` | `ctx.commands` | `command.execute({sessionId, line, images, signal})` → `CommandResult` |
| `src/client/index.ts:listSessions(ctx, signal)` | `ctx.sessions` (`@deepseek-ai/dsh-client-ui-sessions`) | `sessions.list({sessionId?, signal?})` → `SessionSummary[]` |
| `src/client/index.ts:getCurrentSession(ctx)` | `ctx.sessions` | `sessions.current({sessionId?})` → `SessionSummary | undefined` |
| `src/client/index.ts:listModels(ctx, sessionId, signal)` | `ctx.modelDirectories` (`@deepseek-ai/dsh-client-ui-model-selection`) | `session.models({sessionId, signal?})` → `ModelGroup[]` |
| `src/client/index.ts:selectModel(ctx, sessionId, sel)` | `ctx.modelDirectories` | `session.selectModel({sessionId, selection})` |
| `src/client/index.ts:searchSessions(ctx, q, signal)` | `ctx.sessionQuery` (`@deepseek-ai/dsh-tool-session-query`) | `sessionQuery.searchSessions({query, signal?})` → `SessionSearchHit[]` |
| `src/client/index.ts:searchEvents(ctx, sessionId, q, signal)` | `ctx.sessionQuery` | `sessionQuery.searchEvents({sessionId, query, signal?})` → `EventSearchHit[]` |

## Deviations recorded

### D1. Conversation Hits are a release prerequisite (NOT optional)

**Spec §4.5** allows the Conversation Hits provider to be silently
absent. In V1 we deliberately reverse this: Conversation Hits are
a hard prerequisite. The plugin's `cordis.patch.yml` activates the
shipped `session-query-sqlite` row with a persistent FTS path and
`openAt: first-search`, so Conversation Hits populate out of the
box without the user installing any additional plugin (notably
without `dsh-session-workbench`).

### D2. `dsh-session-kb` → `dsh-session-workbench`

**Spec §2 conflict matrix** lists `dsh-session-kb`. The actual
maintained fork is `dsh-session-workbench`. Universal Palette does
not depend on either package; the spec's reference is informational.

### D3. `!!js dshHomePath(...)` for the FTS path

The DSH patch parser does not perform shell-style variable
expansion; a literal `${DSH_HOME}/...` would be passed verbatim to
`openSearchDatabase(path, ...)` and fail to resolve. The
DSH-official way to compose a DSH_HOME-relative path in entry
config is the `!!js dshHomePath(...)` expression. The `dshHomePath`
helper is provided to `!!js` expressions via `ctx.dshHomePath`
(installed by `app-boot` before any entry mounts).

### D4. No public `registerProvider()` contract

**Spec §6.2** suggested a public third-party provider registration
contract. V1 deliberately does not ship this contract — it would
duplicate `dsh-command-palette`'s register/collect/subscribe
service. Third-party plugins extend DSH native services instead.

### D5. No `document.body` fallback for UI mount

**Spec §8.2** allowed a fallback to `document.body.appendChild()`
when `shell.overlay` was absent. V1 deliberately fails closed:
without `shell.overlay`, the palette disables itself. There is no
DOM mutation, no fallback, no scraping. The activator registers
the Component in the slot chain; if the slot is absent, the shell
does not render the Component and the user knows the slot is
missing.

### D6. No ambient `@deepseek-ai/cordis` runtime dependency

The activator imports `Context` from `@deepseek-ai/cordis` for
type purposes only. The runtime resolution is the host's
responsibility: the DSH shell provides the module via the lazy-CJS
module table. Universal Palette ships a `types-cordis.d.ts`
ambient declaration so typecheck passes without the workspace
package; the real types come from the host at activation time.

## Runtime compatibility matrix

| DSH profile state | Capability report | Result |
|---|---|---|
| Full `web` profile + plugin patch activating `session-query-sqlite` | all P0 capabilities true | Full palette, Conversation Hits populated from FTS |
| `web` profile without `shell.overlay` declared | `shellOverlaySlot=false` | Palette disables itself; capability report still exposed |
| `web` profile without a current session | `modelDirectory=true`, items empty | Model provider returns 0 items |
| `headless` / `sdk` profile | n/a | Plugin does not load — `dsh.client: web`-only |
| Custom profile with `ui-layout` absent | `shellOverlaySlot=false` | Palette disabled (fail closed) |

## Open items deferred (NOT part of V1 release contract)

- Per-item hotkey recording inside the palette.
- Image-bearing command actions.
- UI for Hide / Alias / per-provider toggle (the store methods
  exist as optional surfaces, not part of V1 P0).
- Async capability probe (the probe is currently synchronous —
  matches the DSH wire contract where service reads are sync at
  activation time).
