# Implementation Plan: specr MVP

Source spec: specs/specr-mvp/spec.md

Tasks tracked in `specs/specr-mvp/tasks.json` (specr's task list; there is no `tasks/todo.md`).
The Task List below is an ordered index of its item IDs.

## Overview

Build the `specr` Herdr.app mod in four layers, each usable before the next: a tested pure core
(pieces, anchors, adapters, state, tasks, rounds); a review loop on adopted specs (render, diagrams,
comments, Submit); the phases (new spec, approve, plan, changes since last round); and dispatch to
Shepherdr with build status. The spike in `spike/` proved the risky platform parts; this plan
turns them into the product.

## Architecture Decisions

- **Three layers in the mod.** `core/` is pure JS with no host imports, tested with `node:test`;
  `io/` holds every effect (files, folder watching, `exec`, `hc`, agent tabs, mermaid);
  `ui/` describes elements. `main.js` only routes between views.
- **Pieces split at every heading and around mermaid fences.** Anchors are whole-file UTF-16
  offsets. Pieces give `scroll_to_item` jump targets and per-section change marks; the cost (no
  comment across two sections) is accepted in the spec.
- **No work in `render()`.** Async work starts from `init`, timers, events or commands. Every
  view has a dev command loop (`herdr-app do specr.<cmd>`) so it can be driven and screenshotted
  from a shell.
- **State is files.** `.specr/specs/<ID>/state.json` holds phase, owners and pending comments
  (so they survive restarts); `rounds/<n>/` holds each submitted round.
- **Agents are tabs.** `tab.new {argv, task, name}` starts a phase agent; `panes()` maps its pane
  to a terminal; `hc send` delivers reviews.
- **Dispatch is `add --json` then `start`.** Refs passed to `--after` only ever come from `add`'s
  output.
- **Workers inherit auto mode from the plan agent.** Phase agents start with `--session-id`, so
  specr can read their mode from the transcript and pass `start --argv … --permission-mode auto`.
- **Proposed answers to the spec's open questions** (confirm in review):
  - Q1: machine settings (`mmdc` path, puppeteer config) in the mod's `localStorage`, edited from
    a small settings popover; default is `mmdc` on `PATH`.
  - Q2: build status polls `herdr-task list --json --folder <repo>` every 10 s, only while the
    window is visible.
- **UI tasks run in sequence.** They all touch `main.js`; parallel worktrees would conflict on it.
  The core tasks run in parallel.

## Task List

### Phase 1: Foundation (core, parallel after t1)
- t1 · Task 1: Scaffold the mod and the dev loop
- t2 · Task 2: Pieces, anchors and the review message
- t3 · Task 3: Adapters and phase prompts
- t4 · Task 4: Spec state and phase transitions
- t5 · Task 5: tasks.json validation and dispatch commands
- t6 · Task 6: Rounds: changed sections and re-anchoring
- c1 · Checkpoint: Foundation

### Phase 2: Review loop on adopted specs
- t7 · Task 7: Spec list and document view
- t8 · Task 8: Inline comments
- t9 · Task 9: Diagrams
- t10 · Task 10: Adopt an existing spec
- t11 · Task 11: Submit a review
- t19 · Task 19: Spec locations in adapters
- t18 · Task 18: Pick up specs written outside specr
- c2 · Checkpoint: Review loop

### Phase 3: Phases
- t12 · Task 12: New spec and the spec phase
- t13 · Task 13: Approve and the plan phase
- t14 · Task 14: Changes since the last round
- c3 · Checkpoint: Phases

### Phase 4: Dispatch
- t15 · Task 15: Dispatch to Shepherdr
- t16 · Task 16: Build status
- c4 · Checkpoint: Dispatch

### Phase 5: Release
- t17 · Task 17: End-to-end run and publishing files

---

## Task 1: Scaffold the mod and the dev loop

**Description:** Create the repo layout from the spec's Project Structure: `mods/specr/` with
`mod.json` (place `none`, focusable, palette entry "specr: Open"), a `main.js` that shows the
folder it's working in, a root `package.json` (`"type": "module"`, scripts `test`, `check`,
`link`, `syntax`), `scripts/link.sh`, and `.gitignore`. `link.sh` symlinks `mods/specr` into
`~/.config/herdr-app/mods/specr`; if the symlink doesn't load or hot-reload, it copies instead
and says so. Move the spike's fixture spec to `test/fixtures/specs/PROJ-123/spec.md`.

