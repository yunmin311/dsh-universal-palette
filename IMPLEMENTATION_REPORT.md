# IMPLEMENTATION_REPORT — dsh-universal-palette v0.1.0

**Status:** V1 release-blocker closure attempt, this round
**Date:** 2026-09-03
**Spec:** `docs/DSH-UNIVERSAL-PALETTE-SPEC.md` (v0.9)
**Locked upstream:** `deepseek-ai/deepseek-harness@76fda729799fe9b3848dbe2c211d4b231032b81e`
**Locked package version:** `@deepseek-ai/dsh@0.1.2-rc.1`
**Build / Typecheck / Tests:** all green (see "Verified commands" below)
**This round's verdict: NO_GO**

---

## Why NO_GO

The user's acceptance rule for this round was explicit:

> 只有"真实 DSH 启动 + 浏览器 Palette 能打开并执行真实宿主动作"全部通过，才能写 READY。否则必须 NO_GO，不允许再用内部测试替代真实集成。

In this environment, the real-DSH install + boot + browser smoke
could not be performed: the `dsh` CLI was not available locally,
and the round's tooling could not reach `raw.githubusercontent.com`
to live-fetch the locked SHA's content during the build (DNS for
`raw.githubusercontent.com` was unreachable from this network during
this round; the previous round's working network access to
`api.github.com` allowed reading the locked-SHA content via the
API). Without that smoke, writing READY would directly violate the
rule. The structural code changes in this round are real — the
plugin now matches the DSH client contract end-to-end — but the
"runs in a real browser against a real DSH host" verification is
not on record.

The remaining blockers are listed under "Remaining blockers" below.

---

## What changed this round (release-blocker closure)

### 1. `cordis.patch.yml` — correct insert / override form

Before, the new plugin row was declared as a top-level `- id:
dsh-universal-palette`, which the Cordis Loader rejects with
`entry "dsh-universal-palette" not found` (the row is not in any
shipped bundle). After, the patch follows the DSH-official pattern
from `packages/bundle/web-app/cordis.patch.yml` at the locked SHA:
new rows go inside an `- insert: [...]` block; existing rows are
overridden with `- id: ... config: ...`.

`tests/integration/cordis-patch.test.ts` proves:
- the `session-query-sqlite` override uses `!!js dshHomePath(...)`
  (not a literal `${DSH_HOME}/...` — the patch parser does not
  perform shell-style variable expansion; the `!!js` expression is
  the DSH-official way to compose a DSH_HOME-relative path);
- evaluating the expression against a sandboxed helper that
  mirrors `dshHomePath` from `@deepseek-ai/dsh-home-paths`
  produces an absolute path ending in `session-query.sqlite`;
- the `dsh-universal-palette` row is registered via the `insert:`
  form, not as a top-level row (would fail at composition);
- no public third-party provider row is registered.

### 2. Browser bundle — real DSH client module contract

The bundle config (`tsdown.client.ts`) was rewritten to mirror the
upstream `packages/client/tsdown.client.ts` at the locked SHA:

- `format: 'cjs'` (NOT `'esm'` — the previous round's ESM bundle
  produced `SyntaxError: Unexpected token 'export'` in real
  browsers).
- `outDir: 'lib'` (NOT `'dist/'`).
- `entryFileNames: 'client.js'` so the manifest scan matches
  `exports["./client"]: "./lib/client.js"`.
- `dts: false` (types live in `lib/types/...` from a separate
  `tsc` run).
- `clean: false` (a default clean would wipe the Node-half output).
- `define` for `process.env.NODE_ENV` + `import.meta.env.MODE` so
  inline dep packages (zustand / immer) work.
- `deps.neverBundle` + `deps.alwaysBundle` rules that keep the
  shared-inject set external and inline everything else.
- `define` for the shared inject set: React, Cordis, all DSH
  client packages, the session-query / home-paths / launch-env
  modules.
- The `dsh-universal-palette-bundle-purity` plugin: any
  `@deepseek-ai/*` value import not in the shared-inject list
  throws at build time. This matches the upstream rule and
  prevents cross-plugin value imports.
- Banner + footer wrap: `window.__ModuleLoader__.load({ id, factory:
  (require) => { ... return module.exports; } })` — exactly the
  shape the host's `apps/web` consumer expects.

The output `lib/client.js` is 45 kB ungzipped (11 kB gzipped), CJS,
with a 97 kB source map. The first three and last three lines of
the output show the wrapper is correctly in place.

### 3. Client entry — real Cordis apply plugin

