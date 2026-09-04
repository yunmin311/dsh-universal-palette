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
this single SHA. Behavior on a different SHA is not characterized by
the V1 release contract.

## Real API binding table

This table is the single source of truth. Each row is a real public
binding, traced to a file in this repository and to the upstream DSH
package that defines it.

| Binding | Upstream package (SHA `76fda72…`) | Source-of-truth doc | Used in (this repo) | Adapter shape |
|---|---|---|---|---|
| `shell.overlay` (UI mount) | `@deepseek-ai/dsh-client-ui-layout` | `packages/client/ui-layout/README.md` — declares `shell.overlay` as a child slot of `AppFrame` | `src/client/index.ts:ClientCtx.overlay.shellOverlayRoot` + `src/client/UniversalPalette.ts` | The activator's caller resolves the slot via `ctx.slots.renderSlot('shell.overlay')` and passes the returned element in. The palette mounts there or disables itself. |
| `commandUi` (slash command discovery + dispatch) | `@deepseek-ai/dsh-client-ui-commands` | `packages/client/ui-commands/README.md` — `ctx.commandUi.register(name, spec)`, `decorate(name, spec)`; wire `command.list({sessionId})`; `command.execute({sessionId, line, images, signal})` | `src/client/capabilities.ts:CommandCapability.list / find / execute` → `src/client/providers/commands.ts:buildCommandItem` | The browser-side adapter exposes a `host.commands` shape (`{ list, find, execute }`). Universal Palette calls `host.commands.execute(agent, '/' + name, signal)` for primary. |
| `modelDirectories` + `session.selectModel` | `@deepseek-ai/dsh-client-ui-model-selection` | `packages/client/ui-model-selection/README.md` — per-session provider-grouped directory; `session.models` for read; `session.selectModel` for write | `src/client/capabilities.ts:ModelDirectoryCapability.list / select` → `src/client/providers/models.ts` | `host.modelDirectory.list(sessionId, signal)` returns `ModelGroup[]`; `host.modelDirectory.select(sessionId, selection)` submits a `ModelSelectionView` with provider/model/effort. |
| `sessions` (list + open) | `@deepseek-ai/dsh-client-ui-session` + core session log | `docs/architecture.md` core subsystems table — `ctx.sessions` | `src/client/capabilities.ts:SessionCapability` → `src/client/providers/sessions.ts` | `host.sessions.list(signal)` returns summaries; `host.sessions.open(id)` opens the session in the host UI. |
| `sessionQuery` (full-text search) | `@deepseek-ai/dsh-tool-session-query` + `@deepseek-ai/dsh-session-query-sqlite` | `packages/session-query/tool-session-query/README.md` + `packages/session-query-sqlite/README.md` — `ctx.sessionQuery.searchSessions`, `ctx.sessionQuery.searchEvents` | `src/client/capabilities.ts:SessionQueryCapability` → `src/client/providers/conversation-hits.ts` | `host.sessionQuery.searchSessions(query, signal)` returns `SessionSearchHit[]` with title + snippet + updatedAt. |

### Plugin patch — the one row the plugin overrides

| Row id | What we override | Source-of-truth |
|---|---|---|
| `session-query-sqlite` | `config.path` (persistent, absolute under `DSH_HOME`) + `config.openAt: first-search` | `packages/session-query-sqlite/README.md` — shipped row, default `openAt: never` |

This is exactly one override entry in `cordis.patch.yml`. It activates
the persistent FTS index so Conversation Hits populate without the user
installing `dsh-session-workbench`.

### `config.path` resolution (verified against locked SHA)

The override uses a DSH `!!js` expression — NOT a string literal and
NOT a shell-style `${DSH_HOME}` substitution. The DSH patch parser
does not perform shell variable expansion; the `session-query-sqlite`
Config schema validates `path` as a plain non-blank string and the
upstream `openSearchDatabase(path, ...)` (in
`packages/session-query/session-query-sqlite/src/schema.ts` at the
locked SHA) calls `path.resolve(path)` only on non-`:memory:` values,
without further substitution. A literal `${DSH_HOME}/...` would be
passed verbatim to `path.resolve` and would fail to resolve to a
real directory.

