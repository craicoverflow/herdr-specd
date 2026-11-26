// The "New spec" dialog (S1). Describes elements only; starting happens in handlers, never here.
import { div } from "gpui-kit";
import { v_flex, h_flex, Input } from "gpui-base";

const btn = (t, id, label, onClick, primary) =>
  div().id(id).px(10).py(5).rounded(6).cursor_pointer().text_size(13)
    .when(!!primary, (e) => e.bg(t.solid).text_color(t.solid_foreground))
    .when(!primary, (e) => e.border_1().border_color(t.input).text_color(t.foreground))
    .on_click((_e, cx) => onClick(cx)).child(label);

const field = (t, label, input, w) =>
  h_flex().gap(8).items_center()
    .child(div().w(110).flex_none().text_size(13).text_color(t.muted).child(label))
    .child(div().w(w).rounded(6).border_1().border_color(t.input).bg(t.background).child(Input.new(input)));

/** form: { adapter, folder }; inputs: { id, brief, model, effort }; error: { message, usedId? } | null. */
export function newView({ t, form, inputs, error, busy, onChangeFolder, onOpenUsed, onStart, onCancel }) {
  return v_flex().size_full().p(16).gap(10)
    .child(div().text_lg().pb(4).child("New spec"))
    .child(h_flex().gap(8).items_center()
      .child(div().w(110).flex_none().text_size(13).text_color(t.muted).child("Folder"))
      .child(div().flex_1().min_w(0).text_size(12).child(form.folder))
      .child(btn(t, "new-folder", "Change…", onChangeFolder)))
    .child(field(t, "ID", inputs.id, 240))
    .child(field(t, "What to build", inputs.brief, 520))
    .child(h_flex().gap(8).items_center()
      .child(div().w(110).flex_none().text_size(13).text_color(t.muted).child("Adapter"))
      .child(div().text_size(13).child(form.adapter)))
    .child(field(t, "Model", inputs.model, 240))
    .child(field(t, "Effort", inputs.effort, 240))
    .children(error ? [h_flex().gap(8).items_center()
      .child(div().text_size(12).text_color(t.blocked).child(error.message))
      .children(error.usedId ? [btn(t, "new-open-used", `Open ${error.usedId}`, (cx) => onOpenUsed(error.usedId, cx))] : [])] : [])
    .child(h_flex().gap(8).pt(4)
      .child(btn(t, "new-go", busy ? "Starting…" : "Start", onStart, true))
      .child(btn(t, "new-cancel", "Cancel", onCancel)));
}
