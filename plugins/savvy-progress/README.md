# savvy-progress

A Claude Code mod: a progress bar above the prompt and a live panel of subagents. Made for the [savvy-flow](../savvy-flow) skill, and useful with any subagents.

- **Progress bar**: the flow's title, phase, accepted tasks out of planned, and a button with the crew size that opens the panel. It appears once something reports progress (savvy-flow does) or a `savvy-*` worker starts.
- **Agents panel** (open it from the Agents tab in `/mods`, or with the crew button on the progress bar): running, finished and planned subagents with model, effort, task progress, context, estimated cost and time. Working crabs walk, and each savvy tier animates its prop: the astronaut floats, the detective sweeps the magnifier, the engineer turns the wrench, the chef tosses the omelette, the racer runs with a fluttering flag. `prefers-reduced-motion` stops them.

## In `/mods`

The mod has no slash command of its own: it is a tab in the `/mods` panel of the claude-mods-hub mod, which draws it from `$.savvy`. The **Agents** tab (**Agentes** in Portuguese) shows:

- **Overview**: running, finished and planned agents, the current flow's progress, and the estimated cost, tokens and time so far, plus **Open the agents panel**, which opens the pane (or brings it forward). While agents run, the hub redraws the counts every 5 seconds.
- **Settings**: the two options below, `language` and `autoOpen`, changed in place.

Every component the mod draws (the band in each state, the agents pane, its rows, buttons and crabs) also shows, named and live, in the **Components** tab of `/mods`.

## Tools it adds

- `mcp__savvy-progress__progress`: the orchestrator reports the plan, phase and accepted tasks. Only the main session can: a call from a subagent is ignored, so a worker cannot rename, finish or reset the flow.
- `mcp__savvy-progress__step`: a worker reports its own steps (`done`, `total`, `note`). A worker that does not report shows its context fill in grey instead. The tool is listed up front rather than behind ToolSearch, and each `savvy-*` worker gets one line at the end of its brief asking for these reports.

Cost is a rough estimate from token counts and a built-in per-model price table (`PRICES` in `hooks/register.tsx`, list prices as of 2026-10-10), not a bill. Cache writes are priced at the 1-hour rate, which is what Claude Code writes on a subscription; a session that writes 5-minute entries is overestimated there.

## Settings

`language`: `auto` (default), `en`, `ru` or `he`. Hebrew draws the bar and the panel right to left. `auto` follows Claude Code's `language` setting, then the system locale, and falls back to English. Set it in `/config`, or, for a mod loaded by hand, in `~/.claude/settings.json`:

```json
{ "pluginConfigs": { "savvy-progress": { "options": { "language": "ru" } } } }
```

`autoOpen`: `savvy` (default) or `any`. With `savvy` the panel opens by itself when a `savvy-*` worker starts or a plan is reported. With `any` it also opens, once per session, when any other subagent starts. Either way it can be opened from `/mods`, and the crew button on the progress bar toggles it. Both settings can also be changed in the Agents tab of `/mods`.

Install instructions are in the [repository README](../../README.md).
