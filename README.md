# dsh-universal-palette

Universal Palette for DeepSeek Harness Web.

**2026-09-05 Design Gate:** the user accepted the overall direction and authorized commit/push after the final Session identity dedupe. Search, glass, locale and layout are frozen. The [authoritative design contract](docs/DESIGN_CONTRACT.md) records the future v0.2 interoperability direction; no v0.2 adapter is included. See the [current report](IMPLEMENTATION_REPORT.md) and [latest Windows evidence](evidence/2026-09-05-design-gate/SMOKE.md).

## Compatibility

This release is locked to:

- `deepseek-ai/deepseek-harness@76fda729799fe9b3848dbe2c211d4b231032b81e`
- `@deepseek-ai/dsh@0.1.2-rc.1`

Other DSH revisions are not covered by this acceptance record.

## Install and run

```powershell
dsh plugin --profile web add "<repository-path>"
dsh --profile web
```

Press `Ctrl+Shift+K` on Windows/Linux or `Cmd+Shift+K` on macOS to toggle. Escape closes Actions first, then the Palette. Outside clicks close and pass through to DSH.

## Real DSH integration

The browser plugin uses the locked public Client APIs directly:

- Commands: `ctx.remote.commands.list(sessionId)` and `execute(sessionId, line, images, signal)`.
- Sessions: `ctx.sessions.list.getSnapshot()`, `ctx.sessions.refresh()`, `ctx.sessions.open(id)`, `ctx.sessions.binding(id)`, and `ctx.sessions.subagentAddress(id)`.
- Models: `ctx.modelDirectories.directoryFor(sessionId)`, then `directory.load()` and `directory.select(selection)`.
- Conversation Hits: `ctx.sessions.search(query, signal)`; the result snippet is displayed and participates in the existing fuzzy match.
- Mounting: `ctx.slots.inject('shell.overlay', ...)` and the two-argument `ctx.slots.register(options, Component)` contract.

The package keeps the official lazy-CJS browser artifact at `lib/client.js`. The Cordis patch inserts the plugin row and configures `session-query-sqlite` with `path: !!js dshHomePath('session-query.sqlite')` plus `openAt: first-search`.

## Historical adapter smoke (superseded for UX acceptance)

On 2026-09-04, an isolated `DSH_HOME` with DSH `0.1.2-rc.1` completed:

- local plugin add and repeated real Web boots;
- Palette opening through `Ctrl+Shift+K`;
- real Command, Session, and Model rows;
- safe `/goal` execution;
- switch from DeepSeek-V4-Flash to DeepSeek-V4-Pro with the DSH selector updating;
- search for `cobalt-otter-904` returning the real conversation snippet and opening its Session;
- another full DSH restart followed by the same Palette and history-search checks.

The isolated profile had no DeepSeek API credential. The seeded model turn therefore recorded DSH's expected `MISSING_CREDENTIAL` error; this did not affect Client API, command, model-selection, session, or FTS acceptance.

## Development

```powershell
pnpm install
pnpm run typecheck
pnpm run test
pnpm run build
```

See [Architecture](docs/ARCHITECTURE.md), [Compatibility](docs/COMPATIBILITY.md), and [Implementation report](IMPLEMENTATION_REPORT.md).
