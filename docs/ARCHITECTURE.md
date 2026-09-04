# Architecture

## Trust boundary

Universal Palette is a browser-only UI capability over DSH-owned state. It does not own a second command catalog, Session list, Model directory, or history index.

```text
DSH host services
  remote.commands / session-query-sqlite
             |
DSH public browser services
  sessions / workspaces / modelDirectories / slots
             |
typed adapters -> existing aggregator/ranking/preferences -> existing Palette UI
```

The locked contract is `deepseek-ai/deepseek-harness@76fda729799fe9b3848dbe2c211d4b231032b81e`, package version `0.1.2-rc.1`.

## Browser activation

`src/client/index.ts` exports Cordis `inject` and `apply(ctx)`. Activation builds four typed adapters and registers a React component through:

```ts
ctx.slots.inject('shell.overlay', () =>
  ctx.slots.register({ name: 'shell.overlay', id: 'dsh-universal-palette' }, Component))
```

There is no `document.body` fallback, DOM query, or private store access.

## Adapter ownership

- Commands read and execute against the selected top-level Session through `ctx.remote.commands`. A Remote failure, rejected command, or command error becomes an explicit thrown error.
- Sessions map the single `ctx.sessions.list` observable snapshot and the `ctx.workspaces.list` snapshot. Pending lists use `ctx.sessions.refresh()`; opening uses `ctx.sessions.open(id)`. Archived and subagent Sessions are excluded.
- Models resolve the selected top-level Session with `directoryFor(sessionId)`, await `load()`, map `groups/current`, and submit the complete public `ModelSelection` to `select()`.
- Conversation Hits use `ctx.sessions.search(query, signal)`, which delegates to the Host's visible-message search. The returned snippet is both rendered and included as an item keyword so the unchanged ranking layer can match event text.

The aggregator receives a live context getter derived from the same Session and Workspace snapshots. Ranking, preferences, keyboard behavior, and Palette presentation remain internal and unchanged.

## Bundle and composition

`tsdown.client.ts` emits:

- `lib/index.js`: ESM host face;
- `lib/client.js`: CJS browser face wrapped in `window.__ModuleLoader__.load({ id, factory })`.

React, Cordis, client-store, ui-slots, and ui-primitives remain platform externals. DSH service packages are type-only imports; their public declarations make invalid API calls fail typecheck without adding browser value imports.

`cordis.patch.yml`:

- overrides `session-query-sqlite` with the DSH-home path and `openAt: first-search`;
- inserts `@yunmin311/dsh-universal-palette` into the Web composition.

## Failure behavior

Provider failures stay isolated by the existing aggregator. Abort signals stop stale queries. Missing current Sessions produce a legitimate empty provider result. No adapter fabricates host state or substitutes sample data.
