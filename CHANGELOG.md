# Changelog

All notable changes to `@yunmin311/dsh-universal-palette`. Format follows Keep a Changelog; versions follow SemVer.

## 0.2.0 — 2026-09-06

Interoperability foundation (locked to `@deepseek-ai/dsh@0.1.2-rc.1`, upstream `deepseek-ai/deepseek-harness@76fda729…`). No visual or ranking change from 0.1.0.

- Verified zero-adapter Host command federation: Host extension commands (e.g. dsh-tui-command-ext's `/clear` `/rename` `/unarchive` `/compact-fast`) appear in the Palette automatically through the official command catalog; Client-only commandUi commands stay out of scope (no private registry reads).
- Optional dsh-keys-palette bridge: registers one `universal-palette.open` action on the public `keys.actions` service so users can bind a shortcut to open the Palette. Capability-detected, late-provide safe, lifecycle-disposed; zero behavior change when dsh-keys-palette is absent.
- Verified coexistence with dsh-tui-command-ext 0.1.0, dsh-session-workbench 1.0.0, dsh-reference-anything 0.4.0 and dsh-keys-palette 0.2.0 installed together (real DSH boots, stages A–F).
- Upstream public API gaps documented with minimal proposals (`docs/UPSTREAM_INTEROP_GAPS.md`): client command discovery, span-free composer reference insertion, trigger-source roster.
- Known limitation: dsh-keys-palette 0.2.0 defaults `cycle-theme` to `Mod+Shift+K`, which collides with the Palette's frozen `Ctrl+Shift+K` toggle on Windows; rebind on either side.

## 0.1.0 — 2026-09-05

Initial release: DSH-native translucent-glass Universal Palette federating Commands, Models, Sessions and Conversation Hits over the locked public DSH Client APIs, with deterministic context/frecency ranking, zh/en locale following, and real DSH integration acceptance on Windows.
