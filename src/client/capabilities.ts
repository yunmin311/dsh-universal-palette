/**
 * Capability detection (spec §13 Phase A).
 *
 * The activator calls this once with a `HostSurface` built from
 * the live DSH ClientContext. Providers that get `null` for their
 * service opt out of registration; that provider then never
 * emits items and the UI hides the category automatically because
 * no items surface.
 *
 * The capability shape is intentionally neutral (no DSH imports
 * in the type) so the providers can be unit-tested in isolation
 * with fake surfaces.
 */

import type { CapabilityReport } from '../shared/contract.ts'

export interface CapabilityProbe {
  commands: CommandCapability | null
  sessions: SessionCapability | null
  workspaces: WorkspaceCapability | null
  modelDirectory: ModelDirectoryCapability | null
  sessionQuery: SessionQueryCapability | null
  skills: SkillCapability | null
  referenceSource: ReferenceCapability | null
  theme: ThemeCapability | null
  shellOverlaySlot: boolean
  dshVersion: string
}

export interface CommandDescriptorView {
  readonly name: string
  readonly description: string
  readonly input?: { readonly hint?: string; readonly images?: boolean }
}

export interface CommandCapability {
  readonly list: (agent: unknown) => Promise<readonly CommandDescriptorView[]>
  readonly find: (agent: unknown, name: string) => Promise<unknown>
  readonly execute: (agent: unknown, line: string, signal: AbortSignal) => Promise<unknown>
}

export interface SessionSummary {
  readonly id: string
  readonly title: string
  readonly workspaceId?: string
  readonly archived?: boolean
  readonly updatedAt?: number
}

export interface SessionCapability {
  readonly list: (signal: AbortSignal) => Promise<readonly SessionSummary[]>
  readonly getCurrent: () => unknown
  readonly getCurrentWorkspace: () => unknown
  readonly open: (id: string) => Promise<void>
}

export interface WorkspaceCapability {
  readonly list: (signal: AbortSignal) => Promise<readonly WorkspaceSummary[]>
  readonly current: () => unknown
}

export interface WorkspaceSummary {
  readonly id: string
  readonly title: string
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

export interface ModelDirectoryCapability {
  readonly list: (sessionId: string, signal: AbortSignal) => Promise<readonly ModelGroup[]>
  readonly select: (sessionId: string, selection: ModelSelectionView) => Promise<void>
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

export interface SessionQueryCapability {
  readonly searchSessions: (query: string, signal: AbortSignal) => Promise<readonly SessionSearchHit[]>
  readonly searchEvents: (sessionId: string, query: string, signal: AbortSignal) => Promise<readonly EventSearchHit[]>
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

export interface HostSurface {
  readonly version?: string
  readonly hasShellOverlaySlot?: boolean
  readonly commands?: CommandCapability
  readonly sessions?: SessionCapability
  readonly workspaces?: WorkspaceCapability
  readonly modelDirectory?: ModelDirectoryCapability
  readonly sessionQuery?: SessionQueryCapability
  readonly skills?: SkillCapability
  readonly referenceSource?: ReferenceCapability
  readonly theme?: ThemeCapability
}

export function probe(host: HostSurface): CapabilityProbe {
  const p: CapabilityProbe = {
    commands: null,
    sessions: null,
    workspaces: null,
    modelDirectory: null,
    sessionQuery: null,
    skills: null,
    referenceSource: null,
    theme: null,
    shellOverlaySlot: false,
    dshVersion: DEFAULT_VERSION,
  }

  if (host.version) p.dshVersion = host.version
  p.shellOverlaySlot = host.hasShellOverlaySlot ?? false

  if (host.commands) {
    p.commands = {
      list: (agent: unknown) => host.commands!.list(agent),
      find: (agent: unknown, name: string) => host.commands!.find(agent, name),
      execute: (agent: unknown, line: string, signal: AbortSignal) => host.commands!.execute(agent, line, signal),
    }
  }

  if (host.sessions) {
    p.sessions = {
      list: (signal: AbortSignal) => host.sessions!.list(signal),
      getCurrent: () => host.sessions!.getCurrent(),
      getCurrentWorkspace: () => host.sessions!.getCurrentWorkspace(),
      open: (id: string) => host.sessions!.open(id),
    }
  }

  if (host.workspaces) {
    p.workspaces = {
      list: (signal: AbortSignal) => host.workspaces!.list(signal),
      current: () => host.workspaces!.current(),
    }
  }

  if (host.modelDirectory) {
    p.modelDirectory = {
      list: (sessionId: string, signal: AbortSignal) => host.modelDirectory!.list(sessionId, signal),
      select: (sessionId: string, sel: ModelSelectionView) => host.modelDirectory!.select(sessionId, sel),
    }
  }

  if (host.sessionQuery) {
    p.sessionQuery = {
      searchSessions: (q: string, signal: AbortSignal) => host.sessionQuery!.searchSessions(q, signal),
      searchEvents: (sessionId: string, q: string, signal: AbortSignal) =>
        host.sessionQuery!.searchEvents(sessionId, q, signal),
    }
  }

  if (host.skills) p.skills = { list: (signal: AbortSignal) => host.skills!.list(signal) }

  if (host.referenceSource) {
    p.referenceSource = { list: (q: string, signal: AbortSignal) => host.referenceSource!.list(q, signal) }
  }

  if (host.theme) {
    p.theme = {
      snapshot: () => host.theme!.snapshot(),
      subscribe: (cb: () => void) => host.theme!.subscribe(cb),
    }
  }

  return p
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
  }
}