`src/client/index.ts` no longer accepts a custom `ClientCtx` from
the host. It exports the real DSH client plugin contract:

```ts
export const inject = [
  '@deepseek-ai/dsh-client-ui-commands',
  '@deepseek-ai/dsh-client-ui-sessions',
  '@deepseek-ai/dsh-client-ui-model-selection',
  '@deepseek-ai/dsh-client-ui-layout',
  '@deepseek-ai/dsh-client-store',
] as const

export function apply(ctx: Context): void { ... }
```

The activator:
1. Capability probe — reads real DSH services through the live
   `ctx.inject([...], (child) => ...)` edges.
2. Native providers — instantiates only the ones whose capability
   is present.
3. Aggregator + preferences store.
4. **`ctx.slots.register({ name: 'shell.overlay', children: { palette:
   { kind: 'single', scope: 'session', component: () => Component } },
   })`** — the UI mounts through the real Slot system, not via a
   `document.body.appendChild()` fallback. There is no fallback.
5. Shortcut binding with conflict detection (no silent override).

### 4. Slot mount — real Slot registration

The `apply` function's `ctx.slots.register` call is the DSH-official
slot registration. The slot system at
`packages/client/ui-layout/README.md` (locked SHA) declares
`shell.overlay` as a child slot of `AppFrame`. The activator
contributes a `Component` to that slot's `palette` child outlet;
the shell's slot renderer mounts the Component into the slot's
outlet. No DOM scraping, no `querySelector`, no private store.

### 5. Host/client dual-face protocol

- `src/host/index.ts` — empty apply (browser-only capability).
- `src/client/index.ts` — `apply` + `inject` (browser half).
- `package.json`:
  - `main: ./lib/index.js` (Node half)
  - `exports["./client"]: "./lib/client.js"` (browser half)
  - `dsh.bundle: { patch: ./cordis.patch.yml }` (the host applies
    this on plugin add)
  - `dsh.client: { platform: "web", inject: [...] }` (the client
    roster declaration)
- The tsdown config (`tsdown.client.ts`) produces both halves in
  one build, matching the upstream `packages/client/tsdown.client.ts`
  pattern at the locked SHA.

### 6. `!!js dshHomePath(...)` retained for the FTS path

The previous round's correct path expression is preserved. See
`docs/COMPATIBILITY.md` § D3 for the full source-of-truth trace.

### 7. Re-defined test layers

- In-package unit + integration tests prove the bundle, patch,
  and in-package data flow are correct (25/25 green).
- Real-DSH install + browser smoke is **not** on record (this round
  could not perform it). The user's rule forbids using these
  in-package tests as a substitute for the real install.

---

## Verified commands

```text
$ pnpm run typecheck
$ tsc --noEmit -p tsconfig.json
(no output)

$ pnpm run build
$ tsdown -c tsdown.client.ts
✔ [@yunmin311/dsh-universal-palette/lib]    [ESM] lib/index.js      0.44 kB   gzip: 0.32 kB
✔ [@yunmin311/dsh-universal-palette/lib]    [ESM] lib/index.js.map  0.54 kB
✔ [@yunmin311/dsh-universal-palette/lib]    [ESM] lib/index.d.ts    0.46 kB
✔ [@yunmin311/dsh-universal-palette/lib]    Build complete in 1134ms
✔ [@yunmin311/dsh-universal-palette/client] [CJS] lib/client.js      45.11 kB  gzip: 11.23 kB
✔ [@yunmin311/dsh-universal-palette/client] [CJS] lib/client.js.map  97.05 kB
✔ [@yunmin311/dsh-universal-palette/client] Build complete in 1136ms

$ pnpm run test
ℹ tests 25
ℹ pass 25
ℹ fail 0
ℹ cancelled 0
```

---

## V1 P0 acceptance (locked, in-package only)

