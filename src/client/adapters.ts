import type { ClientRemote } from '@deepseek-ai/dsh-api-remotes/client'
import type { InputTriggerServiceContract } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type {
  ISessions,
  SessionBinding,
  SessionListState,
  SessionSummary,
} from '@deepseek-ai/dsh-api-session-controller/client'
import type {
  IWorkspaces,
  WorkspaceSnapshot,
} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {
  ModelCatalogModel,
  ModelProviderGroup,
  ModelSelection,
} from '@deepseek-ai/dsh-api-session-controller/types'
import type {
  ModelDirectory,
  ModelDirectoryResolver,
  ModelDirectoryState,
} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { CommandDescriptor } from '@deepseek-ai/dsh-commands/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

import type {
  PaletteContext,
  PaletteItem,
  PaletteProvider,
} from '../shared/contract.ts'

type CommandRemote = ClientRemote['commands']
type ModelDirectories = Pick<ModelDirectoryResolver, 'directoryFor'>

const EMPTY_ITEMS: PaletteItem[] = []

interface CurrentSession {
  readonly id: SessionId
  readonly binding: SessionBinding | undefined
}

function currentTopLevelSession(sessions: ISessions): CurrentSession | undefined {
  const id = sessions.list.getSnapshot().current
  if (id === undefined) return undefined
  const binding = sessions.binding(id)
  if (sessions.subagentAddress(id) !== undefined) return undefined
  if (binding !== undefined && binding.session.getSnapshot().subagent !== null) return undefined
  return { id, binding }
}

export function currentPaletteContext(
  sessions: ISessions,
  workspaces: IWorkspaces,
): PaletteContext {
  const sessionId = sessions.list.getSnapshot().current
  if (sessionId === undefined) return {}
  const workspace = workspaces.list.getSnapshot().items
    .find(candidate => candidate.sessionIds.includes(sessionId))
  return {
    sessionId: String(sessionId),
    ...(workspace === undefined ? {} : { workspaceId: String(workspace.workspaceId) }),
  }
}

function remoteError(operation: string, result: { error: { code: string; message: string } }): Error {
  return new Error(`${operation} failed: ${result.error.code}: ${result.error.message}`)
}

export function createCommandsProvider(
  remote: CommandRemote,
  sessions: ISessions,
  inputTriggers?: InputTriggerServiceContract,
): PaletteProvider {
  return {
    id: 'commands',
    label: 'Commands',
    availability: 'ready',
    async collect(input, signal) {
      const current = currentTopLevelSession(sessions)
      if (current === undefined) return EMPTY_ITEMS
      const result = await remote.list(current.id)
      if (!result.ok) throw remoteError('commands.list', result)
      if (signal.aborted) return EMPTY_ITEMS
      const items = result.value.map(descriptor =>
        commandItem(remote, current.id, descriptor, input.context))
      // The locked, required ui-model-selection plugin registers /model on the
      // Client only (src/client/index.ts), not in remote.commands.list.
      // Invoke its official slash pipeline; never synthesize a Host descriptor.
      const scope = inputTriggers && sessions.scope(current.id)
      if (inputTriggers && scope && !result.value.some(command => command.name === 'model')) {
        items.push({
          id: 'commands:client:model', providerId: 'commands', kind: 'command',
          title: '/model', subtitle: 'Open DSH model selector', badges: ['DSH'],
          context: { ...input.context, sessionId: String(current.id) },
          primary: { id: 'open-model-selector', title: 'Open', async run(signal) {
            const outcome = await inputTriggers.sessionOf(scope).adjudicate('/model', signal, { images: 0 })
            if (outcome !== 'handled') throw new Error('The DSH /model UI command is unavailable in this Session.')
          } },
        })
      }
      return items
    },
  }
}

function commandItem(
  remote: CommandRemote,
  sessionId: SessionId,
  descriptor: CommandDescriptor,
  context: PaletteContext,
): PaletteItem {
  const line = `/${descriptor.name}`
  return {
    id: `commands:${descriptor.name}`,
    providerId: 'commands',
    kind: 'command',
    title: line,
    aliases: [descriptor.name],
    source: 'DSH',
    subtitle: descriptor.description,
    keywords: descriptor.input === undefined ? undefined : [descriptor.input.hint],
    primary: {
      id: 'execute',
      title: 'Execute',
      kind: 'primary',
      async run(signal) {
        const result = await remote.execute(sessionId, line, [], signal)
        if (!result.ok) throw remoteError('commands.execute', result)
        if (result.value === undefined) {
          throw new Error(`commands.execute rejected unknown or malformed command: ${line}`)
        }
        if (result.value.result.kind === 'error') {
          throw new Error(result.value.result.text)
        }
      },
    },
    secondary: [],
    context: { ...context, sessionId: String(sessionId) },
  }
}

export function createSessionsProvider(
  sessions: ISessions,
  workspaces: IWorkspaces,
): PaletteProvider {
  return {
    id: 'sessions',
    label: 'Sessions',
    availability: 'ready',
    async collect(input, signal) {
      let state = sessions.list.getSnapshot()
      if (state.phase === 'pending') {
        await sessions.refresh()
        state = sessions.list.getSnapshot()
      }
      if (signal.aborted) return EMPTY_ITEMS
      const workspaceState = workspaces.list.getSnapshot()
      return sessionItems(sessions, state, workspaceState, input.context, input.limit)
    },
  }
}

