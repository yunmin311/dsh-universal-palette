# IMPLEMENTATION_REPORT — dsh-universal-palette v0.1.0

**Status:** V1 release-blocker closure complete
**Date:** 2026-09-03
**Spec:** `docs/DSH-UNIVERSAL-PALETTE-SPEC.md` (v0.9)
**Build / Typecheck / Tests:** all green (see "Verified commands" below)

## Locked compatibility baseline

| | |
|---|---|
| Upstream | `deepseek-ai/deepseek-harness` |
| SHA | `76fda729799fe9b3848dbe2c211d4b231032b81e` |
| Root package version | `0.1.2-rc.1` |

Verified against this exact SHA, not `latest master`.

---

## Release-blocker closure — what changed this round

### 1. Conversation Hits: optional degradation → release hard prerequisite

Before: `cordis.patch.yml` did not mount `session-query`; Conversation
Hits populated only if the user had already mounted the package or
installed `dsh-session-workbench`. After: the plugin's
`cordis.patch.yml` overrides the shipped `session-query-sqlite` row
with:

```yaml
- id: session-query-sqlite
  config:
    path: ${DSH_HOME}/session-query.sqlite
    openAt: first-search
```

The path is an absolute filesystem location (no `~/` expansion, no
`:memory:`). `openAt: first-search` is the only setting that opens
the FTS index lazily enough to keep host boot fast while ensuring
Conversation Hits populate without user setup.

Universal Palette does **not** ship its own FTS index, does **not**
copy `dsh-session-kb` / `dsh-session-workbench`, and does **not**
duplicate any index data.

If at any future time the plugin patch mechanism fails to apply this
override, the V1 verdict drops to `NO_GO` per the original closure
rule.

### 2. Compatibility baseline locked to exact SHA + DSH version

All docs (`README`, `docs/COMPATIBILITY.md`, `docs/ARCHITECTURE.md`,
this report) cite the exact SHA `76fda729799fe9b3848dbe2c211d4b231032b81e`
and the root package version `0.1.2-rc.1`. No "latest master", no
"0.1.x" ambiguity.

### 3. V1 P0 contract shrunk

V1 P0 is exactly:

- Commands
- Sessions
- Models
- Conversation Hits
- Action Panel
- Deterministic context / frecency ranking

Skills, References, Alias, Hide remain in the code as **optional /
non-blocking** surfaces. They are not part of the V1 release gate.

### 4. Public `registerProvider()` contract deleted

- `src/client/providers/registry.ts` was renamed to
  `createInternalProviderRegistry()` and is a private implementation
  detail for the aggregator only. It is **not** exposed on `ClientCtx`.
- `CapabilityProbe.thirdPartyProviders` and
  `HostSurface.hasPaletteRegistry` are removed.
- The README + contract files no longer mention third-party provider
  registration.
- `dsh-command-palette`'s `register/collect/subscribe` service is not
  duplicated.

Third-party plugins extend DSH native services instead.

### 5. `document.body` fallback removed

- `activateClient({...overlay: {shellOverlayRoot: ...}})` requires
  the caller to resolve the Slot. There is no `rootContainer ?? document.body`.
- When `shellOverlayRoot` is `null`, `client.isMounted()` returns
  `false` and no DOM mutation occurs on `document.body`.
- The integration test
  `tests/integration/client-activation.test.ts` includes the
  fail-closed case.

### 6. Real binding table documented

`docs/COMPATIBILITY.md` § "Real API binding table" lists each binding
this plugin actually uses, the upstream package (SHA `76fda72…`),
the source-of-truth doc URL, the file in this repo that consumes it,
and the adapter shape. No spec-example names remain that don't map to
a real DSH API.

### 7. Verification re-run

- `pnpm run typecheck` → clean
- `pnpm run build` → clean
- `pnpm run test` → **52 / 52 pass**
- New tests added in this round:
  - `tests/integration/client-activation.test.ts` includes
    `activateClient fails closed when shell.overlay is absent` —
    proves no `document.body` mutation when the slot is missing.
  - `tests/integration/cordis-patch.test.ts` — proves the plugin
    patch:
    1. overrides `session-query-sqlite` with a non-empty, non-`:memory:`
       `path` and `openAt: first-search`
    2. registers the `dsh-universal-palette` row
    3. does NOT register any `palette-registry` row

---

## Verified commands

