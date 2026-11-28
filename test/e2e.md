# End-to-end checklist: specd MVP

Run in a scratch folder that holds two scratch git repos (`api/`, `web/`) and no other specs.
Copy the mod with `npm run link`, put `mmdc` on `PATH`, open **specd: Open** from a terminal in the
scratch folder. Each item below is one success criterion from
[specs/specd-mvp/spec.md](../specs/specd-mvp/spec.md). Tick it with the date and versions used.

Versions: agent-skills 0.6.18 · Claude Code 2.1.332 · mmdc 12.2.0 (spike install) · Herdr/Shepherdr 3.1.3 `herdr-task` ·
macOS (Darwin 25.5.0).

**Live run, 2026-11-26** (Herdr.app 0.1.18, Shepherdr 3.1.3, Claude Code 2.1.332, agent-skills 0.6.18,
Opus 5.5 plan agents, Sonnet workers). Driven from the shell with `tab.new {props: {folder}}` and the
dev commands (`open-first`, `next`, `approve`, `confirm`) in scratch folders under `~/specd-e2e`.
Items that need typing, clicking or selecting in the window were not done and stay unticked.

## Automated

- [x] 9. `npm test` (185 pass) and `npm run check` pass, after the two fixes below.

## Live results

- [ ] 1. **S1** Not run through the dialog (typing needed). HS-14's evidence stands: 3 of 3 headless
  runs of specd's exact first message wrote only `specs/DEMO-1/spec.md`.
