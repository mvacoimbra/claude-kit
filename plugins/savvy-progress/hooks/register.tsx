import { atom, read, update } from 'claude-code'
import type { ButtonProps, EngineInterface, PluginOptions, Register, RenderElement } from 'claude-code'

import { empty, group, kitOf, meter, staticTree, status, text } from './kit/kit'
import type { Kit, KitUi } from './kit/kit'
import { hexOf, toneOf } from './kit/tone'
import type { KitSkin, KitTone } from './kit/tone'
import type {
  AgentRun,
  Flow,
  Panel,
  Phase,
  PlannedTask,
  Prefs,
  SavvyActArgs,
  SavvyActResult,
  SavvyCatalogEntry,
  SavvyItem,
  SavvyLang,
  SavvyPanel,
  SavvyPanelArgs,
  SavvySection,
} from '../types'

const flow = atom({ plugin: 'savvy-progress', key: 'flow' } as const, null)
const agents = atom({ plugin: 'savvy-progress', key: 'agents' } as const, [])
// The pane's two view choices mirror the user's store (`compact`, `hideFinished`), so every
// session draws the pane the same way; `autoOpenedFor` is this session's alone.
const panel = atom({ plugin: 'savvy-progress', key: 'panel' } as const, {
  isCompact: false,
  isDoneCollapsed: false,
  autoOpenedFor: '',
})
// The two userConfig settings as last read from their config rows; null before the first read.
const prefs = atom({ plugin: 'savvy-progress', key: 'prefs' } as const, null)
const now = atom({ plugin: 'savvy-progress', key: 'now' } as const, 0)

// The skin every mod wears, from skins; Claude Code's own colours without it.
async function skinOf($: EngineInterface): Promise<KitSkin | null> {
  try {
    return await $.skins.palette()
  } catch {
    return null
  }
}
const TOOL = 'mcp__savvy-progress__progress'
const STEP_TOOL = 'mcp__savvy-progress__step'
// Added to the end of each savvy worker's brief. Their system prompt words step
// reporting as a condition ("if the step tool appears among your tools") and they
// skip it even with the tool listed; the same request in the brief is followed.
const STEP_BRIEF = `

Progress reporting: before any other work, call \`${STEP_TOOL}\` with \`total\` (your plan in 3-8 steps) and \`done: 0\`; call it again with \`done\` and a few-word \`note\` as each step finishes. It only draws a progress bar.`
const PANE = 'savvy-agents'
const PHASES: readonly Phase[] = ['plan', 'design', 'delegate', 'review', 'close']
const TIERS: readonly string[] = ['fable', 'heavy', 'careful', 'medium', 'light']
// The tools' schemas are advice to the model, not a check: what a call may ask
// the band and the panel to draw is bounded here.
const MAX_TASKS = 200
const MAX_AFTER = 20
const MAX_TITLE = 120

type ProgressInput = {
  title?: string
  total?: number
  done?: number
  phase?: Phase
  finished?: boolean
  tasks?: { title?: string; tier?: string; after?: number[] }[]
}

// ---------------------------------------------------------------------------
// Language: the `language` option, else Claude Code's `language` setting, else the
// process locale; English when nothing says Hebrew or Russian.

type Lang = 'en' | 'ru' | 'he'

const STRINGS = {
  en: {
    pane: 'Agents',
    cost: 'Cost',
    tokens: 'Tokens',
    time: 'Time',
    collapse: 'Collapse',
    expand: 'Expand',
    running: 'Running',
    finished: 'Finished',
    planned: 'Planned',
    empty: 'No subagents yet.',
    emptyHint: 'They show here as they start; a /savvy-flow plan lists its tasks as planned.',
    dismiss: 'Dismiss',
    show: 'Show',
    hide: 'Hide',
    context: 'context',
    round: 'round',
    failed: 'error',
    after: 'after',
    tokensWord: 'tokens',
    agentsCount: 'agents',
    isRunning: 'running',
    isFinished: 'finished',
    isPlanned: 'planned',
    done: 'Done',
    plan: 'Plan',
    design: 'Design',
    tasks: 'Tasks',
    review: 'Review',
    busy: 'running',
    tier: { light: 'light', medium: 'medium', careful: 'careful', heavy: 'heavy', fable: 'fable', other: 'other' },
    effort: { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' },
  },
  ru: {
    pane: 'Агенты',
    cost: 'Стоимость',
    tokens: 'Токены',
    time: 'Время',
    collapse: 'Свернуть',
    expand: 'Развернуть',
    running: 'Работают',
    finished: 'Завершены',
    planned: 'Запланированы',
    empty: 'Субагентов пока нет.',
    emptyHint: 'Они появятся здесь, как только начнут работу; план /savvy-flow покажет свои задачи как запланированные.',
    dismiss: 'Закрыть',
    show: 'Показать',
    hide: 'Скрыть',
    context: 'контекст',
    round: 'раунд',
    failed: 'ошибка',
    after: 'после',
    tokensWord: 'токенов',
    agentsCount: 'агентов',
    isRunning: 'работает',
    isFinished: 'завершён',
    isPlanned: 'запланирована',
    done: 'Готово',
    plan: 'План',
    design: 'Дизайн',
    tasks: 'Задачи',
    review: 'Ревью',
    busy: 'в работе',
    tier: { light: 'light', medium: 'medium', careful: 'careful', heavy: 'heavy', fable: 'fable', other: 'other' },
    effort: { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' },
  },
  he: {
    pane: 'סוכנים',
    cost: 'עלות',
    tokens: 'טוקנים',
    time: 'זמן',
    collapse: 'כיווץ',
    expand: 'הרחבה',
    running: 'פועלים',
    finished: 'הסתיימו',
    planned: 'מתוכננים',
    empty: 'עדיין אין סוכנים.',
    emptyHint: 'הם יופיעו כאן כשיתחילו; תוכנית של ‎/savvy-flow מציגה את המשימות שלה כמתוכננות.',
    dismiss: 'סגירה',
    show: 'הצגה',
    hide: 'הסתרה',
    context: 'הקשר',
    round: 'סבב',
    failed: 'שגיאה',
    after: 'אחרי',
    tokensWord: 'טוקנים',
    agentsCount: 'סוכנים',
    isRunning: 'פועל',
    isFinished: 'הסתיים',
    isPlanned: 'מתוכנן',
    done: 'הושלם',
    plan: 'תכנון',
    design: 'עיצוב',
    tasks: 'משימות',
    review: 'בדיקה',
    busy: 'בעבודה',
    tier: { light: 'קל', medium: 'בינוני', careful: 'זהיר', heavy: 'כבד', fable: 'פייבל', other: 'אחר' },
    effort: { low: 'נמוך', medium: 'בינוני', high: 'גבוה', xhigh: 'גבוה מאוד', max: 'מקסימלי' },
  },
} as const

// Module scope is fine here: session.start sets it again on every (re)load.
let lang: Lang = 'en'
const tr = () => STRINGS[lang]

// Hebrew draws every row mirrored: crab and title on the right, numbers on the left.
const isRtl = () => lang === 'he'

// Tier and effort words as shown; anything unknown shows as it came.
const tierWord = (tier: string): string => (tr().tier as Record<string, string>)[tier] ?? tier
const effortWord = (effort: string): string => (tr().effort as Record<string, string>)[effort] ?? effort

const isRussian = (v: unknown): boolean => typeof v === 'string' && /^(ru|russian|рус)/i.test(v.trim())
const isHebrew = (v: unknown): boolean => typeof v === 'string' && /^(he|iw|hebrew|עברית)/i.test(v.trim())
const langOf = (v: unknown): Lang => (isHebrew(v) ? 'he' : isRussian(v) ? 'ru' : 'en')

async function detectLang($: EngineInterface, option: unknown): Promise<Lang> {
  if (option === 'en' || option === 'ru' || option === 'he') return option
  try {
    const settings = (await $.settings.read()) as Record<string, unknown>
    if (typeof settings.language === 'string' && settings.language.trim()) return langOf(settings.language)
  } catch {
    // No settings: fall through to the locale.
  }
  const locale = (await $.env.get('LC_ALL')) || (await $.env.get('LC_MESSAGES')) || (await $.env.get('LANG'))
  return langOf(locale)
}

const blank = (): Flow => ({
  title: 'savvy-flow',
  total: 0,
  done: 0,
  running: 0,
  phase: 'plan',
  isFinished: false,
  tasks: [],
})

const isNewFlow = (prev: Flow | null, input: ProgressInput): boolean =>
  !prev || prev.isFinished || (input.title !== undefined && clip(input.title.trim(), MAX_TITLE) !== prev.title)

// Only a known tier is kept: the name is later a key into the tier tables.
const tierName = (v: string): string => {
  const t = v.replace(/^savvy-/, '').trim().toLowerCase()
  return TIERS.includes(t) ? t : ''
}

const cleanTasks = (tasks: ProgressInput['tasks']): PlannedTask[] | undefined =>
  tasks
    ?.filter(t => t.title?.trim())
    .slice(0, MAX_TASKS)
    .map(t => ({
      title: (t.title ?? '').trim(),
      tier: tierName(t.tier ?? ''),
      after: (t.after ?? []).filter(n => Number.isInteger(n) && n > 0).slice(0, MAX_AFTER),
    }))

const merge = (prev: Flow | null, input: ProgressInput): Flow => {
  // A new title means a new flow: never carry counters over from an earlier one.
  const base = isNewFlow(prev, input) || !prev ? blank() : { ...blank(), ...prev }
  const tasks = cleanTasks(input.tasks) ?? base.tasks
  const total = Math.min(MAX_TASKS, Math.max(0, Math.round(input.total ?? (input.tasks ? tasks.length : base.total))))
  const done = Math.min(total || Infinity, Math.max(0, Math.round(input.done ?? base.done)))
  const phase = input.phase && PHASES.includes(input.phase) ? input.phase : base.phase
  return {
    ...base,
    title: clip(input.title?.trim() || base.title, MAX_TITLE),
    total,
    done,
    phase: input.finished ? 'close' : phase,
    isFinished: input.finished === true,
    tasks,
  }
}

const label = (f: Flow): string => {
  const s = tr()
  if (f.isFinished) return s.done
  if (f.phase === 'plan') return s.plan
  if (f.phase === 'design') return s.design
  const count = f.total ? `${f.done}/${f.total}` : `${f.running} ${s.busy}`
  return `${f.phase === 'review' ? s.review : s.tasks} ${count}`
}

const ratio = (f: Flow): number => (f.isFinished ? 1 : f.total ? f.done / f.total : 0)

const xml = (s: string): string =>
  s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

const clip = (s: string, max: number): string => (s.length > max ? s.slice(0, Math.max(1, max - 1)) + '…' : s)

// CJK, fullwidth forms and emoji advance about 1em; at 0.56em a Chinese title was sized at half its width and the bar drew over it.
// 中日韩文字、全角标点和 emoji 约占 1em；按 0.56em 算时中文标题宽度被低估近一半，进度条会压到标题上。
const WIDE =
  /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA960-\uA97F\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF01-\uFF60\uFFE0-\uFFE6\u{1F300}-\u{1FAFF}\u{20000}-\u{3FFFD}]/u

// Rough advance of system UI text, in em; good enough to size the title's slot.
const charEm = (ch: string): number =>
  WIDE.test(ch) ? 1 : /[\s.,:;'|!il1()[\]]/.test(ch) ? 0.3 : /[A-ZА-ЯЁmwшщжюМШЩЖЮ@%]/.test(ch) ? 0.72 : 0.56

const textWidth = (s: string, size: number): number => [...s].reduce((w, ch) => w + charEm(ch) * size, 0)

// Cuts `s` to fit `maxW` pixels, with an ellipsis when it had to cut.
const fitText = (s: string, size: number, maxW: number): string => {
  if (textWidth(s, size) <= maxW) return s
  let out = ''
  for (const ch of s) {
    if (textWidth(out + ch + '…', size) > maxW) break
    out += ch
  }
  return out + '…'
}

const barText = (f: Flow, width: number): string => {
  const filled = Math.round(width * ratio(f))
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled))
}

// ---------------------------------------------------------------------------
// Agents panel: every subagent of the session, plus the tasks the flow planned.

const TIER_COLOR: Record<string, string> = {
  fable: '#7F77DD',
  heavy: '#D85A30',
  careful: '#BA7517',
  medium: '#378ADD',
  light: '#1D9E75',
  other: '#888780',
}

// What each savvy tier runs on, for planned tasks that have no run yet.
const colorOf = (tier: string): string => TIER_COLOR[tier] ?? '#888780'

const TIER_MODEL: Record<string, [model: string, effort: string]> = {
  fable: ['Fable', 'high'],
  heavy: ['Opus', 'xhigh'],
  careful: ['Opus', 'high'],
  medium: ['Opus', 'medium'],
  light: ['Opus', 'low'],
}

