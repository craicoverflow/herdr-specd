# Spike: mermaid + selection comments in a Herdr.app mod

Throwaway code that answers two questions from
[docs/ideas/herdr-specr.md](../docs/ideas/herdr-specr.md) before the review pane is specced:

1. Can a GPUI mod show mermaid diagrams with readable labels, in the dark theme?
2. Can a selection in *rendered* markdown become an exact source-line comment, batched into one review?

**Both: yes.** Details, numbers and gotchas below.

## What's here

| Path | What |
| --- | --- |
| `mod/` | Copy of the mod as tested (`main.js`, `logic.js`, `mod.json`). Live copy: `~/.config/herdr-app/mods/specr-spike/` |
| `fixtures/specs/PROJ-123/spec.md` | 272-line test spec: 2 mermaid diagrams, tables, nested lists, code, a 2-unit UTF-16 `𝑓` |
| `logic.test.mjs` | `npm test`: 13 checks on splitting, offset → line mapping, review text |
| `diagrams/`, `nohtml.json` | The CLI renderer test (PNG vs SVG labels) |
| `out/` (gitignored) | Screenshots and the submitted review message |

To try it: Herdr's command palette, "specr spike: review PROJ-123", or the `specr spike` tab in the
herdr-specr space. Select text, type a comment, Enter; Submit writes the message to `out/`. Shell
remote: `herdr-app do specr-spike.<demo|hl|d1|d2|top|end|submit|clear>`.

## Findings

### 1. Mermaid renders natively

- `@mermaid-js/mermaid-cli@12.2.0`, installed locally with `PUPPETEER_SKIP_DOWNLOAD=1` and pointed at
  the system Chrome (`puppeteer.json`), so there's no ~150 MB Chromium download. Still 192 npm packages.
- **PNG, not SVG.** mmdc's default flowchart SVG puts all 7 labels in `<foreignObject>`, which native
  SVG renderers drop. `htmlLabels: false` gets that to 0 but wasn't tried in GPUI; PNG at `-s 2`
  just works.
- **Theme-aware:** `-t dark` / `-t default` with `-b transparent`. The default theme draws black
  lines that vanish on a dark background, so the cache key is `hash(source)-theme`.
- **Timing, from inside the mod:** 4.0 s cold (Chrome starting), 1.7 s warm. Cached after that.
- **Problem: wide diagrams shrink.** The sequence diagram is fitted to the pane's width, so its
  labels are small. The real pane needs click-to-zoom, or natural size with horizontal scroll.

### 2. Selections map to exact source lines

- A real mouse selection in the live window reported `range [191, 290)`, mapped to **lines 6–7**
  with the round trip exact (`doc.slice(global) === piece.slice(local)`). The source's hard line
  break shows in the quote, even though the rendered view soft-wraps over it.
- Placed comments (same code path, offsets from `indexOf`) gave correct lines for a **table cell**
  (57), **two list items** (134–135), **text right after the astral `𝑓`** (104–105) and
  **after the second diagram** (222). Checked against `sed -n`.
- **`highlight_range` paints correctly** across a soft wrap, inside a table cell, and over inline
  code in a table.
- The batched message (`out/review-round-1-*.txt`) reads well: numbered comments, line numbers,
  `>`-quoted source, one closing instruction.

### 3. Platform gotchas (these cost four iterations)

- **Never start async work from `render()`.** `cx.notify()` while the render pass is running
  throws, and the spawned task dies silently. Here that left a diagram stuck on "rendering"
  forever, which looked like an `fs/promises` hang. It wasn't one: `fs.mkdir`, `exists`,
  `writeFile` and `readFile` all work. Start work from `init`, timers or commands.
- **Mod commands make the pane scriptable:** a `nextCommand()` loop plus `herdr-app do <mod>.<cmd>`.
  A `specr review PROJ-123` CLI can open and drive the pane the same way.
- **`scroll_to_item` only scrolls a whole child into view.** Jumping to a comment inside a long
  piece doesn't work. Splitting the markdown into pieces per heading section (not only around
  diagrams) gives jump targets, and also suits "changes since last round" per section.
- **A selection can't cross pieces.** Each piece is its own `TextView`. With pieces per section,
  you can't comment across two sections; that's acceptable, since GitHub can't comment across
  files either.

## Not verified

- Real mouse selections inside tables, across list items, and across a piece boundary (only the
  paragraph selection was done by hand). **Try these yourself in the tab.**
- Typing a comment in the `Input` and pressing Enter, in the live window.
- A live theme switch (the timer is there; light-theme PNGs were only checked from the CLI).
- `hc send` to a real agent; the message is written to a file instead.
- Specs much longer than 272 lines (this one scrolls smoothly).

## Implications for the spec

- Mermaid: PNG via mmdc, path configurable, detect it on `PATH`, show the source when it's missing.
  Document `PUPPETEER_SKIP_DOWNLOAD` plus the Chrome path for installs.
- Pieces: split at every heading as well as around fences; anchors stay whole-file offsets.
- Wide diagrams need zoom or horizontal scroll.
- Rule for every async path in the mod: no side effects in `render()`.
