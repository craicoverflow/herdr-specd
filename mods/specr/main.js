// specr: review specs and plans, then dispatch their tasks.
// Never start async work from render() (spike finding): work starts in init, timers or commands.
import { View, div } from "gpui-kit";
import { ScrollHandle, InputState } from "gpui-base";
import { focused, spaces, props, theme, nextCommand, watchFolder, openOverlay, closeOverlay, checking } from "herdr";
import { pieces } from "./core/pieces.js";
import { loadSpecs, loadSpec, saveState, specsDir } from "./io/files.js";
import { lineStarts } from "./core/anchors.js";
import { addComment, editComment, removeComment, pieceIndexAt, selectionAnchor } from "./core/comments.js";
import { list } from "./ui/list.js";
import { documentView } from "./ui/document.js";
import { Diagrams, isDark } from "./io/mermaid.js";
import { zoomView } from "./ui/diagram.js";

const POLL_MS = 1000; // a safety net under watchFolder: the view is never more than this stale

export default class Specr extends View {
  init(_props, cx) {
    // The terminal that was focused when the palette entry ran (or a folder given as a prop).
    // A new tab has no terminal yet, so fall back to the folder of the space it opened in.
    const f = focused();
    this.folder = props()?.folder ?? f?.cwd ?? spaces().find((s) => s.id === f?.space)?.folder ?? null;
    this.specs = [];
    this.errors = [];
    this.selected = null; // spec ID
    this.spec = null; // { state, path, doc }
    this.pieces = [];
    this.error = null;
    this.scroll = ScrollHandle.new();
    this.at = 0; // piece index for the `next` dev command
    this.sel = null; // the last settled selection as an anchor (ok) or { ok: false, reason }
    this.editing = null; // index of the pending comment being edited
    this.noteError = null;
    // A natural-size diagram window is this same mod opened with a `diagram` prop: it shows the picture only.
    this.zoom = props()?.diagram ?? null;
    if (this.zoom) return;
    this.diagrams = new Diagrams();
    this.docW = 800;
    this.settingsOpen = false;
    this.mmdcInput = InputState.new({ placeholder: "mmdc" });
    this.mmdcInput.set_value(this.diagrams.settings.mmdc);
    this.puppeteerInput = InputState.new({ placeholder: "/path/to/puppeteer.json" });
    this.puppeteerInput.set_value(this.diagrams.settings.puppeteer);
    this.input = InputState.new({ placeholder: "Comment on the selection" });
    this.input.on("submit", (_e, cx) => this.add(cx));
    this.editInput = InputState.new({ placeholder: "Edit the comment" });
    this.editInput.on("submit", (_e, cx) => this.saveEdit(cx));
    if (!this.folder) return;

    cx.spawn(async (cx) => {
      await this.reload();
      cx.notify();
    });
    // Folder watch: reload as soon as something under .specr or the shown document's folder changes.
    cx.spawn(async (cx) => {
      for (;;) {
        try {
          await watchFolder(this.watchDir());
        } catch {
          return; // the watch was refused (too many folders): the timer below keeps the view fresh
        }
        if (await this.reload()) cx.notify();
      }
    });
    cx.timer.every(POLL_MS, (cx) => {
      cx.spawn(async (cx) => {
        if (await this.reload()) cx.notify();
      });
      // A theme switch is noticed here and the diagrams are drawn again in the other theme.
      if (this.diagramsDirty || isDark() !== this.diagrams.dark) {
        this.diagramsDirty = false;
        this.renderDiagrams(cx);
      }
    });
    // Dev command loop: herdr-app do specr.<top|open-first|next|back>
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        await this.command(c);
        cx.notify();
      }
    });
  }

  // Draw the shown document's diagrams (one at a time). Called from init's tasks, timers and
  // handlers only, never from render().
  renderDiagrams(cx) {
    if (checking() || !this.pieces.some((p) => p.kind === "mermaid")) return;
    cx.spawn(async (cx) => {
      await this.diagrams.drain(() => this.pieces.filter((p) => p.kind === "mermaid").map((p) => p.code), cx);
    });
  }

  openZoom(pic, cx) {
    openOverlay({ mod: "specr", kind: "window", key: "specr-diagram", width: 0.8, height: 0.8, props: { diagram: pic } });
    cx.notify();
  }

  saveDiagramSettings(cx) {
    this.diagrams.update({ mmdc: this.mmdcInput.value(), puppeteer: this.puppeteerInput.value() });
    this.settingsOpen = false;
    this.renderDiagrams(cx);
    cx.notify();
  }

  watchDir() {
    return this.spec?.path ? this.spec.path.replace(/\/[^/]*$/, "") : specsDir(this.folder);
  }

  // Reads the folder again; true when something changed (so the caller notifies).
  async reload() {
    if (this.busy || this.saving) return false;
    this.busy = true;
    try {
      let changed = false;
      if (this.selected == null) {
        const { summaries, errors } = await loadSpecs(this.folder);
        const next = JSON.stringify([summaries, errors]);
        changed = next !== this.listKey;
        this.listKey = next;
        this.specs = summaries;
        this.errors = errors;
      } else {
        try {
          const spec = await loadSpec(this.folder, this.selected);
          if (spec.doc !== this.spec?.doc || JSON.stringify(spec.state) !== JSON.stringify(this.spec?.state)) {
            this.spec = spec;
            this.pieces = spec.doc == null ? [] : pieces(spec.doc);
            this.error = null;
            changed = true;
            this.diagramsDirty = true;
          }
        } catch (e) {
          if (this.error !== String(e.message)) changed = true;
          this.error = String(e.message);
        }
      }
      return changed;
    } finally {
      this.busy = false;
    }
  }

  // ---- comments: handlers run from events, never from render() ---------------------------------

  onSelect(i, selection, cx) {
    if (!selection) return; // keep the last selection: clicking the comment box clears it
    this.sel = selectionAnchor(this.spec.doc, this.starts(), this.pieces[i], selection.range);
    if (this.sel.ok) this.input.focus();
    cx.notify();
  }

  starts() {
    if (this.startsDoc !== this.spec.doc) {
      this.startsDoc = this.spec.doc;
      this.startsCache = lineStarts(this.spec.doc);
    }
    return this.startsCache;
  }

  add(cx) {
    if (!this.sel?.ok) return;
    this.change(cx, (s) => addComment(s, this.sel, this.input.value()), () => {
      this.input.set_value("");
      this.sel = null;
    });
  }

  edit(i, cx) {
    this.editing = i;
    this.editInput.set_value(this.spec.state.pending[i].body);
    this.editInput.focus();
    cx.notify();
  }

  saveEdit(cx) {
    if (this.editing == null) return;
    const i = this.editing;
    this.change(cx, (s) => editComment(s, i, this.editInput.value()), () => { this.editing = null; });
  }

  remove(i, cx) {
    this.change(cx, (s) => removeComment(s, i), () => { this.editing = null; });
  }

  jump(i, cx) {
    const at = pieceIndexAt(this.pieces, this.spec.state.pending[i].start);
    if (at >= 0) this.scroll.scroll_to_item(at);
    cx.notify();
  }

  // Apply a pure state change, show it at once, and save it. A refused change shows its reason;
  // a failed save puts the on-disk state back so the panel never shows what isn't saved.
  change(cx, fn, after) {
    let next;
    try {
      next = fn(this.spec.state);
    } catch (e) {
      this.noteError = String(e.message);
      cx.notify();
      return;
    }
    const prev = this.spec.state;
    this.spec = { ...this.spec, state: next };
    this.noteError = null;
    after();
    cx.notify();
    this.saving = true;
    cx.spawn(async (cx) => {
      try {
        await saveState(this.folder, next);
      } catch (e) {
        this.spec = { ...this.spec, state: prev };
        this.noteError = `Couldn't save the comments: ${e.message ?? e}`;
      } finally {
        this.saving = false;
      }
      cx.notify();
    });
  }

  async open(id) {
    this.selected = id;
    this.spec = null;
    this.pieces = [];
    this.error = null;
    this.at = 0;
    this.sel = null;
    this.editing = null;
    this.noteError = null;
    await this.reload();
  }

  async back() {
    this.selected = null;
    this.spec = null;
    this.listKey = null;
    await this.reload();
  }

  async command(c) {
    if (c === "top") this.scroll.scroll_to_item(0);
    else if (c === "open-first") {
      if (this.selected == null) await this.reload();
      if (this.specs[0]) await this.open(this.specs[0].id);
    } else if (c === "next") {
      this.at = Math.min(this.at + 1, Math.max(0, this.pieces.length - 1));
      this.scroll.scroll_to_item(this.at);
    } else if (c === "back") await this.back();
  }

  render(_cx) {
    const t = theme();
    if (this.zoom) return zoomView({ t, pic: this.zoom, onClose: () => closeOverlay(props().overlay) });
    if (!this.folder) return div().size_full().p(16).bg(t.background).text_color(t.foreground).child("No folder: focus a terminal first");
    if (this.selected == null) {
      return div().size_full().bg(t.background).text_color(t.foreground).child(
        list({ t, specs: this.specs, errors: this.errors, onOpen: (id, cx) => cx.spawn(async (cx) => { await this.open(id); cx.notify(); }) }));
    }
    if (!this.spec) {
      return div().size_full().p(16).bg(t.background).text_color(t.muted).child(this.error ?? "Loading…");
    }
    return div().size_full().bg(t.background).text_color(t.foreground).child(
      documentView({ t, spec: this.spec, doc: this.spec.doc, pieces: this.pieces, scroll: this.scroll, error: this.error,
        comments: { sel: this.sel, input: this.input, editInput: this.editInput, editing: this.editing, error: this.noteError,
          onSelect: (i, s, cx) => this.onSelect(i, s, cx), onEdit: (i, cx) => this.edit(i, cx),
          onRemove: (i, cx) => this.remove(i, cx), onJump: (i, cx) => this.jump(i, cx) },
        diagrams: { store: this.diagrams, availW: this.docW - 48, onOpen: (p, cx) => this.openZoom(p, cx),
          onSize: (w, cx) => { if (Math.abs(w - this.docW) > 4) { this.docW = w; cx.notify(); } },
          settings: { open: this.settingsOpen, onOpenChange: (o, cx) => { this.settingsOpen = o; cx.notify(); },
            mmdcInput: this.mmdcInput, puppeteerInput: this.puppeteerInput, onSave: (cx) => this.saveDiagramSettings(cx) } },
        onBack: (cx) => cx.spawn(async (cx) => { await this.back(); cx.notify(); }) }));
  }
}
