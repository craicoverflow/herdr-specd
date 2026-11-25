// specr spike: can a Herdr.app mod (1) render mermaid natively and (2) turn selections in rendered
// markdown into exact source-line comments, batched into one review? Throwaway; see
// ~/code/github.com/craicoverflow/herdr-specr/spike/README.md for what it found.
import { View, div, image } from "gpui-kit";
import { v_flex, h_flex, TextView, InputState, Input, ScrollHandle } from "gpui-base";
import { theme, settings, exec, readTextFile, writeTextFile, appHome, checking, props, nextCommand } from "herdr";
import * as fs from "fs/promises";
import { segments, lineStarts, lineOf, anchor, localRanges, reviewText, hash, alpha } from "./logic.js";

const SPIKE = "/Users/endaphelan/code/github.com/craicoverflow/herdr-specr/spike";
const DEFAULT_FILE = `${SPIKE}/fixtures/specs/PROJ-123/spec.md`;
const MOD = "mods/specr-spike";
const MONO = "JetBrains Mono";

export default class SpecrSpike extends View {
  init(_props, cx) {
    this.file = props()?.file ?? DEFAULT_FILE;
    this.appDir = appHome();
    this.doc = "";
    this.segs = [];
    this.starts = [0];
    this.error = null;
    this.sel = null;          // the pending anchor: last settled selection, kept while typing the comment
    this.comments = [];       // { n, start, end, lines, quote, text, body }
    this.round = 1;
    this.review = null;       // the last submitted message, shown for inspection
    this.events = [];         // raw on_selection_change reports, newest first
    this.pics = new Map();    // diagram key -> { state, path, w, h, ms, error }
    this.queue = [];
    this.busy = false;
    this.docW = 800;
    this.input = InputState.new({ placeholder: "Comment on the selection (Enter adds it)" });
    this.input.on("submit", (_e, cx) => this.add(cx));
    this.dark = Boolean(settings().dark);
    this.scroll = ScrollHandle.new();
    // Spike-only remote control, so it can be driven and screenshotted from a shell:
    //   herdr-app do specr-spike.d1 | d2 | top | end | demo | submit | clear
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        this.command(c, cx);
        cx.notify();
      }
    });
    cx.spawn(async (cx) => {
      try {
        this.doc = (await readTextFile(this.file)) ?? "";
        this.segs = segments(this.doc);
        this.starts = lineStarts(this.doc);
      } catch (e) {
        this.error = `Can't read ${this.file}: ${e}`;
      }
      cx.notify();
      await this.drain(cx);
    });
    // Diagram work never starts from render() (a notify during render throws: spike finding #3).
    // A theme switch is noticed here instead and re-renders the diagrams in the other theme.
    cx.timer.every(1000, (cx) => {
      const dark = Boolean(settings().dark);
      if (dark === this.dark || this.busy) return;
      this.dark = dark;
      cx.spawn(async (cx) => { await this.drain(cx); });
      cx.notify();
    });
  }

  command(c, cx) {
    const at = { top: 0, d1: 1, d2: 3, end: this.segs.length - 1 }[c];
    if (at !== undefined) { this.scroll.scroll_to_item(at); return; }
    if (c === "clear") { this.comments = []; this.sel = null; return; }
    if (c === "submit") { this.submit(cx); return; }
    if (c === "hl") {
      // Comments on text that's on screen after `end` and `d2`: a table cell, inline code in a table, a paragraph.
      this.place([
        ["Open the review pane on a spec's file", "hl: plain table cell"],
        ["specr rounds <ID>", "hl: inline code inside a table cell"],
        ["Rendering a diagram takes about a second once the browser is warm", "hl: paragraph above the sequence diagram"],
      ]);
      return;
    }
    if (c === "demo") {
      // Comments placed exactly where a person would select: a table cell, across two list items,
      // right after the astral 𝑓, and after the second diagram.
      const needles = [
        ["A source range `[start, end)` in UTF-16 offsets", "Table cell: is UTF-16 the right unit for a Rust renderer?"],
        ["a comment whose text is found keeps its place, moved to the new offsets;\n- a comment whose text is gone", "Across two list items: what about a quote that now appears twice?"],
        ["which\n  takes two UTF-16 code units", "After the 𝑓: make sure this quote is exact."],
        ["send comments one at a time", "After the second diagram: good, keep this as a hard rule."],
      ];
      this.place(needles);
    }
  }

  place(needles) {
    for (const [needle, body] of needles) {
      const idx = this.doc.indexOf(needle);
      const i = this.segs.findIndex((g) => g.kind === "md" && g.start <= idx && idx + needle.length <= g.end);
      if (idx < 0 || i < 0) { this.events = [`not found: ${clip(needle, 30)}`, ...this.events]; continue; }
      const seg = this.segs[i];
      const a = anchor(this.doc, this.starts, seg, { start: idx - seg.start, end: idx - seg.start + needle.length });
      this.comments.push({ n: this.comments.length + 1, piece: i, text: needle, ...a, body, round: this.round });
    }
  }

  // ---- selections and comments ---------------------------------------------------------------

  onSel(i, s, cx) {
    const seg = this.segs[i];
    const log = s
      ? `piece ${i} · range ${s.range ? `[${s.range.start}, ${s.range.end})` : "ABSENT"} · "${clip(s.text, 40)}"`
      : `piece ${i} · cleared`;
    this.events = [log, ...this.events].slice(0, 8);
    if (s) {
      this.sel = s.range ? { piece: i, text: s.text, ...anchor(this.doc, this.starts, seg, s.range) } : { piece: i, text: s.text, noRange: true };
      if (this.sel.start !== undefined) this.input.focus();
    }
    cx.notify();
  }

  add(cx) {
    const body = this.input.value().trim();
    if (!body || !this.sel || this.sel.start === undefined) return;
    this.comments.push({ n: this.comments.length + 1, ...this.sel, body, round: this.round });
    this.input.set_value("");
    this.sel = null;
    cx.notify();
  }

  submit(cx) {
    const pending = this.comments.filter((c) => c.round === this.round);
    if (!pending.length) return;
    const rel = this.file.startsWith(`${SPIKE}/fixtures/`) ? this.file.slice(`${SPIKE}/fixtures/`.length) : this.file;
    this.review = reviewText(rel, this.round, pending);
    const out = `${SPIKE}/out/review-round-${this.round}-${Date.now()}.txt`;
    this.round += 1;
    cx.notify();
    cx.spawn(async (cx) => {
      try { await writeTextFile(out, this.review, null); this.events = [`wrote ${out.slice(SPIKE.length + 1)}`, ...this.events]; }
      catch (e) { this.events = [`write failed: ${e}`, ...this.events]; }
      cx.notify();
    });
  }

  // ---- diagrams --------------------------------------------------------------------------------

  keyFor(seg) {
    return `${hash(seg.code)}-${settings().dark ? "dark" : "light"}`;
  }

  // Render every diagram missing for the current theme, one at a time (one Chrome at a time). Called from
  // init's task and the theme timer only, never from render().
  async drain(cx) {
    if (checking() || this.busy) return;
    this.busy = true;
    try {
      for (const seg of this.segs.filter((s) => s.kind === "mermaid")) {
        const key = this.keyFor(seg);
        if (this.pics.get(key)?.state === "ready") continue;
        const step = (s) => { this.pics.set(key, { state: `rendering: ${s}` }); cx.notify(); };
        step("start");
        let result;
        try { result = await draw({ key, code: seg.code, dark: Boolean(settings().dark), appDir: this.appDir }, step); }
        catch (e) { result = { state: "failed", error: `threw: ${e}` }; }
        this.pics.set(key, result);
        cx.notify();
      }
    } finally {
      this.busy = false;
    }
  }

  diagram(i, seg, t, _cx) {
    const key = this.keyFor(seg);
    const pic = this.pics.get(key) ?? { state: "queued" };
    const [a, b] = [lineOf(this.starts, seg.start), lineOf(this.starts, seg.end - 1)];
    const caption = div().text_size(12).text_color(t.muted);
    if (pic.state === "ready") {
      const w = Math.min(pic.w, this.docW - 48);
      return v_flex().gap(4).py(6)
        .child(image(pic.path).w(w).h((w * pic.h) / pic.w))
        .child(caption.child(`diagram · lines ${a}-${b} · ${pic.ms == null ? "from cache" : `rendered in ${pic.ms} ms`} · ${key}`));
    }
    return v_flex().gap(4).py(6)
      .child(div().w_full().p(10).rounded(6).bg(t.surface).font_family(MONO).text_size(12).text_color(t.muted).whitespace_normal().child(seg.code))
      .child(pic.state === "failed"
        ? caption.text_color(t.blocked).child(`diagram failed to render (lines ${a}-${b}): ${clip(pic.error, 160)}`)
        : h_flex().gap(6).child(div().text_size(12).text_color(t.muted).frames(["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"], 90))
          .child(caption.child(`${pic.state} (lines ${a}-${b})`)));
  }

  // ---- view ------------------------------------------------------------------------------------

  markdown(i, seg, t) {
    let tv = TextView.markdown(`md-${i}`, seg.text).selectable(true).on_selection_change((s, cx) => this.onSel(i, s, cx));
    for (const r of localRanges(seg, this.comments.filter((c) => c.round === this.round))) tv = tv.highlight_range(r.start, r.end, alpha(t.working, 0.3));
    if (this.sel && this.sel.start !== undefined) {
      for (const r of localRanges(seg, [this.sel])) tv = tv.highlight_range(r.start, r.end, alpha(t.accent, 0.3));
    }
    return div().w_full().min_w(0).text_size(14).text_color(t.foreground).child(tv);
  }

  side(t) {
    const label = (s) => div().text_size(11).font_semibold().text_color(t.dim).child(s.toUpperCase());
    const mono = (s, color = t.muted) => div().w_full().font_family(MONO).text_size(12).text_color(color).whitespace_normal().child(s);
    const sel = this.sel;
    const pending = this.comments.filter((c) => c.round === this.round);
    const sent = this.comments.filter((c) => c.round < this.round);
    const diagrams = this.segs.filter((s) => s.kind === "mermaid").length;
    return v_flex().id("side").w(360).flex_none().h_full().overflow_y_scrollbar().border_l_1().border_color(t.border).bg(t.surface).p(14).gap(12)
      .child(v_flex().gap(2)
        .child(div().text_size(14).font_semibold().child("specr spike"))
        .child(div().text_size(12).text_color(t.muted).whitespace_normal()
          .child(`${this.file.split("/").slice(-3).join("/")} · ${this.starts.length} lines · ${this.segs.length} pieces (${diagrams} diagrams) · ${settings().dark ? "dark" : "light"}`)))
      .child(label("Selection"))
      .child(!sel
        ? div().text_size(13).text_color(t.muted).whitespace_normal().child("Select text in the document.")
        : sel.noRange
          ? div().text_size(13).text_color(t.blocked).whitespace_normal().child(`No source range for this selection (piece ${sel.piece}): "${clip(sel.text, 80)}"`)
          : v_flex().gap(6)
            .child(h_flex().gap(8)
              .child(div().text_size(13).font_semibold().child(sel.lines[0] === sel.lines[1] ? `Line ${sel.lines[0]}` : `Lines ${sel.lines[0]}-${sel.lines[1]}`))
              .child(div().text_size(12).text_color(sel.ok ? t.done : t.blocked).child(sel.ok ? "round trip ok" : "ROUND TRIP MISMATCH"))
              .child(div().text_size(12).text_color(t.dim).child(`[${sel.start}, ${sel.end})`)))
            .child(div().text_size(12).text_color(t.dim).child("source"))
            .child(mono(clip(sel.quote, 300), t.foreground))
            .child(div().text_size(12).text_color(t.dim).child("rendered"))
            .child(mono(clip(sel.text, 300))))
      .child(div().w_full().rounded(6).border_1().border_color(t.input).bg(t.background).child(Input.new(this.input)))
      .child(label(`Pending review · round ${this.round} · ${pending.length}`))
      .children(pending.map((c) => v_flex().gap(4).p(8).rounded(6).bg(t.background).border_1().border_color(t.border)
        .child(h_flex().justify_between()
          .child(div().text_size(12).font_semibold().child(c.lines[0] === c.lines[1] ? `Line ${c.lines[0]}` : `Lines ${c.lines[0]}-${c.lines[1]}`))
          .child(div().id(`rm-${c.n}`).text_size(12).text_color(t.muted).cursor_pointer().hover((s) => s.text_color(t.blocked))
            .on_click((_e, cx) => { this.comments = this.comments.filter((x) => x !== c); cx.notify(); }).child("remove")))
        .child(mono(`> ${clip(c.quote.split("\n")[0], 80)}`, t.dim))
        .child(div().text_size(13).whitespace_normal().child(c.body))))
      .child(div().id("submit").h(30).px(12).flex().items_center().justify_center().rounded(6)
        .bg(pending.length ? t.solid : t.raised).text_color(pending.length ? t.solid_foreground : t.muted)
        .cursor_pointer().on_click((_e, cx) => this.submit(cx))
        .child(div().text_size(13).font_semibold().child(pending.length ? `Submit review (${pending.length})` : "Submit review")))
      .when(Boolean(this.review), (el) => el
        .child(label(`Sent · round ${this.round - 1} · ${sent.filter((c) => c.round === this.round - 1).length} comments`))
        .child(div().w_full().p(8).rounded(6).bg(t.background).child(mono(this.review, t.foreground))))
      .child(label("Diagrams"))
      .children(this.segs.filter((s) => s.kind === "mermaid").map((s) => {
        const k = this.keyFor(s), p = this.pics.get(k);
        return mono(`${k} · ${p ? p.state : "not requested"}${p?.ms != null ? ` · ${p.ms} ms` : ""}${p?.error ? ` · ${clip(p.error, 200)}` : ""}`, p?.state === "failed" ? t.blocked : t.dim);
      }))
      .child(mono(`busy=${this.busy} queue=${this.queue.length} checking=${checking()}`, t.dim))
      .child(label("Selection events (newest first)"))
      .children(this.events.map((e) => mono(e, t.dim)));
  }

  render(cx) {
    const t = theme();
    if (this.error) return div().size_full().p(20).bg(t.background).text_color(t.blocked).child(this.error);
    return h_flex().id("root").size_full().bg(t.background).text_color(t.foreground)
      .child(v_flex().id("doc").flex_1().min_w(0).h_full().overflow_y_scrollbar().track_scroll(this.scroll).px(24).py(16).gap(6)
        .on_size_change((size, cx) => { const w = size.width / (Number(settings().zoom) || 1); if (Math.abs(w - this.docW) > 4) { this.docW = w; cx.notify(); } })
        .children(this.segs.map((seg, i) => (seg.kind === "mermaid" ? this.diagram(i, seg, t, cx) : this.markdown(i, seg, t)))))
      .child(this.side(t));
  }
}

