# Troubleshooting

Find your symptom, then follow the fix. Each ends with what you should see.

- [Diagrams show as source (`mmdc` missing)](#diagrams-show-as-source-mmdc-missing)
- [`herdr-task` not found](#herdr-task-not-found)
- [The `specd` layout isn't listed](#the-specd-layout-isnt-listed)
- [specd opens as a tab](#specd-opens-as-a-tab-not-in-the-specd-layout)
- [The panel is too narrow](#the-panel-is-too-narrow)
- [My instructions weren't applied](#my-instructions-were-not-applied)

## Diagrams show as source (`mmdc` missing)

**Symptom:** a mermaid fence shows its source with a note that `mmdc` isn't installed or failed.

**Why:** diagrams are drawn by `mmdc` (mermaid-cli). Without it everything else still works.

**Fix:**

1. Check it is on `PATH`: `command -v mmdc`.
2. If not, install it, reusing your Chrome instead of downloading ~150 MB of Chromium:

   ```sh
   PUPPETEER_SKIP_DOWNLOAD=1 npm install -g @mermaid-js/mermaid-cli
   echo '{ "executablePath": "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "headless": "shell" }' > ~/.mmdc-puppeteer.json
   ```

3. In specd's **Settings → Diagrams**, set **puppeteer config** to `~/.mmdc-puppeteer.json`, and
   **mmdc path** if `mmdc` isn't on the `PATH` Herdr sees (a GUI app often has a shorter `PATH` than
   your shell; use the full path from `command -v mmdc`).

**Expected:** the diagram turns into a picture. Tested with `@mermaid-js/mermaid-cli` 12.2.0.

## `herdr-task` not found

**Symptom:** approving a plan or **Confirm** fails with an error about `herdr-task`, or the Tasks
board stays empty.

**Why:** specd hands tasks to Shepherdr through its `herdr-task` command (written against 3.1.3).

**Fix:**

1. In a terminal: `command -v herdr-task`. Nothing printed means Shepherdr isn't installed or its
   folder isn't on `PATH`; install it per Herdr's docs.
2. If it works in your shell but not in specd, Herdr was started without that `PATH` (a GUI app
   doesn't read your shell profile). Add its folder to the `PATH` Herdr starts with, then restart
   Herdr.

**Expected:** `herdr-task list` prints in your shell; **Approve plan** shows the dispatch preview.

## The `specd` layout isn't listed

**Symptom:** `layout.switch` says the layout doesn't exist, or the layout list has no `specd`.

**Fix:**

1. `ls ~/.config/herdr-app/layouts/` should show `specd.json` and `specd.svg`. If not, run
   `sh scripts/link.sh` from the repo. With `HERDR_APP_HOME` set, look in that folder instead.
2. Check the file parses: `python3 -m json.tool ~/.config/herdr-app/layouts/specd.json > /dev/null`.
3. `herdr-app status` shows any errors Herdr hit loading it.

**Expected:** `herdr-app do layout.switch '{"name":"specd"}'` changes the window.

## specd opens as a tab (not in the specd layout)

**Symptom:** **specd: Open** opens a new tab, and the right panel has no specd.

**Why:** specd is a panel only while the `specd` layout is shown. In any other layout it opens a tab,
as it always did.

**Fix:** `herdr-app do layout.switch '{"name":"specd"}'`, then pick specd from the panel icons (top right). Palette commands now focus the panel.

**Expected:** **specd: Open** shows the Specs list in the panel and no tab appears.

## The panel is too narrow

**Symptom:** the review is cramped, or the document is a short strip.

**Why:** the panel can be dragged between 280 and 900 px; its default is 510 px. Below 640 px
specd folds the review into one column, with the comment column under the document. That is by
design, not a fault. At 280 px the document is a short scroll region.

**Fix:** drag the divider between the agent and the panel to widen it, or:

```sh
herdr-app do layout.resize '{"id":"panel","px":700}'
```

**Expected:** at about 700 px the document and the comment column sit side by side. The agent pane
gets narrower in return.

## My instructions were not applied

**Symptom:** a worker or coordinator ignored what you wrote under **Settings → Agents**.

**Check, in order:**

1. **Which text applies here.** Open **Settings → Agents** in the folder you work in. Each role says
   "Applies here: from this folder (n chars)", "your default (n chars)" or "none". A **folder
   override replaces your default** (it isn't added to it), even an empty one. The override is the
   `instructions` entry in the folder's `.specd/config.json`; clear it in Settings to fall back to
   your default.
2. **Workers: look at the dispatch preview.** It shows "Worker instructions: from this folder
   (n chars)" above the tasks. If it says nothing, the text is empty for that folder.
3. **Timing.** Worker instructions lead the prompt of tasks created *after* you saved them; tasks
   already created keep the old prompt. Coordinator instructions are sent once, right after a *new*
   coordinator starts, so they don't reach one that is already running, and they are only sent while
   the specd layout is shown. Save, then dispatch again or start a new coordinator.
4. **Saved?** Settings saves as you type. Close and reopen the page; the text should still be there.
   If `.specd/config.json` isn't valid JSON, specd leaves it alone and says so: fix it by hand.

**Expected:** the preview shows the source and length you expect, and new tasks carry the text.
See [Agent instructions](agents.md).