**Acceptance criteria:**
- [ ] `npm run link && npm run check` passes, and "specr: Open" in the palette opens a tab showing the focused terminal's folder.
- [ ] Saving `mods/specr/main.js` updates an open copy within 2 s (or `link.sh` falls back to copying and prints why).
- [ ] `npm test` and `npm run syntax` run green on the empty project.

**Verification:**
- [ ] `npm run link && npm run check && npm test && npm run syntax`
- [ ] Manual check: open from the palette, edit the shown text, `herdr-app shot` shows the change

**Dependencies:** None

**Files likely touched:**
- `mods/specr/mod.json`, `mods/specr/main.js`
- `package.json`, `scripts/link.sh`, `.gitignore`

**Estimated scope:** Small

## Task 2: Pieces, anchors and the review message

**Description:** Port the spike's `logic.js` into `core/pieces.js` (split at every heading and
around mermaid fences; each piece has `kind`, `start`, `end`, `text`, `heading`, a stable `key`),
`core/anchors.js` (`lineStarts`, `lineOf`, `anchor`, `localRanges`) and `core/review.js` (the
spec's review message, path relative to the spec's folder, at most four quoted lines per
comment).

**Acceptance criteria:**
- [ ] Pieces tile the file exactly and start at every heading and fence (fixture spec: 272 lines).
- [ ] Anchors for a paragraph, a table cell, two list items, text after the astral `𝑓` and text after a diagram give lines equal to an independent newline count.
- [ ] The review message matches the spec's example byte for byte.

**Verification:**
- [ ] Tests pass: `node --test test/pieces.test.mjs test/anchors.test.mjs test/review.test.mjs`
- [ ] `grep -E "from \"(herdr|gpui)" mods/specr/core/*.js` finds nothing

**Dependencies:** t1

**Files likely touched:**
- `mods/specr/core/pieces.js`, `mods/specr/core/anchors.js`, `mods/specr/core/review.js`
- `test/pieces.test.mjs`, `test/anchors.test.mjs`, `test/review.test.mjs`

**Estimated scope:** Medium

## Task 3: Adapters and phase prompts

**Description:** `core/adapters.js` loads and validates adapter version 1, resolves `{id}`
paths, resolves models and effort with spec > folder > adapter precedence, and fills prompts
(`{brief}`, `{specr.spec}`, `{specr.plan}`, `{specr.task}`). `core/instructions.js` holds the text
of the `{specr.*}` blocks from the spec's Framework notes (spec system and path; task list target,
`Source spec:` line, no `todo.md`; "this task only", no marking complete, `herdr-task ready`).
Ship `adapters/agent-skills.json`. Add spec-kit and Kiro adapters as test fixtures only.

**Acceptance criteria:**
- [ ] The agent-skills adapter loads; a broken adapter reports every problem at once.
- [ ] The spec-kit and Kiro fixtures load with no new fields (the contract test).
- [ ] A filled build prompt never starts its argument text with `auto` or `all`.

**Verification:**
- [ ] Tests pass: `node --test test/adapters.test.mjs`

**Dependencies:** t1

**Files likely touched:**
- `mods/specr/core/adapters.js`, `mods/specr/core/instructions.js`, `mods/specr/adapters/agent-skills.json`
- `test/adapters.test.mjs`, `test/fixtures/adapters/spec-kit.json`, `test/fixtures/adapters/kiro.json`

**Estimated scope:** Medium

## Task 4: Spec state and phase transitions

