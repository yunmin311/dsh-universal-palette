# Architecture

DSH Universal Palette follows the host architecture split documented in
`packages/client/README.md` and the slot-system standard note
(`.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md`).
The host half is empty (browser-only capability); the browser half is
the entire product.

## Locked compatibility baseline

This release is verified against the **exact** upstream SHA:

| | |
|---|---|
| Upstream | `deepseek-ai/deepseek-harness` |
| SHA | `76fda729799fe9b3848dbe2c211d4b231032b81e` |
| Root package version | `0.1.2-rc.1` |

Other DSH versions are best-effort / unverified. Compatibility is not
guaranteed for any other SHA.

## Host / Browser split

```
┌─ Host ──────────────────────┐   ┌─ Browser ─────────────────────────────────────────┐
│ Cordis tree                │   │ client cordis root ctx                             │
│ sessions/agents/SessionLog │◀─▶│  ├ dsh-universal-palette plugin                    │
│ Connection + Gateway       │   │  │  ├ host (empty apply)                            │
│ webserver                  │   │  │  └ client (mounted as `dist/client.js`)          │
│ session-query-sqlite       │   │  │     ├ Capability probe                           │
│   (overridden by patch)    │   │  │     ├ Providers (one per native capability)      │
└────────────────────────────┘   │  │     ├ Aggregator (query, abort, debounce, rank)  │
                                 │  │     ├ Preferences store (frecency, pin)          │
                                 │  │     └ UniversalPalette (DOM overlay via Slot)    │
                                 │  └ ui-renderer (React root, not used by us)        │
                                 └────────────────────────────────────────────────────┘
```

## Capability probe

`probe(host)` runs once at activation. It records:

- `commands` (host `command.list`/`find`/`execute`)
- `sessions` (host `sessions.list`/current/open)
- `workspaces`
- `modelDirectory` (host `ctx.modelDirectories.list` + `session.selectModel`)
- `sessionQuery` (host `ctx.sessionQuery`; activated by the plugin's
  own `cordis.patch.yml` enabling `session-query-sqlite` with
  `openAt: first-search`)
- `skills` — optional surface, not part of V1 P0
- `referenceSource` — optional surface, not part of V1 P0
- `theme` (`ctx.theme` snapshotter)
- `shellOverlaySlot` (whether the DSH version declares this child slot)

Each provider factory returns `null` when its capability is missing.
The aggregator collects only what exists. The capability report is
exposed via `client.capabilityReport()` and through `onReady` for
diagnostics.

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
  `ranking/fuzzy.ts`). Alias is optional surface; not part of V1 P0.
- `context`: same workspace (+0.55), same session (+0.25), same model
  provider (+0.20), normalized to [0, 1].
- `frecency`: `log10(1 + count) · 0.5^(age / 7d)`.
- `pin`: 1.0 when pinned, else 0.
- `hint`: 1.0 for command/action kinds when `>` prefix is on, else 0.

Exact title / exact alias overrides bump a result to positions 1-2 even
when the weighted score would put them lower.

## Providers (V1 P0)

| Provider | Source | Required? |
|---|---|:---:|
| `commands` | `host.commands.list({sessionId})` | ✅ P0 |
| `sessions` | `host.sessions.list` | ✅ P0 |
| `models` | `host.modelDirectory.list` | ✅ P0 |
| `conversation-hits` | `host.sessionQuery.searchSessions` | ✅ P0 |
| `skills` | `host.skills.list` | optional |
| `third-party registry` | removed in V1 | ❌ |

The `>` prefix is a hint, not a hard filter — we still consult every
provider, but command/action items get a small ranking boost.

## UI mount

The activator receives `ctx.overlay.shellOverlayRoot` from its caller
(production: resolved through `ctx.slots`; tests: a fabricated
element). Universal Palette mounts only there.

If `shellOverlayRoot` is `null`, the palette is **disabled** — no
`document.body` fallback, no DOM mutation, no `appendChild` to the
host's chrome. This is release-blocker closure item 5.

The DOM root is token-driven via `--dsh-*` / `--dsw-*`. The glass
treatment has three intensities (`solid`, `soft`, `glass`); `soft` is
the default. `prefers-reduced-motion`, `prefers-contrast: more`, and
`not (backdrop-filter)` are honored automatically.

## Persistence

V1 P0 preferences (frecency, pins) persist to `localStorage` under the
`dsh-universal-palette` namespace. The activator does not own a custom
database. The store also keeps `hides`, `aliases`, and `provider`
visibility records as optional surfaces, but the V1 UI does not
expose their inputs.

## Disposal

`handle.dispose()`:

1. Removes the global `keydown` listener (`capture: true`).
2. Unsubscribes aggregator + preferences listeners.
3. Cancels in-flight queries.
4. Removes the host element from its parent (zero DOM residue).
5. Clears the localStorage adapter's in-memory cache.

The plugin can be re-installed and re-activates cleanly without
restarting the DSH host.

## Public extension contract

There is **no public `registerProvider()` API in V1**. Third-party
plugins extend DSH native services (commands, models, etc.); Universal
Palette picks them up via the same native provider pipeline. An
internal `paletteRegistry` exists only as a private implementation
detail for the aggregator (release-blocker closure item 4).

## Performance characteristics

- Warm open: < 100 ms target (browser only; no automated harness here).
- Local provider collect (commands, sessions, models): synchronous
  in tests; in the wire the browser-side adapter pre-warms the cache
  on activation.
- Provider with FTS (session query): hard-capped by `maxSearchResults`
  on the host side; aggregator caps at 40.
- Soft deadline: 600 ms by default.
- Bundle size: `dist/client.js` ≈ 45 kB ungzipped (12 kB gzipped),
  including CSS.