// "Opus · xhigh", with the effort word in the panel's language; '' for an unknown tier.
const tierModel = (tier: string): string => {
  const m = TIER_MODEL[tier]
  return m ? `${m[0]} · ${effortWord(m[1])}` : ''
}

// "Opus 5.5 · low" for a run, or just the model when no effort was seen.
const runModel = (a: AgentRun): string => (a.effort ? `${modelName(a.model)} · ${effortWord(a.effort)}` : modelName(a.model))

// USD per million tokens: input, output, cache read, cache write. The first row that
// matches a model id wins, so a release sits above its family.
// The engine reports tokens, not money, so the panel's cost is an estimate. It reports
// one cache-write count with no split by lifetime; writes are priced at the 1-hour
// rate (2x input), which is what Claude Code writes on a subscription.
type Price = [input: number, output: number, cacheRead: number, cacheWrite: number]

const PRICES: [RegExp, Price][] = [
  [/(fable|mythos)-5-1/, [10, 50, 0.25, 20]],
  [/fable|mythos/, [10, 50, 1, 20]],
  [/opus-5-5/, [4, 20, 0.2, 8]],
  [/opus/, [5, 25, 0.5, 10]],
  [/sonnet-5-5/, [2, 10, 0.1, 4]],
  [/sonnet-5/, [2, 10, 0.2, 4]],
  [/sonnet/, [3, 15, 0.3, 6]],
  [/haiku-5-5/, [0.1, 0.5, 0.01, 0.2]],
  [/haiku/, [1, 5, 0.1, 2]],
]

// Haiku 5.5 is priced by prompt length: a request whose prompt (input, cache reads and
// cache writes together) is over 100,000 tokens pays these prices instead.
const HAIKU_LONG_PROMPT = 100_000
const HAIKU_LONG: Price = [0.5, 2.5, 0.05, 1]

type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

const priceOf = (model: string, prompt: number): Price => {
  const id = model.toLowerCase()
  if (prompt > HAIKU_LONG_PROMPT && /haiku-5-5/.test(id)) return HAIKU_LONG
  return PRICES.find(([re]) => re.test(id))?.[1] ?? [4, 20, 0.2, 8]
}

// `isRequest` says the usage is one model request, which is what a prompt-length price
// is set by; a turn's sum is priced at the model's ordinary prices.
const costOf = (model: string, u: Usage, isRequest: boolean): number => {
  const prompt = isRequest ? (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) : 0
  const [i, o, r, w] = priceOf(model, prompt)
  return (
    ((u.input_tokens || 0) * i +
      (u.output_tokens || 0) * o +
      (u.cache_read_input_tokens || 0) * r +
      (u.cache_creation_input_tokens || 0) * w) /
    1e6
  )
}

// Haiku 4.5 and the Claude 3 models have a 200K window; the rest, Haiku 5.5 included, 1M.
const windowOf = (model: string): number => (/haiku-4|claude-3/i.test(model) ? 200_000 : 1_000_000)

// `savvy-careful`, or `savvy-flow:savvy-careful` when the agents ship in a plugin.
const tierOf = (type: string): string => {
  const bare = type.replace(/^[^:]*:/, '')
  const t = bare.replace(/^savvy-/, '').toLowerCase()
  return Object.hasOwn(TIER_COLOR, t) && bare.startsWith('savvy-') ? t : 'other'
}

const modelName = (id: string): string => {
  const m = /(fable|mythos|opus|sonnet|haiku)-(\d+)(?:-(\d{1,2})(?!\d))?/i.exec(id)
  const [, family = '', major = '', minor] = m ?? []
  if (!family) return id.replace(/^claude-/, '').replace(/\[.*\]$/, '') || '—'
  return `${family.charAt(0).toUpperCase()}${family.slice(1).toLowerCase()} ${major}${minor ? '.' + minor : ''}`
}

const norm = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

const fmtTokens = (n: number): string =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${Math.round(n)}`

const fmtCost = (usd: number): string => `$${usd < 10 ? usd.toFixed(2) : usd.toFixed(1)}`

const fmtTime = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

const elapsed = (a: AgentRun, at: number): number => (a.endedAt ?? Math.max(at, a.startedAt)) - a.startedAt

type Planned = PlannedTask & { n: number }

const plannedOf = (f: Flow | null, list: AgentRun[]): Planned[] => {
  if (!f || f.isFinished) return []
  const started = new Set(list.map(a => norm(a.description)))
  return (f.tasks ?? []).map((t, i) => ({ ...t, n: i + 1 })).filter(t => !started.has(norm(t.title)))
}

const totals = (list: AgentRun[], at: number) => {
  const cost = list.reduce((s, a) => s + a.costUsd, 0)
  const tokens = list.reduce((s, a) => s + a.tokens, 0)
  const start = Math.min(...list.map(a => a.startedAt))
  const end = Math.max(...list.map(a => a.endedAt ?? Math.max(at, a.startedAt)))
  return { cost, tokens, time: list.length ? end - start : 0 }
}

// Pixel Clawd from DockCrab (Clawdy): a 24×18 crab on a 30×28 grid, one costume per tier.
// The body keeps the brand clay; the tier's color lives in the costume's accent.
const CLAY = '#D97757'
const INK = '#1F1E1D'

// `cls` puts a pixel in a named group: `bd` (the default) is the body and its
// costume, `la`/`lb` the leg pairs, anything else a prop with its own motion.
type Fill = (x: number, y: number, w: number, h: number, c: string, cls?: string) => void

const stamp = (f: Fill, x: number, y: number, rows: string[], map: Record<string, string>, cls?: string): void =>
  rows.forEach((row, dy) => [...row].forEach((ch, dx) => map[ch] && f(x + dx, y + dy, 1, 1, map[ch] ?? '', cls)))

// `armCls` lets a raised claw travel with the prop it holds.
const crabBody = (f: Fill, armFront = 0, armCls?: string): void => {
  f(7, 10, 16, 12, CLAY)
  f(3, 14, 4, 4, CLAY)
  f(23, 14 + armFront, 4, 4, CLAY, armCls)
  f(9, 12, 2, 2, INK)
  f(19, 12, 2, 2, INK)
  f(7, 22, 2, 4, CLAY, 'la')
  f(17, 22, 2, 4, CLAY, 'la')
  f(11, 22, 2, 4, CLAY, 'lb')
  f(21, 22, 2, 4, CLAY, 'lb')
}

// Pure CSS, run by the compositor: no redraws. Periods divide one second, so the
// once-a-second redraw of a running row restarts them in phase. Every crab walks;
// each costume adds its prop's own motion on top.
const CRAB_CSS = `<style>
.run .la{animation:st .5s steps(1) infinite}.run .lb{animation:st .5s steps(1) infinite -.25s}
.run .bd{animation:bob .5s steps(1) infinite -.125s}
.run g{transform-box:fill-box}
@keyframes st{50%{transform:translateY(-1px)}}@keyframes bob{50%{transform:translateY(1px)}}
.c-fable.run{animation:float 1s ease-in-out infinite}
.c-fable.run .la,.c-fable.run .lb,.c-fable.run .bd{animation:none}
.c-fable.run .ant{animation:blink 1s steps(1) infinite}
.c-fable.run .star{animation:blink .5s steps(1) infinite -.25s}
@keyframes float{50%{transform:translateY(-2px)}}@keyframes blink{50%{opacity:.15}}
.c-heavy.run .it{animation:scan 1s steps(1) infinite}
.c-heavy.run .gl{animation:blink 1s steps(1) infinite -.5s}
@keyframes scan{25%{transform:translate(-1px,1px)}50%{transform:translate(-2px,2px)}75%{transform:translate(-1px,1px)}}
.c-careful.run .it{transform-origin:100% 100%;animation:twist .5s ease-in-out infinite}
@keyframes twist{50%{transform:rotate(-35deg)}}
.c-medium.run .pan{transform-origin:0 50%;animation:tilt 1s ease-in-out infinite}
.c-medium.run .egg{animation:flip 1s ease-in-out infinite}
@keyframes tilt{20%,40%{transform:rotate(-12deg)}}@keyframes flip{30%{transform:translateY(-5px) scaleY(-1)}60%{transform:translateY(0)}}
.c-light.run .la{animation-duration:.25s}.c-light.run .lb{animation-duration:.25s;animation-delay:-.125s}
.c-light.run .flag{transform-origin:0 50%;animation:wave .25s steps(1) infinite}
@keyframes wave{50%{transform:skewY(-12deg) scaleX(.85)}}
.c-explore.run .it{transform-origin:50% 100%;animation:fence .5s ease-in-out infinite}
@keyframes fence{50%{transform:rotate(25deg)}}
@media (prefers-reduced-motion: reduce){.run,.run g{animation:none!important}}
</style>`

const COSTUMES: Record<string, (f: Fill, t: string) => void> = {
  // Fable: astronaut in a glass dome; floats instead of walking, the antenna and the star blink.
  fable: (f, t) => {
    crabBody(f)
    f(6, 7, 18, 1, '#E6E8EE'); f(5, 8, 1, 14, '#E6E8EE'); f(24, 8, 1, 14, '#E6E8EE'); f(6, 22, 18, 1, '#C9CCD2')
    f(6, 8, 18, 14, 'rgba(169,214,245,.32)'); f(8, 9, 2, 1, '#fff'); f(8, 10, 1, 2, '#fff')
    f(14, 4, 2, 3, '#C9CCD2'); f(14, 2, 2, 2, t, 'ant'); f(13, 18, 4, 2, t)
    f(27, 3, 1, 3, '#F5C542', 'star'); f(26, 4, 3, 1, '#F5C542', 'star')
  },
  // Heavy: detective with a deerstalker; the magnifier sweeps and glints.
  heavy: (f, t) => {
    crabBody(f, -4, 'it')
    stamp(f, 6, 3, ['......bbbbbb......', '....bbcbbcbbbb....', '...bbbbbbbbbbbb...', '..bcbbcbbcbbcbbb..', '.bbbbbbbbbbbbbbbb.', 'dddddddddddddddddd'], { b: '#7A4A26', c: '#A0703F', d: '#5A3519' })
    f(6, 9, 18, 1, t)
    stamp(f, 23, 1, ['.kkk.', 'k...k', 'k...k', 'k...k', '.kkk.'], { k: '#3A3A3C' }, 'it')
    f(24, 2, 3, 3, 'rgba(169,214,245,.7)', 'it'); f(25, 6, 1, 4, '#7A4A26', 'it'); f(24, 2, 1, 1, '#fff', 'gl')
  },
  // Careful: engineer in a hard hat; the wrench turns a bolt.
  careful: (f, t) => {
    crabBody(f)
    stamp(f, 6, 4, ['.....yyyyyyyy.....', '...yyyyyhhyyyyy...', '..yyyyyyhhyyyyyy..', '..yyyyyyhhyyyyyy..', '.yyyyyyyhhyyyyyyy.', 'dddddddddddddddddd'], { y: '#F5C542', h: '#FBE08A', d: '#C99A1E' })
    f(13, 5, 4, 2, t)
    stamp(f, 0, 10, ['.s.s', 'sss.', '.s..', '.s..'], { s: '#8E929A' }, 'it')
  },
  // Medium: chef, the toque traced from DockCrab's Sprites.chefHat; tosses the omelette.
  medium: (f, t) => {
    crabBody(f, -4, 'pan')
    stamp(f, 6, 0, ['........lll.......', '.......lllll......', '.wwwwgwwwwwwgwwwww', 'wwwwwwwwwwwwwwwwww', 'wwwwwwwwwwwwwwwwww', 'wwwwwgwwwwwggwwwww', '.wwwwgwwwwwggwwwww', '.dddbbbbbbbbbbbbb.', '.dddbbbbbbbbbbbbb.', '.dddbbbbbbbbbbbbb.'], { w: '#F4F3EE', l: '#F7F6F2', g: '#D2D1C8', b: t, d: '#B45F43' })
    f(22, 8, 7, 2, '#4A4A48', 'pan'); f(26, 10, 1, 1, '#4A4A48', 'pan'); f(24, 7, 3, 1, '#F5B731', 'egg')
  },
  // Light: racer in a helmet; runs at double pace, the checkered flag flutters.
  light: (f, t) => {
    crabBody(f, -4)
    stamp(f, 6, 5, ['....rrrrrrrrrr....', '..rrrrrrwwrrrrrr..', '.rrrrrrrwwrrrrrrr.', '.rrrrrrrwwrrrrrrr.', '.rrrrrrrwwrrrrrrr.', '.kkkkkkkkkkkkkkkkr'], { r: t, w: '#F8F6F1', k: INK })
    f(25, 1, 1, 9, '#8E929A')
    stamp(f, 26, 1, ['wkwk', 'kwkw', 'wkwk'], { w: '#F8F6F1', k: INK }, 'flag')
  },
  // Explore: pirate scouting the code; the cutlass fences.
  explore: f => {
    crabBody(f)
    stamp(f, 5, 3, ['.kk..............kk.', '.kkk....kkkk....kkk.', '..kkkkkkkwwkkkkkkk..', '..kkkkkkkkkkkkkkkk..', '.gggggggggggggggggg.'], { k: '#55514C', w: '#F8F6F1', g: '#F5C542' })
    f(7, 11, 11, 1, INK); f(18, 11, 4, 3, INK)
    f(27, 6, 1, 9, '#C9CCD2', 'it'); f(26, 15, 3, 1, '#7A4A26', 'it')
  },
  other: f => crabBody(f),
}

const costumeOf = (type: string): string => (type === 'Explore' ? 'explore' : tierOf(type))

const CRAB_SCALE = 1.1

// Body and props nest inside `bd` so a prop rides the bob and adds its own motion;
// legs stay outside it and step on their own. `mirror` flips the crab inside its
// own box (x .. x + CRAB_BOX * scale) so it faces left.
const crab = (x: number, y: number, costume: string, dim = false, isWalking = false, scale = CRAB_SCALE, mirror = false): string => {
  const groups = new Map<string, string[]>([['bd', []]])
  const f: Fill = (cx, cy, w, h, c, cls = 'bd') => {
    if (!groups.has(cls)) groups.set(cls, [])
    groups.get(cls)?.push(`<rect x="${cx}" y="${cy}" width="${w}" height="${h}" fill="${c}"/>`)
  }
  const draw = COSTUMES[costume] ?? ((g: Fill) => crabBody(g))
  draw(f, colorOf(costume))
  const group = (cls: string) => `<g class="${cls}">${(groups.get(cls) ?? []).join('')}</g>`
  const props = [...groups.keys()].filter(k => k !== 'bd' && k !== 'la' && k !== 'lb')
  const body = `<g class="bd">${(groups.get('bd') ?? []).join('')}${props.map(group).join('')}</g>`
  const place = mirror ? `translate(${x + CRAB_BOX * scale},${y}) scale(${-scale},${scale})` : `translate(${x},${y}) scale(${scale})`
  return `<g transform="${place}" opacity="${dim ? 0.45 : 1}" shape-rendering="crispEdges"><g class="c-${costume}${isWalking ? ' run' : ''}">${body}${group('la')}${group('lb')}</g></g>`
}

// ---------------------------------------------------------------------------
// Drawing: the band and the agents pane in the pack's grammar (hooks/kit), worn in the
// skin chosen in skins. The same builders draw the /mods tab's agent rows and the
// component catalog, so the three never drift apart.

// The crab's drawing grid: 30 units wide with its props, 28 tall.
const CRAB_BOX = 30
const CRAB_TALL = 28
// A list row's crab sits where a row's icon would, beside a two-line name: 24px wide.
const ROW_CRAB = 0.8
// The band's is one line tall.
const BAND_CRAB = 0.7

type Press = ButtonProps['onPress']

// Hebrew draws every row mirrored: the crab and the name on the right, the state on the left.
const dir = (): 'row' | 'row-reverse' => (isRtl() ? 'row-reverse' : 'row')
const along = (): 'flex-start' | 'flex-end' => (isRtl() ? 'flex-end' : 'flex-start')

// A crab as a whole SVG document, `scale` px per grid unit, facing left in Hebrew.
const crabDoc = (costume: string, scale: number, isWalking: boolean, dim = false) => {
  const w = Math.ceil(CRAB_BOX * scale)
  const h = Math.ceil(CRAB_TALL * scale) + 1
  return {
    w,
    h,
    source: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${CRAB_CSS}${crab(0, 0, costume, dim, isWalking, scale, isRtl())}</svg>`,
  }
}

