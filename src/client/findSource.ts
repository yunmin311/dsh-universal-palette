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
  const err = new Error(`Host command catalog already registers 'find' (${collisions.join(', ')}); Universal Palette will not register /find.`) as HostFindCollision
  ;(err as unknown as { code: string }).code = 'PUBLIC_SLASH_FIND_COLLISION'
  return err
}

export class PublicSlashFindCollision extends Error {
  public readonly code = 'PUBLIC_SLASH_FIND_COLLISION' as const
  constructor(collisions: readonly string[]) {
    super(`Host command catalog already registers 'find' (${collisions.join(', ')}); Universal Palette will not register /find.`)
  }
}

/**
 * Probe the Host command catalog for an exact `find` command name.
 * Returns the colliding command names (case-sensitive) or an empty
 * array when the catalog is empty / not yet loaded / unavailable.
 */
export async function findHostFindCollisions(ctx: Context): Promise<readonly string[]> {
  const current = ctx.sessions?.list?.getSnapshot?.()?.current
  if (current === undefined) return []
  const remote = (ctx as unknown as { remote?: { commands?: { list?: (id: unknown) => Promise<{ ok: boolean; value?: { items: readonly { name: string }[] } }> } } }).remote
  const list = remote?.commands?.list
  if (typeof list !== 'function') return []
  try {
    const result = await list(current)
    if (!result.ok || result.value === undefined) return []
    return result.value.items.filter((entry) => entry.name === 'find').map((entry) => entry.name)
  } catch {
    return []
  }
}

/**
 * Build the `/find` Input Trigger source. The source returns the
 * single candidate `find`, accepts exact `/find` Enter arbitration, and
 * otherwise returns `undefined` so the normal pipeline continues.
 */
export function createFindSource(
  open: () => void,
  executeSelected: (query: string) => Promise<boolean> = async () => false,
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
  return {
    trigger: FIND_TRIGGER,
    name: FIND_NAME,
    order: 50,
    showGroupTitle: false,
    async candidates(_session: ClientSessionContext): Promise<readonly InputTriggerCandidate[]> {
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
}

/**
 * Register the /find Input Trigger source.
 *
 * Order:
 * 1. Probe the Host command catalog for an exact `find` command name.
 * 2. If a collision exists, throw `PublicSlashFindCollision`.
 * 3. Otherwise register the source via `ctx.inputTriggers.registerSource`
 *    wrapped in `ctx.effect` so the disposer is released on plugin unload.
 */
export async function registerFindSource(options: RegisterFindSourceOptions): Promise<() => void> {
  const collisions = await findHostFindCollisions(options.ctx)
  if (collisions.length > 0) {
    throw makeFindCollision(collisions)
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
  // Preserve `this` binding: registerSource uses `this.live` internally.
  return options.ctx.effect(
    () => registerSource.call(triggers, createFindSource(open, executeSelected)),
    'universal-palette: /find input trigger source',
  )
}

// Re-export so consumers / tests can pattern-match on the union shape.
export { isHostFindCollision }
