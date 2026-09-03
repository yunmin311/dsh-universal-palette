/**
 * Capability detection (spec §13 Phase A — Compatibility Probe).
 *
 * This runs once at activation and the report is exposed via
 * `useCapabilities()`. Every provider reuses the same probe result so
 * we never re-probe during a query lifecycle.
 */

import type { CapabilityReport } from '../shared/contract.ts'

export interface CapabilityProbe {
  /** Returns null when the expected ctx key is missing — providers then degrade. */
  commands: CommandCapability | null
  sessions: SessionCapability | null
  workspaces: WorkspaceCapability | null
  modelDirectory: ModelDirectoryCapability | null
  sessionQuery: SessionQueryCapability | null
  skills: SkillCapability | null
  referenceSource: ReferenceCapability | null
  theme: ThemeCapability | null
  shellOverlaySlot: boolean
  thirdPartyProviders: boolean
  dshVersion: string
}

export interface CommandCapability {
  /** Lists command descriptors for one agent. */
  readonly list: (agent: unknown) => Promise<readonly CommandDescriptorView[]>
  /** Resolves a single command definition. */
  readonly find: (agent: unknown, name: string) => Promise<unknown>
  /** Parses + executes a slash command line without creating a model message. */
  readonly execute: (
    agent: unknown,
    line: string,
    signal: AbortSignal,
  ) => Promise<unknown>
}

export interface CommandDescriptorView {
  readonly name: string
  readonly description: string
  readonly input?: { readonly hint?: string; readonly images?: boolean }
}

export interface SessionCapability {
  readonly list: (signal: AbortSignal) => Promise<readonly SessionSummary[]>
  readonly getCurrent: () => unknown
  readonly getCurrentWorkspace: () => unknown
  /** Open / focus a session in the host UI. */
  readonly open: (sessionId: string) => Promise<void>
}

export interface SessionSummary {
  readonly id: string
  readonly title: string
  readonly workspaceId?: string
  readonly archived?: boolean
  readonly updatedAt?: number
}

export interface WorkspaceCapability {
  readonly list: (signal: AbortSignal) => Promise<readonly WorkspaceSummary[]>
  readonly current: () => unknown
}

export interface WorkspaceSummary {
  readonly id: string
  readonly title: string
}

export interface ModelDirectoryCapability {
  readonly list: (sessionId: string, signal: AbortSignal) => Promise<readonly ModelGroup[]>
  readonly select: (sessionId: string, selection: ModelSelectionView) => Promise<void>
}

export interface ModelGroup {
  readonly provider: string
  readonly models: readonly ModelEntry[]
}

export interface ModelEntry {
  readonly id: string
  readonly displayName: string
  readonly description?: string
  readonly defaultEffort?: string
}

export interface ModelSelectionView {
  readonly provider: string
  readonly model: string
  readonly effort?: string
}

export interface SessionQueryCapability {
  readonly searchSessions: (
    query: string,
    signal: AbortSignal,
  ) => Promise<readonly SessionSearchHit[]>
  readonly searchEvents: (
    sessionId: string,
    query: string,
    signal: AbortSignal,
  ) => Promise<readonly EventSearchHit[]>
}

export interface SessionSearchHit {
  readonly sessionId: string
  readonly title: string
  readonly snippet?: string
  readonly updatedAt?: number
}

export interface EventSearchHit {
  readonly sessionId: string
  readonly eventSeq?: number
  readonly snippet: string
  readonly updatedAt?: number
}

export interface SkillCapability {
  readonly list: (signal: AbortSignal) => Promise<readonly SkillEntry[]>
}

export interface SkillEntry {
  readonly name: string
  readonly description: string
  readonly userInvocable: boolean
}

export interface ReferenceCapability {
  readonly list: (query: string, signal: AbortSignal) => Promise<readonly ReferenceEntry[]>
}

export interface ReferenceEntry {
  readonly id: string
  readonly title: string
  readonly kind: 'session' | 'file' | 'skill'
  readonly snippet?: string
}

export interface ThemeCapability {
  readonly snapshot: () => unknown
  readonly subscribe: (cb: () => void) => () => void
}

const DEFAULT_VERSION = 'unknown'

/**
 * The capability probe is intentionally narrow: it never reaches into
 * a ctx slot directly; it accepts a single `host` argument the
 * activator fills from the real Cordis ctx. Tests inject a fake `host`.
 */