// The mod's mascot: the pixel crab on the desktop, one muted glyph on the terminal.
const crabEl = (k: Kit, costume: string, opts: { scale?: number; walking?: boolean; dim?: boolean; key?: string } = {}): RenderElement => {
  if (!k.vector) return text(k, '▣', opts.dim ? 'faint' : 'muted', opts.key ? { key: opts.key } : {})
  const { Svg } = k.ui
  const d = crabDoc(costume, opts.scale ?? ROW_CRAB, opts.walking === true, opts.dim === true)
  return <Svg {...(opts.key ? { key: opts.key } : {})} source={d.source} alt={`${costume} crab`} width={d.w} height={d.h} />
}

const RING_R = 7

// A share done as a ring with its percent and a muted label: the kit's meter in a
// progress's colours, the accent while it runs and ok once complete (the kit's meter turns
// warn and err as it fills, which suits context, not progress). The terminal draws a bar.
const progressRing = (k: Kit, key: string, share: number, label?: string, tone?: KitTone): RenderElement => {
  const { Box, Svg } = k.ui
  const p = Math.max(0, Math.min(100, Math.round(share * 100)))
  const shade: KitTone = tone ?? (p >= 100 ? 'ok' : 'accent')

  if (!k.vector) {
    const filled = Math.round(p / 12.5)
    return (
      <Box key={key} flexDirection="row" columnGap={1}>
        {text(k, '█'.repeat(filled) + '░'.repeat(8 - filled), shade)}
        {text(k, `${p}%`, undefined, { bold: true })}
        {label ? text(k, label, 'muted') : null}
      </Box>
    )
  }

  const size = RING_R * 2 + 4
  const c = 2 * Math.PI * RING_R
  const ring = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${RING_R}" fill="none" stroke="${k.t.hex.muted}" stroke-opacity=".25" stroke-width="2.5"/><circle cx="${size / 2}" cy="${size / 2}" r="${RING_R}" fill="none" stroke="${hexOf(k.t, shade)}" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="${(c * p) / 100} ${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`
  return (
    <Box key={key} flexDirection={dir()} columnGap={1} alignItems="center">
      <Svg source={ring} alt={`${label ?? ''} ${p}%`.trim()} width={size} height={size} />
      {text(k, `${p}%`, undefined, { bold: true })}
      {label ? text(k, label, 'muted') : null}
    </Box>
  )
}

// ---------------------------------------------------------------------------
// The band above the prompt: the flow's percent as a ring, its title, a track of its
// tasks, its phase as a state, the crab, and two native buttons.

const TRACK_H = 6

// One segment per planned task: accepted ones in the accent (ok once the flow is done),
// ones handed to running workers in a faint accent, the rest in the hairline colour.
// Too many tasks to tell apart, and the segments run together into one bar.
const trackSvg = (k: Kit, f: Flow, W: number): string => {
  const fill = f.isFinished ? k.t.hex.ok : k.t.hex.accent
  const n = f.total
  const handed = n ? Math.min(n, f.done + f.running) : 0
  const rtl = isRtl()
  const at = (x: number, w: number) => (rtl ? W - x - w : x)
  const bar = (x: number, w: number, color: string, opacity = 1) =>
    w > 0 ? `<rect x="${at(x, w).toFixed(1)}" y="0" width="${w.toFixed(1)}" height="${TRACK_H}" rx="${TRACK_H / 2}" fill="${color}"${opacity < 1 ? ` fill-opacity="${opacity}"` : ''}/>` : ''
  let body: string
  if (n > 0 && W / n >= 8) {
    const gap = 2
    const seg = (W - gap * (n - 1)) / n
    body = Array.from({ length: n }, (_, i) => {
      const isDone = f.isFinished || i < f.done
      return bar(i * (seg + gap), seg, isDone || i < handed ? fill : k.t.hex.line, isDone ? 1 : i < handed ? 0.4 : 1)
    }).join('')
  } else {
    const share = ratio(f)
    const handedShare = n ? handed / n : 0
    body = bar(0, W, k.t.hex.line) + bar(0, W * handedShare, fill, 0.4) + bar(0, W * share, fill)
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${TRACK_H}" viewBox="0 0 ${W} ${TRACK_H}">${body}</svg>`
}

type BandProps = { f: Flow; crew: number; isWorking: boolean; onCrew: Press; onDismiss: Press; below?: unknown }

// "Agents · 3": how many agents and planned tasks; a press opens or closes the pane.
const crewLabel = (crew: number): string => `${tr().pane} · ${crew}`

const crewButton = (k: Kit, crew: number, onPress: Press): RenderElement => {
  const { Button } = k.ui
  return <Button key="savvy-agents" label={crewLabel(crew)} dimColor onPress={onPress} />
}

// Forgets the flow, which takes the band down. The desktop draws its native close control.
const dismissButton = (k: Kit, onPress: Press): RenderElement => {
  const { Button } = k.ui
  return <Button key="savvy-dismiss" label={k.vector ? tr().dismiss : '✕'} dimColor role="dismiss" onPress={onPress} />
}

const bandTree = (k: Kit, b: BandProps): RenderElement => {
  const { Box, Svg } = k.ui
  const { f } = b
  const tone: KitTone = f.isFinished ? 'ok' : 'accent'
  const word = label(f)
  const percent = `${Math.round(ratio(f) * 100)}%`
  const below = (b.below ?? null) as RenderElement | null

  if (k.vector) {
    // About 8 CSS px per reported column. What the ring, the state, the crab and the
    // buttons take is fixed; the title takes up to half of the rest, the track the remainder.
    const px = (s: string) => textWidth(s, 13)
    const W = Math.max(240, Math.min(1600, (k.columns || 100) * 8))
    const fixed = 18 + px(percent) + 14 + px(word) + Math.ceil(CRAB_BOX * BAND_CRAB) + px(crewLabel(b.crew)) + 28 + px(tr().dismiss) + 28 + 6 * 8
    const room = W - fixed
    // With room for a track the title takes at most half; without one it takes it all.
    const half = fitText(f.title, 13, Math.max(48, Math.min(280, room * 0.5)))
    const trackW = Math.floor(room - px(half) - 8)
    const hasTrack = trackW >= 64
    const title = hasTrack ? half : fitText(f.title, 13, Math.max(48, room))
    return (
      <Box flexDirection="column">
        <Box flexDirection={dir()} alignItems="center" columnGap={1}>
          {progressRing(k, 'savvy-ring', ratio(f), undefined, tone)}
          <Box flexShrink={1}>{text(k, title, undefined, { bold: true, wrap: 'truncate-end' })}</Box>
          {hasTrack ? <Svg key="savvy-track" source={trackSvg(k, f, trackW)} alt={`${word}, ${percent}`} width={trackW} height={TRACK_H} /> : null}
          <Box flexDirection={dir()} alignItems="center" columnGap={1} flexShrink={0}>
            {status(k, word, tone)}
            {crabEl(k, 'other', { scale: BAND_CRAB, walking: b.isWorking, key: 'savvy-crab' })}
            {crewButton(k, b.crew, b.onCrew)}
            {dismissButton(k, b.onDismiss)}
          </Box>
        </Box>
        {below}
      </Box>
    )
  }

  const columns = k.columns
  const titleW = Math.max(8, Math.min(30, f.title.length + 2, Math.floor(columns / 3)))
  const width = Math.max(6, Math.min(40, columns - titleW - 32))
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" columnGap={2}>
        <Box width={titleW} flexShrink={0} flexDirection="row" columnGap={1}>
          {text(k, '●', tone)}
          {text(k, f.title, undefined, { wrap: 'truncate-end' })}
        </Box>
        {text(k, barText(f, width), tone)}
        {text(k, word, undefined, { bold: true })}
        {text(k, percent, 'muted')}
        {crabEl(k, 'other', { walking: b.isWorking })}
        {crewButton(k, b.crew, b.onCrew)}
        {dismissButton(k, b.onDismiss)}
      </Box>
      {below}
    </Box>
  )
}

// ---------------------------------------------------------------------------
// The agents pane: the flow and the totals, then the Running, Finished and Planned groups,
// one kit row per agent.

// Everything the pane shows, worked out from the session's values.
type PaneView = {
  running: AgentRun[]
  finished: AgentRun[]
  planned: Planned[]
  t: ReturnType<typeof totals>
  // The flow while it runs; the pane's own title already says "Agents".
  flow: Flow | null
  at: number
  isEmpty: boolean
}

const paneView = (list: AgentRun[], f: Flow | null, at: number): PaneView => {
  const planned = plannedOf(f, list)
  return {
    running: list.filter(a => a.status === 'running').reverse(),
    finished: list.filter(a => a.status !== 'running').reverse(),
    planned,
    t: totals(list, at),
    flow: f && !f.isFinished ? f : null,
    at,
    isEmpty: list.length === 0 && planned.length === 0,
  }
}