The supported way to compose DSH_HOME-relative paths in entry
config is a `!!js` expression that calls the official `dshHomePath`
helper from `@deepseek-ai/dsh-home-paths`. The same pattern ships
in the upstream base bundle at the locked SHA
(`packages/bundle/base/cordis.patch.yml`, line 113):
`root: !!js dshHomePath('storages')` for the `storage-json` row.

`dshHomePath` is provided to `!!js` expressions via the `Context`
module augmentation in
`packages/boot/app-boot/src/index.ts` at the locked SHA:
`ctx.dshHomePath` is installed by `app-boot` before any entry
mounts (line 138 of `app-boot/src/index.ts`:
`ctx.provide('dshHomePath', dshHomePath)`). The helper itself
(`packages/util/home-paths/src/index.ts` at the locked SHA)
resolves `$DSH_HOME` (or `~/.dsh` when unset) and joins segments
via Node's `path.join` — returning an absolute path.

Our patch value:

```yaml
- id: session-query-sqlite
  config:
    path: !!js dshHomePath('session-query.sqlite')
    openAt: first-search
```

The `!!js` tag at the start of the value makes the YAML parser
produce an expression node (`{ __jsExpr: '...' }`) which the
Loader's `internal/config` interpolation evaluates at entry
activation against the ctx the activator has populated. The
result is a plain non-blank string which `resolveConfig` in
`packages/session-query/session-query-sqlite/src/index.ts` at the
locked SHA accepts as the FTS path.

A test in `tests/integration/cordis-patch.test.ts` proves:
- The patch's `path` is a `!!js` expression node (not a string literal).
- The expression source text contains no shell-variable reference
  (`$` character) and starts with `dshHomePath(`.
- Evaluating the expression against a small sandboxed helper that
  mirrors `dshHomePath` from `@deepseek-ai/dsh-home-paths`
  produces an absolute path ending in `session-query.sqlite` that
  starts with the resolved home — not the literal `${DSH_HOME}/...`
  string.

This is the closest unit-level evidence we can produce without
spinning up the full DSH boot graph. The upstream covers the
full live Loader path in
`packages/session-query/session-query-sqlite/tests/load-path.e2e.ts`
(against the real home-paths helper, real `dsh` test launcher, real
`ctx.dshHomePath` injection).

### Bindings Universal Palette does NOT use

These are real DSH capabilities but **not** used by Universal Palette
in V1:

- `ctx.skills` (catalog) — present in capabilities probe, but the
  Skills provider is an optional surface, not part of V1 P0.
- `ctx.referenceSource` — same.
- `@` reference pipeline (`@deepseek-ai/dsh-client-ui-reference`) —
  Universal Palette surfaces a Reference **secondary action** but
  does not hook into the `@` pipeline itself.
- `ctx.jobs`, `ctx.goals`, `ctx.agents`, `ctx.locale`, `ctx.layout`,
  `ctx.commandDirectory`, etc. — out of scope for V1.

## Deviations recorded

These are the deviations from spec `docs/DSH-UNIVERSAL-PALETTE-SPEC.md`
that the V1 release keeps. None change the V1 P0 product semantics.

### D1. Browser-side command execution path

**Spec §8.3** assumes `ctx.commands.execute` is available directly in
the browser plugin tree. The DSH source shows the browser-side
adapter for slash commands lives in
`@deepseek-ai/dsh-client-ui-commands` and exposes a client contract
(`ctx.commandUi`). Command execution is a wire RPC under the hood.

**Resolution:** Universal Palette takes `host.commands.execute` as a
`HostSurface` parameter and uses it as-is. The activator maps the DSH
browser-side wire contract (e.g. `command.execute({sessionId, line,
images, signal})`) into the `HostSurface` shape. The wire contract
itself is owned by `ui-commands`, which we do not duplicate.

### D2. Conversation Hits are a release prerequisite (NOT optional)