```text
$ pnpm run typecheck
$ tsc --noEmit -p tsconfig.json
(no output)

$ pnpm run build
$ tsdown -c tsdown.config.ts
ℹ entry: src/host/index.ts, src/client/index.ts
ℹ target: es2022
✔ dist/client.js  45.65 kB   gzip: 12.47 kB
✔ dist/index.js    0.51 kB   gzip:  0.34 kB
ℹ Build complete in 24ms

$ pnpm run test
ℹ tests 52
ℹ pass 52
ℹ fail 0
```

---

## V1 P0 acceptance (locked)

| # | Criterion | Status |
|---:|---|:---:|
| 1 | Default shortcut opens / closes; IME safe; focus restored | ✅ |
| 2 | Empty query shows ≤ 7 items (pinned → context → recent) | ✅ |
| 3 | Mixed query returns Command + Session + Model + Conversation Hit | ✅ |
| 4 | Enter primary; Tab/→ Action Panel; Esc hierarchical | ✅ |
| 5 | Command executes via host command plane, no model message | ✅ |
| 6 | Model switches via host `selectModel`; provider hides on absence | ✅ |
| 7 | Conversation Hits populate out of the box (patch activates FTS) | ✅ |
| 8 | Any provider throw / timeout / abort does not close palette | ✅ |
| 9 | Dispose removes listeners / styles / DOM | ✅ |
| 10 | Light/Dark + Solid/Soft/Glass readable | ✅ |
| 11 | Without `shell.overlay`, palette disables (no DOM fallback) | ✅ |
| 12 | Patch enables persistent FTS + `openAt: first-search` | ✅ |

## Known non-blocking limitations

1. `headless` / `sdk` profiles: plugin does not load (browser-only).
2. DSH is in developer preview; breaking changes are possible beyond
   the locked SHA. The plugin targets one SHA — no behavior is
   characterized for other versions.
3. Image-bearing command actions deferred (deviation D6).
4. UI for Hide / Alias / per-provider toggle deferred (optional
   surfaces, not part of V1 P0).
5. Async capability probe not yet implemented (deviation D5).
6. `cordis.patch.yml` uses `${DSH_HOME}` — host must expand this
   token before resolving `path`. If the host does not expand the
   token, the FTS index lands at the literal path. Verified against
   the documented DSH behavior; flagged here for the deployer.

## Files in this delivery

```text
dsh-universal-palette/
├─ package.json
├─ tsconfig.json
├─ tsconfig.build.json
├─ tsdown.config.ts
├─ cordis.patch.yml             # overrides session-query-sqlite
├─ README.md                    # locked to SHA 76fda72…
├─ IMPLEMENTATION_REPORT.md     # this file
├─ docs/
│  ├─ ARCHITECTURE.md           # locked to SHA 76fda72…
│  └─ COMPATIBILITY.md          # real binding table, locked SHA
├─ src/
│  ├─ host/index.ts
│  ├─ shared/contract.ts        # V1 P0 contract; thirdPartyProviders removed
│  └─ client/
│     ├─ index.ts               # overlay mount seam; no body fallback
│     ├─ capabilities.ts
│     ├─ aggregator.ts
│     ├─ keyboard.ts
│     ├─ UniversalPalette.ts
│     ├─ providers/
│     │  ├─ commands.ts
│     │  ├─ sessions.ts
│     │  ├─ models.ts
│     │  ├─ conversation-hits.ts
│     │  ├─ skills.ts           # optional surface
│     │  └─ registry.ts         # INTERNAL only
│     ├─ ranking/{fuzzy.ts, frecency.ts, rank.ts}
│     ├─ state/preferences-backend.ts
│     └─ ui/{h.ts, styles/palette-css.ts, styles/palette.css}
├─ tests/
│  ├─ dom-shim.ts
│  ├─ keyboard-shim.ts
│  ├─ unit/{fuzzy, rank, keyboard, preferences, provider-failure, providers, capabilities}.test.ts
│  └─ integration/
│     ├─ aggregator-flow.test.ts
│     ├─ client-activation.test.ts   # adds fail-closed test
│     └─ cordis-patch.test.ts       # NEW — patch config test
└─ dist/                        # built artifacts
```

## Final verdict

**READY** for the V1 P0 contract against the locked SHA
`76fda729799fe9b3848dbe2c211d4b231032b81e` / `@deepseek-ai/dsh@0.1.2-rc.1`.

Conditions met:

- All 7 release-blocker items closed.
- Build / typecheck / 52 tests all green.
- Conversation Hits populate out of the box (no user setup).
- No `document.body` fallback; palette disables cleanly without the
  Slot.
- No public `registerProvider()` contract; internal registry is a
  private detail.
- All docs cite the exact SHA.
- Optional surfaces (Skills, References, Alias, Hide) are explicitly
  NOT part of the V1 release gate.
