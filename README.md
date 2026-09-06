# dsh-universal-palette

[![npm version](https://img.shields.io/npm/v/@yunmin311/dsh-universal-palette.svg)](https://www.npmjs.com/package/@yunmin311/dsh-universal-palette)
[![GitHub release](https://img.shields.io/github/v/release/yunmin311/dsh-universal-palette.svg)](https://github.com/yunmin311/dsh-universal-palette/releases)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![DSH](https://img.shields.io/badge/DSH-0.1.2--rc.1-2962ff.svg)](docs/COMPATIBILITY.md)
[![node](https://img.shields.io/node/v/%40yunmin311/dsh-universal-palette.svg)](package.json)
[![CI](https://github.com/yunmin311/dsh-universal-palette/actions/workflows/ci.yml/badge.svg)](https://github.com/yunmin311/dsh-universal-palette/actions/workflows/ci.yml)

Language: English | [简体中文](README.zh-CN.md)

A command, session, model, and history surface for DeepSeek Harness Web — one keystroke, everything running in the current workspace.

![Universal Palette open over DSH Web in dark theme](https://raw.githubusercontent.com/yunmin311/dsh-universal-palette/main/docs/assets/readme/hero.png)

## Why Universal Palette

DSH grows capabilities through plugins: each release and each community plugin can add Host commands, client command UIs, models, and reference sources. The native surfaces for these live in different places — the slash menu, the model selector, the sidebar, the composer's `@` menu — and none of them answer the one question a keyboard-first user actually has: *what can I do right now, in this workspace, and how do I get there?*

Universal Palette is a single translucent overlay on `Ctrl+Shift+K` that federates those surfaces into one deterministic, relevance-ranked list. It owns no second catalog: every command, session, model, and history hit it shows comes from DSH's public Client APIs at query time, so the Palette is automatically correct as DSH and its ecosystem change.

It is built to stay out of the way: DSH's own design tokens, glass over the native surface, locale-following copy, and zero behavior change for anything it does not have a verified public contract with.

## Features

- **Commands** — the complete live Host command catalog, searched and executed through official APIs; new Host commands from DSH or any plugin appear automatically with zero adaptation.
- **Models** — the session's real model directory with the current selection, submitted through the public selection contract.
- **Sessions** — current-first session navigation with stable identity dedupe, no title-based merging.
- **Conversation Hits** — full-text history search via DSH's own session search, with snippet and metadata.
- **Deterministic relevance** — exact-prefix-first scoring with a minimum relevance gate; recency and context only order genuinely relevant rows.
- **Native look and locale** — DSH design tokens, official menu typography and elevation, glass surface, zh/en copy following DSH's locale.
- **Public-contract interoperability** — capability-detected cooperation with community plugins; no private registry reads, no hard dependencies.

## Quick Start

```powershell
dsh plugin --profile web add @yunmin311/dsh-universal-palette@0.2.0
dsh --profile web
```

Press `Ctrl+Shift+K` (Windows/Linux) or `Cmd+Shift+K` (macOS) to toggle. `Esc` closes, outside clicks close and pass through to DSH.

## Usage

| Gesture | Result |
|---|---|
| `Ctrl/Cmd+Shift+K` | Toggle the Palette |
| Type | Fuzzy search across commands, models, sessions, and history |
| `↑↓` | Move selection |
| `Enter` | Open / run the selected row |
| `Tab` | Action panel (infrastructure; current built-in providers expose primary actions only) |
| `Esc` | Close |

![Searching the goal command](https://raw.githubusercontent.com/yunmin311/dsh-universal-palette/main/docs/assets/readme/command-search.png)

![A conversation hit with snippet and metadata](https://raw.githubusercontent.com/yunmin311/dsh-universal-palette/main/docs/assets/readme/conversation-hit.png)

## Search surfaces

| Surface | Source contract | Action | Needs active session |
|---|---|---|---|
| Commands | `ctx.remote.commands.list / execute` (official Host catalog) | Execute | Yes |
| Models | `ctx.modelDirectories` (official model directory) | Select | Yes |
| Sessions | `ctx.sessions` (official session controller) | Open | No |
| Conversation Hits | `ctx.sessions.search` (official FTS boundary) | Open | No |

## Community interoperability

Interoperability is verified against real installed plugins — see the [interoperability matrix](docs/INTEROPERABILITY_MATRIX.md).

- **Host command federation: automatic.** Host commands from community plugins (e.g. dsh-tui-command-ext's `/clear` `/rename` `/unarchive` `/compact-fast`, or a `/code-review` plugin) appear and execute with zero adaptation — the Palette reads the live official catalog.

  ![A third-party Host command discovered by exact query](https://raw.githubusercontent.com/yunmin311/dsh-universal-palette/main/docs/assets/readme/interop-command.png)

- **dsh-keys-palette: optional public bridge.** Registers one `universal-palette.open` action on its public `keys.actions` registry so you can bind a shortcut to open the Palette. Absent plugin, zero effect.
- **Tested coexistence:** dsh-tui-command-ext, dsh-session-workbench, dsh-reference-anything, dsh-keys-palette, dsh-market — all verified installed together on real DSH boots.
- **No private coupling.** Session Workbench and Reference Anything publish no public handoff API; the Palette integrates nothing beyond coexistence and documents upstream gaps instead of hacking around them.

This is not "supports all plugins" — only the contracts above are consumed, capability-detected, with zero behavior change when absent.

## For plugin authors

Universal Palette federates DSH's public contracts — you do not integrate with the Palette to become visible in it.

- **Host commands**: register through DSH's official Host command contract (`ctx.commands.register`) and the Palette discovers you automatically from the live catalog on every query. No Palette dependency, no adapter, no release coordination.
- **Deeper interoperability**: an optional, capability-detected adapter is considered only when your plugin exposes a stable public Cordis service. It must be zero-impact when your plugin is absent and lifecycle-safe when it unloads. The working example is dsh-keys-palette's public `keys.actions` registry, which the Palette uses to contribute one bindable "open" action.
- **Client-only `commandUi` commands, private registries, DOM state, and internal routes are off the table** — the Palette keeps plain coexistence there and waits for a public API ([upstream gaps](docs/UPSTREAM_INTEROP_GAPS.md)).
- **Session / reference / workspace plugins**: the same rule applies. A public handoff service or official contract is the only path into Palette secondary integrations; no public seam means `WAIT_PUBLIC_API`.

Universal Palette currently has no Provider SDK, and none is planned. The preferred ecosystem path is: **register with DSH, and the Palette federates public contracts.** Details and verified cases: [interoperability matrix](docs/INTEROPERABILITY_MATRIX.md).

## Compatibility

Verified and locked against `@deepseek-ai/dsh@0.1.2-rc.1` (`deepseek-ai/deepseek-harness@76fda729799fe9b3848dbe2c211d4b231032b81e`). Other DSH revisions are unverified. Details: [COMPATIBILITY.md](docs/COMPATIBILITY.md), [COMMAND_COMPATIBILITY.md](docs/COMMAND_COMPATIBILITY.md).

## Privacy & Security

- No telemetry and no analytics.
- No network requests of its own: everything goes through DSH's in-process public Client APIs.
- No credentials read or stored; the demo/acceptance profiles run credential-free by design.
- User preferences (shortcut, frecency) live in browser `localStorage` under the Palette's own namespace.
- History search delegates to DSH's session FTS; its database belongs to the DSH profile, not to this plugin.

## Testing

- `pnpm run check` — typecheck + unit tests (including the Keys Palette bridge lifecycle).
- `pnpm run build` — host ESM face + browser CJS bundle with a purity gate.
- Real DSH acceptance on Windows: official command compatibility gate ([`scripts/command-compat.mjs`](scripts/command-compat.mjs)), multi-plugin coexistence probes ([`scripts/interop-probe.mjs`](scripts/interop-probe.mjs)), and recorded evidence under [`evidence/`](evidence/).

## Known limitations

- Locked to DSH `0.1.2-rc.1`; other revisions are unverified.
- Client-only `commandUi` commands (e.g. popup pickers) are not discoverable — DSH exposes no public enumeration yet ([upstream gaps](docs/UPSTREAM_INTEROP_GAPS.md)).
- dsh-keys-palette's default `Mod+Shift+K` (cycle theme) collides with the Palette's `Ctrl+Shift+K` on Windows; rebind either side.

## Development

```powershell
pnpm install
pnpm run check
pnpm run build
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Compatibility](docs/COMPATIBILITY.md)
- [Command compatibility](docs/COMMAND_COMPATIBILITY.md)
- [Design contract](docs/DESIGN_CONTRACT.md)
- [Interoperability matrix](docs/INTEROPERABILITY_MATRIX.md)
- [Upstream interop gaps](docs/UPSTREAM_INTEROP_GAPS.md)
- [Changelog](CHANGELOG.md)

## License

[MIT](LICENSE)
