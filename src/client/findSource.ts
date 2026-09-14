/**
 * /find Input Trigger source.
 *
 * Registered through `ctx.inputTriggers.registerSource` against the
 * locked public slash pipeline. The source:
 *
 * - exposes exactly one candidate, `find`, on the `/` trigger;
 * - rejects any other slash text by reporting `undefined` so the
 *   pipeline keeps its normal flow;
 * - selecting or typing `/find ` enters a public command claim whose trailing
 *   query remains in the resident Composer and never reaches the Agent;
 * - is capability-detected: when the slash pipeline is absent the
 *   registration fails loudly at startup, so a host that does not
 *   support slash sources will not silently downgrade.
 *
 * Conflict gate: `assertNoHostFind` probes the locked public Host
 * command catalog (`ctx.remote.commands.list(currentId)`) for an exact
 * `find` name. If present, the registration is skipped with a thrown
 * `PUBLIC_SLASH_FIND_COLLISION` error so a host-owned `/find` cannot
 * be silently shadowed.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { InputTriggerSource, InputTriggerCandidate, PickOutcome, ClientSessionContext, SubmitEnvelope } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type { CommandDescriptor } from '@deepseek-ai/dsh-commands/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SearchController } from './search-controller.ts'
import type { PreferencesStore } from './state/preferences.ts'

export const FIND_PALETTE_CLAIM = 'universal-palette.find'
export const FIND_TRIGGER = '/'
export const FIND_NAME = 'universal-palette.find-source'

export interface HostFindCollision extends Error {
  readonly code: 'PUBLIC_SLASH_FIND_COLLISION'
}

function isHostFindCollision(value: unknown): value is HostFindCollision {
  return value instanceof Error && (value as { code?: unknown }).code === 'PUBLIC_SLASH_FIND_COLLISION'
}

export function makeFindCollision(collisions: readonly string[]): HostFindCollision {
  // A real PublicSlashFindCollision instance (not a plain tagged Error) so
  // callers can pattern-match with instanceof.
  return new PublicSlashFindCollision(collisions) as HostFindCollision
}

export class PublicSlashFindCollision extends Error {
  public readonly code = 'PUBLIC_SLASH_FIND_COLLISION' as const
  constructor(collisions: readonly string[]) {
    super(`Host command catalog already registers 'find' (${collisions.join(', ')}); Universal Palette will not register /find.`)
  }
}

/**
 * Verdict of a `/find` collision probe. Strictly fail-closed: only a
 * successful, contract-valid catalog that provably lacks exact `find`
 * allows the claim. Everything else (host collision, ok:false, rejected
 * probe, undefined or malformed payload) denies.
 *
 * `coldStart: true` marks the one state where no per-session catalog
 * domain exists at all (`commands.list` is session-scoped by the rc1
 * contract, so with no current session there is no host command catalog
 * that could be shadowed). The claim must stay available there to keep
 * hand-typed `/find` on a cold stock Hero claimed locally instead of
 * leaking to the Agent.
 */
export type FindCollisionVerdict =
  | { readonly kind: 'allow'; readonly coldStart: boolean }
  | {
    readonly kind: 'deny'
    readonly reason: 'host-collision' | 'catalog-unavailable' | 'catalog-contract'
    readonly collisions: readonly string[]
  }

/**
 * Real rc1 public contract face for the Host command catalog
 * (dsh-commands typert.remote-client: `list(agentId) =>
 * Promise<RemoteResult<readonly CommandDescriptor[]>>`).
 */
type HostCommandsList =
  (agentId: SessionId) => Promise<{ ok: boolean; value?: readonly CommandDescriptor[] }>

/**
 * Probe the Host command catalog for an exact `find` command name.
 * Allow ONLY on a successful response whose payload is the contracted
 * descriptor array without `find`; every other outcome denies.
 */
