// The phase document as pieces of rendered markdown. Describes elements only.
import { div } from "gpui-kit";
import { settings } from "herdr";
import { v_flex, h_flex, TextView } from "gpui-base";
import { localRanges } from "../core/anchors.js";
import { sidePanel } from "./side.js";
import { diagram } from "./diagram.js";
import { gear } from "./settings.js";
import { reviewColumns } from "../core/width.js";

// "#rgb" / "#rrggbb" -> "#rrggbb" + alpha byte.
export function alpha(color, a) {
  let c = String(color || "#888888");
  if (c.length === 4) c = `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
  return `${c.slice(0, 7)}${Math.round(a * 255).toString(16).padStart(2, "0")}`;
}

const MARK = { new: "NEW", changed: "CHANGED" };

function piece(p, i, { t, pending, sel, onSelect, last }) {
  let tv = TextView.markdown(`md-${i}-${p.key}`, p.text).selectable(true)
    .on_selection_change((s, cx) => onSelect(i, s, cx));
  for (const r of localRanges(p, pending)) tv = tv.highlight_range(r.start, r.end, alpha(t.working, 0.3));
  for (const r of localRanges(p, last)) tv = tv.highlight_range(r.start, r.end, alpha(t.muted, 0.22));
  if (sel?.ok) for (const r of localRanges(p, [sel])) tv = tv.highlight_range(r.start, r.end, alpha(t.accent, 0.3));
  return div().w_full().min_w(0).text_size(14).text_color(t.foreground).child(tv);
}

// A piece with a margin mark beside it when its section is new or changed.
// Narrow: the mark sits above the piece instead of in a 64px column.
function marked(el, status, t, i, narrow) {
  if (!MARK[status]) return el;
  const color = status === "new" ? t.accent : t.working;
  const mark = div().id(`mark-${i}`).text_size(10).font_semibold().text_color(color).child(MARK[status]);
  if (narrow) return v_flex().w_full().min_w(0).gap(2).child(mark).child(div().w_full().min_w(0).child(el));
  return h_flex().w_full().min_w(0).gap(8).items_start()
    .child(mark.w(64).flex_none())
    .child(div().flex_1().min_w(0).child(el));
}

function removedBanner({ t, removed }) {
  if (!removed?.length) return null;
  return v_flex().gap(2).px(24).py(8).border_b_1().border_color(t.border)
    .child(div().text_size(12).font_semibold().text_color(t.muted).child(`Removed since the last round · ${removed.length}`))
    .children(removed.map((s) => div().text_size(12).text_color(t.dim).child(s.heading || "(text before the first heading)")));
}

function changedToggle({ t, changes, changedOnly, onToggleChanged }) {
  if (!changes) return null;
  const n = changes.sections.filter((s) => s.status !== "unchanged").length;
  return div().id("changed-only").text_size(12).cursor_pointer().px(8).py(2).rounded(6).border_1().border_color(t.border)
    .text_color(changedOnly ? t.background : t.muted).bg(changedOnly ? t.accent : t.surface)
    .on_click((_e, cx) => onToggleChanged(cx)).child(`Changed only · ${n}`);
}

export function documentView({ t, spec, doc, pieces, scroll, error, onBack, comments, diagrams, changes, changedOnly, onToggleChanged, layout = "wide", onViewSize, onSettings }) {
  const s = spec.state;
  const narrow = layout === "narrow";
  const header = h_flex().gap(narrow ? 8 : 12).px(narrow ? 12 : 24).py(10).items_center().flex_wrap().border_b_1().border_color(t.border)
    .child(div().id("back").text_size(13).text_color(t.muted).cursor_pointer()
      .hover((e) => e.text_color(t.foreground)).on_click((_e, cx) => onBack(cx)).child("‹ Specs"))
    .child(div().text_size(14).font_semibold().min_w(0).truncate().child(s.id))
    .child(div().text_size(12).text_color(t.muted).whitespace_normal().child(`${s.phase} · ${s.status} · round ${s.round}`))
    .child(div().flex_1())
    .children([changedToggle({ t, changes, changedOnly, onToggleChanged })].filter(Boolean))
    .child(gear(t, onSettings));
  let body;
  if (error) body = div().p(24).text_color(t.blocked).child(error);
  else if (doc == null) body = div().p(24).text_color(t.muted).child(`The ${s.phase} document isn't there yet (${spec.path ?? "no path"}).`);
  else {
    const firstDiagram = pieces.findIndex((p) => p.kind === "mermaid");
    const last = (changes?.comments ?? []).filter((c) => c.status !== "outdated");
    const ctx = { t, pending: s.pending, sel: comments.sel, onSelect: comments.onSelect, last };
    const shown = pieces.map((p, i) => [p, i, changes ? changes.statusAt(p.start) : "unchanged"])
      .filter(([, , st]) => !(changes && changedOnly && st === "unchanged"));
    const text = v_flex().id("doc").flex_1().min_w(0).min_h(0).overflow_y_scrollbar().track_scroll(scroll).px(narrow ? 12 : 24).py(16).gap(6)
      .on_size_change((size, cx) => diagrams.onSize(size.width / (Number(settings().zoom) || 1), cx))
      .children(shown.length ? shown.map(([p, i, st]) => marked(p.kind === "mermaid"
        ? diagram({ t, i, code: p.code, pic: diagrams.store.pic(p.code), missing: diagrams.store.missing,
          showInstall: i === firstDiagram, availW: diagrams.availW, onOpen: diagrams.onOpen })
        : piece(p, i, ctx), st, t, i, narrow)) : [div().text_size(13).text_color(t.muted).child("Nothing changed since the last round.")]);
    const notes = [...(comments.planCheck?.errors ?? []).map((m) => [m, t.blocked]), ...(comments.planCheck?.warnings ?? []).map((m) => [m, t.working])];
    const removedEl = removedBanner({ t, removed: changes?.removed });
    const banner = notes.length ? v_flex().gap(2).px(24).py(8).border_b_1().border_color(t.border)
      .children(notes.map(([m, c]) => div().text_size(12).text_color(c).whitespace_normal().child(m))) : null;
    const main = v_flex().flex_1().min_w(0).h_full().children([...(removedEl ? [removedEl] : []), ...(banner ? [banner] : []), text]);
    const side = sidePanel({ t, pending: s.pending, status: s.status, narrow, ...comments });
    const { direction } = reviewColumns(layout);
    body = (direction === "column" ? v_flex() : h_flex()).flex_1().min_h(0).min_w(0).child(main).child(side);
  }
  const root = v_flex().id("review").size_full().min_w(0).bg(t.background).child(header).child(body);
  return onViewSize ? root.on_size_change((size, cx) => onViewSize(size.width / (Number(settings().zoom) || 1), cx)) : root;
}