export function probe(host: HostSurface): CapabilityProbe {
  const probe: CapabilityProbe = {
    commands: null,
    sessions: null,
    workspaces: null,
    modelDirectory: null,
    sessionQuery: null,
    skills: null,
    referenceSource: null,
    theme: null,
    shellOverlaySlot: false,
    thirdPartyProviders: false,
    dshVersion: DEFAULT_VERSION,
  }

  if (host.version) probe.dshVersion = host.version
  probe.shellOverlaySlot = host.hasShellOverlaySlot ?? false
  probe.thirdPartyProviders = host.hasPaletteRegistry ?? false

  const commands = host.commands
  if (commands) {
    probe.commands = {
      list: (agent: unknown) => commands.list(agent),
      find: (agent: unknown, name: string) => commands.find(agent, name),
      execute: (agent: unknown, line: string, signal: AbortSignal) => commands.execute(agent, line, signal),
    }
  }

  const sessions = host.sessions
  if (sessions) {
    probe.sessions = {
      list: (signal: AbortSignal) => sessions.list(signal),
      getCurrent: () => sessions.getCurrent(),
      getCurrentWorkspace: () => sessions.getCurrentWorkspace(),
      open: (id: string) => sessions.open(id),
    }
  }

  const workspaces = host.workspaces
  if (workspaces) {
    probe.workspaces = {
      list: (signal: AbortSignal) => workspaces.list(signal),
      current: () => workspaces.current(),
    }
  }

  const modelDir = host.modelDirectory
  if (modelDir) {
    probe.modelDirectory = {
      list: (sessionId: string, signal: AbortSignal) => modelDir.list(sessionId, signal),
      select: (sessionId: string, sel: ModelSelectionView) => modelDir.select(sessionId, sel),
    }
  }

  const sq = host.sessionQuery
  if (sq) {
    probe.sessionQuery = {
      searchSessions: (q: string, signal: AbortSignal) => sq.searchSessions(q, signal),
      searchEvents: (sessionId: string, q: string, signal: AbortSignal) => sq.searchEvents(sessionId, q, signal),
    }
  }

  const skills = host.skills
  if (skills) {
    probe.skills = { list: (signal: AbortSignal) => skills.list(signal) }
  }

  const ref = host.referenceSource
  if (ref) {
    probe.referenceSource = { list: (q: string, signal: AbortSignal) => ref.list(q, signal) }
  }

  const theme = host.theme
  if (theme) {
    probe.theme = {
      snapshot: () => theme.snapshot(),
      subscribe: (cb: () => void) => theme.subscribe(cb),
    }
  }

  return probe
}

export interface HostSurface {
  readonly version?: string
  readonly hasShellOverlaySlot?: boolean
  readonly hasPaletteRegistry?: boolean

  readonly commands?: {
    readonly list: (agent: unknown) => Promise<readonly CommandDescriptorView[]>
    readonly find: (agent: unknown, name: string) => Promise<unknown>
    readonly execute: (agent: unknown, line: string, signal: AbortSignal) => Promise<unknown>
  }
  readonly sessions?: {
    readonly list: (signal: AbortSignal) => Promise<readonly SessionSummary[]>
    readonly getCurrent: () => unknown
    readonly getCurrentWorkspace: () => unknown
    readonly open: (sessionId: string) => Promise<void>
  }
  readonly workspaces?: {
    readonly list: (signal: AbortSignal) => Promise<readonly WorkspaceSummary[]>
    readonly current: () => unknown
  }
  readonly modelDirectory?: {
    readonly list: (sessionId: string, signal: AbortSignal) => Promise<readonly ModelGroup[]>
    readonly select: (sessionId: string, selection: ModelSelectionView) => Promise<void>
  }
  readonly sessionQuery?: {
    readonly searchSessions: (
      query: string,
      signal: AbortSignal,
    ) => Promise<readonly SessionSearchHit[]>
    readonly searchEvents: (
      sessionId: string,
      query: string,
      signal: AbortSignal,
    ) => Promise<readonly EventSearchHit[]>
  }
  readonly skills?: {
    readonly list: (signal: AbortSignal) => Promise<readonly SkillEntry[]>
  }
  readonly referenceSource?: {
    readonly list: (query: string, signal: AbortSignal) => Promise<readonly ReferenceEntry[]>
  }
  readonly theme?: {
    readonly snapshot: () => unknown
    readonly subscribe: (cb: () => void) => () => void
  }
}

export function capabilityReport(probe: CapabilityProbe): CapabilityReport {
  return {
    dshVersion: probe.dshVersion,
    shellOverlaySlot: probe.shellOverlaySlot,
    commands: probe.commands !== null,
    sessions: probe.sessions !== null,
    workspaces: probe.workspaces !== null,
    modelDirectory: probe.modelDirectory !== null,
    sessionQuery: probe.sessionQuery !== null,
    skills: probe.skills !== null,
    referenceSource: probe.referenceSource !== null,
    theme: probe.theme !== null,
    thirdPartyProviders: probe.thirdPartyProviders,
  }
}