**Spec §4.5** allows the Conversation Hits provider to be silently
absent. In V1 we deliberately reverse this: Conversation Hits are a
hard prerequisite. The plugin's `cordis.patch.yml` activates the
shipped `session-query-sqlite` row with a persistent FTS path and
`openAt: first-search`, so Conversation Hits populate out of the box
without the user installing any additional plugin (notably without
`dsh-session-workbench`).

### D3. `dsh-session-kb` → `dsh-session-workbench`

**Spec §2 conflict matrix** lists `dsh-session-kb`. The actual
maintained fork is `dsh-session-workbench`. Universal Palette does
not depend on either package; the spec's reference is informational.

### D4. Glass CSS as a string literal

**Spec §5.2** sketches one CSS block. We honor the same intent but
the production stylesheet lives as a string literal in
`src/client/ui/styles/palette-css.ts` (Vite's `?inline` is not
available in tsdown). All visual tokens still resolve to DSH design
tokens (`--dsh-*`, `--dsw-*`).

### D5. Capability probe is non-async

**Spec §13 Phase A** describes the probe as a "compatibility matrix"
without a return-shape contract. The DSH wire adapter is synchronous
in the browser (`command.list` returns a cached snapshot from the
per-session `CommandDirectory`). We model `probe()` as a synchronous
function returning `CapabilityProbe`. Asynchronous surface checks are
an additive change.

### D6. `host.commands.execute` receives `(agent, line, signal)`

The wire adapter passes `images` separately in the host contract; the
V1 palette does not plumb image attachments through its primary
command action. Deferred.

### D7. No public `registerProvider()` contract

**Spec §6.2** suggested a public third-party provider registration
contract. V1 deliberately does not ship this contract — it would
duplicate `dsh-command-palette`'s register/collect/subscribe service.
Third-party plugins extend DSH native services instead.

### D8. No `document.body` fallback for UI mount

**Spec §8.2** allowed a fallback to `document.body.appendChild()`
when `shell.overlay` was absent. V1 deliberately fails closed:
without `shell.overlay`, the palette disables itself. This is
release-blocker closure item 5.

## Runtime compatibility matrix

| DSH profile state | Capability report | Result |
|---|---|---|
| Full `web` profile + plugin patch activating `session-query-sqlite` | all P0 capabilities true | Full palette, Conversation Hits populated from FTS |
| `web` profile without `shell.overlay` declared | `shellOverlaySlot=false` | Palette disables itself; capability report still exposed |
| `web` profile without a current session | `modelDirectory=true`, items empty | Model provider returns 0 items |
| `headless` / `sdk` profile | n/a | Plugin does not load — `dsh.client: web`-only |
| Custom profile with `ui-layout` absent | `shellOverlaySlot=false` | Palette disabled (fail closed) |

## Network surface

The plugin opens **zero** network connections at runtime. All provider
data comes from the host's wire RPC, which the DSH Web shell already
opens. Frecency / pin / shortcut / glass-intensity records live in
`localStorage` only.

## Coexistence matrix

| Plugin present | Universal Palette behavior |
|---|---|
| `dsh-spotlight` | Default shortcut does not collide; both palettes coexist; Universal Palette does not register as a host command, so `/spotlight` is unaffected |
| `dsh-session-workbench` | Universal Palette consumes the **same** activated `session-query-sqlite` row. No double FTS build — the index lives at `${DSH_HOME}/session-query.sqlite`. |
| `dsh-reference-anything` | Both plugins coexist; Universal Palette surfaces Reference as one secondary action and never edits `@`-pipeline behavior |
| `dsh-model-palette` | Universal Palette's Model provider calls `session.selectModel` — does not duplicate the provider rail or config panel |
| `dsh-command-palette` | Default shortcut does not collide |
| `dsh-codex-ui` | Universal Palette is an additive overlay; the host chrome remains whatever the user has installed |

## Open items deferred (NOT part of V1 release contract)

- Per-item hotkey recording inside the palette.
- Image-bearing command actions (D6).
- UI for Hide / Alias / per-provider toggle.
- Async capability probe (D5).
