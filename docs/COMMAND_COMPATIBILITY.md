# Command Compatibility

How Universal Palette stays compatible with DSH's Host command catalog as it grows.

## Dynamic federation

The Commands provider has no allowlist, no static name table, and no per-command switch logic. Every row comes from the live official catalog (`ctx.remote.commands.list(sessionId)`) on every query, and execution goes through the official `ctx.remote.commands.execute`. When DSH or any plugin registers a new Host command, it appears in the Palette with no source change and no release.

The only special-cased surface is DSH's own Client-side `/model` contribution (registered by the required `ui-model-selection` package): it is invoked through the official slash-pipeline adjudication, never synthesized.

## Locked baseline

- `@deepseek-ai/dsh@0.1.2-rc.1` (`deepseek-ai/deepseek-harness@76fda729799fe9b3848dbe2c211d4b231032b81e`)

## Current live acceptance

The Official Command Compatibility Gate (`scripts/command-compat.mjs`) iterates the real live catalog of a running session and requires, for every command:

- exact-query discovery (`/<name>` returns the command row);
- top relevance (the exact command ranks first);
- no permanent loss as the catalog grows (no count is hardcoded anywhere — the gate iterates whatever is live);
- parameterized commands stay discoverable;
- safe/read-only commands execute; mutating or argument-requiring commands are discovery-verified only.

Latest machine record: [`evidence/2026-09-06-command-compat/official-command-catalog-final-mixed.json`](../evidence/2026-09-06-command-compat/official-command-catalog-final-mixed.json) — every live command discoverable, including third-party Host commands installed at runtime.

## Client-only limitation

DSH's Client command surface (`ctx.commandUi`) exposes `register` / `decorate` / `popupFor` only — there is no public enumeration, so Client-only commands (e.g. `/rewind`-style popup commands) are invisible to the Palette. Their private registry is not read. See [`UPSTREAM_INTEROP_GAPS.md`](UPSTREAM_INTEROP_GAPS.md).

## Upgrade procedure

No procedure. Upgrade DSH, run `pnpm run check` and the Command Compatibility Gate against a real session; the gate output is the acceptance record. If a future DSH rename breaks the two official calls, the typed public API surface (`@deepseek-ai/dsh-api-remotes`) fails typecheck first.
