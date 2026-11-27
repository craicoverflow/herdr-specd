# Evaluation: replacing specd's spec / plan / tasks.json trio

2026-11-27. Five designs were prototyped by parallel Sonnet agents in git worktrees. Each was
run headlessly against 9 visible fake specs, then blind against 5 held-out specs no implementer
saw. Dispatch was a dry run throughout: only a fake `herdr-task` ran, and the real Shepherdr has
no tasks from any of it.

The harness, corpora, results and per-design reports are on branch `uat/base` (under `uat/`) and on
the `uat/<design>` branches; paths below starting with `uat/` are on those branches, not on `main`.

## Recommendation

**Build design C, plus a few of B's person-facing pieces.** specd lets `/agent-skills:plan` run
natively. At Approve, specd derives its own dispatch list with **one LLM decomposition pass** over
whatever documents the spec has, stored internally as `.specd/specs/<ID>/manifest.json`.

| | what | from |
|---|---|---|
| ship now, any design | Adopted specs get default plan paths (today the plan agent is told `undefined`). IDs may start with a digit (`003-photo-albums`). Found also matches `PROJ-123.md` and `rfcs/*.md`. | all |
| plan phase | The prompt is the adapter's native command plus **location only**: "Save the plan to `specs/<id>/plan.md` and the task list to `specs/<id>/todo.md`". No format, no tasks.json. | C, B |
| dispatch list | One `claude -p` decomposition (sonnet, JSON schema, no tools) over every doc of the spec, validated with the existing graph checks, with one retry. | C |
| free paths | Legacy `tasks.json` v1 is read as-is. **Dispatch as one task** for a small ticket needs no model. | B, C |
| trust | The manifest is cached by the source files' hashes, so preview equals dispatch. On change: "tasks/todo.md changed since approval: 10 → 11 tasks; added: …", and Confirm refuses until re-previewed. Re-derives pass the previous ids so they stay stable. | B, C |
| rules | `[x]` and struck-out items are done: skipped, and deps on them are satisfied. An unresolvable repo is an error naming the task. | B, C |
| don't | A parser layer (B), keeping specd's format (A), agents writing Shepherdr tasks (D). | |

## Why

### Results

Verdicts are hand-checked: I read every held-out dispatch list against its story. Where my
verdict differs from the automatic scorer, the cell is marked †.

| design | visible (9) | blind held-out (5) | model calls per approval | core+io lines |
|---|---|---|---|---|
| baseline (today) | 1 (legacy only) | 0 | 0 | 0 |
| A: keep specd's formats, patched | 5 score-pass; v1/v4/v5 dispatch fine but plan differs | 2 (h1†, h5); h4 list right but its flow refused the doc; h2 ✗; h3 ✗ | 1 "Write tasks.json", $0.54–0.67, 11–22 s; up to $1.39 with a retry | +207 −42 |
| B: native plan + parsers, LLM fallback | **9** | **2** (h3, h5); h1† ✗ duplicate work; h2 ✗; h4 ✗ | 0 for known shapes; fallback 6 s, $0.13 | +753 −29 |
| **C: native plan + one LLM decomposition** | **8 in both runs** (v6 grouping) | **5 in both runs** (h1†) | 1, 7–22 s, $0.04–0.21 (two outliers at $0.60–0.61, likely uncached prompts) | +296 −32 |
| D: agents create Shepherdr tasks | 3 (v4, v11 not measured) | 3 of 3 run (h4†) | 1 agent run, 48–121 s, $0.74–1.12 | +302 −4 |

### What decided it

1. **`/agent-skills:plan`'s native format varies from run to run.** The same model and skill wrote
   `## Task 0: …` sections for one spec and `### - [ ] Task 1 \`[api]\`: …` under phase headings for
   another, with dependency lines like "Task 1 (Task 2 for the name combination)". Anything that
   parses the native output has to absorb that variance.
2. **specd must still choose where the plan goes.** In a real run with no path given, the skill
   **refused to plan**, because `tasks/plan.md` held another spec's unfinished plan (v4). Told
   "save to `specs/export/plan.md`", it complied in its native format. So: inject the location,
   never the format.
