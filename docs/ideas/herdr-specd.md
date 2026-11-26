# herdr-specd

## Problem Statement

How might we take a feature from idea to merged PRs, across one or more repos, with Opus writing the
spec and plan, you reviewing each like a PR, and Sonnet workers building the planned tasks in parallel
herdr worktrees, without leaving Herdr or hand-copying the plan into tasks?

## What already exists (build on it, don't rebuild it)

- **Shepherdr tasks (`herdr-task`).** The CLI behind the Tasks tab ("the one way to change them").
  `add` already takes `--model`, `--effort`, `--agent`, `--worktree`, `--folder`, `--prompt-file`,
  `--after 3,5` (dependencies, including other folders' tasks such as `WEB-2`), `--set review=on|off`
  and `--finish-notes`. Workers run `ready`; Accept merges and opens the PR.
- **Artifacts (`herdr-artifact`).** Versioned recipes with a block-level "Mark up" that reaches the
  owning agent via `herdr-artifact note`. Not markdown, not batched, not line-level.
- **GPUI `TextView.markdown()`.** `on_selection_change` reports selections as UTF-16 offsets into the
  markdown source; `highlight_range(start, end, color)` paints source ranges. This is the primitive
  for inline comments on *rendered* markdown.
- **`hc send <terminal> <text>`.** Pastes text into an agent's input and presses enter (respects
  `draft_wait` while you're typing). This is how a review is submitted.
- **Constraints.** Herdr.app mods are JS + GPUI: no HTML, CSS or web view, but they can `exec`
  programs. Custom panels are window-only; the phone web app shows a still picture of them.

## Recommended Direction

A Herdr.app mod with two jobs: **reviewing documents** and **dispatching the plan**. Shepherdr does
everything else.

**A spec is a unit with an ID, not a file.** Every spec gets an ID when it's started or adopted,
usually a Jira key (`PROJ-123`), otherwise a slug. A folder can hold any number of specs at once.
The default layout is one folder per spec: `specs/PROJ-123/spec.md`, `plan.md` and `tasks.json`.
Paths come from the adapter's templates (`specs/{id}/spec.md`), which a folder can override. specd
injects the resolved path into the phase prompt, overriding the skill's own "save as SPEC.md".
Specs that already exist are registered with `specd adopt <path> --id PROJ-123 [--plan <path>]`.
specd only tracks specs you've started or adopted; it never guesses by scanning `.md` files.
Per-spec working state lives in `.specd/specs/{id}/` (phase, document paths, review rounds, and the
map from plan entries to Shepherdr task IDs).

**Review pane.** It opens a spec's phase document as rendered markdown, with mermaid fences rendered
to images. You select text and comment; each comment is tied to a source range and highlighted.
Comments build up as a pending review, and **Submit** sends them all at once (`hc send`) to the
agent that wrote the document, each with its source lines and the quoted text. Each submitted round
keeps a copy of the document, so round two opens on **"changes since your last review"**, and
comments whose quoted text is gone are marked outdated, as GitHub does.

**Adapters and dispatch.** An adapter is a manifest of phases: skill command, model, effort,
document, whether you review it, and a prompt suffix. The plan phase's suffix tells the agent to
also write `tasks.json` (id, title, repo, deps, plan section anchor), so specd never parses
LLM-written markdown, and a new framework is a new manifest, not a parser. Approving the plan
validates `tasks.json` against a schema, then creates the tasks in dependency order:
`herdr-task add "PROJ-123 · <title>" --folder <repo> --worktree --model sonnet --after <ids>
--prompt-file <the task's plan section>`. Each worker's prompt is scoped to "this task only, don't
edit any todo/checklist file, run `herdr-task ready` when done". Optional review is
`--finish-notes "Run /agent-skills:review before ready"`, so it can stay off at work, where a PR
bot reviews. Model defaults come from the adapter (Opus for spec and plan, Sonnet for build) and
can be overridden for each spec.

```jsonc
// adapters/agent-skills.json (the only adapter shipped)
{
  "id": "agent-skills",
  "paths": {
    "spec":  "specs/{id}/spec.md",
    "plan":  "specs/{id}/plan.md",
    "tasks": "specs/{id}/tasks.json"
  },
  "phases": [
    { "id": "spec",  "run": "/agent-skills:spec",  "doc": "spec", "model": "opus",   "review": true },
    { "id": "plan",  "run": "/agent-skills:plan",  "doc": "plan", "model": "opus",   "review": true,
      "emits": "tasks" },
    { "id": "build", "run": "/agent-skills:build", "fanout": true, "model": "sonnet", "mode": "worktree",
      "finishNotes": { "when": "review", "text": "Run /agent-skills:review before ready" } }
  ]
}
```

## Key Assumptions to Validate

- [ ] **The path in the prompt wins over the skill's own.** `/agent-skills:spec` says "save as
      SPEC.md" and `/agent-skills:plan` says "tasks/plan.md". Run each phase three times with the
      path injected. Fallback: specd moves the file into place when the phase ends.
- [x] **Mermaid renders natively with readable labels.** Validated in `spike/`: PNG via mmdc with
      system Chrome, theme-aware, 4.0 s cold / 1.7 s warm. SVG is out (`<foreignObject>` labels).
      Wide diagrams shrink to the pane's width and need zoom or horizontal scroll.
- [x] **Selection offsets survive splitting the document.** Validated in `spike/`: a real selection
      mapped to exact source lines; table cells, list items, astral characters and text after a
      diagram anchor correctly; `highlight_range` paints them. Still to check by hand: real
      selections inside tables and across list items.
- [ ] **Comments re-pin after the agent revises.** Find each quoted text again in v2; accept
      "outdated" when it's gone.
- [ ] **The plan agent reliably writes a valid `tasks.json`.** Run the plan phase with the suffix on
      three real specs and validate against the schema before dispatching.
- [ ] **Cross-folder `--after` works end to end.** In a two-repo spec, make repo B's task wait on
      repo A's and watch Shepherdr start it.
- [ ] **The adapter contract fits more than one framework.** Write spec-kit and Kiro manifests as
      test fixtures. If either needs a new field, the contract is wrong.

## MVP Scope

In order, each step usable on its own:

1. **Review pane** for a spec's documents: rendered markdown and mermaid, comments on selections,
   pending review, Submit through `hc send`, saved copies per round, and changes since the last
   round. Lists the folder's specs and their phases.
2. **Spec units, adapter loader and phase runner.** `specd new PROJ-123` and `specd adopt`; the
   agent-skills adapter; starts the spec and plan phases with Opus in an agent tab you can talk to,
   with the resolved path injected, and opens the review pane when the document appears.
3. **Dispatch.** Approving the plan validates `tasks.json` and creates the Shepherdr tasks with
   `--folder`, `--after`, `--model`, spec-ID titles and scoped prompts. Multiple repos are
   included: that's the common case, and it only costs a `repo` field.

## Not Doing (and Why)

- **A Specs board tab.** Shepherdr's Tasks tab shows status, and the review pane can show "Plan
  approved, 4/9 tasks done". Revisit after three real specs.
- **Shipping a second adapter.** Spec-kit and Kiro exist only as test fixtures for the contract.
  Ship one when someone uses that framework.
- **Parsing plan markdown.** The agent writes a structured task file instead. Regexes over LLM
  output break with every template change.
- **Finding specs by scanning `.md` files.** Guessing is unreliable; starting or adopting a spec is
  explicit and cheap.
- **A Jira tie-in** (seeding a spec from the ticket, putting the key into worker branch names for
  herdr-jira's sidebar). It fits naturally, but it's a second integration. Add it after dispatch
  works.
- **Reviewing on your phone.** Custom GPUI panels are window-only. A recipe-based fallback with
  block-level comments could come later.
- **A traceability matrix** (acceptance-criterion IDs → task proofs). The strongest follow-up, but
  it needs a criterion-ID convention in specs first.
- **Living spec / amendments from workers.** Real, but it only matters once dispatch exists and
  drift shows up.
- **Editing or re-planning tasks after dispatch.** Use Shepherdr directly; specd doesn't own tasks
  once they're created.
- **Bundling a mermaid renderer.** It's an optional dependency; without one, diagrams show as
  source.
- **Tracking worker state or scheduling.** Shepherdr owns both; specd only calls `herdr-task`.
- **Multiple machines.** Workers find the spec by its local absolute path.

## Open Questions

- **Plan checkpoints.** The agent-skills plan has "Checkpoint: review with human before proceeding"
  between phases. Turn each into a verification task (`--after` that phase's tasks), or drop them?
  Leaning towards verification tasks, which keeps "approve = dispatch" honest.
- **Who gets the review** when the agent that wrote the document has exited: resume that session,
  or start a fresh Opus with the document and the comments?
- **The spec phase.** A plain agent tab started by specd, or a Shepherdr task with `--here` so it
  shows up in the inbox and on the phone? It has to be a conversation either way:
  `/agent-skills:spec` asks clarifying questions.
- **Distribution.** How do other people install a Herdr.app mod? See `~/.config/herdr-app/AGENTS.md`,
  "Layouts and mods other people made".
- **`.specd/` in git?** Review rounds are personal working state (suggest gitignoring); the spec
  folders themselves are committed.