// Render one diagram to PNG with mmdc (system Chrome), cached by source + theme under the mod's hidden .cache.
// Files through fs/promises (portable; writes allowed under ~/.config/herdr-app). `step` names where it is,
// so a hang shows on screen.
async function draw({ key, code, dark, appDir }, step) {
  step("enter");
  const dir = `${appDir}/${MOD}/.cache`;
  const png = `${dir}/${key}.png`;
  const mmd = `${dir}/${key}.mmd`;
  try {
    step("mkdir");
    await fs.mkdir(dir, { recursive: true });
    step("cache lookup");
    let ms = null;
    if (!(await fs.exists(png))) {
      step("write source");
      await fs.writeFile(mmd, code);
      step("mmdc");
      const t0 = Date.now();
      const r = await exec(`${SPIKE}/node_modules/.bin/mmdc`,
        ["-p", `${SPIKE}/puppeteer.json`, "-q", "-i", mmd, "-o", png, "-s", "2", "-b", "transparent", "-t", dark ? "dark" : "default"],
        { timeout: 90000 });
      if (r.code !== 0) return { state: "failed", error: (r.stderr || r.stdout || `exit ${r.code}`).trim() };
      ms = Date.now() - t0;
    }
    step("size");
    const b = await fs.readFile(png); // PNG IHDR: width and height, big-endian, at bytes 16 and 20
    const u32 = (o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
    return { state: "ready", path: `${MOD}/.cache/${key}.png`, w: u32(16) / 2, h: u32(20) / 2, ms };
  } catch (e) {
    return { state: "failed", error: String(e) };
  }
}

function clip(s, n) {
  const x = String(s ?? "");
  return x.length > n ? `${x.slice(0, n - 1)}…` : x;
}
