import { expect, mock, test } from 'claude-code/testing'
import type { Engine, Plugin } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { SavvyActArgs, SavvyActResult, SavvyItem, SavvyPanel, SavvyPanelArgs } from '../types'

const PROGRESS = 'mcp__savvy-progress__progress'
const ARGS = { surface: 'terminal', columns: 80 } as const

// The kit's `$` carries no plugin noun: only a module that calls one can, and an inline
// plugin runs apart from the test. This one stands in for the /mods hub: a call of its
// tool is a call on `$.savvy`, the answer handed back as the tool's result.
const PROBE = 'mcp__mods-hub-stand-in__probe'
const HUB: Plugin = {
  name: 'mods-hub-stand-in',
  register: on => {
    on('tool.call', { tool: 'mcp__mods-hub-stand-in__probe' }, async ($, e) => {
      const call = e as unknown as { method: 'panel' | 'act'; args: never }
      const value = call.method === 'act' ? await $.savvy.act(call.args) : await $.savvy.panel(call.args)
      return { result: JSON.stringify(value) }
    })
  },
}

async function probe($: Engine, method: 'panel' | 'act', args: unknown): Promise<unknown> {
  const answer = (await $.tool.call({ tool: PROBE, method, args } as never)) as { result?: unknown }
  return JSON.parse(String(answer.result))
}

const hub = {
  panel: ($: Engine, args: SavvyPanelArgs) => probe($, 'panel', args) as Promise<SavvyPanel>,
  act: ($: Engine, args: SavvyActArgs) => probe($, 'act', args) as Promise<SavvyActResult>,
}