const totalsSummary = (t: ReturnType<typeof totals>): string => `≈${fmtCost(t.cost)} · ${fmtTokens(t.tokens)} ${tr().tokensWord} · ${fmtTime(t.time)}`

// The task's own progress when the worker reports steps; a finished run is full.
const progressOf = (a: AgentRun): number | null => {
  if (a.status === 'done') return 1
  if (a.stepTotal) return Math.min(1, (a.stepDone ?? 0) / a.stepTotal)
  return null
}

const ctxOf = (a: AgentRun): number => (a.contextMax ? Math.min(100, Math.round((a.contextTokens / a.contextMax) * 100)) : 0)

const STATUS_GLYPH: Record<string, string> = { running: '●', done: '✓', failed: '✗', planned: '◷' }

// A run's state as a word and its tone: running in the accent, finished ok, failed err.
const stateOf = (st: string): [word: string, tone: KitTone] => {
  const s = tr()
  if (st === 'running') return [s.isRunning, 'accent']
  if (st === 'done') return [s.isFinished, 'ok']
  if (st === 'failed') return [s.failed, 'err']
  return [s.isPlanned, 'muted']
}

// "careful · Opus 5.5 · high · round 2": the tier (a subagent's own type outside the
// savvy tiers), the model and effort, and the round when a task went out again.
const runMeta = (a: AgentRun): string => {
  const tier = tierOf(a.type)
  return [tier === 'other' ? a.type : tierWord(tier), runModel(a), a.round > 1 ? `${tr().round} ${a.round}` : ''].filter(Boolean).join(' · ')
}

const plannedTier = (p: PlannedTask): string => (p.tier in TIER_COLOR ? p.tier : 'other')

const plannedMeta = (p: Planned): string => {
  const tier = plannedTier(p)
  return [tierWord(tier), tierModel(tier), p.after.length ? `${tr().after} ${p.after.join(', ')}` : ''].filter(Boolean).join(' · ')
}

// "3/5 · covering edge cases": the worker's reported steps and note.
const stepsText = (a: AgentRun): string => (a.stepTotal ? `${a.stepDone ?? 0}/${a.stepTotal}${a.stepNote ? ' · ' + a.stepNote : ''}` : '')

const costTime = (a: AgentRun, at: number): string => `≈${fmtCost(a.costUsd)} · ${fmtTime(elapsed(a, at))}`

// A list row in the kit's row grammar: the crab where a row's icon sits, the name over its
// muted meta line, the state at the end; readings follow under the name. `pad` is 0 where
// the row is handed to the /mods hub, which pads its items itself.
const listRow = (k: Kit, key: string, lead: RenderElement, name: RenderElement, meta: string, end: RenderElement, below: (RenderElement | null)[], pad = 1): RenderElement => {
  const { Box } = k.ui
  return (
    <Box key={key} flexDirection="column" paddingX={pad} hover={{ backgroundColor: k.t.ink.hover }}>
      <Box flexDirection={dir()} columnGap={1} alignItems="flex-start">
        {lead}
        <Box flexDirection="column" flexGrow={1} flexShrink={1} alignItems={along()}>
          {name}
          {text(k, meta, 'muted', { wrap: 'truncate-end' })}
          {below.filter(Boolean)}
        </Box>
        <Box flexShrink={0}>{end}</Box>
      </Box>
    </Box>
  )
}

// The worker's steps as a ring and the step it is on; nothing when it reports none.
const agentSteps = (k: Kit, a: AgentRun): RenderElement | null => {
  const progress = progressOf(a)
  if (!a.stepTotal || progress === null) return null
  return progressRing(k, `steps-${a.id}`, progress, stepsText(a), a.status === 'failed' ? 'muted' : undefined)
}

// Context as the kit's ring (warn past 80%, err past 95%), then the estimated cost and time.
const agentStats = (k: Kit, a: AgentRun, at: number): RenderElement => {
  const { Box } = k.ui
  return (
    <Box key={`stats-${a.id}`} flexDirection={dir()} columnGap={2} alignItems="center" flexWrap="wrap">
      {meter(k, `ctx-${a.id}`, tr().context, ctxOf(a), fmtTokens(a.contextTokens))}
      {text(k, costTime(a, at), 'muted')}
    </Box>
  )
}

// One subagent.
const agentRow = (k: Kit, a: AgentRun, at: number, pad = 1): RenderElement => {
  const [word, tone] = stateOf(a.status)
  return listRow(
    k,
    `agent-${a.id}`,
    crabEl(k, costumeOf(a.type), { walking: a.status === 'running' }),
    text(k, a.description || a.type, undefined, { wrap: 'truncate-end' }),
    runMeta(a),
    status(k, word, tone),
    [agentSteps(k, a), agentStats(k, a, at)],
    pad,
  )
}

// A task the flow planned that no run has picked up yet: a dim crab, muted text.
const plannedRow = (k: Kit, pl: Planned, pad = 1): RenderElement =>
  listRow(
    k,
    `plan-${pl.n}`,
    crabEl(k, plannedTier(pl), { dim: true }),
    text(k, `${pl.n}. ${pl.title}`, 'muted', { wrap: 'truncate-end' }),
    plannedMeta(pl),
    status(k, tr().isPlanned, 'muted'),
    [],
    pad,
  )

// A group's title with its count at the right, and a control after it where there is one.
const head = (k: Kit, key: string, title: string, detail: string, end?: RenderElement): RenderElement => {
  const { Box } = k.ui
  return (
    <Box key={key} flexDirection={dir()} columnGap={2} paddingX={1} alignItems="center">
      <Box flexGrow={1} flexShrink={1} flexDirection={dir()}>
        {text(k, title, undefined, { bold: true })}
      </Box>
      {text(k, detail, 'muted')}
      {end ?? null}
    </Box>
  )
}

const listSection = (k: Kit, key: string, heading: RenderElement, rows: RenderElement[]): RenderElement => {
  const { Box } = k.ui
  return (
    <Box key={`sec-${key}`} flexDirection="column">
      {heading}
      {group(k, key, rows)}
    </Box>
  )
}

const compactButton = (k: Kit, isCompact: boolean, onPress: Press): RenderElement => {
  const { Button } = k.ui
  return <Button key="compact" label={isCompact ? tr().expand : tr().collapse} dimColor onPress={onPress} />
}

// The Finished group's head: its count and the button that hides or shows its rows.
const finishedToggle = (k: Kit, isCollapsed: boolean, count: number, onPress: Press): RenderElement => {
  const { Button } = k.ui
  return head(k, 'h-done', tr().finished, String(count), <Button key="done" label={isCollapsed ? tr().show : tr().hide} dimColor onPress={onPress} />)
}

const totalsLine = (k: Kit, t: ReturnType<typeof totals>): RenderElement => text(k, totalsSummary(t), 'muted', { key: 'totals' })

// At the top: the running flow's name and its progress ring, then the totals and Collapse.
const paneHeader = (k: Kit, v: PaneView, compact: RenderElement | null): RenderElement => {
  const { Box } = k.ui
  return (
    <Box key="header" flexDirection="column" paddingX={1}>
      {v.flow ? (
        <Box flexDirection={dir()} columnGap={2} alignItems="center">
          <Box flexGrow={1} flexShrink={1} flexDirection={dir()}>
            {text(k, v.flow.title, undefined, { bold: true, wrap: 'truncate-end' })}
          </Box>
          {progressRing(k, 'flow-ring', ratio(v.flow), label(v.flow))}
        </Box>
      ) : null}
      <Box flexDirection={dir()} columnGap={2} alignItems="center">
        <Box flexGrow={1} flexShrink={1} flexDirection={dir()}>
          {totalsLine(k, v.t)}
        </Box>
        {compact}
      </Box>
    </Box>
  )
}

// One crab slot of the collapsed row, in px.
const SLOT = 30

// The collapsed pane: one crab per agent with its state's dot, planned ones dim, the rest as +N.
const compactRow = (k: Kit, v: PaneView): RenderElement => {
  const { Box, Svg } = k.ui
  const items = [
    ...[...v.running, ...v.finished].map(a => ({ costume: costumeOf(a.type), status: a.status as string, dim: false })),
    ...v.planned.map(p => ({ costume: plannedTier(p), status: 'planned', dim: true })),
  ]
  if (!k.vector) {
    return (
      <Box key="compact-row" flexDirection="row" flexWrap="wrap" columnGap={1}>
        {items.map((it, i) => text(k, STATUS_GLYPH[it.status] ?? '◷', stateOf(it.status)[1], { key: `c-${i}` }))}
      </Box>
    )
  }
  const W = Math.max(120, (k.columns || 40) * 8 - 32)
  const fit = Math.max(1, Math.floor((W - 40) / SLOT))
  const shown = items.slice(0, fit)
  const more = items.length - shown.length
  const w = Math.max(SLOT, shown.length * SLOT)
  const tall = Math.ceil(CRAB_TALL * ROW_CRAB) + 1
  const body = shown
    .map((it, i) => {
      const x = isRtl() ? w - (i + 1) * SLOT : i * SLOT
      return `${crab(x, 0, it.costume, it.dim, it.status === 'running', ROW_CRAB, isRtl())}<circle cx="${x + SLOT - 4}" cy="4" r="3" fill="${hexOf(k.t, stateOf(it.status)[1])}"/>`
    })
    .join('')
  return (
    <Box key="compact-row" flexDirection={dir()} columnGap={1} alignItems="center">
      <Svg source={`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${tall}" viewBox="0 0 ${w} ${tall}">${CRAB_CSS}${body}</svg>`} alt={`${items.length} ${tr().agentsCount}`} width={w} height={tall} />
      {more ? text(k, `+${more}`, 'muted') : null}
    </Box>
  )
}

// The whole agents pane.
const paneTree = (k: Kit, v: PaneView, p: Panel, onCompact: Press, onDone: Press): RenderElement => {
  const s = tr()
  const { Box } = k.ui
  const { running, finished, planned } = v
  // Nothing to fold while the pane is empty: the header carries no Collapse then.
  const parts: (RenderElement | null)[] = [paneHeader(k, v, v.isEmpty ? null : compactButton(k, p.isCompact, onCompact))]

  if (v.isEmpty) {
    parts.push(empty(k, 'empty', s.empty, s.emptyHint))
  } else if (p.isCompact) {
    parts.push(group(k, 'compact', [compactRow(k, v)]))
  } else {
    if (running.length > 0) parts.push(listSection(k, 'running', head(k, 'h-run', s.running, String(running.length)), running.map(a => agentRow(k, a, v.at))))
    if (finished.length > 0) {
      const toggle = finishedToggle(k, p.isDoneCollapsed, finished.length, onDone)
      parts.push(p.isDoneCollapsed ? <Box key="sec-finished" flexDirection="column">{toggle}</Box> : listSection(k, 'finished', toggle, finished.map(a => agentRow(k, a, v.at))))
    }
    if (planned.length > 0) parts.push(listSection(k, 'planned', head(k, 'h-plan', s.planned, String(planned.length)), planned.map(pl => plannedRow(k, pl))))
  }

  return (
    <Box flexDirection="column" rowGap={1}>
      {parts.filter(Boolean)}
    </Box>
  )
}

// Opens the agents pane, or closes it when it is up; true when it ends up open.
async function togglePane($: EngineInterface): Promise<boolean> {
  const isOpen = (await $.ui.panes()).some(p => p.id === PANE)
  if (isOpen) {
    await $.ui.close({ id: PANE })
    return false
  }
  await openPane($)
  return true
}

// Opens the agents pane, or brings it forward from behind another tab, without toggling it.
async function openPane($: EngineInterface): Promise<void> {
  const at = await $.clock.now()
  await update($, now, () => at)
  await $.ui.open({ id: PANE, title: tr().pane })
}

async function autoOpen($: EngineInterface, key: string): Promise<void> {
  const p = await read($, panel)
  if (p.autoOpenedFor === key) return
  await update($, panel, prev => ({ ...prev, autoOpenedFor: key }))
  void $.ui.open({ id: PANE, title: tr().pane })
}

// ---------------------------------------------------------------------------
// Settings. The two userConfig settings live in their config rows and the pane's two view
// choices in the store: both are the user's, shared by every session. The atoms only carry
// them between draws of one session, so they are read again before each /mods panel and
// on a slow clock, and another session's change shows here within seconds.

// The mod's userConfig fields the hub's Settings section changes, each a choice.
const SETTINGS = {
  language: { values: ['auto', 'en', 'ru', 'he'], fallback: 'auto' },
  autoOpen: { values: ['savvy', 'any'], fallback: 'savvy' },
} as const

type Setting = keyof typeof SETTINGS

const isSetting = (id: string): id is Setting => Object.hasOwn(SETTINGS, id)

