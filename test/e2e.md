# End-to-end checklist: specr MVP

Run in a scratch folder that holds two scratch git repos (`api/`, `web/`) and no other specs.
Copy the mod with `npm run link`, put `mmdc` on `PATH`, open **specr: Open** from a terminal in the
scratch folder. Each item below is one success criterion from
[specs/specr-mvp/spec.md](../specs/specr-mvp/spec.md). Tick it with the date and versions used.

Versions: agent-skills 0.6.18 · Claude Code 2.1.332 · mmdc 12.2.0 (spike install) · Herdr/Shepherdr 3.1.3 `herdr-task` ·
macOS (Darwin 25.5.0).

**Status of this run (2026-11-26):** the automated checks pass. The live, hand-driven items were
**not run**: the worker that wrote this file could open the pane from the command line but could
not choose its folder, type, click or select text in the Herdr window, so nothing below marked
"manual" was done. Leave those boxes unticked until someone runs them and writes the date.

## Automated

- [x] 9. `npm test` (179 pass) and `npm run check` pass. 2026-11-26, Node as installed, `herdr-app check mods/specr`.

## Manual (each needs the live window)

- [ ] 1. **S1** New spec with ID `DEMO-1` writes `specs/DEMO-1/spec.md`, not `SPEC.md`, in 3 of 3 runs. Date: ___ Model/skills: ___
- [ ] 2. **S3** Comments on a paragraph, a table cell, two list items and text after a diagram report
  lines that match `sed -n '<a>,<b>p'`. (Use `test/fixtures/specs/PROJ-123/spec.md`; the spike
  checked the same cases from code, not by mouse.) Date: ___
- [ ] 3. **S4** Submit puts exactly one message in the owner's terminal (`hc read`) and saves round 1.
  With the owner closed, Submit opens a new `<ID> spec` tab that receives the review. Date: ___
- [ ] 4. **S5** After the agent edits the file, round 2 marks the edited sections; every round-1
  comment is anchored, "moved?" or outdated. Date: ___
- [ ] 5. **S6** Approve is disabled with a pending comment. Approving the spec writes `plan.md` and
  `tasks.json` at their spec-folder paths and no `tasks/todo.md` (check with agent-skills 0.6.x and
  an older install). Date: ___
- [ ] 6. **S7** A `tasks.json` with a cycle and an unknown repo shows both errors and creates no
  tasks. A valid two-repo file with one checkpoint creates every item with the right `--folder`,
  `--after`, `--model`, titled `DEMO-1 · …`. Re-running after a forced failure creates only the
  missing items. With the plan agent in auto mode every item's `queue.argv` ends in
  `--permission-mode auto`; in another mode, none does. Date: ___
  (Clean up the created tasks afterwards: `herdr-task rm`.)
- [ ] 7. **S8** Both fixture diagrams render in dark and light; with `mmdc` off `PATH` they show as
  source with the install note. Date: ___
- [ ] 8. **S2** Adopting `PROJ-9.md` leaves the file in place and reviews it like any other spec. Date: ___
- [ ] 10. **S11** With specr open, `specs/PROJ-9/spec.md`, `SPEC.md` and `SPEC-auth.md` written by
  hand are each listed under Found within 2 s with one notification. Adopt opens them with the IDs
  `PROJ-9`, the typed one, and `auth`; a `tasks/plan.md` whose `Source spec:` names `SPEC.md` is
  attached. Dismiss survives a restart. `docs/notes.md` and `specs/PROJ-9/notes.md` are never offered. Date: ___

## Also check by hand

- [ ] S9: after dispatch, Build lists items by repo with Shepherdr state and `n/m done`, refreshing every 10 s.
- [ ] S10: with several specs in the folder, the list shows ID, title, phase, pending, tasks.
- [ ] Wide diagram: click opens it at natural size, scrollable.

## Partial evidence from this run

On 2026-11-26 the mod was installed with `npm run link`, `herdr-app check` passed, and a scratch
folder with a seeded spec and three pending comments was prepared. Opening the pane on it from the
CLI showed "No specs in this folder yet." because the folder could not be set, so no review-pane
screenshot was taken.
