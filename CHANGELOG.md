# Changelog

All notable changes to `@yunmin311/dsh-universal-palette`. Format follows Keep a Changelog; versions follow SemVer.

## 0.2.1 — 2026-09-14

Hardening release (locked to `@deepseek-ai/dsh@0.1.2-rc.1` baseline, verified against `0.1.5-rc.1`):

- Strict fail-closed `/find` Host collision handling: only a successful, contract-valid catalog that provably lacks exact `find` allows the claim; `ok:true,value:undefined`, malformed payloads, probe errors, and unresolved catalog state all deny/withdraw.
- Bounded provider soft deadline: shared 600ms deadline publishes whatever resolved; late providers marked `late` and ignored — no N×deadline stalls, fast results never held hostage.
- Zero-session navigation fixes: workspace/session rows execute real public API flows (workspace registration, session creation, Recent sessions open), no dead rows.
- Stale action-error reset: failed action closes/reopens clear the error; query change or draft edit also clears; mode switch clears.
- Production context-aware ranking wiring: aggregator receives live `sessionId` + `workspaceId` from host adapters; cross-domain ranking with workspace/session boosts, frecency, pins.
- Lifecycle/dispose cleanup: controller/aggregator/preferences/cold-observable cleanup on dispose; no duplicate callback fan-out, no ghost state on reload.
- Hero disabled diagnostic + shortcut conflict visibility: disabled Search button shows localized reason (`当前宿主的 Hero 页面不支持 Composer Search。`); Alt+M conflict notice renders inside palette.
- Removed misleading Tab Actions footer.
- Typed-query suppression regression discovered/fixed during real runtime smoke: `prepareView` compared draft against write-never controller `query` instead of aggregator live `query`, suppressing every non-empty result list; fixed to compare against aggregator query.

## 0.2.0 — 2026-09-06

Interoperability foundation (locked to `@deepseek-ai/dsh@0.1.2-rc.1`, upstream `deepseek-ai/deepseek-harness@76fda729…`). No visual or ranking change from 0.1.0.

- Verified zero-adapter Host command federation: Host extension commands (e.g. dsh-tui-command-ext's `/clear` `/rename` `/unarchive` `/compact-fast`) appear in the Palette automatically through the official command catalog; Client-only commandUi commands stay out of scope (no private registry reads).
- Optional dsh-keys-palette bridge: registers one `universal-palette.open` action on the public `keys.actions` service so users can bind a shortcut to open the Palette. Capability-detected, late-provide safe, lifecycle-disposed; zero behavior change when dsh-keys-palette is absent.
- Verified coexistence with dsh-tui-command-ext 0.1.0, dsh-session-workbench 1.0.0, dsh-reference-anything 0.4.0 and dsh-keys-palette 0.2.0 installed together (real DSH boots, stages A–F).
- Upstream public API gaps documented with minimal proposals (`docs/UPSTREAM_INTEROP_GAPS.md`): client command discovery, span-free composer reference insertion, trigger-source roster.
- Known limitation: dsh-keys-palette 0.2.0 defaults `cycle-theme` to `Mod+Shift+K`, which collides with the Palette's frozen `Ctrl+Shift+K` toggle on Windows; rebind on either side.

## 0.1.0 — 2026-09-03

Initial release: DSH-native translucent-glass Universal Palette federating Commands, Models, Sessions and Conversation Hits over the locked public DSH Client APIs, with deterministic context/frecency ranking, zh/en locale following, and real DSH integration acceptance on Windows.
