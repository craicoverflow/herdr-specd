// The spec list. Describes elements only; work starts in init, timers or commands, never here.
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";

const cell = (t, w, s, color) => div().w(w).flex_none().text_size(13).text_color(color ?? t.foreground).child(String(s));

export function list({ t, specs, errors, found = [], onFoundAdopt, onFoundDismiss, onOpen, onAdopt }) {
  const head = h_flex().gap(12).px(12).py(6)
    .child(cell(t, 90, "ID", t.dim))
    .child(div().flex_1().min_w(0).text_size(12).text_color(t.dim).child("Title"))
    .child(cell(t, 70, "Phase", t.dim))
    .child(cell(t, 70, "Pending", t.dim))
    .child(cell(t, 50, "Tasks", t.dim));
  const rows = specs.map((s) =>
    h_flex().id(`spec-${s.id}`).gap(12).px(12).py(8).rounded(6).cursor_pointer()
      .hover((e) => e.bg(t.surface))
      .on_click((_e, cx) => onOpen(s.id, cx))
      .child(cell(t, 90, s.id))
      .child(div().flex_1().min_w(0).text_size(13).child(s.title))
      .child(cell(t, 70, s.phase, t.muted))
      .child(cell(t, 70, s.pending, s.pending ? t.working : t.muted))
      .child(cell(t, 50, s.tasks ?? "–", t.muted)));
  return v_flex().size_full().p(16).gap(4)
    .child(h_flex().items_center().pb(8)
      .child(div().flex_1().text_lg().child("Specs"))
      .child(div().id("adopt-spec").px(10).py(4).rounded(6).border_1().border_color(t.input).text_size(13).cursor_pointer()
        .on_click((_e, cx) => onAdopt(cx)).child("Adopt spec…")))
    .child(specs.length ? head : div().text_size(13).text_color(t.muted).child("No specs in this folder yet."))
    .children(rows)
    .children(found.length ? [div().pt(12).pb(4).px(12).text_size(12).text_color(t.dim).child("Found")] : [])
    .children(found.map((f) =>
      h_flex().gap(12).px(12).py(8).items_center()
        .child(div().flex_1().min_w(0).text_size(13).child(f.path))
        .child(div().id(`found-adopt-${f.path}`).px(10).py(4).rounded(6).border_1().border_color(t.input).text_size(13).cursor_pointer()
          .on_click((_e, cx) => onFoundAdopt(f, cx)).child("Adopt"))
        .child(div().id(`found-dismiss-${f.path}`).px(10).py(4).rounded(6).text_size(13).text_color(t.muted).cursor_pointer()
          .on_click((_e, cx) => onFoundDismiss(f, cx)).child("Dismiss"))))
    .children(errors.map((e) => div().px(12).text_size(12).text_color(t.blocked).child(`${e.id}: ${e.message}`)));
}