type ConfigRow = { key: string; value?: unknown }

async function configRows($: EngineInterface): Promise<readonly ConfigRow[]> {
  try {
    return (await $.config.list()) as readonly ConfigRow[]
  } catch {
    // No config menu here: the activation's options stand.
    return []
  }
}

// The setting as stored now, else the options `register` got, else its default.
const settingFrom = (rows: readonly ConfigRow[], options: PluginOptions, id: Setting): string => {
  const { values, fallback } = SETTINGS[id]
  const known = (v: unknown): v is string => typeof v === 'string' && (values as readonly string[]).includes(v)
  const row = rows.find(r => r.key === `savvy-progress.${id}`)
  if (known(row?.value)) return row.value
  return known(options[id]) ? options[id] : fallback
}

const prefsFrom = (rows: readonly ConfigRow[], options: PluginOptions): Prefs => ({
  language: settingFrom(rows, options, 'language'),
  autoOpen: settingFrom(rows, options, 'autoOpen'),
})

// The pane's view choices: the store key, the panel field it mirrors.
const VIEW = {
  compact: 'isCompact',
  hideFinished: 'isDoneCollapsed',
} as const

type ViewChoice = keyof typeof VIEW

const isViewChoice = (id: string): id is ViewChoice => Object.hasOwn(VIEW, id)

async function storedView($: EngineInterface): Promise<Partial<Pick<Panel, 'isCompact' | 'isDoneCollapsed'>>> {
  const out: Partial<Pick<Panel, 'isCompact' | 'isDoneCollapsed'>> = {}
  for (const id of Object.keys(VIEW) as ViewChoice[]) {
    try {
      const value = await $.store.get(id)
      if (typeof value === 'boolean') out[VIEW[id]] = value
    } catch {
      // No store here: the session's own choice stands.
    }
  }
  return out
}

// Writes a view choice to the user's store at once, and to this session's atom.
async function setView($: EngineInterface, id: ViewChoice, on: boolean): Promise<void> {
  await update($, panel, prev => ({ ...prev, [VIEW[id]]: on }))
  try {
    await $.store.set(id, on)
  } catch {
    // No store here: the choice holds for this session.
  }
}

// Reads the user's settings again; an atom changes only when its stored value did.
async function syncSettings($: EngineInterface, options: PluginOptions): Promise<void> {
  const next = prefsFrom(await configRows($), options)
  const was = await read($, prefs)
  if (!was || was.language !== next.language || was.autoOpen !== next.autoOpen) {
    await update($, prefs, () => next)
    if (!was || was.language !== next.language) lang = await detectLang($, next.language)
  }
  const view = await storedView($)
  const p = await read($, panel)
  if ((view.isCompact !== undefined && view.isCompact !== p.isCompact) || (view.isDoneCollapsed !== undefined && view.isDoneCollapsed !== p.isDoneCollapsed)) {
    await update($, panel, prev => ({ ...prev, ...view }))
  }
}

// ---------------------------------------------------------------------------
// The /mods hub's tab (claude-mods-hub PROTOCOL.md): this session's flow and agents, the
// agents themselves as rows, the panel's view choices, and the mod's two settings. It
// speaks the hub's language (English or Portuguese); the rows speak the pane's.

const HUB = {
  en: {
    title: 'Agents',
    overview: 'This session',
    view: 'View',
    panelTitle: 'Agents panel',
    settings: 'Settings',
    nRunning: (n: number) => `${n} running`,
    nDone: (n: number) => `${n} done`,
    nPlanned: (n: number) => `${n} planned`,
    none: 'no agents this session',
    running: 'Running',
    finished: 'Finished',
    failed: (n: number) => `${n} failed`,
    planned: 'Planned',
    flow: 'Flow',
    cost: 'Estimated cost',
    tokens: 'Tokens',
    time: 'Time',
    planning: 'planning',
    design: 'design',
    tasks: 'tasks',
    review: 'review',
    flowDone: 'done',
    busy: 'running',
    more: (n: number) => `${n} more in the agents panel.`,
    open: 'Open panel',
    openHelp: 'Running, finished and planned subagents with model, task progress, context, cost and time.',
    opened: 'Agents panel opened.',
    compact: 'Collapsed view',
    compactHelp: 'The panel shows one row of crabs and the totals instead of the full list.',
    hideFinished: 'Hide finished agents',
    hideFinishedHelp: 'Folds the Finished group away; running and planned agents stay listed.',
    on: 'on',
    off: 'off',
    language: 'Panel language',
    languageHelp: "For the agents panel and the progress bar. Auto follows Claude Code's language, then the system locale.",
    autoOpen: 'Open the panel by itself',
    autoOpenHelp: 'When a savvy-flow worker starts or a plan is reported; with any subagent, also once per session when another one starts.',
    auto: 'Auto',
    savvy: 'savvy-flow',
    any: 'Any subagent',
    set: (label: string, value: string) => `${label}: ${value}.`,
    badValue: (value: string) => `Not an option: ${value}`,
    unknown: (id: string) => `Unknown action: ${id}`,
  },
  pt: {
    title: 'Agentes',
    overview: 'Esta sessão',
    view: 'Exibição',
    panelTitle: 'Painel de agentes',
    settings: 'Ajustes',
    nRunning: (n: number) => `${n} em execução`,
    nDone: (n: number) => `${n} ${n === 1 ? 'concluído' : 'concluídos'}`,
    nPlanned: (n: number) => `${n} ${n === 1 ? 'planejado' : 'planejados'}`,
    none: 'nenhum agente nesta sessão',
    running: 'Em execução',
    finished: 'Concluídos',
    failed: (n: number) => `${n} com erro`,
    planned: 'Planejados',
    flow: 'Fluxo',
    cost: 'Custo estimado',
    tokens: 'Tokens',
    time: 'Tempo',
    planning: 'planejando',
    design: 'design',
    tasks: 'tarefas',
    review: 'revisão',
    flowDone: 'concluído',
    busy: 'em execução',
    more: (n: number) => `Mais ${n} no painel de agentes.`,
    open: 'Abrir painel',
    openHelp: 'Subagentes em execução, concluídos e planejados, com modelo, progresso da tarefa, contexto, custo e tempo.',
    opened: 'Painel de agentes aberto.',
    compact: 'Visão recolhida',
    compactHelp: 'O painel mostra uma linha de caranguejos e os totais em vez da lista completa.',
    hideFinished: 'Ocultar agentes concluídos',
    hideFinishedHelp: 'Recolhe o grupo de concluídos; os agentes em execução e planejados continuam na lista.',
    on: 'ligado',
    off: 'desligado',
    language: 'Idioma do painel',
    languageHelp: 'Para o painel de agentes e a barra de progresso. Automático segue o idioma do Claude Code e depois o do sistema.',
    autoOpen: 'Abrir o painel sozinho',
    autoOpenHelp: 'Quando um worker do savvy-flow começa ou um plano é informado; com qualquer subagente, também uma vez por sessão quando outro começa.',
    auto: 'Automático',
    savvy: 'savvy-flow',
    any: 'Qualquer subagente',
    set: (label: string, value: string) => `${label}: ${value}.`,
    badValue: (value: string) => `Opção inválida: ${value}`,
    unknown: (id: string) => `Ação desconhecida: ${id}`,
  },
} as const

type Hub = (typeof HUB)[SavvyLang]

// A language the hub asks for that the mod does not speak is answered in English.
const hubOf = (l: unknown): Hub => (l === 'pt' ? HUB.pt : HUB.en)

// `act` carries no language: its message speaks the one the hub's last `panel` asked for.
// Module scope is fine: the hub asks for a panel before it shows a button to press.
let hubLang: SavvyLang = 'en'

const settingLabel = (h: Hub, id: Setting | ViewChoice): string => ({ language: h.language, autoOpen: h.autoOpen, compact: h.compact, hideFinished: h.hideFinished })[id]

const optionLabel = (h: Hub, value: string): string =>
  ({ auto: h.auto, en: 'English', ru: 'Русский', he: 'עברית', savvy: h.savvy, any: h.any })[value] ?? value

// "tasks 1/4 · 25%", in the hub's language.
const flowProgress = (h: Hub, f: Flow): string => {
  if (f.isFinished) return h.flowDone
  if (f.phase === 'plan') return h.planning
  if (f.phase === 'design') return h.design
  const word = f.phase === 'review' ? h.review : h.tasks
  return f.total ? `${word} ${f.done}/${f.total} · ${Math.round(ratio(f) * 100)}%` : `${word}: ${f.running} ${h.busy}`
}

// "2/6", "review 5/6", "planning": the flow's short state for the summary line.
const flowShort = (h: Hub, f: Flow): string => {
  if (f.isFinished) return h.flowDone
  if (f.phase === 'plan') return h.planning
  if (f.phase === 'design') return h.design
  if (!f.total) return ''
  return f.phase === 'review' ? `${h.review} ${f.done}/${f.total}` : `${f.done}/${f.total}`
}

// The finished agents the tab lists as rows; the panel lists them all.
const HUB_FINISHED = 8

async function panelOf($: EngineInterface, args: SavvyPanelArgs, options: PluginOptions): Promise<SavvyPanel> {
  hubLang = args.lang === 'pt' ? 'pt' : 'en'
  const h = hubOf(hubLang)
  await syncSettings($, options)
  const pr = (await read($, prefs)) ?? prefsFrom([], options)
  const view = await read($, panel)
  const list = await read($, agents)
  const f = await read($, flow)
  const at = Math.max(await $.clock.now(), ...list.map(a => a.startedAt), 0)
  const v = paneView(list, f, at)
  const running = v.running.length
  const finished = v.finished.length
  const failed = list.filter(a => a.status === 'failed').length
  const planned = v.planned.length
  const isFlowLive = f !== null && !f.isFinished

  // One short line under the mod's name: the flow's count and what runs; the ring beside it
  // carries the percent.
  const count = running ? h.nRunning(running) : planned ? h.nPlanned(planned) : finished ? h.nDone(finished) : ''
  const summary = [isFlowLive ? flowShort(h, f) : '', count].filter(Boolean).join(' · ') || h.none

  const overview: SavvyItem[] = []
  if (f !== null) overview.push({ kind: 'info', label: h.flow, value: `${f.title}: ${flowProgress(h, f)}`, tone: f.isFinished ? 'ok' : 'accent' })
  overview.push(
    { kind: 'info', label: h.running, value: String(running), tone: running ? 'accent' : 'muted' },
    {
      kind: 'info',
      label: h.finished,
      value: failed ? `${finished} (${h.failed(failed)})` : String(finished),
      ...(failed ? { tone: 'warn' as const } : finished ? {} : { tone: 'muted' as const }),
    },
    { kind: 'info', label: h.planned, value: String(planned), ...(planned ? {} : { tone: 'muted' as const }) },
  )
  if (list.length) {
    overview.push(
      { kind: 'info', label: h.cost, value: `≈${fmtCost(v.t.cost)}` },
      { kind: 'info', label: h.tokens, value: fmtTokens(v.t.tokens) },
      { kind: 'info', label: h.time, value: fmtTime(v.t.time) },
    )
  }

  // The agents themselves, as the pane draws them: plain data, one row per item.
  const k = kitOf($.ui.resolve({ surface: args.surface, component: 'Pane' }) as unknown as KitUi, toneOf(await skinOf($)), args.surface, Math.max(24, args.columns - 4))
  const tree = (el: RenderElement): SavvyItem => ({ kind: 'tree', tree: staticTree(el, k.t) })
  const lists: SavvySection[] = []
  if (running) lists.push({ id: 'running', title: `${h.running} · ${running}`, items: v.running.map(a => tree(agentRow(k, a, at, 0))) })
  if (finished) {
    const items = v.finished.slice(0, HUB_FINISHED).map(a => tree(agentRow(k, a, at, 0)))
    if (finished > HUB_FINISHED) items.push({ kind: 'text', text: h.more(finished - HUB_FINISHED) })
    lists.push({ id: 'finished', title: `${h.finished} · ${finished}`, items })
  }
  if (planned) lists.push({ id: 'planned', title: `${h.planned} · ${planned}`, items: v.planned.map(pl => tree(plannedRow(k, pl, 0))) })

  // The group's main action goes last.
  const viewItems: SavvyItem[] = [
    { kind: 'toggle', id: 'compact', label: h.compact, help: h.compactHelp, value: view.isCompact, scope: 'user' },
    { kind: 'toggle', id: 'hideFinished', label: h.hideFinished, help: h.hideFinishedHelp, value: view.isDoneCollapsed, scope: 'user' },
    { kind: 'action', id: 'open', title: h.panelTitle, label: h.open, help: h.openHelp, primary: true, scope: 'session' },
  ]

  const settings: SavvyItem[] = (Object.keys(SETTINGS) as Setting[]).map(id => ({
    kind: 'choice',
    id,
    label: settingLabel(h, id),
    help: id === 'language' ? h.languageHelp : h.autoOpenHelp,
    value: pr[id],
    options: SETTINGS[id].values.map(value => ({ value, label: optionLabel(h, value) })),
    scope: 'user',
  }))

  return {
    title: h.title,
    summary,
    ...(f !== null ? { percent: Math.round(ratio(f) * 100) } : {}),
    ...(running ? { tone: 'accent' as const } : failed ? { tone: 'warn' as const } : {}),
    sections: [
      { id: 'overview', title: h.overview, items: overview },
      ...lists,
      { id: 'view', title: h.view, items: viewItems },
      { id: 'settings', title: h.settings, items: settings },
    ],
    // The counts and clocks move while agents run: the hub draws the tab again.
    ...(running ? { refreshMs: 5000 } : {}),
  }
}

