# Upstream DSH interop gaps — minimal API proposals

Status: evidence-backed proposals for `deepseek-ai/deepseek-harness@76fda729799fe9b3848dbe2c211d4b231032b81e` (`@deepseek-ai/dsh@0.1.2-rc.1`). Each gap below was verified against the shipped type declarations of the locked packages, not against runtime guesses. Universal Palette works within today's contracts; these proposals unblock capabilities that currently have no legal path. Each proposal is deliberately small: one read-only face, one insert face, one optional roster view — no new protocol framework.

---

## 1. Read-only Client command discovery (`commandUi`)

**Status quo (locked SHA).** `@deepseek-ai/dsh-client-ui-commands` declares the public `CommandUiContract` as:

```ts
interface CommandUiContract {
  register(contribution: CommandContribution): () => void;
  decorate(decoration: CommandDecoration): () => void;
  popupFor(actx: ClientContext): unknown; // wiring-internal
}
```

The contract's own doc comment states "Business packages consume `register` alone." The contribution registry (`directory`) is private; there is no list/snapshot/subscribe. Client-only commands (`CommandContribution`: `/rewind`, `/fork`, `/resume`, `/archive`, `/status`, `/theme`, `/lang` in real plugins) are invisible to any aggregator; only the native slash menu renders them.

**Real use case.** Universal Palette federates the official Host command catalog (`ctx.remote.commands.list(sessionId)`) and executes through `ctx.remote.commands.execute`. Today it cannot surface client-owned commands at all, so users get two divergent command worlds: palette-visible Host commands and palette-invisible client commands. The gap was measured with `dsh-tui-command-ext@0.1.0` (4 Host commands auto-appear; 7 client commands invisible).

**Why the current contract is not enough.** `register` is write-only by design. There is no legal read path, and the alternatives (reading the private `directory`, scraping the rendered slash menu DOM) are exactly what the interop rules forbid.

**Minimal interface shape.** Extend `CommandUiContract` with a read-only projection — no controller state, no UI internals:

```ts
interface CommandContributionView {
  readonly name: string;        // without leading slash, unique per registration
  readonly description: string;
}
interface CommandUiContract {
  register(contribution: CommandContribution): () => void;
  decorate(decoration: CommandDecoration): () => void;
  popupFor(actx: ClientContext): unknown;
  /** Read-only enumeration of registered contributions (metadata only). */
  list(): readonly CommandContributionView[];
  /** Change notification; returns an unsubscribe. */
  subscribe(fn: () => void): () => void;
}
```

Decorations stay out of scope for `list()` — they intentionally do not manufacture rows, so a consumer that already reads the Host catalog never needs them.

**Lifecycle / safety boundary.** `list()` returns plain metadata (name + description); it must not expose `options`/`onSelect`, popup controllers, or availability callbacks. `subscribe` fires on registration/disposal; the registry already dies with the owning fibers, so an uninstalled plugin disappears from the snapshot automatically — no consumer-side cleanup. Execution stays where it is today: a consumer still cannot execute a client contribution remotely; surfacing it as a row that hands off to the native slash menu is the consumer's decision.

**How Universal Palette would consume it.** `const ui = ctx.get('commandUi'); if (!ui?.list) return;` — capability-detected, no inject, no hard dependency. Command rows from `list()` would render with an explicit "client" source and dispatch by focusing the composer and submitting the bare token through the public input path, or by opening the native popup if a future contract allows. Until then the Palette keeps the honest zero-adapter split documented in `INTEROPERABILITY_MATRIX.md`.

---

## 2. Public composer reference insertion

**Status quo (locked SHA).** Canonical discovery is public — `ctx.remote.sessionReferenceResolver.candidates(sessionId, query, signal)` returns `{mention, sessionId, label, cwd, sameWorkspace, createdAt}` and `ctx.remote.fileReferences.list(agent, query, signal)` returns file candidates. But insertion is pipeline-internal:

- `InputTriggerSource.onPick(pick)` returns `PickOutcome` (`{insert: ReferenceInsert}` where `ReferenceInsert = {source, ref, label, appearance?, clipboardText}`), and only the per-session `InputTriggerController` executes claim/insert outcomes via scoped input events (`'slash/input-insert-reference'` carries `{reference, span}`).
- The conversation facade exposes `SessionInput.insertReference(ref: ReferenceInsert, span: TokenSpan)`, but it requires a pick-time `TokenSpan` (draft-CAS material from a live trigger hit) and the facade is the input layer's internal session face, not a feature-package service.
- `InputTriggerController.toggleSource(source, hit)` needs a synthetic `TriggerHit` with span/`draftRev` — forging it means faking pipeline state.