**Description:** `core/state.js`: create state for a new spec and for an adopted one (phase
from the files given), read and write `state.json` version 1 (refuse other versions with a clear
message), and the transitions: drafting → review when the document appears, approve (refused
while comments are pending), spec → plan → build → done, owner per phase, round per document.

**Acceptance criteria:**
- [ ] Every transition in the spec's S1, S2, S4 and S6 is a function with a test, including the refusals.
- [ ] A `state.json` with an unknown version is refused, not overwritten.

**Verification:**
- [ ] Tests pass: `node --test test/state.test.mjs`

**Dependencies:** t1

**Files likely touched:**
- `mods/specr/core/state.js`
- `test/state.test.mjs`

**Estimated scope:** Small

## Task 5: tasks.json validation and dispatch commands

**Description:** `core/tasks.js`: validate `tasks.json` version 1 against every rule in the spec
(all errors at once, plus the `Source spec:` warning or error); order items by dependency; extract
a task's section from `plan.md` by heading text; build each item's prompt file text and its
`herdr-task add` and `start` argv arrays (`start` gets `--argv <worker argv ending in
--permission-mode auto>` only when told the parent is in auto mode); read a Claude transcript's
latest `permissionMode`; plan a retry from the refs already created.

**Acceptance criteria:**
- [ ] One broken fixture per validation rule, each reporting exactly its error; a fixture with a cycle and an unknown repo reports both.
- [ ] The argv for a task, a checkpoint, `--after` with refs from two folders, the review toggle, and a parent in auto mode (and in another mode) match expected arrays exactly.
- [ ] The transcript reader returns the latest `permissionMode` from a fixture `.jsonl`, and nothing for a missing file.
- [ ] A retry plan after a partial dispatch includes only uncreated items and created-but-unstarted ones.

**Verification:**
- [ ] Tests pass: `node --test test/tasks.test.mjs`

**Dependencies:** t3

**Files likely touched:**
- `mods/specr/core/tasks.js`
- `test/tasks.test.mjs`, `test/fixtures/plans/` (plan.md and tasks.json variants)

**Estimated scope:** Medium

## Task 6: Rounds: changed sections and re-anchoring

**Description:** `core/rounds.js`: compare the current file with the last round's copy by
section (heading plus body), giving `new`, `changed`, `unchanged` and `removed`; re-anchor last
round's comments by quote: found once (anchored), found several times (nearest the old offset,
"moved?"), not found (outdated).

**Acceptance criteria:**
- [ ] Fixture pairs cover an edited section, an added one, a removed one, and a renamed heading.
- [ ] Each comment comes back anchored, moved or outdated; none is dropped.

**Verification:**
- [ ] Tests pass: `node --test test/rounds.test.mjs`

**Dependencies:** t2

**Files likely touched:**
- `mods/specr/core/rounds.js`
- `test/rounds.test.mjs`, `test/fixtures/rounds/`

**Estimated scope:** Small

## Checkpoint: Foundation

Item `c1`, after t2 to t6:
- `npm test` passes
- `npm run check` passes
- `mods/specr/core/` has no `herdr` or `gpui` imports

## Task 7: Spec list and document view

**Description:** The pane's two main views. With no spec selected, list the folder's specs from
`.specr/specs/*/state.json` (ID, title from the document's first heading, phase, pending count,
task count). Selecting one renders its phase document as pieces (markdown only for now), reloading
when the file changes (`watchFolder`). Add the dev command loop (`top`, `open-first`, `next`).

**Acceptance criteria:**
- [ ] A folder with two fixture specs lists both; opening one renders it with headings, tables, lists and code.
- [ ] Editing the file on disk updates the view within 2 s.
- [ ] A 1,000-line document opens and scrolls without visible stalls.

**Verification:**
- [ ] `npm test && npm run check`
- [ ] Manual check: `herdr-app do specr.open-first`, then `herdr-app shot`

**Dependencies:** c1

