# Implementation Plan: specd layout

Source spec: specs/specd-layout/spec.md

Tasks are in `specs/specd-layout/todo.md` (markdown checklist; no external tracker is designated for
this repo). The Task List below is an ordered index of its task numbers.

## Overview

Give specd a home in Herdr's right panel, in a new `specd` layout cloned from Shepherdr, so a spec
is reviewed beside the agent's terminal. Make specd usable at the panel's 280–900px widths. Let
the user set standing instructions for the coordinator and for dispatched workers in a specd
settings page. Document it all with README screenshots and task-shaped guides.

The work has one real unknown at each end (what starts an agent in Chat; how a coordinator can get
instructions before its first message) and one structural change in the middle (specd becomes a
panel that follows focus instead of a tab pinned to one folder). The plan resolves the unknowns
first, then builds the panel, then instructions, then docs.

## Findings (read from the code, then checked live in task 1, 2026-11-27)

These change the plan. Each is checked again in task 1 before anything depends on it.

1. **Nothing in this install opens an agent *pane* in Chat. Confirmed live (task 1, 2026-11-27).**
   Started in the `shepherdr` layout (header mod `pane-chat`, which shows Chat only for a pane whose
   `mod` is `chat`; seen via `herdr-app ls`: a terminal pane has a `pane` id under its tab, a Chat pane
   leaves the tab's `terminals` empty and the agent's core label `herdr.chat=<chat pane>` set):

   | Flow | Pane `mod` | Header state |
   |---|---|---|
   | + menu → Claude Code (`tab.new {argv:["claude"]}`) | none (terminal) | Terminal |
   | specd phase agent (`tab.new {argv, task, folder, focus:false}`, `io/agents.js`) | none (terminal) | Terminal |
   | Shepherdr task opened from the Tasks panel | none: the worker has **no pane or tab** (hidden, labels `herdr.task`, no `herdr.tab`); the panel's `tasks-thread-chat` block (mod `chat`) shows it. Live: `shared("tasks.thread").terminal` = this very task's worker | Chat, but inside the panel, not a pane |
   | Assistant tab (`coordinator.js` `openCoordinator`, `mod:"chat"`) | `chat` | Chat |

   Only the Assistant tab and the Tasks-panel thread show an agent in Chat, and neither is a pane
   that `pane-specd` could change (the thread has no `pane-chat` header; the Assistant is
   uncloned by the spec). Switching a pane to Chat (header `toChat`: `pane.split {mod:"chat"}`,
   `hc label herdr.chat=<pane>`, `terminal.park`) was reproduced by hand: the label read back from
   `hc get` (`herdr.chat=<pane>`, `keep: true`), the tab then listed no terminal. **Not
   observed:** coming back as Chat after restarting the window. The person's window was not
   restarted. From `chat/parked.js`: the label lives in core and survives; `sweep()` kills a parked
   agent whose chat pane is missing twice in a row, so a restored layout that has the chat pane
   keeps it, one that lacks it ends the agent. Verify in task 11 if it matters. So the spec's
   premise ("every agent pane starts in Chat view") does not hold here: `pane-specd` would change
   nothing, task 10 is a no-op and success criterion 3 already holds. (Open question 1.)
