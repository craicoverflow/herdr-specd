# specr

A [Herdr.app](https://herdr.dev) mod for spec-driven development. Review an agent's spec and plan
like a pull request (rendered markdown, mermaid diagrams, inline comments), then dispatch the plan's
tasks to [Shepherdr](https://herdr.dev) workers in worktrees.

Status: MVP. See [specs/specr-mvp/spec.md](specs/specr-mvp/spec.md) and
[test/e2e.md](test/e2e.md) (what was and wasn't run by hand).

## What it does

- **Spec units.** A spec has an ID (a Jira key such as `PROJ-123`, or a slug). Files live in
  `specs/<ID>/spec.md`, `plan.md`, `tasks.json`; specr's own state is in `.specr/specs/<ID>/`.
- **Review pane.** Select text, comment, build a pending review, Submit it as one message to the
  agent that owns the file. Each round is kept; the next round marks changed sections and shows
  which earlier comments are anchored, "moved?" or outdated.
- **Phases and dispatch.** Approving the spec starts the plan agent; approving the plan validates
  `tasks.json` and creates the Shepherdr tasks (`herdr-task add`), then shows their state.
- **Found specs.** Specs written by hand (`SPEC.md`, `SPEC-<id>.md`, `docs/SPEC.md`,
  `spec/<id>.md`, `specs/<id>/spec.md`) are listed under "Found" for one-click adoption.

## Requirements

- Herdr.app with Shepherdr (`herdr-task` on `PATH`). Written against Shepherdr 3.1.3's `herdr-task`.
- [agent-skills](https://github.com/addyosmani/agent-skills) for Claude Code. Checked with 0.6.18.
  On 0.6.x its planning skill honours "specr is the task list", so the plan agent writes
  `tasks.json` and no `tasks/todo.md`. On older installs this relies on specr's prompt alone; a
  stray `tasks/todo.md` is ignored.
- `mmdc` (mermaid-cli) for diagrams. Optional: without it diagrams show as source with an install
  note.

## Install

```sh
git clone https://github.com/craicoverflow/herdr-specr
cd herdr-specr
npm run link          # copies mods/specr into ~/.config/herdr-app/mods/specr
```

It copies rather than symlinks because Herdr doesn't hot-reload a symlinked mod folder. Re-run
`npm run link` after editing `mods/specr`.

Then open the command palette (`⌘⇧P`): **specr: Open**, **specr: New spec**, **specr: Adopt spec**.
The folder is the focused terminal's working directory (or the space's folder).

### mmdc setup

Skip the ~150 MB Chromium download and use the Chrome you already have:

```sh
PUPPETEER_SKIP_DOWNLOAD=1 npm install -g @mermaid-js/mermaid-cli
echo '{ "executablePath": "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "headless": "shell" }' > ~/.mmdc-puppeteer.json
```

In the pane header's diagram settings, set **mmdc path** (empty: found on `PATH`) and **puppeteer
config** (`~/.mmdc-puppeteer.json`). Tested with `@mermaid-js/mermaid-cli` 12.2.0. Diagrams render
to PNG, because mmdc's SVG labels use `foreignObject`, which native renderers drop.

## Develop

```sh
npm test          # node --test, no Herdr needed
npm run check     # herdr-app check mods/specr
```

Mod rule: never start async work from `render()` (see [spike/README.md](spike/README.md)).

## Adapters

One JSON file per spec framework, in `mods/specr/adapters/`: which paths, agent argv and prompt each
phase uses. `agent-skills.json` is the only one shipped; add another JSON file next to it (the installed mod's `adapters/` folder).

## Not done yet

Jira integration, phone review, a second shipped adapter, multi-machine. The name `specr` on
herdr.dev/mods could not be checked from the command line (the site is a client-rendered page that
answers 200 for any path); look it up in a browser before publishing.
