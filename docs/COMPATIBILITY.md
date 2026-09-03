# Compatibility Notes

This document records every place where the spec (`docs/DSH-UNIVERSAL-
PALETTE-SPEC.md`) and the real DeepSeek Harness API surface diverge,
plus the runtime compatibility matrix.

## DSH API references verified against the public source

| Spec claim | Source-of-truth | Status |
|---|---|:---:|
| `ctx.commands` is a `CommandRuntime` | `docs/subsystems/commands.md` § Cordis API | ✅ confirmed |
| Command execute is `@Remote async execute(agent, line, images, signal)` | same | ✅ confirmed (browser-side wire adapter lives in `packages/client/ui-commands/README.md`) |
| `ctx.modelDirectories` + `session.selectModel` | `packages/client/ui-model-selection/README.md` | ✅ confirmed |
| `ctx.sessionQuery` is opt-in (not mounted by default) | `packages/session-query/tool-session-query/README.md` | ✅ confirmed |
| Theme tokens are `--dsw-*` / `--dsh-*` | `packages/client/ui-theme/README.md` | ✅ confirmed |
| `shell.overlay` is a declared child slot of `AppFrame` | `packages/client/ui-layout/README.md` | ✅ confirmed |
| Slot system: `ctx.slots.register({ name, children, store, inject }, Component)` | `.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md` | ✅ confirmed |
| Client packages live under `src/client/`; build artifact is `lib/client.js`; `exports["./client"]` | `packages/client/README.md` | ✅ confirmed (we use `dist/client.js` to match `tsdown` defaults) |
| DSH is currently developer-preview; breaking changes possible | `docs/architecture.md` | ✅ confirmed |

## Deviations from the spec

These are explicit, recorded deviations. None change product semantics.

### D1. Browser-side command execution path

**Spec §8.3** assumes `ctx.commands.execute` is available in the
browser plugin tree. The DSH source shows the browser-side adapter for
slash commands lives in `packages/client/ui-commands` and exposes a
client contract (`ctx.commandUi`). Command execution is a wire RPC
under the hood.

**Resolution:** Universal Palette takes `host.commands.execute` as a
`HostSurface` parameter and uses it as-is. The activator maps the DSH
browser-side wire contract (e.g. `command.execute({sessionId, line,
images, signal})`) into the `HostSurface` shape. The wire contract
itself is owned by `ui-commands`, which we do not duplicate.

### D2. Conversation Hits degrade without `ctx.sessionQuery`

**Spec §4.5** allows the Conversation Hits provider to be silently
absent. The DSH source confirms `ctx.sessionQuery` is opt-in; when
absent, our provider simply is not registered. The aggregator reports
the missing provider through `capabilityReport.sessionQuery = false`
and the UI shows no Conversation Hits row.

### D3. `dsh-session-kb` → `dsh-session-workbench`

**Spec §2 conflict matrix** lists `dsh-session-kb`. The actual
maintained fork has been renamed to `dsh-session-workbench`
(`github.com/PolinniZhong/dsh-session-workbench`). Universal Palette
does not depend on either package; the spec's reference to either is
informational.

### D4. Glass CSS uses `color-mix(in srgb, …)` + `backdrop-filter`

**Spec §5.2** sketches one CSS block. We honor the same intent but
the production stylesheet lives as a string literal in
`src/client/ui/styles/palette-css.ts` (Vite's `?inline` is not
available in tsdown). All visual tokens still resolve to DSH design
tokens.

### D5. `palette-css.ts` string vs `?inline` import

Bundling CSS as a JS string is a build-tool choice, not a semantic
change. We avoid `?inline` so the project builds with `tsdown`
without requiring Vite.

### D6. Capability probe is non-async

**Spec §13 Phase A** describes the probe as a "compatibility matrix"
without a return-shape contract. The DSH wire adapter is synchronous
in the browser (`command.list` returns a cached snapshot from the
per-session `CommandDirectory`). We model `probe()` as a synchronous
function returning `CapabilityProbe`. Asynchronous surface checks (if
DSH ever exposes one) are an additive change.

### D7. `host.commands.execute` receives `(agent, line, signal)`

The wire adapter passes `images` separately in the host contract; the
V1 palette does not yet plumb image attachments through its primary
command action. That is a Phase-D feature and does not change V1's
federation surface.

## Runtime compatibility matrix

| DSH profile state | Capability report | Result |
|---|---|---|
| Full `web` profile + `dsh-tool-session-query` mounted + persistent FTS | all `true` | Full palette, Conversation Hits populated |
| Full `web` profile, `dsh-tool-session-query` not mounted | `sessionQuery=false` | Palette works; Conversation Hits category hidden |
| `web` profile without a current session | `modelDirectory=true`, items empty | Model provider returns 0 items (no fake items) |
| `headless` profile | n/a | Plugin does not load — `dsh.client` is `web`-only |
| Custom profile with `ui-layout` absent | `shellOverlaySlot=false` | Fallback mounts to `document.body` with high z-index |

## Browser support

Universal Palette targets modern evergreen Chromium (the DSH Web
client's runtime). CSS uses `backdrop-filter` (with `@supports not`
fallback to solid), `color-mix` (graceful fallback to the previous
solid color), `prefers-reduced-motion`, `prefers-contrast: more`, and
the standard CSS Custom Properties cascade.

## Network surface

The plugin opens **zero** network connections at runtime. All
provider data comes from the host's wire RPC, which the DSH Web
shell already opens. Frecency / pin / hide / alias / shortcut /
glass-intensity records live in `localStorage` only.

## Coexistence matrix

Verified by reading the upstream README files:

| Plugin present | Universal Palette behavior |
|---|---|
| `dsh-spotlight` | Default shortcut does not collide; both palettes coexist; Universal Palette does not scrape DOM |
| `dsh-command-palette` | Default shortcut does not collide |
| `dsh-session-workbench` (or `dsh-session-kb`) | Both can consume `ctx.sessionQuery`; Universal Palette does not call it twice — the host caches |
| `dsh-reference-anything` | Both plugins coexist; Universal Palette surfaces Reference as one secondary action and never edits `@`-pipeline behavior |
| `dsh-model-palette` | Different shortcut (Ctrl/Cmd+Shift+K vs Alt+M); Universal Palette does not duplicate the provider rail or config panel |
| `dsh-codex-ui` | Universal Palette is an additive overlay; the host chrome remains whatever the user has installed |

## Open items deferred to V1.1

- Per-item hotkey recording inside the palette (spec §9).
- `ctx.theme` reactive updates when the user switches the color
  scheme while the palette is open.
- Provider-side `subscribe(invalidate)` invalidation — V1 providers
  use the host's own change events and re-emit at query time.
