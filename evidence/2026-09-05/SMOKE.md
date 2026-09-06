# Windows DSH P0 UX smoke — REVIEW_REQUIRED

2026-09-05 · DSH 0.1.2-rc.1 · locked SHA 76fda729799fe9b3848dbe2c211d4b231032b81e.

Base HEAD: `c1273e7d2d59679566a6a990bdb02cd05d7991ba`; UI repairs are uncommitted working-tree changes. No push. Visual approval is pending.

Real Windows Node DSH Web backends, real Microsoft Edge, 1792×896 viewport. Screenshots are headless browser captures of the actual application, not mock pages. A Windows native directory dialog was also operated through desktop UI automation. Only the isolated `.dsh-ux-cold-20260905` and `.dsh-smoke-20260904-01` profiles were used.

## Matrix

| Case | Result | Evidence / observed behavior |
|---|---|---|
| A No workspace / no Session | PASS | First empty-profile boot showed 3 guidance actions. Native Select workspace opened Windows “Select Workspace Directory”; selecting the repository registered a real Workspace and opened its Session. Final [no-session image](01-no-session.png) additionally has one real persisted recent conversation. [Initial clean-profile image](cold-initial.png) was captured earlier in the repair, before the final row-padding adjustment. |
| B Workspace / no Session | PASS | [State](workspace-no-session.png) says 创建或打开 Session and explicitly scopes Commands/Models. Select workspace lists real registry entries; selecting one opens it. New session calls official navigation. |
| C Active Session / empty query | PASS | [Eight rows](02-empty-query.png), including Commands, Models and Sessions. No fixed empty-box height. |
| D Command search | PASS | [goal results](03-goal-results.png) contains official `/goal`. Live Host catalog: compact, export, feedback, goal, permission, plan. Full command details below. |
| E History search | PASS | [Conversation Hit](04-conversation-hit.png) for cobalt-otter-904; clicking opens the exact Session id returned by public sessions.search. |
| F Escape / focus | PASS | In real DSH, one Esc closes root and restores the composer/control that was focused before opening. Two-stage Actions→Palette Escape passes in the real Edge component test. Current public providers have no secondary actions, so no production Action Panel screenshot is claimed. |
| G Shortcut toggle | PASS | Ctrl+Shift+K opens and then closes; original focus restored. |
| H Outside click / pass-through | PASS | With Palette open, clicking DSH sidebar toggle changes sidebar and closes Palette in the same gesture. Clicking the underlying composer closes, focuses and permits editing; test text is removed afterward. Computed root pointer-events=none, surface=auto. |
| I Light / dark | PASS | Changed through native DSH Settings: [light](theme-light.png), [dark](theme-dark.png). Menu surface resolves to DSH #fff / #353638 with 0.9 alpha, primary text to native rgb(15,17,21) / rgb(249,250,251), blur18px. These colors are measured host token values, not authored fallbacks. |
| J Sidebar wide / compact | PASS with geometry limitation | [Expanded](sidebar-expanded.png): x736; [collapsed](sidebar-collapsed.png): x624. Both width600 at viewport1792. Centers1036/924 match default main-area centers. Public wide prop only; arbitrary sidebar dragging/details-pane geometry is unavailable. |
| No-hit query | PASS | [No results](no-results.png) names the query and suggests a shorter phrase/command. |
| Input DOM / caret | PASS | Real Edge component test preserves the same input node after text insertion and selection changes. |

## Official command execution

| Command | Actual result | Locked official source |
|---|---|---|
| `/goal` | Executed; “No goal is currently set” and official usage. | packages/goal/command-goal |
| `/model` | [Official model picker](model-native.png) opened via public Client input-trigger adjudication. This command is registered on the Client by required ui-model-selection, not in the Host catalog. | packages/client/ui-model-selection/src/client/index.ts |
| `/permission` | Reported current workspace-write preset and available presets; no permission change. | packages/interaction/permission-presets/README.md |
| `/plan` | “Plan mode on”; restored with `/plan off`, receiving “Plan mode off.” No model request. | packages/plan/plan-mode/README.md |
| `/feedback` | Official input-required error is displayed in the Palette. This verifies registration/execution/error handling; it is not a successful feedback submission. | packages/feedback/command-feedback/README.md |

The pre-existing history contains an earlier MISSING_CREDENTIAL model-turn error. This repair did not create that record or issue a paid model request. Tests ran with telemetry disabled. No feedback text was submitted.

## Evidence and reproduction

- `pnpm run check`: typecheck + 27 tests passed. `pnpm run build`: Host ESM + client lazy-CJS passed.
- `node scripts/smoke-dsh.mjs`: real runtime assertions; [machine-readable results](smoke-results.json). Reads authenticated URLs only from isolated profile logs and captures the actual public plugin activation Context for observation/navigation.
- Browser page errors: none. Host stderr: Node SQLite experimental warning only.
- Local trace is excluded from Git because it contains authenticated URLs; screenshots and per-item results are the shareable review evidence.
- [Design lock](../../docs/DESIGN_CONTRACT.md), [official token/component inventory and limitations](../../IMPLEMENTATION_REPORT.md).

Final status remains **REVIEW_REQUIRED**. Default sidebar positioning passes; exact positioning for arbitrary resized sidebar/details pane is intentionally not claimed.