// Starts a session, the registrations it makes recorded in `seen`.
async function start($: Engine, on: On, seen: { commands: string[]; tools: string[] } = { commands: [], tools: [] }) {
  mock.env(on, { LANG: 'en_US.UTF-8' })
  const clock = mock.clock(on, { now: Date.parse('2026-10-13T12:00:00Z') })
  on('settings.read', async () => ({ value: {} }) as never)
  on('session.start', async () => ({ cwd: '/repo' }) as never)
  on('command.register', async (_$, e) => {
    seen.commands.push(e.name)
    return { value: { command: e.name } }
  })
  on('tool.register', async (_$, e) => {
    seen.tools.push(e.name)
    return { value: { tool: e.name } }
  })
  await $.session.start({ source: 'startup', cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
  return clock
}

const items = (p: SavvyPanel, section: string): SavvyItem[] => p.sections.find(s => s.id === section)?.items ?? []
const action = (p: SavvyPanel, id: string) => items(p, 'view').find(i => i.kind === 'action' && i.id === id)
const toggle = (p: SavvyPanel, id: string) => items(p, 'view').find(i => i.kind === 'toggle' && i.id === id)

test('hub: the panel is an Agents tab with the open action', { plugins: [HUB] }, async ($, on) => {
  await start($, on)
  const p = await hub.panel($, { lang: 'en', ...ARGS })

  expect(p.title).toBe('Agents')
  expect(p.summary).toBe('no agents this session')
  expect(p.sections.map(s => [s.id, s.title])).toEqual([
    ['overview', 'This session'],
    ['view', 'Agents panel'],
    ['settings', 'Settings'],
  ])
  // Opening the pane is this session's; the view choices and settings are the user's.
  expect(action(p, 'open')).toEqual({
    kind: 'action',
    id: 'open',
    label: 'Open panel',
    help: expect.any(String),
    primary: true,
    scope: 'session',
  })
  expect(toggle(p, 'compact')).toMatchObject({ value: false, scope: 'user' })
  expect(toggle(p, 'hideFinished')).toMatchObject({ value: false, scope: 'user' })
  // Nothing runs: no redraw countdown.
  expect(p.refreshMs).toBeUndefined()
  expect(items(p, 'settings').map(i => (i.kind === 'choice' ? [i.id, i.value] : i.kind))).toEqual([
    ['language', 'auto'],
    ['autoOpen', 'savvy'],
  ])
})

test('hub: Portuguese when the hub asks for it', { plugins: [HUB] }, async ($, on) => {
  await start($, on)
  const p = await hub.panel($, { lang: 'pt', ...ARGS })

  expect(p.title).toBe('Agentes')
  expect(p.summary).toBe('nenhum agente nesta sessão')
  expect(p.sections.map(s => s.title)).toEqual(['Esta sessão', 'Painel de agentes', 'Ajustes'])
  expect(action(p, 'open')).toMatchObject({ label: 'Abrir painel', primary: true })
  expect(items(p, 'overview').filter(i => i.kind === 'info').map(i => (i.kind === 'info' ? i.label : ''))).toEqual([
    'Em execução',
    'Concluídos',
    'Planejados',
  ])
})

test('hub: the flow and the running agents show, with a refresh while they run', { plugins: [HUB] }, async ($, on) => {
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.spawn', async () => ({ agentId: 'a1', model: 'claude-opus-5-5' }) as never)
  await start($, on)
  await $.tool.call({ tool: PROGRESS, title: 'Ship it', phase: 'delegate', total: 4, done: 1 } as never)
  await $.agent.spawn({ prompt: 'go', description: 'Write the parser', subagentType: 'savvy-careful', tool_use_id: 't1' } as never)

  const p = await hub.panel($, { lang: 'en', ...ARGS })
  expect(p.summary).toBe('Ship it: tasks 1/4 · 25% · 1 running')
  expect(items(p, 'overview')).toContainEqual({ kind: 'info', label: 'Flow', value: 'Ship it: tasks 1/4 · 25%', tone: 'accent' })
  expect(items(p, 'overview')).toContainEqual({ kind: 'info', label: 'Running', value: '1', tone: 'accent' })
  expect(p.refreshMs).toBe(5000)
  // The running agent is listed as a row, drawn by the pane's own builder.
  const running = p.sections.find(s => s.id === 'running')
  expect(running?.title).toBe('Running · 1')
  expect(JSON.stringify(running?.items)).toContain('Write the parser')
  expect(running?.items.every(i => i.kind === 'tree')).toBe(true)

  const pt = await hub.panel($, { lang: 'pt', ...ARGS })
  expect(pt.summary).toBe('Ship it: tarefas 1/4 · 25% · 1 em execução')
})

test('hub: act open opens the agents pane', { plugins: [HUB] }, async ($, on) => {
  const opened: string[] = []
  on('ui.open', (_$, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  await start($, on)

  await hub.panel($, { lang: 'en', ...ARGS })
  expect(await hub.act($, { id: 'open' })).toEqual({ message: 'Agents panel opened.' })
  expect(opened).toEqual(['savvy-agents'])
})

test('hub: a setting is changed through its config row', { plugins: [HUB] }, async ($, on) => {
  const writes: [string, unknown][] = []
  on('config.set', async (_$, e) => {
    writes.push([e.key, e.value])
    return { value: e.value }
  })
  await start($, on)

  await hub.panel($, { lang: 'pt', ...ARGS })
  expect(await hub.act($, { id: 'autoOpen', value: 'any' })).toEqual({ message: 'Abrir o painel sozinho: Qualquer subagente.' })
  expect(await hub.act($, { id: 'language', value: 'xx' })).toEqual({ message: 'Opção inválida: xx' })
  expect(await hub.act($, { id: 'nope' })).toEqual({ message: 'Ação desconhecida: nope' })
  expect(writes).toEqual([['savvy-progress.autoOpen', 'any']])
})

test('hub: the agents-info command is gone', { plugins: [HUB] }, async ($, on) => {
  const seen = { commands: [] as string[], tools: [] as string[] }
  await start($, on, seen)

  // The session started: the model tools are still there; the slash command is not.
  expect(seen.tools).toEqual(['progress', 'step'])
  expect(seen.commands).not.toContain('agents-info')
})

// The user's store, shared by every session: a map the test can read and write as another
// session would.
function sharedStore(on: On): Map<string, unknown> {
  const memory = new Map<string, unknown>()
  on('store.get', async (_$, e) => ({ value: memory.get(e.key) }))
  on('store.set', async (_$, e) => {
    memory.set(e.key, e.value)
    return { value: undefined }
  })
  return memory
}

test('hub: the view choices are written to the user store at once', { plugins: [HUB] }, async ($, on) => {
  const store = sharedStore(on)
  await start($, on)

  await hub.panel($, { lang: 'en', ...ARGS })
  expect(await hub.act($, { id: 'compact', value: 'on' })).toEqual({ message: 'Collapsed view: on.' })
  expect(store.get('compact')).toBe(true)
  expect(toggle(await hub.panel($, { lang: 'en', ...ARGS }), 'compact')).toMatchObject({ value: true })
  expect(await hub.act($, { id: 'hideFinished', value: 'maybe' })).toEqual({ message: 'Not an option: maybe' })
})

test('hub: a choice another session stored shows here, in the panel and on the slow clock', { plugins: [HUB] }, async ($, on) => {
  const store = sharedStore(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.spawn', async () => ({ agentId: 'a1', model: 'claude-opus-5-5' }) as never)
  const clock = await start($, on)
  await $.agent.spawn({ prompt: 'go', description: 'Write the parser', subagentType: 'savvy-careful', tool_use_id: 't1' } as never)

  // Another session writes the shared store: the next panel reads it.
  store.set('hideFinished', true)
  expect(toggle(await hub.panel($, { lang: 'en', ...ARGS }), 'hideFinished')).toMatchObject({ value: true })

  // And without a panel, the pane follows within the clock's 3 seconds.
  store.set('compact', true)
  await clock.advance(3000)
  const pane = { title: '', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} } as const
  const ui = await $.ui.mount({ plugin: 'savvy-progress', surface: 'terminal', component: 'Pane', requestId: 'savvy-agents', props: pane })
  expect((await ui.find({ key: 'compact' }))?.props.label).toBe('Expand')
  await ui.unmount()
})