2. **The coordinator starts lazily, and `hc send` cannot beat its first message. Confirmed live,
   with a correction.** `openCoordinator` opens an Assistant tab holding a `chat` pane and no agent.
   On the person's first message `mods/chat` `startAgent` runs
   `hc run --bg --json --no-parent --keep --cwd <folder> --label herdr.chat=<pane> --label herdr.chat.slot=<slot> --label herdr.role=coordinator ... assistant "<message>"`.
   The template name is hardcoded; the template's words and the message arrive together as one
   first message (in the transcript, one `user` entry: `<hc from=...>` + the template body + the
   message). Measured by running that same `hc run` against a new space while polling `hc ls`/`hc get`
   every 100 ms (the first message was not typed into the chat UI, the `hc run` was the one `startAgent`
   makes, minus the chat-pane labels, which a script cannot read: `shared.json` held no slots):
   - The terminal is listed **0.03 s and 0.20 s** after `hc run` starts (2 runs), already carrying
     `herdr.role=coordinator`, `herdr.space`, `herdr.coordinator.tab`.
   - `hc run` returned after 5.25 s: that is Claude Code starting before the first message is typed.
     The first message is in the transcript at about +5.3 s.
   - An `hc send` issued **0.23 s after the terminal appeared, before the first message** did not
     go first. It blocked 5.0 s, returned `{"started":true,"status":"done","turn":1}`, and in the
     transcript is the **third** entry: after the first message **and after the agent's first reply**
     (entries: first message 20:45:10.5, reply "ok" 20:45:12.0, `hc send` text 20:45:13.6). `hc send`
     waits for the terminal to be idle, so the instructions arrive as a separate second turn, not
     before the first.
   - `hc label <t> specd.spike=1` issued the same instant succeeded and still read back after the
     first turn and after the agent finished (labels merge; `herdr.role` was untouched). Not tested
     across a core restart.
   - Variance: the Assistant tab (chat) was present 3 s, ~16 s, and (once, within 17 s) not at all
     after a bare `herdr-app do space.new` (it is made by `watchNewSpaces` on the coordinator mod's
     tick). A watcher that waits for it needs a timeout, and must not assume it.
   - A folder Claude Code does not trust (e.g. `~`: "Yes lasts for this session only") shows a trust
     dialog; `hc run` then returns `first_message.sent:false` and the agent is `blocked`. `hc send`
     would answer that dialog unless it is `--if idle`. chat's own `startAgent` already copes with
     this (it re-sends later: `firstSend`).

   Herdr's own **Edit instructions…** editor writes `~/.config/herdr-core/templates/assistant.md`;
   the spec forbids specd doing the same. So the only template-free route is `hc send` after the
   first turn: instructions arrive *after* the person's first message **and the first reply**
   (open question 2).
3. **Palette entries are static.** `mod.json` `palette` can only call an app command or
   `<mod>.<command>`, and the latter needs a shown copy listening on `nextCommand()`. A stack
   child that isn't the active one may not be running. So "open in the panel" can't depend on the
   panel copy being awake.
4. **specd resolves its folder once, in `init`** (focused terminal's cwd, or the space's folder).
   A panel lives across tabs and spaces, so the folder must follow focus (task 4).
5. **The installed `shepherdr.json` has an extra `agenttrail` block** (a 340px right column, random
   id): a personal edit, not shipped Shepherdr. Cloning the file as is would make the committed layout
   depend on a mod other machines may not have (open question 4).
6. `layout.select {stack, child}` and `shared("layout")` exist, so a mod can switch a stack and
   know the layout's name. `setShared` / `shared` is the pattern Herdr's own mods use to pass a
   request between copies (`pane-chat` → `chat.startreq`).
7. `scripts/link.sh` honours `HERDR_APP_HOME`, so docs can be checked against a clean copy.

## Architecture Decisions

- **Panel is the same mod, a different place.** One `mods/specd`, two homes: tab (today) and panel
  (specd layout). `core/place.js` (pure) decides which from `shared("layout")`; `main.js` only routes.
  Every existing flow keeps its code path; the panel changes where it is drawn and how wide it is.
- **Palette entries stay `tab.new`.** A tab copy that finds itself in the `specd` layout writes
  `setShared("specd.request", {cmd, props, at})`, runs `layout.select` on the panel stack, and closes
  its own tab; the panel copy consumes the request on init and on its poll. This works whether or
  not the panel copy was running, and needs no change outside the layout. (If task 2 shows commands
  reach a hidden stack child reliably, the shared request can be dropped. Recorded in findings.)