- [ ] 2. **S3** Not run (mouse selections). Covered in code by the anchors tests only.
- [ ] 3. **S4** Not run (Submit click). Bug 3 below also hung Submit's `saveRound`; fixed, not yet seen live.
- [ ] 4. **S5** Not run (needs a submitted round).
- [x] 5. **S6** Approve is disabled with a pending comment ("Submit or remove the 1 pending comment
  first"). Approving starts the plan agent (`--session-id` recorded). 3 of 3 runs wrote `plan.md`
  starting with its `Source spec:` line and `tasks.json` at the spec folder's paths, no `tasks/todo.md`,
  and the spec moved to Plan · review by itself. Older agent-skills install not checked.
  Only 1 of 3 `tasks.json` files was valid on its own merit (Bug 1, now fixed; a fourth run after the
  fix was valid).
- [x] 6. **S7** (after fixing Bugs 3 and 4) Invalid `tasks.json` (DEMO-2's own, and a cycle plus an
  unknown repo) shows every error and creates nothing. A valid two-repo file with a checkpoint creates
  every item titled `DEMO-1 · …` with the right `--folder`, `--model` and `--after` (the checkpoint
  waits across repos). A forced failure (`web/.git` hidden after the preview) created only `t1`; the
  re-run created only `t2` and `c1` and kept `t1`'s ref. Plan agent in auto mode: every stored argv
  ends in `--permission-mode auto`; in manual mode: none does (Settings' `default`).
- [x] 7. **S8** Both fixture diagrams render in the window (dark); with `mmdc` off `PATH` they show as
  source with the install note. Light theme checked headlessly with specd's own `mmdcArgs`
  (`-t default -b transparent`); a live theme switch was skipped (it would change the person's layout).
- [ ] 8. **S2** Not run (file picker).
- [ ] 10. **S11** Partly: four specs written by hand (`specs/PROJ-8/spec.md`, `SPEC.md`, `SPEC-auth.md`,
  `spec/billing.md`) were all listed under Found within 2 s with one notification each, and
  `docs/notes.md` and `specs/PROJ-8/notes.md` were never offered. Adopt and Dismiss not clicked.
- [x] **S9** Build lists the items by repo with Shepherdr's state and `0/3 done`, polling every 10 s.
- [ ] **S10** Not checked with several specs in one folder.
- [ ] Wide diagram click-to-zoom: not clicked.

## Bugs found

1. **Fixed:** the plan prompt (`core/instructions.js`, `planInstructions`) never gave the `tasks.json`
   schema, only "tasks.json, version 1". DEMO-1's agent read specd's installed `core/tasks.js` to learn
   it; DEMO-3's copied DEMO-1's file; DEMO-2's invented its own. The prompt now carries a JSON example
   (`tasksExample`, checked against `validateTasks` in `test/instructions.test.mjs`) and the rules.
   Live re-run (DEMO-4): valid `tasks.json` with no validator errors, without reading specd's source.
2. **Fixed:** in Plan · drafting the pane said "The plan document isn't there yet (…/spec.md)": after
   Approve it kept the spec's path. `shownDocPath` now gives the phase document's path (test added).
3. **Fixed:** in a mod, `fs/promises` writes outside `~/.config/herdr-app` never settle. `writePromptFile`
   (dispatch) and `saveRound` (Submit) called `fs.mkdir` there, so Confirm silently did nothing (and every
   later Confirm was ignored). Herdr's `writeTextFile` creates missing folders itself; the `fs.mkdir`
   calls are gone.
4. **Fixed:** Claude Code 2.1.x records the mode in `{"type":"permission-mode"}` entries (also on a
   shift+tab switch with no message), not only on user entries, so `readPermissionMode` returned
   nothing and workers never inherited auto mode. It now reads both; test added.

Nits: a Found notification for `specs/PROJ-8/spec.md` says "spec.md" rather than the ID; after
dispatch the view still says "Nothing runs until you confirm"; a phase agent started in a folder
Claude hasn't seen before waits at Claude's "trust this folder?" prompt and specd doesn't show it.

---

## specd layout

Run against [specs/specd-layout/spec.md](../specs/specd-layout/spec.md)'s success criteria and the live items
of its Testing strategy. Setup per the live-check protocol: back up `~/.config/herdr-app/mods/specd` and
`layouts/specd.json`, `npm run link`, `layout.switch {name: "specd"}`, a scratch space under `~/specd-e2e`
(two git repos `api/`, `web/`, the `examples/checkout` spec adopted by writing its `state.json`; never
`/private/tmp`), `herdr-app do specd.<cmd>`, `herdr-app shot`. Afterwards: the person's layout switched back
to `shepherdr`, scratch space closed, scratch folder deleted, backups restored, `herdr-app status` shows
`"errors": []`.

**Live run, 2026-11-28** (Herdr.app 0.1.18, Shepherdr layout 0.1.18 (`cloned_from`), Claude Code 2.1.332,
agent-skills 0.6.18, mmdc on `PATH`, macOS Darwin 25.5.0). As in the MVP run, nothing that needs a click,
a drag or typing in the window was done (`herdr-app do` has no pointer or key input).

- [x] **L1. specd in the right panel, no Artifacts.** `layout.switch specd`, then `layout.select
  {stack: panel-body, child: specd}`: the panel shows the Specs list beside the agent's terminal, and the
  layout's panel stack is Files, Changes, Tasks, specd (`test/layout.test.mjs`, passes). Tasks board seen
  beside the agent in the same layout. `docs/screenshots/layout-hero.png`, `specd-panel-list.png`.
- [x] **L2. Palette commands focus the panel.** `tab.new {mod: "specd", props: {tab: true, folder}}` (the call
  all three palette commands make) while the `specd` layout was shown: the new tab closed itself within
  ~300 ms and the panel showed the list (a settings page that was open was reset too). Typing the command
  into the palette itself was not done.
- [x] **L3. 280 px.** `layout.resize {id: panel, px: 280}`: the review folds to one column, the comment
  column (selection, pending, Approve) sits under the document, no sideways scroll, nothing cut at the
  right edge. The document is a short scroll region there, so its last visible line is clipped by design.
  `docs/screenshots/review-280px.png`.
- [x] **L4. 510 px (default).** The same review in the default panel: one column, the comment column
  under the document. `review-510px.png`.
- [x] **L5. 900 px.** `px: 900`: document and comment column side by side, diagram fits and says "Click to
  open at full size"; the agent pane is squeezed to nothing, as the layout's min/max allow. Not kept as a doc
  screenshot.
- [x] **L6. A new agent tab opens in Terminal.** `tab.new {argv: ["claude"]}` in the demo space: header
  `Claude Code`, Terminal selected, the CLI running. `terminal-header.png`.
- [x] **L7. Chat is one click away, and back.** `pane-chat.toggle` (the Chat/Terminal switch's own
  command) on the focused agent pane gave the chat view; a second toggle brought the terminal back.
  `chat-via-switch.png`. **Slip:** the first toggle was sent while the person had their own tab focused
  and switched their agent pane to Chat; it was switched back at once, nothing lost. Later toggles were
  sent only after `space.select` + `tab.select` on the demo tab (read back from `herdr-app status`).
- [ ] **L8. The Chat/Terminal choice survives a Herdr restart.** Not run: restarting the window ends
  the person's session. Task 1's spike (plan.md) found the `herdr.chat` core label; unchecked here.
- [x] **L9. Worker instructions show in the dispatch preview.** With `.specd/config.json` holding a worker
  instruction, `specd.spec-as-plan` shows "Worker instructions: from this folder (89 chars)" above the
  items. `dispatch-preview-instructions.png`.
- [ ] **L10. A dispatched task carries them, and the folder override beats the user default.** Not run:
  Confirm would create and start real tasks in the person's Shepherdr. Covered by `test/dispatch.test.mjs`,
  `test/agents.test.mjs` and the Task 7/9 proofs; no live prompt file was read this run. The user default
  was empty here, so "folder wins" was not exercised live.
- [ ] **L11. A new coordinator receives the coordinator instructions before its first message.** Not run
  live here (needs a new space's Assistant to start; Task 9/12's proof covers it). The Agents page showed
  "Applies here: from this folder (98 chars)". `agents-settings.png`.
- [ ] **L12. All specd-mvp flows work in the panel.** Partly: list, open, spec-as-plan, dispatch preview,
  settings, Back worked in the panel (`errors` empty). Comment (selection), Submit, Approve (starts a plan
  agent) and Confirm were not run.
- [ ] **L13. Outside the `specd` layout specd still opens as a tab.** A tab opened in `shepherdr`, but
  against the restored older installed copy, which always opens a tab, so this proves nothing. Covered by
  `test/place.test.mjs` (`placeFor`); redo with the current copy installed.
- [x] **L14. Installing and removing the layout leaves Herdr's shipped files untouched.** `test/layout.test.mjs`
  (link and `--remove` leave pre-existing files byte-identical) passes; live, the person's `shepherdr` layout
  was selected again and `herdr-app status` was clean.
- [ ] **L15. A new user can follow the README and guides.** The docs are Tasks 12-14 (HS2-16 to HS2-18);
  these are the screenshots they use.

Not built: `pane-specd` (Task 10 was "not needed": nothing opens an agent in Chat, so `pane-chat`
stays in the layout; L6 shows the Terminal-first behaviour as it is).

Screenshots (`docs/screenshots/`, taken in this run, the spaces sidebar cropped out because it holds the
person's other spaces): `layout-hero.png`, `specd-panel-list.png`, `review-510px.png`, `review-280px.png`,
`dispatch-preview-instructions.png`, `agents-settings.png`, `terminal-header.png`, `chat-via-switch.png`.

### Known limits (for the README)

- Terminal-first needs no header of its own today: agents already open in Terminal.
- At 280 px the document is a short scroll region above the comment column.
- Coordinator instructions only apply while the `specd` layout is shown and only to a coordinator that
  starts afterwards (as the Agents page says).
- `node --test test/` has one failure that depends on the live `~/.config/herdr-app/layouts/shepherdr.json`
  (`sizes, sidebar and tabs match shepherdr.json`): the person's file has an extra run-time block
  (`tasks-thread-term`) that the comparison doesn't ignore. Not caused by this work.

### Docs run-through, 2026-11-28 (HS2-18)

Followed the README quick start and each guide as written. Install and uninstall ran against a copy of
`~/.config/herdr-app` (scratch home under `$HOME`, `HERDR_APP_HOME` set, specd's own files removed from it
first). The UI steps ran in the live window with the current copy installed, then the backup was put back.
The repo folder stood in for the `git clone` step.

- README quick start, `sh scripts/link.sh` → matched (three `copied` lines and the note).
- README quick start, `layout.switch specd` → matched live (layout `specd`, Specs list in the panel);
  with the scratch home it says "no Herdr window at …/herdr-app.sock", as it has no window. **Fixed:** install
  guide now says to leave `HERDR_APP_HOME` unset for live steps.
- install 1, `herdr-app check` → matched (`check passed`). Mod loaded in the live window, `errors` empty.
- install 2, panel shows Specs list, New spec…, Adopt spec…, Settings → matched
  (the panel icons were not clicked: `layout.select` was used).
- install 3, agent opens in Terminal → matched earlier in L6; not repeated.
- install 4, switch back → matched (`shepherdr` restored, `errors` empty).
- install 6, `link.sh --remove` → matched (one `removed` line each for `specd.json`, `specd.svg`, `mods/specd`;
  none for `pane-specd`, which wasn't there); a second run printed nothing and exited 0.
- install 5 (update), troubleshooting "layout isn't listed" (`ls`, `json.tool`) → matched in the scratch home.
- README "Try it on the example" → **fixed:** said "from a terminal in `~/checkout-demo`" but specd uses the
  focused terminal's folder and a palette/tab open in the specd layout shows the panel for that folder, so
  the step now says to open a terminal tab there first. Adopt, comment, Approve plan, Confirm: not done
  (need clicks and typing; `herdr-app do` has none).
- review 1 (open), dispatch 2 and agents 1/3/4 → matched in L2, L9, L11 earlier; not repeated live.
- review 2 to 7, dispatch 1 and 3, agents 2 and 5: **not followed**: need typing, clicks or a real agent
  (Confirm creates real tasks). Their text stays marked ○.
- Installing then removing: `layouts/` and `mods/` file hashes in the scratch home identical before and
  after (1345 files). Herdr's `herdr-core/templates` unchanged (script never touches them).
- Real home after the live checks: same hashes for `layouts/`, `mods/` and templates, except Herdr's own
  run-time `layouts/.state/*.json`, which Herdr rewrites when a layout is switched. Scratch home,
  `~/specd-e2e-docs` and backups deleted.
