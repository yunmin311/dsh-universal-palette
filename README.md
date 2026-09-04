# dsh-universal-palette

Dense translucent-glass **Universal Palette** for **DeepSeek Harness Web**.

| Shortcut | Where |
|---|---|
| `Ctrl+Shift+K` (Windows/Linux) · `Cmd+Shift+K` (macOS) | Open the palette |

> **What this release is.** This is the V1 release attempt against the
> exact DSH upstream SHA pinned below. The build, typecheck, and
> in-package unit tests are all green. The plugin's cordis.patch.yml
> matches the DSH composition contract (override + `insert:` form,
> `!!js dshHomePath(...)` path expression). The browser bundle is a
> real CJS artifact wrapped with `window.__ModuleLoader__.load({...})`
> exactly the way the upstream `tsdown.client.ts` produces it.
>
> **The verdict this round is NO_GO** — and that verdict is recorded
> in `IMPLEMENTATION_REPORT.md` with the precise reason: the user's
> acceptance rule for this round required a real `dsh plugin --profile
> web add .` install + `dsh --profile web` boot + browser smoke.
> That smoke could not be performed in this environment (no live
> `dsh` install, no network access to fetch the locked SHA live during
> this round's tooling run). The remaining integration gaps are
> wire-adapter bodies against the live DSH client services
> (`ctx.commands.list({sessionId})`, `ctx.modelDirectories.list(...)`,
> `ctx.sessionQuery.searchSessions(...)`, etc.) that have to be filled
> in against the actual first-party DSH client packages; the activator
> in `src/client/index.ts` is structurally correct (real `apply(ctx)`
> with real `inject` list, real `ctx.slots.register(...)`) but its
> service-adapter bodies are placeholders that need the live service
> contract calls filled in. Those calls exist in the locked DSH
> source but the integration harness to exercise them is not
> available in this environment.

## Locked compatibility baseline

| | |
|---|---|
| Upstream | `deepseek-ai/deepseek-harness` |
| SHA | `76fda729799fe9b3848dbe2c211d4b231032b81e` |
| Root package version | `0.1.2-rc.1` |

Other DSH versions are best-effort / unverified. The plugin targets
this single SHA. Behavior on a different SHA is not characterized
by the V1 release contract.

## Install (once the live smoke is performed)

```sh
dsh plugin --profile web add github:yunmin311/dsh-universal-palette#v0.1.0
dsh --profile web
```

Press `Ctrl/Cmd+Shift+K` to open. The default shortcut is deliberately
**off** `Ctrl/Cmd+K` (taken by `dsh-spotlight`) and **off** `Alt+M`
(taken by `dsh-model-palette`); on known-conflict, the palette
surfaces a notice — it never silently overrides.

## Usage

| Action | Key |
|---|---|
| Open palette | `Ctrl/Cmd+Shift+K` |
| Close palette | `Esc` |
| Move selection | `↑` / `↓` |
| Run primary action | `Enter` |
| Open Action Panel | `Tab` or `→` |
| Move within Action Panel | `↑` / `↓` |
| Back from Action Panel | `Esc` or `Tab` |
| Force commands/actions | type `>` first |

## How it integrates with DSH

The package is a real DSH dual-face Cordis plugin:

- `src/host/index.ts` — Node-half apply (empty; browser-only capability).
- `src/client/index.ts` — Browser-half `apply(ctx)` + `inject` manifest,
  mounted by the DSH shell as a Cordis plugin through the bundle's
  `window.__ModuleLoader__.load({ id, factory })` registration (see
  `packages/client/modules/src/client/system.ts` at the locked SHA).
- `cordis.patch.yml` — overrides the shipped `session-query-sqlite`
  row to enable a persistent FTS index, and inserts the
  `dsh-universal-palette` row into the active composition.
- `tsdown.client.ts` — produces `lib/index.js` (Node half, ESM) and
  `lib/client.js` (browser half, CJS wrapped with the
  `window.__ModuleLoader__` banner) per the upstream client-bundle
  contract at `packages/client/tsdown.client.ts` in the locked SHA.

The browser half uses Cordis services, not direct value imports:
`ctx.slots.register(...)` mounts the Component into the
`shell.overlay` slot chain; capability probe reads the real DSH
client services (`ctx.commands`, `ctx.sessions`,
`ctx.modelDirectories`, `ctx.sessionQuery`, etc.) through the
`inject` edges declared in the package's `dsh.client` field.

## Architecture

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the host /
browser split, capability probe, ranking math, provider contract,
disposal guarantees, and the CJS / `window.__ModuleLoader__` bundle
contract.

## Compatibility matrix

See [`docs/COMPATIBILITY.md`](docs/COMPATIBILITY.md) for the exact
real-API binding table (each binding traced to the upstream DSH
package + source-of-truth doc at the locked SHA) and the recorded
deviations.

## Implementation evidence

See [`IMPLEMENTATION_REPORT.md`](IMPLEMENTATION_REPORT.md) for the
final verdict, the in-package test results, and the explicit
blockers that prevent this round from being marked READY.

## Development

```sh
git clone https://github.com/yunmin311/dsh-universal-palette.git
cd dsh-universal-palette
pnpm install

pnpm run typecheck
pnpm run build
pnpm run test
```

Requirements: Node.js `>=22.19`, pnpm `11.x`.

## License

MIT