async function actOn($: EngineInterface, args: SavvyActArgs): Promise<SavvyActResult> {
  const h = hubOf(hubLang)
  if (args.id === 'open') {
    await openPane($)
    return { message: h.opened }
  }
  if (isViewChoice(args.id)) {
    if (args.value !== 'on' && args.value !== 'off') return { message: h.badValue(args.value ?? '') }
    await setView($, args.id, args.value === 'on')
    return { message: h.set(settingLabel(h, args.id), args.value === 'on' ? h.on : h.off) }
  }
  if (!isSetting(args.id)) return { message: h.unknown(args.id) }
  const value = args.value ?? ''
  if (!(SETTINGS[args.id].values as readonly string[]).includes(value)) return { message: h.badValue(value) }
  const written = await $.config.set({ key: `savvy-progress.${args.id}`, value })
  if (written.deny !== undefined) return { message: written.deny }
  // The pane and the band follow at once; the reload the change brings reads it again.
  const id = args.id
  await update($, prefs, prev => ({ ...(prev ?? { language: 'auto', autoOpen: 'savvy' }), [id]: value }))
  if (id === 'language') lang = await detectLang($, value)
  return { message: h.set(settingLabel(h, id), optionLabel(h, value)) }
}

// ---------------------------------------------------------------------------
// The /mods hub's component catalog (claude-mods-hub PROTOCOL.md, "The catalog"):
// every component the band and the pane draw, named, each in a state worth seeing,
// drawn with the builders above from sample values. Names and help speak the hub's
// language; the drawings speak the pane's, as they do in place.

const noop = (): void => {}

const SAMPLE_AT = Date.UTC(2026, 9, 13, 12, 0, 0)

const sampleRun = (over: Partial<AgentRun> & Pick<AgentRun, 'id' | 'type' | 'description' | 'status'>): AgentRun => ({
  model: 'claude-opus-5-5',
  effort: 'high',
  startedAt: SAMPLE_AT - 135_000,
  contextTokens: 182_000,
  contextMax: 1_000_000,
  tokens: 1_240_000,
  costUsd: 1.18,
  steps: 14,
  round: 1,
  ...over,
})

const SAMPLE = {
  steps: sampleRun({ id: 's-steps', type: 'savvy-careful', description: 'Write the parser', status: 'running', stepDone: 3, stepTotal: 5, stepNote: 'covering edge cases' }),
  context: sampleRun({ id: 's-ctx', type: 'savvy-light', description: 'Wire the CLI flags', status: 'running', effort: 'low', startedAt: SAMPLE_AT - 48_000, contextTokens: 96_000, tokens: 310_000, costUsd: 0.21, steps: 5 }),
  done: sampleRun({ id: 's-done', type: 'savvy-heavy', description: 'Audit the auth flow', status: 'done', effort: 'xhigh', startedAt: SAMPLE_AT - 420_000, endedAt: SAMPLE_AT - 60_000, contextTokens: 412_000, tokens: 3_900_000, costUsd: 4.62, steps: 31, stepDone: 6, stepTotal: 6 }),
  failed: sampleRun({ id: 's-failed', type: 'savvy-medium', description: 'Migrate the config', status: 'failed', effort: 'medium', startedAt: SAMPLE_AT - 300_000, endedAt: SAMPLE_AT - 200_000, contextTokens: 128_000, tokens: 820_000, costUsd: 0.74, steps: 9, stepDone: 2, stepTotal: 4 }),
  retry: sampleRun({ id: 's-retry', type: 'savvy-medium', description: 'Migrate the config', status: 'running', effort: 'medium', round: 2, startedAt: SAMPLE_AT - 70_000, contextTokens: 64_000, tokens: 260_000, costUsd: 0.22, steps: 4, stepDone: 1, stepTotal: 4, stepNote: 'reading the old schema' }),
  other: sampleRun({ id: 's-other', type: 'general-purpose', description: 'Search the docs', status: 'done', model: 'claude-sonnet-5-5', effort: undefined, startedAt: SAMPLE_AT - 240_000, endedAt: SAMPLE_AT - 180_000, contextTokens: 54_000, tokens: 210_000, costUsd: 0.09, steps: 6 }),
}

// Spawned in this order: the pane lists the newest first.
const SAMPLE_LIST: AgentRun[] = [SAMPLE.done, SAMPLE.failed, SAMPLE.other, SAMPLE.steps, SAMPLE.context]

const SAMPLE_TASKS: PlannedTask[] = [
  { title: 'Write the parser', tier: 'careful', after: [] },
  { title: 'Wire the CLI flags', tier: 'light', after: [] },
  { title: 'Audit the auth flow', tier: 'heavy', after: [] },
  { title: 'Migrate the config', tier: 'medium', after: [] },
  { title: 'Design the data model', tier: 'fable', after: [] },
  { title: 'Write the README', tier: 'light', after: [1, 2] },
]

const sampleFlow = (over: Partial<Flow>): Flow => ({ ...blank(), title: 'Ship the component catalog', tasks: SAMPLE_TASKS, ...over })

const FLOWS = {
  planning: sampleFlow({ phase: 'plan', tasks: [] }),
  design: sampleFlow({ phase: 'design', tasks: [] }),
  midFlow: sampleFlow({ phase: 'delegate', total: 6, done: 2, running: 2 }),
  unplanned: sampleFlow({ phase: 'delegate', running: 2, tasks: [] }),
  review: sampleFlow({ phase: 'review', total: 6, done: 5 }),
  done: sampleFlow({ phase: 'close', total: 6, done: 6, isFinished: true }),
}

const OPEN_PANEL: Panel = { isCompact: false, isDoneCollapsed: false, autoOpenedFor: '' }

const COSTUMES_SHOWN = ['fable', 'heavy', 'careful', 'medium', 'light', 'explore', 'other'] as const

// Draws with another pane language for a moment: the builders read the module's
// `lang`, and drawing is synchronous, so nothing else sees the swap.
const inLang = <T,>(l: Lang, draw: () => T): T => {
  const was = lang
  lang = l
  try {
    return draw()
  } finally {
    lang = was
  }
}


type Words = { name: string; help: string }

