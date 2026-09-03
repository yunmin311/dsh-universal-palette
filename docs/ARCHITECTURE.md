# Architecture

DSH Universal Palette follows the host architecture split documented in
`packages/client/README.md` and the [Cordis plugin development skill]
in `apps/cli/config/agent-presets/cordis/skills/`. The host half is
empty (browser-only capability); the browser half is the entire
product.

```
┌─ Host ──────────────────────┐   ┌─ Browser ─────────────────────────────────────────┐
│ Cordis tree                │   │ client cordis root ctx                             │
│ sessions/agents/SessionLog │◀─▶│  ├ dsh-universal-palette plugin                    │
│ Connection + Gateway       │   │  │  ├ host (empty apply)                            │
│ webserver                  │   │  │  └ client (mounted as `lib/client.js`)           │
└────────────────────────────┘   │  │     ├ Capability probe                           │
                                 │  │     ├ Providers (one per capability)             │
                                 │  │     ├ Aggregator (query, abort, debounce, rank)  │
                                 │  │     ├ Preferences store (frecency, pin, hide, …) │
                                 │  │     └ UniversalPalette (DOM overlay)             │
                                 │  └ ui-renderer (React root, not used by us)        │
                                 └────────────────────────────────────────────────────┘
```

## Capability probe (Phase A)

`probe(host)` runs once at activation. It records:

- `commands` (host `command.list`/`find`/`execute`)
- `sessions` (host `sessions.list`/current/open)
- `workspaces`
- `modelDirectory` (host `ctx.modelDirectories.list` + `session.selectModel`)
- `sessionQuery` (host `ctx.sessionQuery`; opt-in per
  `packages/session-query/tool-session-query/README.md`)
- `skills` (host `skills/list`)
- `referenceSource` (host reference seam)
- `theme` (`ctx.theme` snapshotter)
- `shellOverlaySlot` (whether the DSH version declares this child slot)
- `thirdPartyProviders` (whether the host exposes a registry seam)

Each provider factory returns `null` when its capability is missing.
The aggregator collects only what exists. The capability report is
exposed via `client.capabilityReport()` and through `onReady` for
diagnostics + the third-party registry.

## Aggregator lifecycle

```text
input change
  ├─ debounce 28 ms
  ├─ AbortController per query
  ├─ emit "loading"
  ├─ collect from each enabled provider (concurrent)
  │   └─ soft deadline 600 ms; provider past deadline: failure row
  ├─ rank (text + context + frecency + pin + providerHint)
  ├─ hard cap 40
  └─ emit "ready" / "empty"
```

Each `setQuery()` call cancels any previous in-flight query before
starting the new one. Provider failures are contained; the UI shows
one thin status row per failed provider without closing the palette.

## Ranking

`final = 0.46·text + 0.19·context + 0.15·frecency + 0.10·pin + 0.10·hint`

- `text`: deterministic subsequence + prefix + alias (see
  `ranking/fuzzy.ts`).
- `context`: same workspace (+0.55), same session (+0.25), same model
  provider (+0.20), normalized to [0, 1].
- `frecency`: `log10(1 + count) · 0.5^(age / 7d)` — see
  `ranking/frecency.ts`.
- `pin`: 1.0 when pinned, else 0.
- `hint`: 1.0 for command/action kinds when `>` prefix is on, else 0.

Exact title / exact alias overrides bump a result to positions 1-2 even
when the weighted score would put them lower (spec §7).

## Providers

| Provider | Source | Pinned? | Graceful degradation |
|---|---|:---:|---|
| `commands` | `host.commands.list({sessionId})` | ✅ | Missing → not registered |
| `sessions` | `host.sessions.list` | ✅ | Missing → not registered |
| `models` | `host.modelDirectory.list` | ✅ | Empty current session → empty result |
| `conversation-hits` | `host.sessionQuery.searchSessions` | ✅ | FTS missing → not registered; FTS throws → empty result |
| `skills` | `host.skills.list` | ✅ | Missing → not registered; `userInvocable: false` filtered |
| `third-party` | `paletteRegistry.register()` | ✅ | Disposer returned |

The `>` prefix is a hint, not a hard filter — we still consult every
provider, but command/action items get a small ranking boost.

## UI

- Pure DOM, no React / Preact / lit (DSH shell provides React for its
  own components; we do not require it).
- Token-driven via `--dsh-*` / `--dsw-*` (per
  `packages/client/ui-theme/README.md`).
- Three glass intensities (`solid`, `soft`, `glass`) — the default is
  `soft`. `prefers-reduced-motion`, `prefers-contrast: more`, and
  `not (backdrop-filter)` are honored automatically.
- IME-safe: `compositionstart` / `compositionend` flag the input
  element; `Enter` / `Arrow` / `Esc` are no-ops during composition.
- Focus restore on close: we save `document.activeElement` on open
  and restore it on close.
- Slot mount: when `ctx.slots` exposes a `shell.overlay` child slot
  (per `packages/client/ui-layout/README.md`), the activator mounts
  there; otherwise it falls back to `document.body` and the overlay
  z-index is high enough that it sits above the DSH shell.

## Persistence

V1 preferences (frecency, pins, hides, aliases, glass intensity,
shortcut, provider visibility) persist to `localStorage` under the
`dsh-universal-palette` namespace. The activator does not own a
custom database; if the host exposes a settings service, the
`PreferencesBackend` adapter can be swapped without touching the
`PreferencesStore` API.

## Disposal

`handle.dispose()`:

1. Removes the global `keydown` listener (`capture: true`).
2. Unsubscribes aggregator + preferences listeners.
3. Cancels in-flight queries.
4. Removes the host element from its parent (zero DOM residue).
5. Clears the localStorage adapter's in-memory cache.

The plugin can be re-installed and re-activates cleanly without
restarting the DSH host.

## Public extension contract (V1)

```ts
interface PaletteProvider {
  readonly id: string
  readonly label: string
  readonly availability?: 'ready' | 'degraded' | 'unavailable'
  collect(input: PaletteCollectInput, signal: AbortSignal):
    Promise<PaletteItem[]> | PaletteItem[]
  subscribe?(invalidate: () => void): () => void
}
```

Anything that returns `PaletteItem[]` from `collect()` integrates
immediately. No SDK, no extra registration ceremony, no per-item
schema validation — V1 is intentionally tiny (spec §6.2).

## Performance characteristics

- Warm open: < 100 ms (target, no measurement here — browser only).
- Local provider collect (commands, sessions, models): synchronous
  in tests; in the wire the browser-side adapter pre-warms the cache
  on activation.
- Provider with FTS (session query): hard-capped by `maxSearchResults`
  on the host side; aggregator caps at 40.
- Soft deadline: 600 ms by default; configurable via
  `AggregatorOptions.softDeadlineMs`.
- Bundle size: `dist/client.js` ≈ 45 kB ungzipped (12 kB gzipped),
  including CSS.