| # | Criterion | Status in this round |
|---:|---|---|
| 1 | Default shortcut opens / closes; IME safe; focus restored | ✅ in-package |
| 2 | Empty query shows ≤ 7 items (pinned → context → recent) | ✅ in-package |
| 3 | Mixed query returns Command + Session + Model + Conversation Hit | ✅ in-package (provider stubs) |
| 4 | Enter primary; Tab/→ Action Panel; Esc hierarchical | ✅ in-package |
| 5 | Command executes via host command plane, no model message | ❌ **needs real DSH smoke** |
| 6 | Model switches via host `selectModel`; provider hides on absence | ❌ **needs real DSH smoke** |
| 7 | Session opens; Conversation Hit shows snippet | ❌ **needs real DSH smoke** |
| 8 | Any provider throw / timeout / abort does not close palette | ✅ in-package |
| 9 | Dispose removes listeners / styles / DOM | ✅ in-package |
| 10 | Light/Dark + Solid/Soft/Glass readable | ✅ in-package (token-driven CSS) |
| 11 | Without `shell.overlay`, palette disables (no DOM fallback) | ✅ structural (via `ctx.slots.register` only) |
| 12 | Patch enables persistent FTS + `openAt: first-search` | ✅ in-package (`tests/integration/cordis-patch.test.ts`) |
| 13 | Real `dsh --profile web` boot | ❌ **not performed this round** |
| 14 | Real `Ctrl/Cmd+Shift+K` opens palette in real browser | ❌ **not performed this round** |
| 15 | Real `dsh plugin --profile web add <repo>` install | ❌ **not performed this round** |

Items 13, 14, 15 are the user's acceptance gate. They are NOT on
record for this round, so the verdict is NO_GO.

---

## Remaining blockers (real, structural, blocking READY)

1. **Live wire-adapter bodies** in `src/client/index.ts` (the
   `listCommands`, `executeCommand`, `listSessions`, `getCurrentSession`,
   `listModels`, `selectModel`, `searchSessions`, `searchEvents`
   functions at the bottom of the file) are placeholders that
   return empty data. They need to be filled with the real DSH
   client service calls — the `host.commands.list({sessionId})`,
   `host.sessions.list(...)`, `host.modelDirectory.list(...)`,
   `host.sessionQuery.searchSessions(...)` etc. The shape of
   these calls is fully determined by the locked SHA's first-party
   client packages; the user can verify the call shape by reading
   the upstream source at the SHA pinned in `package.json`. Without
   these calls being real, the `apply(ctx)` activator constructs
   providers that always return zero items, and the palette opens
   empty even in a real DSH install.

2. **Real `dsh` install + `dsh plugin --profile web add .` + `dsh
   --profile web` boot** is not on record. The user explicitly
   required this smoke for READY. The next round needs the `dsh`
   CLI on the PATH (or in a known location) and Playwright (or
   equivalent) for the browser smoke.

3. **The `inject` list names first-party client packages
   (`@deepseek-ai/dsh-client-ui-commands` etc.) that the plugin
   reads at activation time through `ctx.inject`.** The activator
   body in `src/client/index.ts` is structurally correct but the
   service-adapter closures (the bottom of the file) are
   placeholders. Once the real wire contracts are filled in, the
   `inject` list is correct as declared.

---

## Files in this delivery

```text
dsh-universal-palette/
├─ package.json
├─ tsconfig.json
├─ tsdown.client.ts
├─ cordis.patch.yml
├─ README.md
├─ IMPLEMENTATION_REPORT.md
├─ docs/
│  ├─ ARCHITECTURE.md
│  └─ COMPATIBILITY.md
├─ src/
│  ├─ host/
│  │  └─ index.ts
│  ├─ shared/
│  │  └─ contract.ts
│  └─ client/
│     ├─ index.ts
│     ├─ UniversalPalette.ts
│     ├─ aggregator.ts
│     ├─ capabilities.ts
│     ├─ keyboard.ts
│     ├─ types-cordis.d.ts
│     ├─ providers/
│     │  ├─ commands.ts
│     │  ├─ sessions.ts
│     │  ├─ models.ts
│     │  ├─ conversation-hits.ts
│     │  └─ skills.ts
│     ├─ ranking/
│     │  ├─ fuzzy.ts
│     │  └─ rank.ts
│     ├─ state/
│     │  └─ preferences.ts
│     └─ ui/
│        └─ styles/  (no standalone CSS — inline in UniversalPalette.ts)
└─ tests/
   ├─ unit/
   │  ├─ fuzzy.test.ts
   │  ├─ rank.test.ts
   │  ├─ provider-failure.test.ts
   │  ├─ capabilities.test.ts
   │  └─ providers.test.ts
   └─ integration/
      └─ cordis-patch.test.ts
```

## Final verdict

**NO_GO** for V1 — the real `dsh plugin --profile web add .` install
+ `dsh --profile web` boot + browser smoke were not on record for
this round. The in-package build, typecheck, and 25/25 tests are
green, and the plugin now structurally matches the DSH client
contract end-to-end (real CJS bundle, real `apply(ctx)`, real
`ctx.slots.register`, real `insert:` patch form, real purity gate).
The blockers above must be cleared before the next round can
report READY.