const CATALOG: Record<SavvyLang, Record<string, Words>> = {
  en: {
    'band-planning': { name: 'Progress band, planning', help: 'The row above the prompt as a flow starts: an empty ring at 0%, the title, an empty track and Plan.' },
    'band-design': { name: 'Progress band, design', help: 'The band while the flow is in its design phase.' },
    'band-mid-flow': { name: 'Progress band, mid-flow', help: 'Tasks accepted out of planned: the ring’s percent, accepted segments in the accent, segments handed to running workers faint, and the crab walks.' },
    'band-unplanned': { name: 'Progress band, workers without a plan', help: 'Workers started before any plan was reported: the count of running ones instead of a fraction.' },
    'band-review': { name: 'Progress band, review', help: 'The band while the orchestrator reviews the workers’ results.' },
    'band-done': { name: 'Progress band, done', help: 'A finished flow: a full ring, a full track and Done, all in the ok colour; it stays until dismissed.' },
    'band-hebrew': { name: 'Progress band, Hebrew', help: 'The band with the Hebrew pane language: mirrored, the ring and title on the right, the buttons on the left.' },
    'band-russian': { name: 'Progress band, Russian', help: 'The band with the Russian pane language.' },
    'band-narrow': { name: 'Progress band, narrow', help: 'A band too narrow for the track: the ring, the title and the state still show.' },
    'band-track': { name: 'Task track', help: 'In the band: one segment per planned task, accepted, handed to a worker or still to do; many tasks run together into one bar.' },
    'band-crab': { name: 'Band crab', help: 'The crab beside the band’s state; it walks while any agent runs (a muted glyph in the terminal).' },
    'crew-button': { name: 'Agents button', help: 'Beside the band: how many agents and planned tasks; a press opens or closes the agents pane.' },
    'dismiss-button': { name: 'Dismiss button', help: 'At the band’s end: forgets the flow and takes the band down; the desktop draws its native close control.' },
    'pane-full': { name: 'Agents pane', help: 'The whole pane: the flow and totals over the Running, Finished and Planned groups.' },
    'pane-empty': { name: 'Agents pane, empty', help: 'The pane before any subagent has started or been planned.' },
    'pane-compact': { name: 'Agents pane, collapsed', help: 'The collapsed view: one crab per agent with its state’s dot (a glyph in text), under the totals.' },
    'pane-compact-overflow': { name: 'Agents pane, collapsed with overflow', help: 'More agents than the collapsed row fits: the rest count as +N.' },
    'pane-finished-hidden': { name: 'Agents pane, finished hidden', help: 'The pane with the Finished group folded away to its head.' },
    'pane-hebrew': { name: 'Agents pane, Hebrew', help: 'The pane with the Hebrew pane language: every row mirrored, crab and name on the right.' },
    'pane-header': { name: 'Pane header', help: 'At the top of the pane: the running flow’s name and progress ring, then the totals and Collapse.' },
    'pane-totals': { name: 'Totals', help: 'Estimated cost, tokens and time across every subagent of the session.' },
    'flow-ring': { name: 'Flow progress ring', help: 'In the pane header: the share of tasks accepted, with the phase and count.' },
    'collapse-button': { name: 'Collapse button', help: 'Folds the pane down to one row of crabs; every session follows.' },
    'expand-button': { name: 'Expand button', help: 'Unfolds the collapsed pane back to its groups.' },
    'finished-toggle-open': { name: 'Finished head, shown', help: 'The head of the Finished group, with its count; Hide folds the group away.' },
    'finished-toggle-closed': { name: 'Finished head, hidden', help: 'The same head while the group is folded; Show brings it back.' },
    'section-running': { name: 'Running heading', help: 'The heading over the running agents, with their count.' },
    'section-planned': { name: 'Planned heading', help: 'The heading over the planned tasks, with their count.' },
    'agent-row-running': { name: 'Agent row, running', help: 'A worker that reports its steps: its crab walks, a steps ring and note, the context ring, cost and time, and running.' },
    'agent-row-running-no-steps': { name: 'Agent row, running without steps', help: 'A worker that reports no steps: only the context ring, cost and time under its name.' },
    'agent-row-finished': { name: 'Agent row, finished', help: 'A run that answered: a full steps ring and finished, in the ok colour.' },
    'agent-row-failed': { name: 'Agent row, failed', help: 'A run that ended without an answer: error, in the err colour.' },
    'agent-row-retry': { name: 'Agent row, second round', help: 'A task delegated again: its round shows in the meta line.' },
    'agent-row-other': { name: 'Agent row, other subagent', help: 'A subagent outside savvy-flow: its own type in the meta line and the plain crab.' },
    'planned-row': { name: 'Planned task row', help: 'A task the plan lists that no worker has picked up: a dim crab, muted text, the tier’s model.' },
    'planned-row-waiting': { name: 'Planned task row, waiting', help: 'A planned task that waits for others: after 1, 2.' },
    'model-badge': { name: 'Meta line', help: 'Under each name: the tier (or the subagent’s type), the model and effort, and the round.' },
    'task-progress': { name: 'Task progress', help: 'Under each name: the worker’s reported steps as a ring, with the step count and note.' },
    'agent-stats': { name: 'Context, cost and time', help: 'Under each name: the context ring with the context size, then estimated cost and elapsed time.' },
    'context-ring-high': { name: 'Context ring, nearly full', help: 'The context ring past 80%, in the warn colour; past 95% it turns err.' },
    'status-marks': { name: 'States', help: 'At the end of each row: running, finished, error, planned, each a dot and a word.' },
    'crab-fable': { name: 'Crab, fable tier', help: 'The astronaut in a glass dome: floats, antenna and star blink.' },
    'crab-heavy': { name: 'Crab, heavy tier', help: 'The detective in a deerstalker: the magnifier sweeps and glints.' },
    'crab-careful': { name: 'Crab, careful tier', help: 'The engineer in a hard hat: the wrench turns a bolt.' },
    'crab-medium': { name: 'Crab, medium tier', help: 'The chef in a toque: tosses the omelette.' },
    'crab-light': { name: 'Crab, light tier', help: 'The racer in a helmet: runs at double pace, the flag flutters.' },
    'crab-explore': { name: 'Crab, Explore agent', help: 'The pirate scouting the code: the cutlass fences.' },
    'crab-other': { name: 'Crab, other subagent', help: 'The plain crab, for any subagent outside the savvy tiers.' },
  },
  pt: {
    'band-planning': { name: 'Barra de progresso, planejando', help: 'A linha acima do prompt quando um fluxo começa: anel vazio em 0%, o título, a trilha vazia e Plan.' },
    'band-design': { name: 'Barra de progresso, design', help: 'A barra enquanto o fluxo está na fase de design.' },
    'band-mid-flow': { name: 'Barra de progresso, no meio do fluxo', help: 'Tarefas aceitas sobre as planejadas: o percentual no anel, segmentos aceitos na cor de destaque, os entregues a workers em execução mais claros, e o caranguejo anda.' },
    'band-unplanned': { name: 'Barra de progresso, workers sem plano', help: 'Workers iniciados antes de um plano ser informado: a contagem dos que rodam em vez de uma fração.' },
    'band-review': { name: 'Barra de progresso, revisão', help: 'A barra enquanto o orquestrador revisa o resultado dos workers.' },
    'band-done': { name: 'Barra de progresso, concluída', help: 'Um fluxo encerrado: anel cheio, trilha cheia e Done, tudo na cor de sucesso; fica até ser dispensada.' },
    'band-hebrew': { name: 'Barra de progresso, hebraico', help: 'A barra com o painel em hebraico: espelhada, anel e título à direita, botões à esquerda.' },
    'band-russian': { name: 'Barra de progresso, russo', help: 'A barra com o painel em russo.' },
    'band-narrow': { name: 'Barra de progresso, estreita', help: 'Uma barra estreita demais para a trilha: o anel, o título e o estado continuam visíveis.' },
    'band-track': { name: 'Trilha de tarefas', help: 'Na barra: um segmento por tarefa planejada, aceita, entregue a um worker ou pendente; muitas tarefas viram uma barra contínua.' },
    'band-crab': { name: 'Caranguejo da barra', help: 'O caranguejo ao lado do estado da barra; anda enquanto algum agente roda (um glifo discreto no terminal).' },
    'crew-button': { name: 'Botão de agentes', help: 'Ao lado da barra: quantos agentes e tarefas planejadas; abre ou fecha o painel de agentes.' },
    'dismiss-button': { name: 'Botão de dispensar', help: 'No fim da barra: esquece o fluxo e tira a barra; o desktop desenha seu controle nativo de fechar.' },
    'pane-full': { name: 'Painel de agentes', help: 'O painel inteiro: fluxo e totais sobre os grupos Em execução, Concluídos e Planejados.' },
    'pane-empty': { name: 'Painel de agentes, vazio', help: 'O painel antes de qualquer subagente começar ou ser planejado.' },
    'pane-compact': { name: 'Painel de agentes, recolhido', help: 'A visão recolhida: um caranguejo por agente com o ponto do seu estado (um glifo no texto), sob os totais.' },
    'pane-compact-overflow': { name: 'Painel de agentes, recolhido com excesso', help: 'Mais agentes do que cabem na linha recolhida: o resto conta como +N.' },
    'pane-finished-hidden': { name: 'Painel de agentes, concluídos ocultos', help: 'O painel com o grupo de concluídos recolhido ao seu título.' },
    'pane-hebrew': { name: 'Painel de agentes, hebraico', help: 'O painel em hebraico: cada linha espelhada, caranguejo e nome à direita.' },
    'pane-header': { name: 'Cabeçalho do painel', help: 'No topo do painel: o nome e o anel de progresso do fluxo em execução, depois os totais e Collapse.' },
    'pane-totals': { name: 'Totais', help: 'Custo estimado, tokens e tempo de todos os subagentes da sessão.' },
    'flow-ring': { name: 'Anel de progresso do fluxo', help: 'No cabeçalho do painel: a parcela de tarefas aceitas, com a fase e a contagem.' },
    'collapse-button': { name: 'Botão de recolher', help: 'Recolhe o painel numa linha de caranguejos; todas as sessões seguem.' },
    'expand-button': { name: 'Botão de expandir', help: 'Abre de novo os grupos do painel recolhido.' },
    'finished-toggle-open': { name: 'Título de concluídos, visível', help: 'O título do grupo de concluídos, com a contagem; Hide recolhe o grupo.' },
    'finished-toggle-closed': { name: 'Título de concluídos, oculto', help: 'O mesmo título com o grupo recolhido; Show traz o grupo de volta.' },
    'section-running': { name: 'Título Em execução', help: 'O título sobre os agentes em execução, com a contagem.' },
    'section-planned': { name: 'Título Planejados', help: 'O título sobre as tarefas planejadas, com a contagem.' },
    'agent-row-running': { name: 'Linha de agente, em execução', help: 'Um worker que informa seus passos: o caranguejo anda, anel de passos e nota, anel de contexto, custo e tempo, e running.' },
    'agent-row-running-no-steps': { name: 'Linha de agente, em execução sem passos', help: 'Um worker que não informa passos: só o anel de contexto, custo e tempo sob o nome.' },
    'agent-row-finished': { name: 'Linha de agente, concluída', help: 'Uma execução que respondeu: anel de passos cheio e finished, na cor de sucesso.' },
    'agent-row-failed': { name: 'Linha de agente, com erro', help: 'Uma execução que terminou sem resposta: error, na cor de erro.' },
    'agent-row-retry': { name: 'Linha de agente, segunda rodada', help: 'Uma tarefa delegada de novo: a rodada aparece na linha de detalhes.' },
    'agent-row-other': { name: 'Linha de agente, outro subagente', help: 'Um subagente fora do savvy-flow: o próprio tipo na linha de detalhes e o caranguejo simples.' },
    'planned-row': { name: 'Linha de tarefa planejada', help: 'Uma tarefa do plano que nenhum worker pegou: caranguejo esmaecido, texto discreto, o modelo do tier.' },
    'planned-row-waiting': { name: 'Linha de tarefa planejada, aguardando', help: 'Uma tarefa planejada que espera outras: after 1, 2.' },
    'model-badge': { name: 'Linha de detalhes', help: 'Sob cada nome: o tier (ou o tipo do subagente), modelo e esforço, e a rodada.' },
    'task-progress': { name: 'Progresso da tarefa', help: 'Sob cada nome: os passos que o worker informou como anel, com a contagem e a nota.' },
    'agent-stats': { name: 'Contexto, custo e tempo', help: 'Sob cada nome: o anel de contexto com o tamanho do contexto, depois custo estimado e tempo decorrido.' },
    'context-ring-high': { name: 'Anel de contexto, quase cheio', help: 'O anel de contexto acima de 80%, na cor de alerta; acima de 95% fica na cor de erro.' },
    'status-marks': { name: 'Estados', help: 'No fim de cada linha: running, finished, error, planned, cada um com ponto e palavra.' },
    'crab-fable': { name: 'Caranguejo, tier fable', help: 'O astronauta no capacete de vidro: flutua, antena e estrela piscam.' },
    'crab-heavy': { name: 'Caranguejo, tier heavy', help: 'O detetive de chapéu: a lupa varre e brilha.' },
    'crab-careful': { name: 'Caranguejo, tier careful', help: 'O engenheiro de capacete: a chave gira um parafuso.' },
    'crab-medium': { name: 'Caranguejo, tier medium', help: 'O chef de toque: joga a omelete.' },
    'crab-light': { name: 'Caranguejo, tier light', help: 'O piloto de capacete: corre no dobro do ritmo, a bandeira tremula.' },
    'crab-explore': { name: 'Caranguejo, agente Explore', help: 'O pirata explorando o código: o sabre esgrima.' },
    'crab-other': { name: 'Caranguejo, outro subagente', help: 'O caranguejo simples, para qualquer subagente fora dos tiers do savvy.' },
  },
}

// The crab with its tier word and model, as a row's lead would show it.
const crabSample = (k: Kit, costume: string): RenderElement => {
  const { Box } = k.ui
  const tier = costume === 'explore' ? 'other' : costume
  const word = costume === 'explore' ? 'Explore' : tierWord(tier)
  const model = tierModel(tier)
  return (
    <Box flexDirection={dir()} columnGap={1} alignItems="center" paddingX={1}>
      {crabEl(k, costume, { walking: true })}
      {text(k, word)}
      {model ? text(k, model, 'muted') : null}
    </Box>
  )
}

// The four states a row ends with.
const statusMarksSample = (k: Kit): RenderElement => {
  const { Box } = k.ui
  return (
    <Box flexDirection={dir()} columnGap={3} paddingX={1} flexWrap="wrap">
      {(['running', 'done', 'failed', 'planned'] as const).map(st => {
        const [word, tone] = stateOf(st)
        return (
          <Box key={`mark-${st}`} flexDirection="row">
            {status(k, word, tone)}
          </Box>
        )
      })}
    </Box>
  )
}

const padded = (k: Kit, children: (RenderElement | null)[]): RenderElement => {
  const { Box } = k.ui
  return (
    <Box flexDirection="column" paddingX={1} alignItems={along()}>
      {children.filter(Boolean)}
    </Box>
  )
}

