# Universal Palette — Interoperability Matrix (v0.2 Phase A)

Status: **VERIFIED FACTS ONLY**. Every row below was checked against real, installed plugins on real DSH boots, not source reading alone. Phase A scope: research + capability detection + at most one minimal adapter (Keys Palette). No other integration code was written. Baseline: `dsh-universal-palette@0.1.0` at main `5db1138a28606343849e3a0cd7ae30c1081b7630`; UI, glass, ranking, locale, shortcut defaults and DSH adapters untouched.

## Test environment

| Item | Value |
|---|---|
| DSH | `@deepseek-ai/dsh@0.1.2-rc.1` (`dsh --version`), upstream `deepseek-ai/deepseek-harness@76fda729799fe9b3848dbe2c211d4b231032b81e` |
| Isolated home | `interop-probe/dsh-home` (`DSH_HOME`), profile `web`; the normal profile was never touched |
| Method | `dsh plugin --profile web add …` real installs, real restarts per stage, real Microsoft Edge headless via `scripts/interop-probe.mjs` (same test-only public activation bridge as `scripts/smoke-dsh.mjs`) |
| Machine results | `evidence/2026-09-06-interop/interop-results-{A,B,C,C2,D,E,F}.json` + screenshots |
| Unit tests | `pnpm run check` 38/38 pass (34 V1 + 4 new `tests/unit/keys-actions.test.ts`) |

## Exact versions installed

| Plugin | Exact version | Source identity |
|---|---|---|
| dsh-tui-command-ext | `0.1.0` | npm `dsh-tui-command-ext@0.1.0`, shasum `a44cc91029a7cfaa3cdb58d128369bc040767209` (no public git repo; DDPG publishes via npm) |
| dsh-keys-palette | `0.2.0` | npm `dsh-keys-palette@0.2.0`, shasum `237d5fc7830e71226d1c1b354b40db704b1f9371` (no public git repo; DDPG publishes via npm) |
| dsh-session-workbench | `1.0.0` | `github:PolinniZhong/dsh-session-workbench#v1.0.0`, commit `ce91981d3992b8400d5e22aed237fbeb968643f4` (1.0.1 targets the DSH 0.1.1-rc.2 client-module layout, not 0.1.2-rc.1) |
| dsh-reference-anything | `0.4.0` | `github:Chael-Chael/dsh-reference-anything#v0.4.0`, commit `db460606bdb2e198ac4964a48056e08276fdbafd` (v0.4.0 targets DSH `>=0.1.2-rc.1`) |

## Interoperability matrix

