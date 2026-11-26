// The phase document as pieces of rendered markdown. Describes elements only.
import { div } from "gpui-kit";
import { settings } from "herdr";
import { v_flex, h_flex, TextView } from "gpui-base";
import { localRanges } from "../core/anchors.js";
import { sidePanel } from "./side.js";
import { diagram, settingsPopover } from "./diagram.js";

// "#rgb" / "#rrggbb" -> "#rrggbb" + alpha byte.
export function alpha(color, a) {
  let c = String(color || "#888888");
  if (c.length === 4) c = `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
  return `${c.slice(0, 7)}${Math.round(a * 255).toString(16).padStart(2, "0")}`;
}

function piece(p, i, { t, pending, sel, onSelect }) {
  let tv = TextView.markdown(`md-${i}-${p.key}`, p.text).selectable(true)
    .on_selection_change((s, cx) => onSelect(i, s, cx));
  for (const r of localRanges(p, pending)) tv = tv.highlight_range(r.start, r.end, alpha(t.working, 0.3));
  if (sel?.ok) for (const r of localRanges(p, [sel])) tv = tv.highlight_range(r.start, r.end, alpha(t.accent, 0.3));
  return div().w_full().min_w(0).text_size(14).text_color(t.foreground).child(tv);
}

export function documentView({ t, spec, doc, pieces, scroll, error, onBack, comments, diagrams }) {
  const s = spec.state;
  const header = h_flex().gap(12).px(24).py(10).items_center().border_b_1().border_color(t.border)
    .child(div().id("back").text_size(13).text_color(t.muted).cursor_pointer()
      .hover((e) => e.text_color(t.foreground)).on_click((_e, cx) => onBack(cx)).child("‹ Specs"))
    .child(div().text_size(14).font_semibold().child(s.id))
    .child(div().text_size(12).text_color(t.muted).child(`${s.phase} · ${s.status} · round ${s.round}`))
    .child(div().flex_1())
    .child(settingsPopover({ t, ...diagrams.settings }));
  let body;
  if (error) body = div().p(24).text_color(t.blocked).child(error);
  else if (doc == null) body = div().p(24).text_color(t.muted).child(`The ${s.phase} document isn't there yet (${spec.path ?? "no path"}).`);
  else {
    const firstDiagram = pieces.findIndex((p) => p.kind === "mermaid");
    const ctx = { t, pending: s.pending, sel: comments.sel, onSelect: comments.onSelect };
    const text = v_flex().id("doc").flex_1().min_w(0).min_h(0).overflow_y_scrollbar().track_scroll(scroll).px(24).py(16).gap(6)
      .on_size_change((size, cx) => diagrams.onSize(size.width / (Number(settings().zoom) || 1), cx))
      .children(pieces.map((p, i) => (p.kind === "mermaid"
        ? diagram({ t, i, code: p.code, pic: diagrams.store.pic(p.code), missing: diagrams.store.missing,
          showInstall: i === firstDiagram, availW: diagrams.availW, onOpen: diagrams.onOpen })
        : piece(p, i, ctx))));
    const notes = [...(comments.planCheck?.errors ?? []).map((m) => [m, t.blocked]), ...(comments.planCheck?.warnings ?? []).map((m) => [m, t.working])];
    const banner = notes.length ? v_flex().gap(2).px(24).py(8).border_b_1().border_color(t.border)
      .children(notes.map(([m, c]) => div().text_size(12).text_color(c).whitespace_normal().child(m))) : null;
    const main = v_flex().flex_1().min_w(0).h_full().children(banner ? [banner, text] : [text]);
    body = h_flex().flex_1().min_h(0).child(main).child(sidePanel({ t, pending: s.pending, status: s.status, ...comments }));
  }
  return v_flex().size_full().bg(t.background).child(header).child(body);
}