async function catalogOf($: EngineInterface, args: SavvyPanelArgs): Promise<SavvyCatalogEntry[]> {
  const words = CATALOG[args.lang === 'pt' ? 'pt' : 'en']
  const columns = Math.max(24, (args.columns || 80) - 4)
  const tone = toneOf(await skinOf($))
  const bk = kitOf($.ui.resolve({ surface: args.surface, component: 'AbovePrompt' }) as unknown as KitUi, tone, args.surface, columns)
  const k = kitOf($.ui.resolve({ surface: args.surface, component: 'Pane' }) as unknown as KitUi, tone, args.surface, columns)
  const { Svg } = k.ui
  const at = SAMPLE_AT
  const full = paneView(SAMPLE_LIST, FLOWS.midFlow, at)

  const band = (f: Flow, crew: number, isWorking: boolean, kit: Kit = bk) => bandTree(kit, { f, crew, isWorking, onCrew: noop, onDismiss: noop })

  // Enough agents to run past what the collapsed desktop row fits.
  const many = Array.from({ length: Math.max(1, Math.floor((columns * 8 - 72) / SLOT)) + 4 }, (_, i) => {
    const kinds = [SAMPLE.steps, SAMPLE.context, SAMPLE.done, SAMPLE.failed, SAMPLE.other] as const
    const base = kinds[i % kinds.length] ?? SAMPLE.done
    return { ...base, id: `many-${i}` }
  })

  const trackW = Math.max(120, Math.min(480, columns * 8 - 32))

  const draws: [id: string, draw: () => RenderElement][] = [
    ['band-planning', () => band(FLOWS.planning, 0, false)],
    ['band-design', () => band(FLOWS.design, 0, false)],
    ['band-mid-flow', () => band(FLOWS.midFlow, 7, true)],
    ['band-unplanned', () => band(FLOWS.unplanned, 2, true)],
    ['band-review', () => band(FLOWS.review, 6, false)],
    ['band-done', () => band(FLOWS.done, 6, false)],
    ['band-hebrew', () => inLang('he', () => band(FLOWS.midFlow, 7, true))],
    ['band-russian', () => inLang('ru', () => band(FLOWS.midFlow, 7, true))],
    ['band-narrow', () => band(FLOWS.midFlow, 7, true, kitOf(bk.ui, tone, args.surface, 56))],
    [
      'band-track',
      () =>
        bk.vector ? (
          <Svg source={trackSvg(bk, FLOWS.midFlow, trackW)} alt={label(FLOWS.midFlow)} width={trackW} height={TRACK_H} />
        ) : (
          text(bk, barText(FLOWS.midFlow, 24), 'accent')
        ),
    ],
    ['band-crab', () => crabEl(bk, 'other', { scale: BAND_CRAB, walking: true })],
    ['crew-button', () => crewButton(bk, 7, noop)],
    ['dismiss-button', () => dismissButton(bk, noop)],

    ['pane-full', () => paneTree(k, full, OPEN_PANEL, noop, noop)],
    ['pane-empty', () => paneTree(k, paneView([], null, at), OPEN_PANEL, noop, noop)],
    ['pane-compact', () => paneTree(k, full, { ...OPEN_PANEL, isCompact: true }, noop, noop)],
    ['pane-compact-overflow', () => paneTree(k, paneView(many, null, at), { ...OPEN_PANEL, isCompact: true }, noop, noop)],
    ['pane-finished-hidden', () => paneTree(k, full, { ...OPEN_PANEL, isDoneCollapsed: true }, noop, noop)],
    ['pane-hebrew', () => inLang('he', () => paneTree(k, full, OPEN_PANEL, noop, noop))],
    ['pane-header', () => paneHeader(k, full, compactButton(k, false, noop))],
    ['pane-totals', () => padded(k, [totalsLine(k, full.t)])],
    ['flow-ring', () => padded(k, [progressRing(k, 'flow-ring', ratio(FLOWS.midFlow), label(FLOWS.midFlow))])],
    ['collapse-button', () => compactButton(k, false, noop)],
    ['expand-button', () => compactButton(k, true, noop)],
    ['finished-toggle-open', () => finishedToggle(k, false, full.finished.length, noop)],
    ['finished-toggle-closed', () => finishedToggle(k, true, full.finished.length, noop)],
    ['section-running', () => head(k, 'h-run', tr().running, String(full.running.length))],
    ['section-planned', () => head(k, 'h-plan', tr().planned, String(full.planned.length))],

    ['agent-row-running', () => agentRow(k, SAMPLE.steps, at)],
    ['agent-row-running-no-steps', () => agentRow(k, SAMPLE.context, at)],
    ['agent-row-finished', () => agentRow(k, SAMPLE.done, at)],
    ['agent-row-failed', () => agentRow(k, SAMPLE.failed, at)],
    ['agent-row-retry', () => agentRow(k, SAMPLE.retry, at)],
    ['agent-row-other', () => agentRow(k, SAMPLE.other, at)],
    ['planned-row', () => plannedRow(k, { title: 'Design the data model', tier: 'fable', after: [], n: 5 })],
    ['planned-row-waiting', () => plannedRow(k, { title: 'Write the README', tier: 'light', after: [1, 2], n: 6 })],
    ['model-badge', () => padded(k, [text(k, runMeta(SAMPLE.steps), 'muted')])],
    ['task-progress', () => padded(k, [agentSteps(k, SAMPLE.steps)])],
    ['agent-stats', () => padded(k, [agentStats(k, SAMPLE.steps, at)])],
    ['context-ring-high', () => padded(k, [meter(k, 'ctx-high', tr().context, 86, fmtTokens(860_000))])],
    ['status-marks', () => statusMarksSample(k)],
    ...COSTUMES_SHOWN.map((c): [string, () => RenderElement] => [`crab-${c}`, () => crabSample(k, c)]),
  ]

  return draws.map(([id, draw]) => {
    const w = words[id] ?? { name: id, help: '' }
    return { id, name: w.name, help: w.help, tree: staticTree(draw(), tone) }
  })
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    // The user's settings and the pane's view choices, as stored; sets the pane language.
    await syncSettings($, options)
    await $.tool.register({
      name: 'progress',
      description:
        'Report /savvy-flow progress to the progress bar above the prompt and the agents panel. ' +
        'Call it after presenting the plan (title, total, tasks, phase "delegate"), each time a task is accepted (done), ' +
        'when switching phase or re-planning (tasks), and once at the end with finished: true. Fields left out keep their previous value. ' +
        'For the main session only: a call from a subagent is ignored (workers report with `step`).',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short name of the overall task, a few words.' },
          total: { type: 'integer', minimum: 0, description: 'Number of planned worker tasks.' },
          done: { type: 'integer', minimum: 0, description: 'Number of tasks accepted after review.' },
          phase: { type: 'string', enum: [...PHASES] },
          finished: { type: 'boolean', description: 'True once the flow is closed.' },
          tasks: {
            type: 'array',
            description:
              'The planned worker tasks in order, numbered from 1. Each title must equal the Agent tool `description` the task will be delegated with, so the panel can match runs to tasks.',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'A few words; reused verbatim as the Agent description.' },
                tier: { type: 'string', enum: [...TIERS] },
                after: { type: 'array', items: { type: 'integer' }, description: 'Numbers of the tasks this one waits for.' },
              },
              required: ['title', 'tier'],
            },
          },
        },
      },
    })
    await $.tool.register({
      name: 'step',
      description:
        'For savvy-flow workers: report progress on your own task to the agents panel. ' +
        'Right after reading the brief, call it with `total` (your plan in 3-8 steps) and `done: 0`; ' +
        'call it again as each step finishes. Cheap and silent: it only draws a bar.',
      inputSchema: {
        type: 'object',
        properties: {
          done: { type: 'integer', minimum: 0, description: 'Steps finished so far.' },
          total: { type: 'integer', minimum: 1, description: 'Steps planned; may change if the plan changes.' },
          note: { type: 'string', description: 'The step in progress, a few words.' },
        },
        required: ['done'],
      },
      // In every agent's tool list, not behind ToolSearch: workers do not go looking for it.
      isDeferred: false,
    })

    // Ticks the running agents' clocks; quiet when nothing runs.
    $.clock.every(1000, () => {
      void (async () => {
        const list = await read($, agents)
        if (!list.some(a => a.status === 'running')) return
        const at = await $.clock.now()
        await update($, now, () => at)
      })()
    })
    // Another session may change a setting: read the stored ones again, slowly.
    $.clock.every(3000, () => void syncSettings($, options))
    return started
  })

  // `$.savvy` for the /mods hub (claude-mods-hub PROTOCOL.md): a call is the
  // `savvy.panel`, `savvy.act` or `savvy.catalog` event, answered below with this
  // session's `$`; the stub is the chain's floor.
  on('engine.create', async ($, e, next) => {
    const built = await next(e)
    return { ...built, savvy: { panel: async () => ({ title: '', sections: [] }), act: async () => ({}), catalog: async () => [] } }
  })
  on('savvy.panel', async ($, e) => ({ value: await panelOf($, e, options) }))
  on('savvy.act', async ($, e) => ({ value: await actOn($, e) }))
  on('savvy.catalog', async ($, e) => ({ value: await catalogOf($, e) }))

  on('tool.call', { tool: TOOL }, async ($, e) => {
    // The flow is the main session's: a call from a worker's loop carries its agentId
    // and changes nothing, or any subagent could rename, finish or reset the flow.
    if (e.agentId) return { result: 'ignored: only the main session reports the flow' }
    const input = e as unknown as ProgressInput
    const prev = await read($, flow)
    if (isNewFlow(prev, input) && input.title !== undefined) {
      // A new flow starts with a clean list; agents still running stay.
      await update($, agents, list => list.filter(a => a.status === 'running'))
    }
    const next = await update($, flow, p => merge(p, input))
    if (next && input.tasks?.length) await autoOpen($, next.title)
    return { result: `ok: ${label(next ?? blank())}` }
  })

  // A worker's own progress: the call runs in the worker's loop, so agentId names it.
  on('tool.call', { tool: STEP_TOOL }, async ($, e) => {
    const input = e as unknown as { done?: number; total?: number; note?: string }
    const agentId = e.agentId
    if (!agentId) return { result: 'ignored: only subagents report steps' }
    let matched = false
    await update($, agents, list =>
      list.map(a => {
        if (a.agentId !== agentId) return a
        matched = true
        const total = Math.max(0, Math.round(input.total ?? a.stepTotal ?? 0))
        const done = Math.max(0, Math.round(input.done ?? a.stepDone ?? 0))
        return { ...a, stepTotal: total, stepDone: total ? Math.min(total, done) : done, stepNote: input.note?.trim() || undefined }
      }),
    )
    return { result: matched ? 'ok' : `ignored: no panel row for agent ${agentId}` }
  })

  // Safety net: worker launches move the faint layer even if the orchestrator forgets to report.
  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const type = String(e.subagent_type ?? '')
    if (!type.startsWith('savvy-')) return next(e)

    await update($, flow, prev => {
      const base = prev && !prev.isFinished ? { ...blank(), ...prev } : blank()
      return { ...base, running: base.running + 1, phase: base.phase === 'plan' ? 'delegate' : base.phase }
    })
    try {
      return await next(e)
    } finally {
      await update($, flow, prev => (prev ? { ...prev, running: Math.max(0, prev.running - 1) } : prev))
    }
  })

  on('agent.spawn', async ($, e, next) => {
    const isUnbriefed = e.subagentType.startsWith('savvy-') && !e.prompt.includes(STEP_TOOL)
    const started = await next(isUnbriefed ? { ...e, prompt: e.prompt + STEP_BRIEF } : e)
    if (started.deny !== undefined) return started

    const at = await $.clock.now()
    await update($, agents, list => {
      const round = 1 + list.filter(a => norm(a.description) === norm(e.description) && e.description).length
      const run: AgentRun = {
        id: started.agentId ?? e.tool_use_id,
        agentId: started.agentId,
        type: e.subagentType,
        description: e.description,
        model: started.model,
        status: 'running',
        startedAt: at,
        contextTokens: 0,
        contextMax: windowOf(started.model),
        tokens: 0,
        costUsd: 0,
        steps: 0,
        round,
      }
      return [...list.filter(a => a.id !== run.id), run].slice(-200)
    })
    await update($, now, () => at)
    if (e.subagentType.startsWith('savvy-')) {
      const f = await read($, flow)
      await autoOpen($, f && !f.isFinished ? f.title : 'savvy-flow')
    } else if (((await read($, prefs)) ?? prefsFrom([], options)).autoOpen === 'any') {
      await autoOpen($, 'any-agent')
    }
    return started
  })

  // Each model request of a subagent: live context, tokens and cost.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    const agentId = e.agentId
    const usage = result.usage
    if (!agentId || !usage) return result

    const model = usage.model || e.model
    await update($, agents, list =>
      list.map((a): AgentRun =>
        a.agentId !== agentId
          ? a
          : {
              ...a,
              model,
              effort: typeof e.effort === 'string' ? e.effort : a.effort,
              status: 'running',
              endedAt: undefined,
              contextTokens:
                (usage.input_tokens || 0) +
                (usage.cache_read_input_tokens || 0) +
                (usage.cache_creation_input_tokens || 0) +
                (usage.output_tokens || 0),
              contextMax: windowOf(model),
              tokens:
                a.tokens +
                (usage.input_tokens || 0) +
                (usage.output_tokens || 0) +
                (usage.cache_read_input_tokens || 0) +
                (usage.cache_creation_input_tokens || 0),
              costUsd: a.costUsd + costOf(model, usage, true),
              steps: a.steps + 1,
            },
      ),
    )
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const agentId = e.agentId
    if (agentId) {
      const at = await $.clock.now()
      await update($, agents, list =>
        list.map((a): AgentRun => {
          if (a.agentId !== agentId) return a
          // A run whose steps went unseen still gets the turn's own sum.
          const fallback = a.steps === 0 && e.usage
          return {
            ...a,
            status: e.reason === 'answer' ? 'done' : 'failed',
            endedAt: at,
            ...(fallback && e.usage
              ? {
                  model: e.usage.model || a.model,
                  tokens:
                    e.usage.input_tokens +
                    e.usage.output_tokens +
                    e.usage.cache_read_input_tokens +
                    e.usage.cache_creation_input_tokens,
                  costUsd: costOf(e.usage.model || a.model, e.usage, false),
                }
              : {}),
          }
        }),
      )
      await update($, now, () => at)
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const list = await read($, agents)
    const f = await read($, flow)
    const p: Panel = await read($, panel)
    const at = Math.max(await read($, now), ...list.map(a => a.startedAt), 0)
    const k = kitOf($.ui.resolve(e) as unknown as KitUi, toneOf(await skinOf($)), e.surface, e.props.bodyColumns)
    return paneTree(
      k,
      paneView(list, f, at),
      p,
      () => void setView($, 'compact', !p.isCompact),
      () => void setView($, 'hideFinished', !p.isDoneCollapsed),
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const f = await read($, flow)
    if (f === null || e.props.hasSurvey) return next(e)
    // Draw this row with the other mods' bands beneath it. Claude Code's own placeholder ({ type: 'engine' }) is
    // never nested: the desktop drops a band that nests it.
    const drawn = await Promise.resolve(next(e)).catch(() => null)
    const below = drawn && typeof drawn === 'object' && (drawn as { type?: string }).type !== 'engine' ? drawn : null

    const list = await read($, agents)
    const k = kitOf($.ui.resolve(e) as unknown as KitUi, toneOf(await skinOf($)), e.surface, e.props.bodyColumns)
    return bandTree(k, {
      f,
      crew: list.length + plannedOf(f, list).length,
      isWorking: list.some(a => a.status === 'running'),
      onCrew: () => void togglePane($),
      onDismiss: () => void update($, flow, () => null),
      below,
    })
  })
}