export async function findHostFindCollisions(ctx: Context): Promise<FindCollisionVerdict> {
  const current = ctx.sessions?.list?.getSnapshot?.()?.current
  if (current === undefined) return { kind: 'allow', coldStart: true }
  const remote = (ctx as unknown as { remote?: { commands?: { list?: HostCommandsList } } }).remote
  const list = remote?.commands?.list
  if (typeof list !== 'function') {
    return { kind: 'deny', reason: 'catalog-unavailable', collisions: [] }
  }
  let result: Awaited<ReturnType<HostCommandsList>>
  try {
    result = await list(current)
  } catch {
    return { kind: 'deny', reason: 'catalog-unavailable', collisions: [] }
  }
  try {
    if (result === null || typeof result !== 'object') {
      return { kind: 'deny', reason: 'catalog-contract', collisions: [] }
    }
    if (!result.ok) return { kind: 'deny', reason: 'catalog-unavailable', collisions: [] }
    if (result.value === undefined || !Array.isArray(result.value)) {
      return { kind: 'deny', reason: 'catalog-contract', collisions: [] }
    }
    const collisions = result.value.filter(entry => entry?.name === 'find').map(entry => entry.name)
    return collisions.length > 0
      ? { kind: 'deny', reason: 'host-collision', collisions }
      : { kind: 'allow', coldStart: false }
  } catch {
    // Any inspection failure (host returned a shape that throws on read)
    // means the catalog cannot prove it lacks `find`: fail closed.
    return { kind: 'deny', reason: 'catalog-contract', collisions: [] }
  }
}

/**
 * Compatibility capability injected by the plugin composition. The claim is
 * ALWAYS offered for a typed `/find …` (gating the claim would fall through
 * to the Agent submission pipeline); only the surface availability and the
 * candidate listing are gated.
 */
export interface FindCapability {
  /** Whether the Composer Search surface may open right now (`!cold || hero dock declared`). */
  readonly composerSearchAllowed: () => boolean
  /** Localized capability error returned by the claim when the surface cannot open. */
  readonly unavailableError: () => string
}

/**
 * Build the `/find` Input Trigger source. The source returns the
 * single candidate `find`, accepts exact `/find` Enter arbitration, and
 * otherwise returns `undefined` so the normal pipeline continues.
 *
 * With a capability, the candidate is withheld (`[]`) on a Hero surface
 * whose host lacks the dock, and the claim's submit answers with the
 * localized capability error instead of touching the Agent pipeline.
 */
export function createFindSource(
  open: () => void,
  executeSelected: (query: string) => Promise<boolean> = async () => false,
  capability?: FindCapability,
): InputTriggerSource {
  const openAfterHostSettles = () => { globalThis.setTimeout(open, 0) }
  const enterSearchMode = (): PickOutcome => {
    openAfterHostSettles()
    return {
      claim: {
        // Trailing space is intentional: Space selection is consumed by the
        // Host, while the visible token remains a stable command prefix.
        token: '/find ',
        hint: 'Search',
        async submit(args) {
          if (capability && !capability.composerSearchAllowed()) {
            return { kind: 'error', text: capability.unavailableError() }
          }
          try {
            const ran = await executeSelected(args.trimStart())
            return ran ? { kind: 'success' } : { kind: 'error', text: 'No search result selected.' }
          } catch (error) {
            return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
          }
        },
      },
    }
  }
  const candidateOffered = (): boolean => capability?.composerSearchAllowed() ?? true
  return {
    trigger: FIND_TRIGGER,
    name: FIND_NAME,
    order: 50,
    showGroupTitle: false,
    async candidates(_session: ClientSessionContext): Promise<readonly InputTriggerCandidate[]> {
      if (!candidateOffered()) return []
      return [{
        name: 'find',
        description: 'Search commands, sessions, models, and conversations',
        icon: 'folder',
        value: 'find',
      }]
    },
    onPick(): PickOutcome {
      return enterSearchMode()
    },
    matchSpace(_session: ClientSessionContext, token: string): PickOutcome {
      return token === '/find' ? enterSearchMode() : undefined
    },
    async matchEnter(_session: ClientSessionContext, line: string, _signal: AbortSignal, _envelope: SubmitEnvelope): Promise<PickOutcome> {
      const trimmed = line.trim()
      if (trimmed !== '/find' && !trimmed.startsWith('/find ')) return undefined
      return enterSearchMode()
    },
  }
}

export interface RegisterFindSourceOptions {
  readonly ctx: Context
  readonly controller: SearchController
  readonly preferences?: PreferencesStore
  /** Fail-closed capability face; the claim itself is never gated. */
  readonly capability?: FindCapability
}

/**
 * Register the /find Input Trigger source.
 *
 * Order:
 * 1. Probe the Host command catalog for an exact `find` command name for
 *    the session present at registration time, if any. A collision throws
 *    `PublicSlashFindCollision` so a host-owned `/find` is never shadowed.
 * 2. Otherwise register the source via `ctx.inputTriggers.registerSource`.
 * 3. Cold start: when no session existed at apply time the probe could not
 *    run, so a `sessions.list` watcher re-runs the verdict on every current-
 *    session change and withdraws the registration while the active session's
 *    catalog owns `find`. No catalog snapshot/cache is kept — each verdict
 *    re-probes the live public contract.
 */
