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
