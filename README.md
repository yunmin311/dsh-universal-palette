# dsh-universal-palette

Dense translucent-glass **Universal Palette** for **DeepSeek Harness Web**.
One keyboard-first surface that federates Commands, Models, Sessions,
Conversation Hits, Skills, and References into a single result model
with rich-item secondary actions.

> **One sentence differentiation:** not "another command palette" — it
> finds a DSH object and then, in the same keyboard flow, executes the
> next action that object currently allows (open / reference / copy /
> pin / load / switch).

| Shortcut | Where |
|---|---|
| `Ctrl+Shift+K` (Windows/Linux) · `Cmd+Shift+K` (macOS) | Open the palette |

The default shortcut is deliberately **off** `Ctrl/Cmd+K` (taken by
`dsh-spotlight`) and **off** `Alt+M` (taken by `dsh-model-palette`).
When a known conflict is detected, the palette surfaces it as a soft
notice inside the surface — it never silently overrides.

## What it does

- **One input box** across every enabled DSH capability the host
  exposes (commands, models, sessions, conversation hits, skills,
  references).
- **Rich item rows**: Conversation Hits carry a snippet line, taller
  row, and metadata badges (workspace · age).
- **Result-level Action Panel**: every result exposes `Open` /
  `Switch` / `Load` as primary, plus a small `…` that opens a second
  layer (`Tab` / `→`) with **Reference**, **Copy excerpt**, **Pin**,
  **Hide**, **Set alias**.
- **Deterministic ranking**: `0.46·text + 0.19·context + 0.15·frecency +
  0.10·pin + 0.10·providerHint`. No LLM call, no model tokens consumed
  by opening the palette.
- **Frecency** stored locally (`localStorage` under the
  `dsh-universal-palette` namespace). Pin/Hide/Alias persist the same
  way. `Reset ranking` clears frecency, not pins.
- **Provider isolation**: any single provider failure (throw, timeout,
  abort) hides only that category — every other category still
  searches and executes.
- **Capability detection** at activation: providers opt out when the
  host service is missing; the palette degrades silently instead of
  throwing.
- **Native contracts only**: no DSH DOM selectors scraped, no first-
  party React patched, no second session index built.

## Install

Requirements: `dsh` CLI on a `web` profile (developer preview).

```sh
dsh plugin --profile web add github:yunmin311/dsh-universal-palette#main
```

Then start DSH Web:

```sh
dsh --profile web
```

Press the default shortcut to open.

> **Optional but recommended for Conversation Hits:**
>
> `dsh-session-workbench` (formerly `dsh-session-kb`) is **not** a
> dependency. Universal Palette talks to the host's `ctx.sessionQuery`
> directly, but that service is only mounted when you opt in to
> `@deepseek-ai/dsh-tool-session-query` and a persistent FTS backend.
> Without it, the Conversation Hit category hides silently — every
> other category still works.

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
| `dsh-command-palette` | Double `Shift` | Sessions, workspaces, settings, features, custom prompts, provider extension | Universal Palette is **not** a settings navigator. It federates only the host's native contract surface and ships with explicit graceful degradation. |
| `dsh-session-workbench` (was `dsh-session-kb`) | sidebar tab | FTS fragment hits + locate + `@recall` | Universal Palette consumes `ctx.sessionQuery` when present; otherwise it degrades silently. It does **not** build a second FTS index. |
| `dsh-reference-anything` | `@` | Unified `@` menu (commands, skills, files, sessions, external conversations) | Universal Palette is a global action surface. Reference insertion is one secondary action among many on a result — it never replaces the `@` flow. |
| `dsh-model-palette` | `Alt+M` | Provider rail + model config + OpenRouter media | Universal Palette exposes Model as one item kind with `Switch` as primary; model configuration is **not** its concern. |
| `dsh-codex-ui` | sidebar replacement | Replaces main UI | Universal Palette is an additive overlay only. Uninstalling it leaves zero layout residue. |

Install any combination. Universal Palette picks a non-conflicting
shortcut by default; when conflicts are detected, it surfaces them
instead of overriding.

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

## Architecture

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the host /
browser split, capability probe, ranking math, provider contract, and
disposal guarantees.

## Compatibility matrix

See [`docs/COMPATIBILITY.md`](docs/COMPATIBILITY.md) for the verified
DSH API bindings, recorded deviations, runtime capability matrix, and
per-plugin coexistence behavior.

## Implementation evidence

[`IMPLEMENTATION_REPORT.md`](IMPLEMENTATION_REPORT.md) records the
final capability probe, verified commands, P0 acceptance, dedup
result, and verdict.

## License

MIT