**Files likely touched:**
- `mods/specr/main.js`, `mods/specr/ui/list.js`, `mods/specr/ui/document.js`, `mods/specr/io/files.js`

**Estimated scope:** Medium

## Task 8: Inline comments

**Description:** Selecting text in a piece shows the side panel's comment box with its source
lines; Enter adds a pending comment. Pending comments are highlighted, listed in document order,
editable and removable, and saved in `state.json`. Clicking one scrolls to its section. A
selection with no source range says it can't be commented on.

**Acceptance criteria:**
- [ ] Mouse selections in a paragraph, a table cell, across two list items and after a diagram report lines matching `sed -n`.
- [ ] Pending comments survive closing and reopening the pane, and restarting Herdr.
- [ ] Removing a comment removes its highlight and its entry in `state.json`.

**Verification:**
- [ ] `npm test && npm run check`
- [ ] Manual check: the four selections above, compared with `sed -n '<a>,<b>p'`

**Dependencies:** t7

**Files likely touched:**
- `mods/specr/ui/side.js`, `mods/specr/ui/document.js`, `mods/specr/main.js`, `mods/specr/io/files.js`

**Estimated scope:** Medium

## Task 9: Diagrams

**Description:** `io/mermaid.js` renders mermaid pieces to PNG with `mmdc` (theme `dark` or
`default`, transparent, scale 2), one at a time, cached by `hash(source)-theme` in the mod's
`.cache/`, started from `init` and a theme-watch timer, never from `render()`. `ui/diagram.js`
shows a spinner over the source while rendering, the source with a note on failure, install
instructions once when `mmdc` is missing, and opens a scrollable natural-size window on click. A
settings popover holds the `mmdc` path and puppeteer config (`localStorage`).

**Acceptance criteria:**
- [ ] Both fixture diagrams render in dark and light; switching Herdr's theme re-renders them.
- [ ] With `mmdc` off `PATH`, diagrams show as source with the install note.
- [ ] Clicking the sequence diagram opens it at natural size.

**Verification:**
- [ ] `npm run check`
- [ ] Manual check: `herdr-app shot` in both themes, and with `mmdc` hidden

**Dependencies:** t8

**Files likely touched:**
- `mods/specr/io/mermaid.js`, `mods/specr/ui/diagram.js`, `mods/specr/ui/document.js`, `mods/specr/main.js`

**Estimated scope:** Medium

## Task 10: Adopt an existing spec

**Description:** "specr: Adopt spec" picks a markdown file (`pickFiles`), optionally a plan and a
`tasks.json`, asks for the ID (prefilled from the file name), and creates the spec's state with
the files where they are, in the phase they imply.

**Acceptance criteria:**
- [ ] Adopting `PROJ-9.md` leaves it in place, lists it as `PROJ-9`, and opens it for review.
- [ ] Adopting a spec with a plan starts it in "Plan · review".
- [ ] An ID already used in the folder is refused.

**Verification:**
- [ ] `npm test && npm run check`
- [ ] Manual check: adopt a scratch file, `herdr-app shot`

**Dependencies:** t9

**Files likely touched:**
- `mods/specr/ui/adopt.js`, `mods/specr/mod.json`, `mods/specr/main.js`

**Estimated scope:** Small

## Task 11: Submit a review

**Description:** `io/agents.js` starts a phase agent tab (`tab.new` with the adapter's argv and a
first message, named `<ID> <phase>`, with a fresh `--session-id <uuid>` recorded on the owner so
its transcript can be found later), finds its terminal through `panes()`, and checks whether an
owner's terminal still exists. Submit builds the review message, sends it with `hc send` to the
owner or, when it's gone, to a new agent tab that becomes the owner; then saves the round
(`rounds/<n>/` with the file and `review.json`) and clears the pending comments.

**Acceptance criteria:**
- [ ] Submit puts exactly one message, intact over several lines, in the owner's terminal (`hc read`).
- [ ] With the owner closed, Submit opens `<ID> spec` and the review arrives there.
- [ ] Round 1 is saved and the round number goes to 2.