export async function registerFindSource(options: RegisterFindSourceOptions): Promise<() => void> {
  const initial = await findHostFindCollisions(options.ctx)
  if (initial.kind === 'deny' && initial.reason === 'host-collision') {
    throw makeFindCollision(initial.collisions)
  }
  const open = () => {
    const id = options.ctx.sessions?.list?.getSnapshot?.()?.current
    if (id === undefined) return
    options.controller.openComposerSearch(String(id), 'slash')
  }
  const executeSelected = async (query: string) => {
    if (options.controller.getState().draft !== query) {
      options.controller.setDraft(query)
    }
    const state = options.controller.getState()
    if (state.aggregator.query !== query.trim()) return false
    const row = state.aggregator.items[Math.min(state.selectedIndex, Math.max(0, state.aggregator.items.length - 1))]
    if (!row) return false
    await options.preferences?.recordUse(row.item.id)
    await row.item.primary.run(new AbortController().signal)
    if (row.item.primary.stayOpen !== true) options.controller.close()
    return true
  }
  const triggers = (options.ctx as unknown as { inputTriggers?: { registerSource?: (src: InputTriggerSource) => () => void } }).inputTriggers
  const registerSource = triggers?.registerSource
  if (typeof registerSource !== 'function') {
    // No slash pipeline in this host: no behavior change.
    return () => {}
  }
  let sourceDisposer: (() => void) | null = null
  let disposed = false
  const setRegistered = (registered: boolean) => {
    if (disposed) return
    if (registered && sourceDisposer === null) {
      // Preserve `this` binding: registerSource uses `this.live` internally.
      sourceDisposer = registerSource.call(triggers, createFindSource(open, executeSelected, options.capability))
    } else if (!registered && sourceDisposer !== null) {
      try { sourceDisposer() } catch { /* registration already gone */ }
      sourceDisposer = null
    }
  }
  // Fail-closed verdict handling: host collisions stay loud via the
  // PublicSlashFindCollision message; unprovable catalogs (unavailable,
  // contract violations) withdraw the claim and name the reason.
  const logDenial = (verdict: Extract<FindCollisionVerdict, { kind: 'deny' }>): void => {
    if (verdict.reason === 'host-collision') {
      // eslint-disable-next-line no-console
      console.error('[dsh-universal-palette]', makeFindCollision(verdict.collisions).message)
    } else if (verdict.reason === 'catalog-contract') {
      // eslint-disable-next-line no-console
      console.error('[dsh-universal-palette] /find collision probe: host catalog payload is not the contracted CommandDescriptor array; /find claim withdrawn (fail-closed).')
    } else {
      // eslint-disable-next-line no-console
      console.error('[dsh-universal-palette] /find collision probe: host command catalog unavailable; /find claim withdrawn (fail-closed).')
    }
  }
  if (initial.kind === 'deny') logDenial(initial)
  setRegistered(initial.kind === 'allow')
  const list = options.ctx.sessions?.list
  let offSessions: (() => void) | undefined
  // Every session change starts its own probe; only the LATEST event's
  // verdict is applied (a generation token discards stale resolutions), so
  // a slow probe for an older session can never mask a newer collision.
  let probeSeq = 0
  if (list && typeof list.subscribe === 'function') {
    offSessions = list.subscribe(() => {
      if (disposed) return
      const seq = ++probeSeq
      void findHostFindCollisions(options.ctx)
        .then(verdict => {
          if (disposed || seq !== probeSeq) return
          if (verdict.kind === 'deny') logDenial(verdict)
          setRegistered(verdict.kind === 'allow')
        })
        .catch(error => {
          // Defensive: the probe resolves verdicts and never rejects; if
          // that invariant ever breaks, fail closed and stay loud.
          if (disposed || seq !== probeSeq) return
          setRegistered(false)
          // eslint-disable-next-line no-console
          console.error('[dsh-universal-palette] /find collision probe failed:', error)
        })
    })
  }
  return options.ctx.effect(() => () => {
    disposed = true
    offSessions?.()
    try { sourceDisposer?.() } catch { /* registration already gone */ }
    sourceDisposer = null
  }, 'universal-palette: /find input trigger source')
}

// Re-export so consumers / tests can pattern-match on the union shape.
export { isHostFindCollision }