**Real use case.** Universal Palette already surfaces Sessions (and could surface file candidates from the official remotes). A "insert as @reference" secondary action would put the canonical reference into the current composer draft — the same object the native `@` menu produces — without the user retyping it. Today the only legal outcomes are: plain-text draft writes (`InputActions.setDraft`) that lose the reference chip/codec semantics, or nothing.

**Why the current contract is not enough.** Every mutation path is span-bound or roster-bound. Building one honestly requires either fabricating `TokenSpan`/`draftRev` (fragile CAS forgery) or dispatching scoped internal events — both are private-state dependencies that break on any input-machine change.

**Minimal interface shape.** One span-free insert on the existing per-session input face, executed by the same machine that serves the `@` menu:

```ts
// on the session-scoped input face (or a small public resolver for it):
insertCanonicalReference(ref: ReferenceInsert): boolean;
// ReferenceInsert is already public in dsh-client-ui-conversation:
// {source, ref, label, appearance?, clipboardText}
```

Semantics: identical to a settled menu pick's insert outcome — append the chip at the caret, run the owning source's codec at submit time, respect admission phases (return `false` when the input cannot accept, e.g. busy/frozen), never touch the draft otherwise. `source` must name a **registered** trigger source for that trigger char; the machine reuses the existing codec/serialization path, so prompt serialization stays correct and no second codec protocol is created.

**Lifecycle / safety boundary.** One-way write: this inserts, it never reads the draft, attachments, or span map; it returns `false` instead of queueing. Reuses the same guards as a pick (claimed/frozen tiers refuse). No source is invoked for discovery — the caller brings the full `ReferenceInsert`, so nothing about other plugins' candidate business logic becomes callable.

**How Universal Palette would consume it.** For a Session row: `sessionReferenceResolver.candidates(sessionId, '')` to resolve the canonical `mention`/`ref`, then insert on the current session's input face. For files: `remote.fileReferences.list`. Capability-detected per session; if the face is absent the action is simply not offered — no degraded plain-text fallback pretending to be a reference.

---

## 3. Read-only input-trigger source discovery (optional)

**Status quo (locked SHA).** `InputTriggerServiceContract` (`ctx.inputTriggers`) is `registerSource(src)` + `sessionOf(actx)` only. The roster (`live`) is private; the per-session controller keeps `sources(trigger)`/`all()` internal to the pipeline. `dsh-reference-anything@0.4.0` registers seven `@` sources through this contract; no consumer can even learn their names.

**Real use case.** Honest attribution and handoff: a palette that shows "references are handled by the native @ menu (enhanced by Reference Anything)" can only say so today by hardcoding plugin names. A read-only roster would let consumers describe the ecosystem and route users to the native menu, without absorbing anyone's data layer.

**Why the current contract is not enough.** `registerSource` is write-only; the controller's roster access is deliberately internal. Any enumeration today requires private-store reads.

**Minimal interface shape (only if upstream considers it worth the surface).** A metadata-only view on the service:

```ts
interface InputTriggerSourceView {
  readonly trigger: TriggerChar;   // '/' | '@'
  readonly name: string;           // unique per trigger
  readonly order?: number;
}
interface InputTriggerServiceContract {
  registerSource(src: InputTriggerSource): () => void;
  sessionOf(actx: ClientContext): InputTriggerController;
  /** Metadata-only roster snapshot; no candidates, no callbacks. */
  listSources(): readonly InputTriggerSourceView[];
}
```

**Lifecycle / safety boundary.** This is discovery only, and it must never grow into candidate access: no `candidates()`, no `onPick()`, no codec, no lexicon — other plugins' business logic stays theirs. Snapshots update via the existing registry change notifications; uninstalled plugins drop out automatically. If upstream prefers zero new surface here, the gap can stay closed: nothing in Universal Palette v0.2 depends on it, and `NO_PUBLIC_REFERENCE_SOURCE_ENUMERATION` remains the recorded state.

**How Universal Palette would consume it.** A quiet provenance line and, when a user searches something that is reference-shaped, a "Search in @ menu" handoff entry — attributed to the source that owns that trigger. Never an import of another plugin's candidates into Palette ranking.

---

## Summary of requested seams

| # | Gap | Recorded state | Requested surface | Consumer today |
|---|---|---|---|---|
| 1 | Client command discovery | `NO_PUBLIC_COMMANDUI_ENUMERATION` | `commandUi.list()` + `subscribe()` (metadata only) | Host commands only; client commands invisible |
| 2 | Composer reference insertion | `NO_PUBLIC_COMPOSER_INSERT_YET` | span-free `insertCanonicalReference(ReferenceInsert)` | Discovery yes, insertion no legal path |
| 3 | Trigger source discovery | `NO_PUBLIC_REFERENCE_SOURCE_ENUMERATION` | `listSources()` metadata view (optional) | Nothing readable; nothing claimed |
