export type Phase = 'plan' | 'design' | 'delegate' | 'review' | 'close'

export type PlannedTask = {
  title: string
  tier: string
  after: number[]
}

export type Flow = {
  title: string
  total: number
  done: number
  running: number
  phase: Phase
  isFinished: boolean
  tasks: PlannedTask[]
}

export type AgentStatus = 'running' | 'done' | 'failed'

export type AgentRun = {
  id: string
  agentId?: string
  type: string
  description: string
  model: string
  effort?: string
  status: AgentStatus
  startedAt: number
  endedAt?: number
  contextTokens: number
  contextMax: number
  tokens: number
  costUsd: number
  steps: number
  round: number
  /** Self-reported by the worker through the `step` tool. */
  stepDone?: number
  stepTotal?: number
  stepNote?: string
}

export type Panel = {
  isCompact: boolean
  isDoneCollapsed: boolean
  autoOpenedFor: string
}

// What `$.savvy` hands the /mods hub (claude-mods-hub PROTOCOL.md): one tab, drawn by the hub.
export type SavvyLang = 'en' | 'pt'
export type SavvyPanelArgs = { lang: SavvyLang; surface: 'terminal' | 'desktop' | 'vscode' | 'mobile'; columns: number }
export type SavvyTone = 'ok' | 'warn' | 'err' | 'muted' | 'accent'
export type SavvyItem =
  | { kind: 'toggle'; id: string; label: string; help?: string; value: boolean }
  | { kind: 'choice'; id: string; label: string; help?: string; value: string; options: { value: string; label: string }[] }
  | { kind: 'action'; id: string; label: string; help?: string; primary?: boolean }
  | { kind: 'input'; id: string; label: string; help?: string; placeholder?: string; submitLabel?: string }
  | { kind: 'info'; label: string; value: string; tone?: SavvyTone }
  | { kind: 'text'; text: string; tone?: SavvyTone }
  | { kind: 'swatch'; id: string; label: string; color: string; selected: boolean }
  | { kind: 'tree'; tree: unknown }
export type SavvySection = { id: string; title: string; items: SavvyItem[] }
export type SavvyPanel = {
  // The tab's name.
  title: string
  // One line for the overview and under the tab row.
  summary?: string
  tone?: SavvyTone
  // Drawn as sub-tabs when there is more than one.
  sections: SavvySection[]
  // While this tab shows, the hub draws it again this often (a countdown).
  refreshMs?: number
}
export type SavvyActArgs = { id: string; value?: string }
export type SavvyActResult = { message?: string }
// One component the mod draws, for the hub's Components tab.
export type SavvyCatalogEntry = {
  // Stable, kebab-case: what a person names when asking for a change.
  id: string
  // The component's name, as a person would say it ("Progress band, done").
  name: string
  // One line on what it is and where it shows.
  help?: string
  // The component drawn for `args.surface` at `args.columns`, from the same builders the mod
  // draws it with in place, in a state worth seeing. Static: a press cannot cross to the mod.
  tree: unknown
}

declare module 'claude-code' {
  // What savvy-progress adds to `$`: its tab in the /mods hub and its component catalog.
  interface EngineInterface {
    savvy: {
      panel: (args: SavvyPanelArgs) => Promise<SavvyPanel>
      act: (args: SavvyActArgs) => Promise<SavvyActResult>
      catalog: (args: SavvyPanelArgs) => Promise<SavvyCatalogEntry[]>
    }
  }

  interface PluginState {
    'savvy-progress': {
      flow: Flow | null
      agents: AgentRun[]
      panel: Panel
      now: number
    }
  }
}