- **Folder follows focus in the panel, and pins while a spec is open.** The list shows the focused
  space's folder; opening a spec pins its folder until Back, so a review isn't pulled away by a tab
  switch. Pure `folderFor(focused, spaces, props)` in `core/place.js`.
- **One width rule.** `core/width.js` exports `layoutFor(width)` → `"wide" | "narrow"` with a single
  breakpoint constant (640px, per the spec; adjusted in task 5 if the live check says otherwise). All
  views read it; none measures on its own.
- **Instructions are data, not prompts, until the last step.** `core/agents.js` (pure):
  `resolveInstructions({user, folder})` → `{text, from}` (`from`: `"folder" | "user" | "none"`) and
  `withInstructions(prompt, text)`. `dispatchRows` calls the second; `herdr-task` is untouched. User
  defaults live in specd's localStorage (beside the diagram settings, shared by panel and tab copies);
  folder overrides in `.specd/config.json`, written by merging into the existing file.
- **A folder override that is present wins, even when empty.** Absent key = inherit; `""` = "none
  for this folder". The settings page shows which applies and offers Reset (remove the key).
  (Open question 3; the resolver has a test for each case so the choice is cheap to flip.)
- **`pane-specd` is a conditional clone** of `pane-chat` with the smallest change that makes Terminal
  the starting state, `cloned_from` recorded. Built only if task 1 finds a flow that opens Chat.
