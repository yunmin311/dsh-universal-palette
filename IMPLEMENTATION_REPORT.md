# Implementation report

**Date:** 2026-09-04
**Verdict:** READY
**Locked upstream:** `deepseek-ai/deepseek-harness@76fda729799fe9b3848dbe2c211d4b231032b81e`
**Locked package:** `@deepseek-ai/dsh@0.1.2-rc.1`

## Delivered

The four P0 adapters now call the locked public DSH Client APIs directly. The former neutral Host surface and its local declarations were removed. The existing aggregator, ranking, preferences, keyboard, and Palette UI remain the product implementation.

The browser entry uses the real Cordis service names, the official `shell.overlay` injection/register contract, and the lazy-CJS `lib/client.js` artifact. The package manifest declares the exact DSH type packages and the browser service-contributor packages.

## Automated verification

The final verification set covers:

- real adapter call shapes and Remote failure translation;
- subagent/archive exclusion and the single Session snapshot;
- Model directory load/select with complete selections;
- Conversation snippet searchability and Session open;
- Cordis activation and the two-argument slot registration;
- existing aggregation, ranking, keyboard, preferences, patch, and bundle contracts;
- TypeScript against the installed `0.1.2-rc.1` declarations;
- CJS browser and ESM host builds.

Final result: 22 tests passed, 0 failed; typecheck and both build faces passed.

## Real Windows DSH acceptance

An isolated home at `E:\1project\dsh-universal-palette\.dsh-smoke-20260904-01` was used; the normal profile was not modified.

1. Confirmed `dsh --version` as `0.1.2-rc.1`.
2. Added the repository with `dsh plugin --profile web add "<repo>"`.
3. Booted the Web profile repeatedly with isolated logs.
4. Opened Universal Palette with `Ctrl+Shift+K`.
5. Observed real rows for Commands, the persisted Session, and DeepSeek models.
6. Executed the safe `/goal` command; DSH displayed its real “No goal is currently set” result.
7. Selected DeepSeek-V4-Pro; DSH's own model selector updated to `DeepSeek-V4-Pro · High`.
8. Searched `cobalt-otter-904`; the Host returned the real history snippet, and Enter opened the matching Session.
9. Stopped and restarted DSH again; the plugin, the current Model, all three base categories, and the same Conversation Hit remained available.

No boot contained `Failed to load plugins`, `Unexpected token export`, or a client activation exception. Stderr contained only Node's SQLite experimental warning.

## Limitation observed

The isolated profile intentionally had no DeepSeek API credential. The one seeded model turn therefore produced DSH's expected `MISSING_CREDENTIAL` record. This is outside the Palette's Client API wiring and did not block the required safe command, Model switch, Session open, FTS search, or restart acceptance.
