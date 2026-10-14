# savvy-progress

A Claude Code mod: a progress bar above the prompt and a live panel of subagents. Made for the [savvy-flow](../savvy-flow) skill, and useful with any subagents.

- **Progress bar**: the flow's percent as a ring, its title, a track with one segment per planned task (accepted, handed to a running worker, or still to do), the phase and count as a state, a small crab that walks while agents run, an **Agents** button with the crew size that opens the panel, and a dismiss control. It appears once something reports progress (savvy-flow does) or a `savvy-*` worker starts.
- **Agents panel** (open it from the Agents tab in `/mods`, or with the Agents button on the progress bar): the running flow with its progress ring and the session's totals, then **Running**, **Finished** and **Planned** groups with one row per agent: its crab, name, tier, model and effort, the worker's reported steps as a ring, the context as a ring (warn past 80%, err past 95%), estimated cost and time, and its state. Each savvy tier has its own crab, and working crabs animate their prop: the astronaut floats, the detective sweeps the magnifier, the engineer turns the wrench, the chef tosses the omelette, the racer runs with a fluttering flag. `prefers-reduced-motion` stops them. **Collapse** folds the panel to one row of crabs; **Hide** folds the Finished group.

Both wear the skin chosen in the skins mod, and Claude Code's own colours without it.

## In `/mods`

The mod has no slash command of its own: it is a tab in the `/mods` panel of the claude-mods-hub mod, which draws it from `$.savvy`. The **Agents** tab (**Agentes** in Portuguese) shows:

- **This session**: the current flow's progress, running, finished and planned agents, and the estimated cost, tokens and time so far.
- **Running**, **Finished** and **Planned**: this session's agents as rows, drawn as the panel draws them (the eight latest finished ones; the panel lists them all). While agents run, the hub redraws the tab every 5 seconds.
- **View**: the panel's two view choices, **Collapsed view** and **Hide finished agents**, then **Open panel**, which opens the pane in this session (or brings it forward).

The line under the mod's name in `/mods` is short (`2/6 · 3 running`), with the flow's progress as a ring beside it.
- **Settings**: the two options below, `language` and `autoOpen`, changed in place.

Settings follow you: the two options live in their config rows and the view choices in the mod's store, both shared by every session, and each session reads them again every few seconds. What runs in a session (its flow and its agents) stays that session's.

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

`autoOpen`: `savvy` (default) or `any`. With `savvy` the panel opens by itself when a `savvy-*` worker starts or a plan is reported. With `any` it also opens, once per session, when any other subagent starts. Either way it can be opened from `/mods`, and the Agents button on the progress bar toggles it. Both settings can also be changed in the Agents tab of `/mods`.

Install instructions are in the [repository README](../../README.md).
