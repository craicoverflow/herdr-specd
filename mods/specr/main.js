// specr: review specs and plans, then dispatch their tasks.
// Never start async work from render() (spike finding): work starts in init, timers or commands.
import { View, div } from "gpui-kit";
import { ScrollHandle } from "gpui-base";
import { focused, spaces, props, theme, nextCommand, watchFolder } from "herdr";
import { pieces } from "./core/pieces.js";
import { loadSpecs, loadSpec, specsDir } from "./io/files.js";
import { list } from "./ui/list.js";
import { documentView } from "./ui/document.js";

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

  watchDir() {
    return this.spec?.path ? this.spec.path.replace(/\/[^/]*$/, "") : specsDir(this.folder);
  }

  // Reads the folder again; true when something changed (so the caller notifies).
  async reload() {
    if (this.busy) return false;
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

  async open(id) {
    this.selected = id;
    this.spec = null;
    this.pieces = [];
    this.error = null;
    this.at = 0;
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
        onBack: (cx) => cx.spawn(async (cx) => { await this.back(); cx.notify(); }) }));
  }
}