function sessionItems(
  sessions: ISessions,
  state: SessionListState,
  workspaces: WorkspaceSnapshot,
  context: PaletteContext,
  limit: number,
): PaletteItem[] {
  const archived = new Set(workspaces.archivedSessionIds)
  const items: PaletteItem[] = []
  for (const id of state.ids) {
    const summary = state.byId[id]
    if (summary === undefined || archived.has(id)) continue
    if (summary.parentId !== undefined || summary.origin === 'subagent') continue
    const workspace = workspaces.items.find(candidate => candidate.sessionIds.includes(id))
    items.push(sessionItem(sessions, summary, workspace?.workspaceId, state.current === id, context))
    if (items.length >= limit) break
  }
  return items
}

function sessionItem(
  sessions: ISessions,
  summary: SessionSummary,
  workspaceId: string | undefined,
  current: boolean,
  context: PaletteContext,
): PaletteItem {
  return {
    id: `sessions:${summary.id}`,
    providerId: 'sessions',
    kind: 'session',
    title: summary.displayTitle,
    updatedAt: summary.updatedAt,
    isCurrent: current,
    subtitle: [current ? 'current' : undefined, summary.running ? 'running' : 'idle', summary.cwd]
      .filter((part): part is string => part !== undefined)
      .join(' · '),
    badges: [relativeAge(summary.updatedAt)],
    primary: {
      id: 'open',
      title: 'Open',
      kind: 'primary',
      run: () => { sessions.open(summary.id) },
    },
    secondary: [],
    context: {
      ...context,
      sessionId: String(summary.id),
      ...(workspaceId === undefined ? {} : { workspaceId: String(workspaceId) }),
    },
  }
}

export function createModelsProvider(
  sessions: ISessions,
  modelDirectories: ModelDirectories,
): PaletteProvider {
  return {
    id: 'models',
    label: 'Models',
    availability: 'ready',
    async collect(input, signal) {
      const current = currentTopLevelSession(sessions)
      if (current === undefined) return EMPTY_ITEMS
      const directory = modelDirectories.directoryFor(current.id)
      const state = await directory.load()
      if (signal.aborted) return EMPTY_ITEMS
      return modelItems(directory, state, current.id, input.context, input.limit)
    },
  }
}

function modelItems(
  directory: ModelDirectory,
  state: ModelDirectoryState,
  sessionId: SessionId,
  context: PaletteContext,
  limit: number,
): PaletteItem[] {
  const items: PaletteItem[] = []
  for (const group of state.groups) {
    for (const model of group.models) {
      items.push(modelItem(directory, state, group, model, sessionId, context))
      if (items.length >= limit) return items
    }
  }
  return items
}

function modelItem(
  directory: ModelDirectory,
  state: ModelDirectoryState,
  group: ModelProviderGroup,
  model: ModelCatalogModel,
  sessionId: SessionId,
  context: PaletteContext,
): PaletteItem {
  const current = state.current?.provider === group.id && state.current.model === model.id
  const reasoningEffort = current
    ? state.current?.reasoningEffort ?? model.reasoning?.defaultEffort
    : model.reasoning?.defaultEffort
  return {
    id: `models:${group.id}:${model.id}`,
    providerId: 'models',
    kind: 'model',
    title: model.name,
    source: group.name,
    subtitle: model.description === undefined ? group.name : `${group.name} · ${model.description}`,
    keywords: [group.id, model.id],
    badges: current ? ['current'] : reasoningEffort === undefined ? undefined : [reasoningEffort],
    primary: {
      id: 'select',
      title: current ? 'Selected' : 'Select',
      kind: 'primary',
      async run() {
        const selection: ModelSelection = {
          provider: group.id,
          model: model.id,
          ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
        }
        await directory.select(selection)
      },
    },
    secondary: [],
    context: { ...context, provider: group.id, sessionId: String(sessionId) },
  }
}

export function createConversationHitsProvider(sessions: ISessions): PaletteProvider {
  return {
    id: 'conversation-hits',
    label: 'Conversation Hits',
    availability: 'ready',
    async collect(input, signal) {
      const query = input.query.trim()
      if (query === '') return EMPTY_ITEMS
      const result = await sessions.search(query, signal)
      if (!result.ok) throw remoteError('sessions.search', result)
      if (signal.aborted) return EMPTY_ITEMS
      return result.value.items.slice(0, input.limit).map(hit => ({
        id: `conversation-hits:${hit.sessionId}`,
        providerId: 'conversation-hits',
        kind: 'conversation-hit',
        title: sessions.list.getSnapshot().byId[hit.sessionId]?.displayTitle
          ?? '',
        updatedAt: sessions.list.getSnapshot().byId[hit.sessionId]?.updatedAt,
        workspaceTitle: sessions.list.getSnapshot().byId[hit.sessionId]?.cwd?.split(/[\\/]/).filter(Boolean).at(-1),
        source: 'DSH',
        subtitle: 'history hit',
        snippet: hit.snippet,
        keywords: [hit.snippet],
        primary: {
          id: 'open',
          title: 'Open',
          kind: 'primary',
          run: () => { sessions.open(hit.sessionId) },
        },
        secondary: [],
        context: { ...input.context, sessionId: String(hit.sessionId) },
      }))
    },
  }
}

function relativeAge(updatedAt: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - updatedAt) / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}