3. **Parsers overfit: B was 9/9 visible but 2/5 blind.** Its extractors were confidently wrong on
   shapes they hadn't seen, so the LLM fallback never ran:
   - The RFC's rollout table and the colleague's `1)` list each became **one task** (the doc
     wasn't recognised as a plan).
   - Kiro's tasks were dispatched as **both parents and sub-tasks**, which is duplicate work,
     chained one after another.

   Deterministic results looked trustworthy and weren't. It is also the largest design (753 lines).
4. **One decomposition pass generalised.** C passed every held-out shape in both runs: a Kiro
   spec, an RFC with frontmatter and a rollout table, a half-built native plan with `[x]` items, a
   messy prose list across two repos, and a GitHub epic. It skipped done work and put every
   multi-repo item in the right repo. It's small and costs cents.
5. **A keeps the rigidity it was meant to remove.**
   - It still needs `section` strings to match plan headings, so the RFC failed after a retry:
     "section "Lua script + Go client…" is not a heading in plan.md".
   - It re-dispatched the four tasks already ticked done (h3).
   - It overrides the native plan format and writes `specs/<id>/tasks.json` into your repo.
   - It pays for a model call anyway.
6. **D works but is the wrong trade.**
   - The agents built valid graphs and followed agent-skills' tracker mode every time.
   - Each run took 1–2 minutes and about $1.
   - Agents paraphrased titles even when told to copy them verbatim.
   - The tasks sit in Shepherdr's Tasks tab **before** you approve the plan.
   - Re-planning needs another agent run to sync the tasks (built, never measured).

### C's weak spots, and what to do about them

| weak spot | evidence | mitigation |
|---|---|---|
| Granularity for many tiny steps | spec-kit: the stories were grouped right, but Setup and Foundational were split | The prompt already asks for grouping. Add one line per adapter ("spec-kit: one item per phase/story") and an **Ask again with a note** action in the preview |
| Run-to-run variance | Identical items across runs: v7 5/5, v2 9/10, v11 10/11, v1 7/10. Pass/fail never changed | Cache the manifest by hash; you approve the list you see; pass the previous ids on re-derive (built in C) |
| Latency | 7–22 s per approval; v11's re-derive was 28 s across 2 calls | Run it from the approve handler with `exec(…, {timeout: 120000})` (Herdr allows up to 10 minutes) and show progress |
| Checkpoints and "run these one after another" advice | C honours the advice, so it serialises a bit more than the plan's dependency lines strictly need | Fine: that's the plan's own intent |

## Things worth fixing now, whatever you choose

- `mods/specd/core/adopt.js` / `mods/specd/core/state.js`: adopting a lone spec stores only `{spec}`, and `planApproval`
  then prompts with `undefined` paths. With just this fixed, today's design ran v1, v4 and v5 end to
  end (`uat/results-coordinator/baseline-pathfix/` on `uat/base`).
- `mods/specd/core/state.js` `ID_RE` rejects digit-first IDs. spec-kit folders are `003-name`, and Found
  pre-fills them, then Adopt refuses them.
- A spec plus a plan with no tasks file passes Approve, then crashes with the raw
  "Cannot read properties of undefined (reading 'startsWith')".
- The same file adopted twice under two IDs silently creates a duplicate spec.

## herdr-jira integration points

From reading herdr-jira 0.5.0. The helper CLI `~/.config/herdr-app/mods/jira/.bin/herdr-jira api <op>`
returns one JSON object per call and uses no LLM.

1. **Already nearly free: worker branches show the ticket.**
   - specd titles workers `<ID> · <title>`, and Shepherdr slugs titles into branches (`task/22-…`).
   - herdr-jira finds Jira keys anywhere in a branch name, case-insensitively (`branch.go`), and
     confirms them with Jira.
   - So a spec whose ID is `PROJ-123` gets `task/31-proj-123-…` branches that herdr-jira labels
     PROJ-123.
   - Still to check: whether Shepherdr worker panes count as spaces for the "working on it" list.
2. **Adopt from Jira.** `api issue PROJ-123` returns the description already converted to markdown,
   plus sub-tasks and a URL. specd's Adopt gains "from Jira issue". This is v8 made native, with no
   pasted file and no change to herdr-jira. The ID defaults to the key.
3. **Start work → Write a spec.** herdr-jira's Start work sheet gets a third option. It opens specd's
   New spec with ID = key and brief = the issue text (herdr-jira's `agentTask`), via one
   `run("tab.new", {mod: "specd", props: {new: …}})`.
4. **Progress back to Jira (opt-in per folder).**
   - On Approve spec, Approve plan, dispatch and all done, specd posts a short markdown comment
     (`api comment`).
   - It can optionally move the issue (`api transition`).
5. **Not yet: Jira as the task list.** agent-skills' tracker mode could create Jira sub-tasks, as
   design D does with Shepherdr. herdr-jira can't create sub-tasks (`create` takes no parent) and
   reads no issue links, so there are no dependencies. It would also duplicate Shepherdr's status
   tracking. D's results argue against it anyway.

## Caveats

- **The usage limit stopped every agent three times.** As a result, A's and D's plan-agent runs
  used sonnet rather than opus, and their v1, v4 and v5 lists are coarser than the native-opus
  reference. Those cells measure plan quality, not dispatch. D's v4 and v11 were never run.
- **The scorer matches titles loosely.** Every held-out list was checked by hand (the † cells). B
  also caught a scorer bug (a shared seen-set in `closure()`). It was fixed in 4614a79 on `uat/base`, and
  every result was re-scored with `uat/rescore.mjs`.
- **I wrote both corpora.** Two cases are real (both native plans and the v4 refusal are unedited
  `claude -p "/agent-skills:plan"` output), but the rest is less varied than real life.
- **No design is wired into the UI.** Every flow ran through `core/` and `io/` as the handlers
  would call them.

## Where everything is

- **Branches and worktrees** (in `../herdr-specd-uat/<name>`): `uat/base` (harness, corpora, and
  this evaluation as `uat/EVALUATION.md`), `uat/baseline`, `uat/a-patch`, `uat/b-derived`, `uat/c-llm`, `uat/d-shepherdr`. Each
  design has `uat/results/<design>/REPORT.md`. Nothing is pushed, and `main` is untouched.
- **Blind runs** (on `uat/base`): `uat/heldout/` (the 5 specs) and `uat/results-heldout/run{1,2}/<design>/`.
- **Rerun:**
  `node --import ./uat/register.mjs uat/run.mjs --driver uat/drivers/<d>.mjs --all uat/corpus`
  inside a design's worktree.
- **Clean up:**
  `git worktree remove ../herdr-specd-uat/<name>` for each, then `git branch -D uat/<name>`.