**Verification:**
- [ ] `npm test && npm run check`
- [ ] Manual check: submit to a scratch `claude` tab, then `hc read <terminal>`

**Dependencies:** t10

**Files likely touched:**
- `mods/specr/io/agents.js`, `mods/specr/io/files.js`, `mods/specr/ui/side.js`, `mods/specr/main.js`

**Estimated scope:** Medium

## Task 19: Spec locations in adapters

**Description:** The pure half of spec S11. Add the optional `discover` field to adapter version 1
(`discover.specs` and `discover.plans`: path patterns with `{id}` as a wildcard) to
`core/adapters.js`'s validation, and fill it in `adapters/agent-skills.json` (`SPEC.md`,
`SPEC-{id}.md`, `docs/SPEC.md`, `spec/{id}.md`; plans: `tasks/plan.md`). New `core/found.js`:
turn the adapter's `paths.spec` plus `discover.specs` into matchers; given a file list, the
recorded spec paths and the dismissed paths, return the found specs (path, ID from `{id}` or
null); suggest an ID for a spec without one (a Jira-style key from its first heading, else a slug
of the heading); pick the plan to attach (a `discover.plans` file whose `Source spec:` line names
the spec's path).

**Acceptance criteria:**
- [ ] `specs/PROJ-9/spec.md`, `SPEC.md`, `SPEC-auth.md`, `docs/SPEC.md` and `spec/billing.md` are found with IDs `PROJ-9`, null, `auth`, null, `billing`; `docs/notes.md`, `specs/PROJ-9/notes.md` and recorded or dismissed paths are not.
- [ ] The ID suggestion gives `PROJ-123` for `# PROJ-123: Login` and `login-flow` for `# Spec: Login flow`.
- [ ] A `tasks/plan.md` is attached only when its `Source spec:` names the spec; adapters without `discover` still load.

**Verification:**
- [ ] Tests pass: `node --test test/found.test.mjs test/adapters.test.mjs`

**Dependencies:** t3

**Files likely touched:**
- `mods/specr/core/found.js`, `mods/specr/core/adapters.js`, `mods/specr/adapters/agent-skills.json`
- `test/found.test.mjs`, `test/adapters.test.mjs`

**Estimated scope:** Small

## Task 18: Pick up specs written outside specr

**Description:** The UI half of spec S11, on Task 19's `core/found.js`. Watch the folder
(`watchFolder`) while the pane is open and check once when it opens. Found specs appear in the
spec list under "Found" with one notification each. Adopt reuses Task 10's adoption: the ID from
the path, or asked for (prefilled with the suggestion) for `SPEC.md` and `docs/SPEC.md`; the
matching plan attached. Dismiss records the path in `.specr/dismissed.json`.

**Acceptance criteria:**
- [ ] With specr open, writing `specs/PROJ-9/spec.md`, `SPEC.md` and `SPEC-auth.md` by hand lists each under Found within 2 s, with exactly one notification each.
- [ ] Adopting `SPEC.md` asks for its ID, prefilled from its heading, and attaches a `tasks/plan.md` whose `Source spec:` names it ("Plan · review"); Dismiss hides a path across a restart.
- [ ] `docs/notes.md` and `specs/PROJ-9/notes.md` are never offered.

**Verification:**
- [ ] `npm test && npm run check`
- [ ] Manual check: the cases above in a scratch folder, `herdr-app shot`

**Dependencies:** t11, t19

**Files likely touched:**
- `mods/specr/ui/list.js`, `mods/specr/ui/adopt.js`, `mods/specr/io/files.js`, `mods/specr/main.js`

**Estimated scope:** Medium

## Checkpoint: Review loop

Item `c2`, after t7 to t11, t19 and t18:
- `npm test` and `npm run check` pass
- Adopt a spec, comment on a paragraph, a table cell, two list items and text after a diagram, and Submit to a running agent: the agent receives one message with the right lines
- The owner-gone path opens a new agent tab that receives the review
- Writing `specs/PROJ-9/spec.md` and `SPEC.md` by hand while specr is open offers both under Found, and Adopt opens each for review

## Task 12: New spec and the spec phase

**Description:** "specr: New spec" dialog (ID, brief, adapter, models), refusing a used ID;
creates the state, starts the `<ID> spec` agent with the adapter's argv and the filled spec
prompt, records it as owner, and opens the spec in "Spec · drafting", switching to review when the
document appears.

**Acceptance criteria:**
- [ ] With agent-skills 0.6.18, `DEMO-1` writes `specs/DEMO-1/spec.md` and no `SPEC.md`, in 3 of 3 runs.
- [ ] The agent tab runs the adapter's model and effort.
- [ ] A used ID is refused with a way to open the existing spec.

**Verification:**
- [ ] `npm test && npm run check`
- [ ] Manual check: three runs in a scratch folder; `ls` after each

**Dependencies:** c2

**Files likely touched:**
- `mods/specr/ui/new.js`, `mods/specr/mod.json`, `mods/specr/main.js`, `mods/specr/io/agents.js`

**Estimated scope:** Medium

## Task 13: Approve and the plan phase

**Description:** The Approve button: disabled with the reason while comments are pending.
Approving the spec starts the `<ID> plan` agent with the filled plan prompt and moves to "Plan ·
drafting"; the plan is then reviewed like the spec. Show the `Source spec:` check's warning or
error in the plan view.

**Acceptance criteria:**
- [ ] Approve is disabled with one pending comment and enabled with none.
- [ ] Approving `DEMO-1`'s spec writes `specs/DEMO-1/plan.md` (starting with its `Source spec:` line) and `tasks.json`, and no `tasks/todo.md`, in 3 of 3 runs.
- [ ] A plan whose `Source spec:` names another file shows the error.

**Verification:**
- [ ] `npm test && npm run check`
- [ ] Manual check: three runs; `ls specs/DEMO-1 tasks 2>&1`

**Dependencies:** t12

**Files likely touched:**
- `mods/specr/ui/side.js`, `mods/specr/main.js`, `mods/specr/io/agents.js`

**Estimated scope:** Small

## Task 14: Changes since the last round

**Description:** When the document differs from the last round's copy, mark `new` and `changed`
sections in the margin, list removed sections at the top, add a "Changed only" toggle, and show
last round's comments as anchored (muted highlight), "moved?" or outdated.

**Acceptance criteria:**
- [ ] After an agent edits one section, only that section is marked and "Changed only" shows just it.
- [ ] Every round-1 comment shows as anchored, "moved?" or outdated.

**Verification:**
- [ ] `npm test && npm run check`
- [ ] Manual check: submit round 1, edit the file by hand, `herdr-app shot`

**Dependencies:** t13

**Files likely touched:**
- `mods/specr/ui/document.js`, `mods/specr/ui/side.js`, `mods/specr/main.js`

**Estimated scope:** Medium

## Checkpoint: Phases

Item `c3`, after t12 to t14:
- `npm test` and `npm run check` pass
- New spec → review round 1 → agent revises → round 2 shows the changes → approve → the plan arrives at its path with `tasks.json` and no `todo.md`

## Task 15: Dispatch to Shepherdr

**Description:** Approving the plan validates `tasks.json`. Errors: list them all, dispatch
nothing, offer "Send to plan agent". Valid: show the preview (one row per item: title, repo,
deps, model, exact argv) with the review toggle; Confirm runs `herdr-task add --json` per item in
order, records refs, then `herdr-task start` for each; flag any item whose returned `mode` is
`here`; on failure stop and keep the refs, and running dispatch again finishes the rest.

**Acceptance criteria:**
- [ ] A `tasks.json` with a cycle and an unknown repo shows both errors and creates no tasks.
- [ ] A valid two-repo file with a checkpoint creates every item titled `DEMO-1 · …` with the right `--folder`, `--after` and `--model` (`herdr-task list --json`), and the checkpoint waits on its tasks.
- [ ] After a forced failure, running dispatch again creates only the missing items.
- [ ] With the plan agent in auto mode, every item's stored `queue.argv` ends in `--permission-mode auto`; with it in another mode, Shepherdr's Settings decide.

**Verification:**
- [ ] `npm test && npm run check`
- [ ] Manual check: two scratch repos; `herdr-task list --json --folder <repo>` for each; `herdr-task show <ref> --json` for `queue.argv`; remove the scratch tasks afterwards

**Dependencies:** c3

**Files likely touched:**
- `mods/specr/ui/dispatch.js`, `mods/specr/io/herdr-task.js`, `mods/specr/main.js`

**Estimated scope:** Medium

## Task 16: Build status

**Description:** In "Build", list the spec's items grouped by repo with their Shepherdr state and
PR link and a `done/total` count, polling `herdr-task list --json --folder <repo>` every 10 s
only while the window is visible. Clicking an item opens it in Shepherdr's Tasks tab when a
command for that exists, otherwise copies its ref.

**Acceptance criteria:**
- [ ] States change in the pane within 15 s of changing in Shepherdr.
- [ ] No polling while the window is hidden.

**Verification:**
- [ ] `npm run check`
- [ ] Manual check: start and finish a scratch task; watch the pane

**Dependencies:** t15

**Files likely touched:**
- `mods/specr/ui/build.js`, `mods/specr/io/herdr-task.js`, `mods/specr/main.js`

**Estimated scope:** Small

## Checkpoint: Dispatch

Item `c4`, after t15 and t16:
- `npm test` and `npm run check` pass
- A dispatched scratch spec's tasks show their states in the pane, and the checkpoint task waits on its phase

## Task 17: End-to-end run and publishing files

**Description:** Write `test/e2e.md` (the spec's end-to-end checklist) and run it in full in a
scratch folder with two scratch repos. Write `RECIPE.md` from the real files per Herdr's sharing
rules, take `preview.png`, and write `README.md` (install, `mmdc` setup with
`PUPPETEER_SKIP_DOWNLOAD`, agent-skills version note). Check whether `specr` is free on
herdr.dev/mods.

**Acceptance criteria:**
- [ ] Every spec success criterion is ticked in `test/e2e.md` with the date and versions used.
- [ ] `RECIPE.md` follows Herdr's six-part order; `preview.png` shows the review pane with comments and a diagram.

**Verification:**
- [ ] `npm test && npm run check`
- [ ] Manual check: the full `test/e2e.md` run

**Dependencies:** c4

**Files likely touched:**
- `test/e2e.md`, `RECIPE.md`, `preview.png`, `README.md`

**Estimated scope:** Small

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| The phase agent ignores the injected path or writes `tasks/todo.md` | High | t12 and t13 measure it 3 of 3 against agent-skills 0.6.18; the spec's fallback moves files into place |
| Parallel UI workers conflict on `main.js` | Medium | UI tasks are chained; only the core tasks run in parallel |
| A GPUI quirk like the render-time `notify` | Medium | The no-work-in-`render()` rule; a dev command loop and `herdr-app shot` in every UI task |
| Shepherdr's `herdr-task` changes shape | Medium | All calls live in `io/herdr-task.js`; argv is tested exactly; versions recorded in `test/e2e.md` |
| Testing dispatch creates real Shepherdr tasks | Medium | Scratch repos only, removed after each run |
| The symlinked mod doesn't hot-reload | Happened (Task 1) | `link.sh` copies; re-run `npm run link` after edits |
| `mmdc` and Chrome are heavy for other people | Low | Optional; source plus install note without it |

## Open Questions

- Confirm the proposed answers to the spec's Q1 (settings in `localStorage`) and Q2 (poll every
  10 s while visible).
- The spec's Q4 (an opt-in block in `AGENTS.md`/`CLAUDE.md`) is not in this plan; add a task after
  the MVP if wanted.