| Question | dsh-tui-command-ext | dsh-keys-palette | dsh-session-workbench | dsh-reference-anything |
|---|---|---|---|---|
| Registers on Host | 4 commands in the official `commands` registry: `/clear` `/rename` `/unarchive` `/compact-fast` | Nothing (host half is a no-op stub) | Host-side session library/storage (its own patch layer) | Host remotes consumed only (its sources run client-side) |
| Registers on Client | 7 `commandUi` popupSelect contributions: `/rewind` `/fork` `/resume` `/archive` `/status` `/theme` `/lang` | Cmd+/ palette UI + `keys.actions` service | Conversation tab-bar UI (slots) | Native `@` sources via official `ctx.inputTriggers.registerSource` |
| Public Cordis service | None | **Yes**: `keys.actions` via `ctx.reflect.provide` | None found (no `provide` in its code) | None found (no `provide` in its code) |
| Service name / signature | — | `ctx.get('keys.actions')` → `{ register(def {id, label?, description?, source?, run}) → disposer; list() → view[]; subscribe(fn) → unsubscribe }` | — | — |
| Official command/reference/action contract | Official Host command registry (this is its whole Host surface) | Its own documented public extension registry (README + `.d.ts` shipped in the package) | None published | Consumes official `inputTriggers`, `remote.commands/skills/fileReferences/sessionReferenceResolver`; publishes nothing |
| Capability-detectable | Yes — its Host commands simply appear in `ctx.remote.commands.list(sessionId)` | Yes — `ctx.get('keys.actions') !== undefined` | N/A (nothing to detect) | N/A (nothing public to detect) |
| Usable with no hard dependency | Yes (zero-adapter for Palette) | Yes (Palette adds no inject; runtime detect only) | Yes (independent) | Yes (independent) |
| Disappears completely when uninstalled | Yes (boot-c2/F re-boots show clean catalogs) | **Yes — verified**: after `dsh plugin remove`, `ctx.get('keys.actions')` is `undefined` and the Palette is unchanged | Yes (boot without it) | Yes |
| Needs private registry / DOM scraping / source internals | No (from the Palette's side: nothing to read) | No (service is the contract) | Would require its internals → forbidden, not done | Would require its internals → forbidden, not done |

## The four verifications

### 1. TUI Command Ext — zero-adapter result (verified)

- With no Palette changes, the four Host extension commands (`/clear` `/rename` `/unarchive` `/compact-fast`) appeared automatically in the official live catalog (`ctx.remote.commands.list`) and in the existing Commands provider rows; `/unarchive` executed through the unchanged provider (stage B).
- The seven Client-only commands (`/rewind` `/fork` `/resume` `/archive` `/status` `/theme` `/lang`) are absent from the Host catalog **and invisible to the Palette**. They live only as `commandUi` popupSelect contributions; `ctx.commandUi` exposes no enumeration contract (recorded surface: register-shaped face, no list/all/sources).
- Recorded as the **official Host catalog vs Client commandUi enumeration gap**. The Palette did NOT read the commandUi private registry to fill the gap; Client-only coverage waits for an official public discovery contract.

### 2. Keys Palette — public contract verified, one minimal adapter implemented (verified)

- `keys.actions` is a real public contract, declared in the package's shipped `.d.ts` and README and honored by the runtime (`ctx.reflect.provide('keys.actions', registry)` inside `ctx.effect`, duplicate-id rejection, per-action disposer, whole registry dies with the plugin).
- The adapter (`src/client/keysActions.ts`) registers exactly one action, `universal-palette.open`, when the service is present; late-provided services are picked up via Cordis' public `internal/service` event (no blocking inject — absent plugin must not stall activation); registration disposer is held and released through `ctx.effect`; the label re-registers on locale change.
- Real acceptance (stage C): the action appeared in `keys.list()` alongside the built-ins; after binding `universal-palette.open → Alt+P` through the plugin's documented persistence (`dsh.keys-palette.v1`, `{v:1, bindings}`), the real Keys Palette keydown listener opened and closed the Palette. Stage C2: after `dsh plugin remove dsh-keys-palette`, `keys.actions` is gone and the Palette behaves exactly as V1.
- Not done, by design: no reading of Keys Palette bindings, no importing its actions into the Palette, no reverse integration.

### 3. Session Workbench — `NO_PUBLIC_HANDOFF_YET`

- Source review of v1.0.0: no provided Cordis service, no exported third-party handoff API; its recall flow drives the composer `@` reference itself and its UI lives in its own slots.
- Per the interop rules: no bridge was built, no internal route was called. The Palette's official Conversation Hits remain the primary surface; a future secondary handoff (Open/Locate/Recall in Session Workbench) requires this plugin to publish a stable public contract first.

### 4. Reference Anything — NO-GO on its internals; official DSH reference contract is the real path

- v0.4.0 provides **no Cordis service and no public candidates/insert/picker API** for third parties. It enhances the native `@` menu by registering sources through the **official** `ctx.inputTriggers.registerSource` contract and reading official remotes (`remote.commands`, `remote.skills`, `remote.fileReferences`, `remote.sessionReferenceResolver`).
- Calling its internal sources/host routes is forbidden and was not done. Copying its external AI/cloud/local-agent index logic is **NO-GO**.
- Key finding: the canonical reference surface is already public in DSH itself — `ctx.remote.sessionReferenceResolver.candidates(sessionId, query, signal)` (shipped in `dsh-api-remotes`, returns `{mention, sessionId, label, cwd, sameWorkspace, createdAt}`) and `ctx.remote.fileReferences.list(agent, query, signal)`. A future Palette "insert canonical @reference" secondary action can be built on these official contracts, making Reference Anything unnecessary for that purpose, not a dependency for it. Not implemented this round (out of Phase A scope).

## Coexistence results (real boots)

| Stage | Installed | Result |
|---|---|---|
| A | Palette only | PASS — behavior identical to V1 baseline (catalog, empty query, /goal) |
| B | + TUI Command Ext | PASS — Host commands auto-appear and execute; Client-only commands invisible; zero code change |
| C / C2 | + Keys Palette / after uninstall | PASS — bound shortcut opens/closes the Palette; uninstall leaves `keys.actions` undefined and Palette unchanged |
| D | + Session Workbench | PASS — both installed, no conflict; `ctx.sessions.search` (single session-query-sqlite layer) healthy |
| E | + Reference Anything | PASS — `@` menu still opens (1 listbox) alongside the Palette; search healthy; no page errors |
| F | all four | PASS — DSH boot, Palette, commands, models, sessions, history search, own-shortcut toggle, pointer-through (`root: none / surface: auto`), focus restore all healthy; no browser page errors |

## Public contract gaps (unchanged DSH limitations)

1. **Client commandUi enumeration**: no public discovery for popupSelect contributions; Client-only slash commands are invisible to any aggregator. Gap recorded, not worked around. Type-level proof at the locked SHA: `@deepseek-ai/dsh-client-ui-commands` declares `CommandUiContract` as `register` / `decorate` / `popupFor` only, with the contract comment "Business packages consume `register` alone" — no list/snapshot/subscribe exists.
2. **No public composer reference insertion**: canonical discovery is public (`remote.sessionReferenceResolver.candidates`, `remote.fileReferences.list`), but every insertion path is span-bound or pipeline-internal — `SessionInput.insertReference(ref, span)` requires a pick-time `TokenSpan` (draft CAS), and `PickOutcome` insert outcomes are executed only by the per-session `InputTriggerController` via scoped internal events. No span-free public seam exists. Gap recorded as `NO_PUBLIC_COMPOSER_INSERT_YET`; no `TokenSpan` forgery, no internal event dispatch.
3. **No `@` source enumeration**: `InputTriggerServiceContract` exposes `registerSource`/`sessionOf` only; there is no public listing of registered reference sources. Gap recorded as `NO_PUBLIC_REFERENCE_SOURCE_ENUMERATION`; other plugins' candidates and business logic stay theirs.
4. **Session Workbench and Reference Anything publish no services**; any handoff needs them to publish one (or must wait for official DSH surfaces).

Minimal upstream API proposals for gaps 1–3 are written up in [UPSTREAM_INTEROP_GAPS.md](UPSTREAM_INTEROP_GAPS.md).

## Known default collision (finding, not a defect)

Keys Palette `0.2.0` ships default binding `cycle-theme: Mod+Shift+K`; on Windows `Mod` = Ctrl, which collides with the Palette's default `Ctrl+Shift+K` toggle. One press opens the Palette **and** flips the DSH theme (observed dark→light). Users can rebind in Keys Palette (Settings → 快捷键, persisted in `dsh.keys-palette.v1`); the Palette's own shortcut is configurable in its preferences. Both defaults are frozen V1 surfaces, so Phase A changes neither; recorded here so the collision is discoverable.

## NO-GO boundaries honored

- No DOM scraping, private store, private registry, or source-internal object access for any interop.
- No public `registerProvider()` restored; no Universal Palette SDK created.
- No bridge into Session Workbench internals; no call into Reference Anything internals; no copying of its business logic.
- Schema unchanged: the existing internal item model (optional source metadata + opaque primary/secondary actions) proved sufficient to carry the one adapter; only `src/client/keysActions.ts` and its wiring were added.
