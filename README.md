# dsh-universal-palette

Dense translucent-glass **Universal Palette** for **DeepSeek Harness Web**.

> **One sentence differentiation:** not "another command palette" — it
> finds a DSH object and then, in the same keyboard flow, executes the
> next action that object currently allows (open / reference / copy /
> switch / load).

| Shortcut | Where |
|---|---|
| `Ctrl+Shift+K` (Windows/Linux) · `Cmd+Shift+K` (macOS) | Open the palette |

The default shortcut is deliberately **off** `Ctrl/Cmd+K` (taken by
`dsh-spotlight`) and **off** `Alt+M` (taken by `dsh-model-palette`).
When a known conflict is detected, the palette surfaces it as a soft
notice inside the surface — it never silently overrides.

## Locked compatibility baseline

This release is verified against the **exact** upstream SHA below —
not `latest master`, not `0.1.x`, not any moving target.

| | |
|---|---|
| Upstream | `deepseek-ai/deepseek-harness` |
| SHA | `76fda729799fe9b3848dbe2c211d4b231032b81e` |
| Root package version | `0.1.2-rc.1` |

Other DSH versions are best-effort / unverified. Compatibility is not
guaranteed for any other SHA.

## V1 release contract (P0, locked)

The V1 P0 set is exactly:

- **Commands** — execute via host command plane, no model message
- **Sessions** — open via host sessions.open
- **Models** — switch via host `session.selectModel`
- **Conversation Hits** — populated via `ctx.sessionQuery` against a
  persistent FTS index opened `on first-search` (enabled by the
  plugin's `cordis.patch.yml`)
- **Action Panel** — result-level secondary actions
- **Deterministic context / frecency ranking** — `0.46·text +
  0.19·context + 0.15·frecency + 0.10·pin + 0.10·providerHint`, no LLM

Skills, generic References, Alias, and Hide remain in the code path as
optional surfaces; **none are part of the V1 release gate**. No
V1.1 features are tracked here.

## What it does

- **One input box** across every enabled DSH capability the host
  exposes — Commands, Sessions, Models, Conversation Hits.
- **Rich item rows**: Conversation Hits carry a snippet line, taller
  row, and metadata badges (workspace · age).
- **Result-level Action Panel**: every result exposes `Open` /
  `Switch` / `Load` as primary, plus a small `…` that opens a second
  layer (`Tab` / `→`) with **Reference**, **Copy excerpt**, **Pin**.
- **Deterministic ranking** — no LLM call, no model tokens consumed
  by opening the palette.
- **Frecency** stored locally (`localStorage` under the
  `dsh-universal-palette` namespace). Pin persists the same way.
  `Reset ranking` clears frecency, not pins.
- **Provider isolation**: any single provider failure (throw, timeout,
  abort) hides only that category — every other category still
  searches and executes.
- **Capability detection** at activation: providers opt out when the
  host service is missing; the palette degrades silently instead of
  throwing.
- **No `shell.overlay` → no palette**: the UI mounts only through the
  public Slot system. If the slot is absent in the running DSH build,
  the palette disables itself — there is no `document.body` fallback,
  no DOM scraping, no first-party patching.

## Install

Requirements: `dsh` CLI on a `web` profile, version
`0.1.2-rc.1` (matching the locked SHA).

```sh
dsh plugin --profile web add github:yunmin311/dsh-universal-palette#main
```

The plugin's `cordis.patch.yml` activates the shipped
`session-query-sqlite` row (persistent path under `DSH_HOME`,
`openAt: first-search`) so Conversation Hits populate without
requiring the user to install any additional plugin.

Then start DSH Web:

```sh
dsh --profile web
```

Press the default shortcut to open.

## Usage

| Action | Key |
|---|---|
| Open palette | `Ctrl/Cmd+Shift+K` |
| Close palette | `Esc` (or `Esc` again from Action Panel) |
| Move selection | `↑` / `↓` |
| Run primary action | `Enter` |
| Open Action Panel | `Tab` or `→` |
| Move within Action Panel | `↑` / `↓` |
| Back from Action Panel | `Esc` or `Tab` |
| Force commands/actions | type `>` first |

Empty query shows up to **7** items: Pinned → Current-context →
Recent/Frequent. No dashboard, no marketing text — the palette opens
into the input box.

## Coexistence with other plugins

| Plugin | Shortcut | What it covers | How Universal Palette differs |
|---|---|---|---|
| `dsh-spotlight` | `Ctrl/Cmd+K` | Native slash commands, recent sessions, DOM-action discovery, plugin settings | Universal Palette does **not** scrape host DOM. It talks only to host services and adds rich secondary actions on every result. |
| `dsh-command-palette` | Double `Shift` | Sessions, workspaces, settings, features, custom prompts, provider extension | Universal Palette is **not** a settings navigator. It federates only the host's native contract surface. |
| `dsh-session-workbench` (was `dsh-session-kb`) | sidebar tab | FTS fragment hits + locate + `@recall` | Universal Palette activates the **same** shipped `session-query-sqlite` row, no second FTS index, no `dsh-session-kb` clone. |
| `dsh-reference-anything` | `@` | Unified `@` menu (commands, skills, files, sessions, external conversations) | Universal Palette is a global action surface. Reference insertion is one secondary action among many on a result — it never replaces the `@` flow. |
| `dsh-model-palette` | `Alt+M` | Provider rail + model config + OpenRouter media | Universal Palette exposes Model as one item kind with `Switch` as primary; model configuration is **not** its concern. |
| `dsh-codex-ui` | sidebar replacement | Replaces main UI | Universal Palette is an additive overlay only. Uninstalling it leaves zero layout residue. |

Install any combination. Universal Palette picks a non-conflicting
shortcut by default; when conflicts are detected, it surfaces them
instead of overriding.

## Browser half entry

The browser half ships at `dist/client.js` and exports a default
`activateClient(ctx)` function. The DSH shell calls it after the host
graph loads.

```ts
import activateClient, { type ClientCtx } from '@yunmin311/dsh-universal-palette/client'

const handle = activateClient({
  host: {
    commands: { /* wire adapter */ },
    sessions: { /* wire adapter */ },
    modelDirectory: { /* wire adapter */ },
    sessionQuery: { /* wire adapter */ },
  },
  overlay: {
    shellOverlayRoot: ctx.slots.resolve('shell.overlay'),
  },
})

// Later, on plugin unload:
handle.dispose()
```

**There is no public `registerProvider()` API in V1.** Third-party
plugins extend DSH native services instead. Universal Palette
federates only the host's native capability set.

## Architecture

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the host /
browser split, capability probe, ranking math, provider contract, and
disposal guarantees.

## Compatibility matrix

See [`docs/COMPATIBILITY.md`](docs/COMPATIBILITY.md) for the exact
real-API binding table, runtime capability matrix, recorded
deviations, and per-plugin coexistence behavior.

## Implementation evidence

[`IMPLEMENTATION_REPORT.md`](IMPLEMENTATION_REPORT.md) records the
final capability probe, verified commands, P0 acceptance, dedup
result, and verdict.

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
