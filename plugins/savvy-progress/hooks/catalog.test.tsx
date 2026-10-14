import { expect, mock, test } from 'claude-code/testing'
import type { Engine, Plugin } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { SavvyCatalogEntry, SavvyPanelArgs } from '../types'

// Stands in for the /mods hub, as in hub.test.ts: a call of its tool is a call of
// `$.savvy.catalog` end to end (a tree that is not plain data fails right there),
// and its pane draws every entry's tree, as the hub's Components tab does, so a
// tree that does not validate fails the mount. An inline plugin runs apart from
// the test: everything it uses is written inside it.
const HUB: Plugin = {
  name: 'mods-hub-stand-in',
  register: on => {
    on('tool.call', { tool: 'mcp__mods-hub-stand-in__probe' }, async ($, e) => {
      const args = (e as unknown as { args: never }).args
      return { result: JSON.stringify(await $.savvy.catalog(args)) }
    })
    on('ui.render', { component: 'Pane', requestId: 'catalog' }, async ($, e) => {
      const { Box, Text } = $.ui.resolve(e)
      const entries = await $.savvy.catalog({ lang: 'en', surface: e.surface, columns: e.props.bodyColumns })
      return (
        <Box flexDirection="column">
          {entries.map(entry => (
            <Box key={`entry-${entry.id}`} flexDirection="column">
              <Text key={`name-${entry.id}`}>{entry.name}</Text>
              {entry.tree as never}
            </Box>
          ))}
        </Box>
      )
    })
  },
}

const PROBE = 'mcp__mods-hub-stand-in__probe'
const pane = { title: '', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } as const

async function start($: Engine, on: On) {
  mock.env(on, { LANG: 'en_US.UTF-8' })
  mock.clock(on, { now: Date.parse('2026-10-13T12:00:00Z') })
  on('settings.read', async () => ({ value: {} }) as never)
  on('session.start', async () => ({ cwd: '/repo' }) as never)
  on('tool.register', async (_$, e) => ({ value: { tool: e.name } }))
  await $.session.start({ source: 'startup', cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
}

async function catalog($: Engine, args: SavvyPanelArgs): Promise<SavvyCatalogEntry[]> {
  const answer = (await $.tool.call({ tool: PROBE, args } as never)) as { result?: unknown }
  return JSON.parse(String(answer.result)) as SavvyCatalogEntry[]
}

// Every element type a tree holds, depth first.
const types = (node: unknown): string[] => {
  if (Array.isArray(node)) return node.flatMap(types)
  if (node === null || typeof node !== 'object') return []
  const el = node as { type?: unknown; props?: { children?: unknown }; children?: unknown }
  return [...(typeof el.type === 'string' ? [el.type] : []), ...types(el.children), ...types(el.props?.children)]
}

test('catalog: every component, each with a unique kebab-case id, a name, help and a tree', { plugins: [HUB] }, async ($, on) => {
  await start($, on)
  const entries = await catalog($, { lang: 'en', surface: 'terminal', columns: 80 })

  expect(entries.length).toBeGreaterThanOrEqual(40)
  const ids = entries.map(e => e.id)
  expect(new Set(ids).size).toBe(ids.length)
  for (const e of entries) {
    expect(e.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    expect(e.name.length).toBeGreaterThan(0)
    expect(e.name).not.toBe(e.id)
    expect(String(e.help).length).toBeGreaterThan(0)
    expect(e.tree).toBeTruthy()
  }
  // The band, the pane and each row state are all named.
  for (const id of ['band-planning', 'band-mid-flow', 'band-done', 'crew-button', 'pane-full', 'pane-empty', 'agent-row-running', 'agent-row-finished', 'agent-row-failed', 'planned-row', 'model-badge', 'task-progress', 'agent-stats', 'pane-totals', 'pane-hebrew']) {
    expect(ids).toContain(id)
  }
  expect(entries.find(e => e.id === 'band-mid-flow')?.name).toBe('Progress band, mid-flow')
})

test('catalog: names and help in Portuguese for pt, ids unchanged', { plugins: [HUB] }, async ($, on) => {
  await start($, on)
  const en = await catalog($, { lang: 'en', surface: 'terminal', columns: 80 })
  const pt = await catalog($, { lang: 'pt', surface: 'terminal', columns: 80 })

  expect(pt.map(e => e.id)).toEqual(en.map(e => e.id))
  expect(pt.find(e => e.id === 'pane-full')?.name).toBe('Painel de agentes')
  expect(pt.find(e => e.id === 'band-done')?.name).toBe('Barra de progresso, concluída')
  // Every entry is translated, not only a few.
  const same = pt.filter(e => e.name === en.find(x => x.id === e.id)?.name)
  expect(same).toEqual([])
})

test('catalog: trees for the terminal are text, for the desktop SVG rows', { plugins: [HUB] }, async ($, on) => {
  await start($, on)
  const terminal = await catalog($, { lang: 'en', surface: 'terminal', columns: 80 })
  const desktop = await catalog($, { lang: 'en', surface: 'desktop', columns: 80 })

  expect(desktop.map(e => e.id)).toEqual(terminal.map(e => e.id))
  const of = (list: SavvyCatalogEntry[], id: string) => types(list.find(e => e.id === id)?.tree)
  // The pane's rows and the band are drawn as one SVG each on the desktop, as text in the terminal.
  for (const id of ['band-mid-flow', 'agent-row-running', 'planned-row', 'pane-full', 'crab-heavy']) {
    expect(of(desktop, id)).toContain('Svg')
    expect(of(terminal, id)).not.toContain('Svg')
    expect(of(terminal, id)).toContain('Text')
  }
  // Static trees: no Button crosses, its label is drawn as text.
  for (const e of [...terminal, ...desktop]) expect(types(e.tree)).not.toContain('Button')
  expect(JSON.stringify(desktop.find(e => e.id === 'crew-button')?.tree)).toContain('Agents · 7')
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`catalog: every tree draws in a pane on the ${surface}`, { plugins: [HUB] }, async ($, on) => {
    await start($, on)
    const ui = await $.ui.mount({ plugin: 'mods-hub-stand-in', surface, component: 'Pane', requestId: 'catalog', props: pane })
    expect(await ui.find({ type: 'Text', text: /^Agent row, failed$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Crab, Explore agent$/ })).toBeDefined()
    if (surface === 'desktop') expect((await ui.findAll({ type: 'Svg' })).length).toBeGreaterThan(30)
    else expect(await ui.find({ type: 'Text', text: /Write the parser/ })).toBeDefined()
    await ui.unmount()
  })
}