- **Live checks follow the repo's memory notes:** back up `~/.config/herdr-app/mods/specd` (and
  any `layouts/specd.json`), link, scratch folders under `$HOME` (mods can't read `/private/tmp`),
  `tab.close` what you opened, restore afterwards.
- **Sequential UI work.** Tasks 3–9 all touch `main.js`; they run one after another. Only tasks that
  don't share files (task 10 `mods/pane-specd/`, the docs) may fan out, at most three at a time, each
  committing after every step (usage-limit lesson).

## Dependency graph

```text
T1 spike: Chat default + coordinator start ─────────────┬───────────────► T9 coordinator delivery
                                                         └─► T10 pane-specd (conditional)
T2 layout file + install ─► T3 palette → panel ─► T4 folder follows focus ─► T5 narrow: review
                                                                          └► T6 narrow: the rest
T7 worker instructions (core + dispatch) ─► T8a settings page shell ─► T8b Agents section ─► T9
T2..T10 ─► T11 live run + screenshots ─► T12 README + install/troubleshooting ─► T14 clean-home walk-through
                                       └─► T13 review/dispatch/agents guides ──┘
```

T7 has no dependency on the layout and can start right after the Phase 0 checkpoint if the panel
work is waiting on a live check.

## Task List

### Phase 0: Resolve the unknowns
- [ ] Task 1: Spike: what opens an agent in Chat, and how a coordinator can be given instructions

### Checkpoint 0: Decisions
- [ ] Findings 1 and 2 above are confirmed or corrected; the human picks the path for open questions 1 and 2

### Phase 1: specd in the panel
- [ ] Task 2: The `specd` layout installs and shows specd in the right panel
- [ ] Task 3: Palette commands focus the panel in the `specd` layout, open a tab elsewhere
- [ ] Task 4: The panel follows the focused space
- [ ] Task 5: Narrow panel: the review folds its comment column under the document
- [ ] Task 6: Narrow panel: list, dispatch preview, build view and forms fit 280px

### Checkpoint 1: Panel
- [ ] specd-mvp flows work in the panel at 280, 510 and 900px; outside the layout specd opens as a tab

### Phase 2: Agent instructions
- [ ] Task 7: Worker instructions reach dispatched tasks (folder override first)
- [ ] Task 8a: specd settings page, with the Diagrams section moved in
- [ ] Task 8b: Agents section: edit user defaults and folder overrides
- [ ] Task 9: A new coordinator receives the coordinator instructions

### Checkpoint 2: Instructions
- [ ] Worker and coordinator instructions arrive; folder override wins; empty changes nothing

### Phase 3: Terminal-first header (conditional on task 1)
- [ ] Task 10: `pane-specd` header: Terminal first, Chat one click away

### Phase 4: Live check and docs
- [ ] Task 11: Live run of every success criterion, with the screenshots the docs need
- [ ] Task 12: README rewrite, install guide, troubleshooting guide
- [ ] Task 13: Review, dispatch and agents guides
- [ ] Task 14: Follow every guide from a clean Herdr home

### Checkpoint 3: Complete
- [ ] All success criteria in the spec met; docs match the UI; ready for review

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Nothing starts agents in Chat, so `pane-specd` is pointless | Med: a whole phase of work and a clone to maintain for nothing | Task 1 checks first; task 10 is conditional and small if it stays |
| Coordinator instructions can't arrive before its first message (it starts with that message as its task) | High: success criterion 5 can't be met as written | Task 1 measures; options in open question 2; criterion reworded if the human accepts "with the first message" |
| Panel copy isn't running while another stack child is active | High: no polling, no coordinator watch, lost palette requests | Shared-request pattern (task 3); task 2 records whether hidden children run; watcher design in task 9 follows the finding |
| Folder follows focus and a spec is pulled away mid-review | Med | Pin the folder while a spec is open (task 4); test with a fake focus change |
| `main.js` is 846 lines and every task edits it | Med: merge conflicts, regressions | Sequential tasks; new logic in `core/` with tests; each task runs the headless suite and the main.js handler tests |
| Narrow layouts can't be judged headless | Med | Pure `layoutFor` is unit-tested; the live check screenshots 280/510/900 (task 11) |
| Herdr doesn't hot-reload copied mods or layouts | Low | `npm run link` after each edit; the live checklist says so |
| Parallel agents exhaust the usage limit | Med | ≤3 at a time; commit after each step; no nested `claude -p` loops in tests (they use a fake llm) |
| Layout JSON drifts from Herdr's schema | Low | `herdr-app check`, `layout.switch`, a structure test (task 2) |

## Open Questions

1. **Does anything start an agent pane in Chat?** Task 1 looked at every flow listed in Finding 1:
   none does. Recommendation: drop task 10 and treat success criterion 3 as already true (state
   it in the spec as "the layout leaves agent panes as Herdr opens them"). If you do know a flow
   that opens Chat (a different layout or Herdr version), name it and task 10 stays.
2. **Coordinator timing.** `hc send` cannot land before the first message: measured, it arrived
   after the first message and the first reply (Finding 2). Options: (a) instructions arrive as the
   second message, after the first reply (criterion 5 reworded); (b) specd writes a marked block into
   `~/.config/herdr-core/templates/assistant.md`, which contradicts "never edit templates in
   place"; (c) drop coordinator instructions. The earlier recommendation (a) "if the send lands
   before the agent's first turn" is **refuted**. Recommendation: (b) behind an explicit "Apply to
   Assistant" button that shows the diff, because it is the only route where the standing
   instructions are in the first message; the person decides. If you reject (b), choose (a) and
   expect the first reply to ignore them (it is a placeholder turn for the person's task), or (c).
3. **Folder override meaning.** Recommended: key present (even `""`) wins; absent inherits.
   The alternative (empty = inherit) can't switch instructions off for one folder.
4. **The `agenttrail` block.** Your `shepherdr.json` has a personal 340px `agenttrail` column. The
   committed layout drops it (it isn't Herdr's, and other machines may lack it). Say if you want it
   kept.
5. **Coordinator instructions via `hc send` only apply while the `specd` layout is shown,** because only the panel
   copy runs the watcher. Acceptable? (Outside the layout, specd has no running copy to deliver
   them.)
6. **Breakpoint.** 640px per the spec; task 5 confirms it against a live screenshot at 600/640/700.
