# Universal Palette — authoritative design contract

Status: **REVIEW_REQUIRED**. Locked by the user on 2026-09-05. This repairs implementation drift; it does not authorize a new design direction or business architecture.

## Approved visual direction

**DSH Native × Translucent Glass × High Density**: Raycast Root Palette glass, Obsidian restraint and efficiency, DSH's official design language. No independent branding, plain black modal, fullscreen backdrop, tabs, or category sidebar.

- Approximately 600px compact floating surface, in the upper visual area of the main workspace. Content determines height, including empty states. Approximately 5–8 primary results visible.
- One stable search input, following DSH locale: `搜索命令、会话、模型与历史…` / `Search commands, sessions, models, history…`.
- Small monochrome icons, title, quiet metadata/source/shortcut. Never a 64px text category column. History hits may be slightly taller with a single snippet line.
- Optional subtle Recent / Current / History labels. No tutorial popup.
- One quiet localized footer: `↑↓ 移动 · Enter 打开/执行 · Tab 操作 · Esc 关闭` / `↑↓ Navigate · Enter Open/Run · Tab Actions · Esc Close`.

## Native surface and typography

Reference: `deepseek-ai/deepseek-harness@76fda729799fe9b3848dbe2c211d4b231032b81e`, `PopupSelectView.module.css`, `ui-primitives` Menu/Input, `ui-theme`, and `ui-layout`.

Use `--dsw-specific-menu`, `--dsw-alias-label-primary`, `--dsw-alias-label-secondary/tertiary`, `--dsw-alias-interactive-bg-hover`, `--dsw-alias-border-*`, `--dsw-elevation-prominent`, and official easing/durations. Light and dark inherit DSH. Glass may use color-mix with transparent and backdrop-filter on the native menu surface. No invented `--dsh-surface-bg`, `--dsh-accent`, hardcoded black, or blue fallback.

Use the native menu's 13px title / 12px detail hierarchy, 20px outer radius, 8px row radius, and native prominent elevation. The search may use 14px for input legibility. Footer is weaker than result metadata.

## Interaction and state

- Ctrl+Shift+K toggles. Escape closes Action Panel first, then Palette.
- Outside pointer closes Palette without preventing or stopping the underlying click. Restore the original focus on close; the clicked control can subsequently receive normal browser focus.
- Slot root always has pointer-events:none. Only the visible surface opts into pointer-events:auto.
- Use a normal React component and CSS Module. Query/selection changes must preserve input identity, focus, caret, and IME composition.
- No workspace/session: `选择工作区开始`, with executable Select workspace / New session / Recent sessions using native public APIs.
- Workspace without session: create/open Session guidance. Commands and Models explicitly require an active Session.
- Active session, empty query: Pinned/Recent/Contextual across native Commands, Models, Sessions. No query match: `No results for "<query>"` with a short useful hint.
- Keep existing aggregator, providers, ranking and real DSH adapters. No invented catalog entries or fake conversations.

## Public API boundary and positioning

Do not read private layout stores or scrape host DOM. Investigate the locked public slot and standard props first. When no public geometry is available, use responsive visual positioning and disclose the precision limitation. Do not replace occupied root/conversation/sidebar slots to obtain geometry.

## Review gate

Real Windows DSH evidence must include no-session, empty-query, goal results, and Conversation Hit screenshots at approximately 1792×896, plus sidebar expanded/collapsed and dark/light checks. Cover cold start, workspace without session, active session, command/history search, Escape, toggle, outside click/pass-through, focus, themes and positioning.

Deliver HEAD, screenshots, per-item smoke results (or recording), and native token/component reuse. Do not push or mark READY automatically. Only the user may approve visual readiness.

## Design Gate refinement — 2026-09-05

- Search is relevance-first: title/name/alias/exact-prefix dominate. Descriptions are weak support and sparse description subsequences never qualify. A minimum textual relevance gate applies before context, pins and recency; never fill a searched list with unrelated results. Regression queries: goal, permission, flash, cobalt-otter-904.
- Glass must remain perceptible: official menu surface at approximately 70–82% opacity, 20–24px blur, light saturation, hairline native border and weak native elevation. Current implementation: 76%, blur22px, saturation1.12, native panel elevation. No hardcoded colors. Text stays at native opaque contrast.
- All owned UI copy follows DSH's active locale through the public locale service. User titles, snippets, model names, protocol command names and source brand names remain original content. Empty-query groups are subtle (当前 / 快捷操作 / 模型); search uses one mixed list.
- Conversation hits show a quiet 历史 · 相对时间 · 工作区 metadata line alongside the title, without adding a row of height.

## Interoperability direction — reserved for v0.2

The richer the DSH community becomes, the more useful Universal Palette should become. The default is federation/consumer, not asking the ecosystem to implement a Palette SDK.

1. Zero-adapter cooperation: consume the official Human Command / command registry so capabilities registered there can be discovered naturally. The current Host command adapter consumes the complete public live catalog. The locked Client command UI has no public enumeration contract; do not scrape its private registry or claim universal Client-only coverage. Follow future official public discovery contracts when available.
2. Optional known-plugin enhancements: only stable public contracts, no hard dependencies or phantom results when absent. Future candidates include Session Workbench history/recall, Reference Anything references, Keys Palette action/shortcuts and TUI Command Ext commands. These are examples for later investigation, not current integrations.
3. Handoff ownership: discover, search and dispatch actions. Do not copy a community plugin's UI, database or business logic. Future secondary actions may open Session Workbench or insert via Reference Anything.

Source/provenance may appear very quietly; no plugin categories, tabs, Marketplace or plugin-centric navigation. The internal item model retains optional source metadata and opaque primary/secondary actions; these are internal data, not a public registration protocol. Do not restore public registerProvider() unless real future evidence proves official command/reference/action contracts insufficient.

This round changes documentation only for community interoperability. No community-plugin installs, new adapters or expanded V1 scope. Real interoperability acceptance belongs to a separate v0.2 interoperability milestone.

## Final pre-commit instruction

The user confirmed Design Gate broadly passed and froze overall visual design, glass, positioning, locale, result layout and architecture. Only fix empty-query duplicate Sessions, then run existing tests/smoke and commit/push with this contract, interoperability direction and evidence. Stable Session ID determines identity; Current wins and other distinct Sessions backfill before the result cap. Do not merge different Sessions by title or aggressively deduplicate across result types. No expansion of v0.2 work is authorized.
