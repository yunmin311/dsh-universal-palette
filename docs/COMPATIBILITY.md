# Compatibility

## Locked baseline

| Item | Value |
|---|---|
| Upstream | `deepseek-ai/deepseek-harness` |
| Commit | `76fda729799fe9b3848dbe2c211d4b231032b81e` |
| DSH package | `@deepseek-ai/dsh@0.1.2-rc.1` |
| Verified profile | `web` on Windows |

## Public Client API bindings

| Surface | Locked public contract | Universal Palette use |
|---|---|---|
| Commands | `ctx.remote.commands.list(sessionId)`; `execute(sessionId, line, images, signal)` | Lists the current top-level Session catalog, executes `/<name>` with an empty image list, and surfaces every Remote/command failure. |
| Sessions | `ctx.sessions.list: ObservableSnapshot<SessionListState>`; `refresh()`; `open(id)`; `binding(id)`; `subagentAddress(id)` | Maps `ids/byId/current/phase`, uses the DSH Workspace snapshot, opens through DSH, and excludes archived/subagent rows. |
| Workspaces | `ctx.workspaces.list.getSnapshot(): WorkspaceSnapshot` | Resolves Session membership and the current ranking context without another state store. |
| Models | `ctx.modelDirectories.directoryFor(sessionId)`; `ModelDirectory.load()`; `select(selection)` | Maps `ModelDirectoryState.groups/current` and submits a real `ModelSelection`. |
| Conversation Hits | `ctx.sessions.search(query, signal)` | Uses the Host-visible message index, displays its snippet, and opens the returned Session id. |
| Slots | `ctx.slots.inject(name, callback)`; `ctx.slots.register(options, Component)` | Renders in `shell.overlay`; a null `sidebar.footer.action` contribution observes public `wide` owner prop only. |
| Cold start | `ctx.uiWorkspace.pickDirectory()`, `connectWorkspace(id)`, `startSession()`; `ctx.workspaces.create({path})` | Native directory picker and workspace/session navigation. |
| Client /model | `ctx.inputTriggers.sessionOf(ctx.sessions.scope(id)).adjudicate('/model', signal, {images:0})` | Opens the official Client model command registered by required `ui-model-selection`; never calls Host execute for this Client-only command. |
| Locale | `ctx.locale.register/bind/getSnapshot/subscribe` | Registers balanced zh/en dictionaries; public live locale state updates all owned copy without replacing the input. |

Type declarations come from the exact `0.1.2-rc.1` DSH packages in `devDependencies`. There is no local Cordis ambient declaration.

## Manifest and runtime values

`package.json.dsh.client.inject` names the packages that contribute the required browser services:

- `@deepseek-ai/dsh-api-remotes`
- `@deepseek-ai/dsh-api-session-controller`
- `@deepseek-ai/dsh-api-workspace-controller`
- `@deepseek-ai/dsh-client-ui-model-selection`
- `@deepseek-ai/dsh-client-ui-renderer`
- `@deepseek-ai/dsh-client-ui-layout`
- `@deepseek-ai/dsh-client-ui-workspace`
- `@deepseek-ai/dsh-client-ui-sidebar`
- `@deepseek-ai/dsh-client-ui-input-trigger`
- `@deepseek-ai/dsh-client-locale`

The locked public API has no live main-content rectangle. Responsive positioning uses the public sidebar `wide` prop, with no private-store/DOM measurement. Exact positioning after arbitrary sidebar resizing or details-pane opening is not claimed. See [design contract](DESIGN_CONTRACT.md). Status: **REVIEW_REQUIRED**.

The runtime Cordis `inject` export uses service names: `remote`, `remote.commands`, `sessions`, `workspaces`, `modelDirectories`, and `slots`.

## FTS

The Web patch retains:

```yaml
- id: session-query-sqlite
  config:
    path: !!js dshHomePath('session-query.sqlite')
    openAt: first-search
```

The browser does not call the Host-only `sessionQuery` service directly. `ctx.sessions.search` is the public browser boundary and delegates to the locked Host implementation.

## Verified deviations

- Conversation Hits are enabled for this plugin's Web profile rather than accepting the upstream default `openAt: never`.
- The Palette intentionally excludes subagent command/session/model surfaces.
- Image-bearing command execution is not exposed by this V1 UI; command execution passes the public empty image array.
