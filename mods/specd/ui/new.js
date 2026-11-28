// The "New spec" dialog (S1). Describes elements only; starting happens in handlers, never here.
import { div } from "gpui-kit";
import { settings } from "herdr";
import { v_flex, h_flex, Input } from "gpui-base";
import { formShape } from "../core/width.js";

const btn = (t, id, label, onClick, primary) =>
  div().id(id).px(10).py(5).rounded(6).cursor_pointer().text_size(13)
    .when(!!primary, (e) => e.bg(t.solid).text_color(t.solid_foreground))
    .when(!primary, (e) => e.border_1().border_color(t.input).text_color(t.foreground))
    .on_click((_e, cx) => onClick(cx)).child(label);

// Wide: label column beside a fixed-width field. Narrow: the label above a full-width field.
const row = (shape) => (shape.stacked ? v_flex().gap(4) : h_flex().gap(8).items_center());
const label = (t, shape, text) => div().when(!shape.stacked, (e) => e.w(shape.labelW).flex_none()).text_size(13).text_color(t.muted).child(text);
const field = (t, text, input, w, shape) =>
  row(shape).child(label(t, shape, text))
    .child(div().when(!shape.stacked, (e) => e.w(w)).when(shape.stacked, (e) => e.w_full().min_w(0))
      .rounded(6).border_1().border_color(t.input).bg(t.background).child(Input.new(input)));

/** form: { adapter, folder }; inputs: { id, brief, model, effort }; error: { message, usedId? } | null. */
export function newView({ t, form, inputs, error, busy, onChangeFolder, onOpenUsed, onStart, onCancel, layout = "wide", onViewSize }) {
  const shape = formShape(layout);
  const root = v_flex().id("new-form").size_full().min_w(0).p(shape.stacked ? 12 : 16).gap(10).overflow_y_scrollbar()
    .child(div().text_lg().pb(4).child("New spec"))
    .child(row(shape)
      .child(label(t, shape, "Folder"))
      .child(div().flex_1().min_w(0).text_size(12).whitespace_normal().child(form.folder))
      .child(btn(t, "new-folder", "Change…", onChangeFolder)))
    .child(field(t, "ID", inputs.id, shape.fieldW, shape))
    .child(field(t, "What to build", inputs.brief, shape.briefW, shape))
    .child(row(shape)
      .child(label(t, shape, "Adapter"))
      .child(div().text_size(13).child(form.adapter)))
    .child(field(t, "Model", inputs.model, shape.fieldW, shape))
    .child(field(t, "Effort", inputs.effort, shape.fieldW, shape))
    .children(error ? [h_flex().gap(8).items_center().flex_wrap()
      .child(div().flex_1().min_w(0).text_size(12).text_color(t.blocked).whitespace_normal().child(error.message))
      .children(error.usedId ? [btn(t, "new-open-used", `Open ${error.usedId}`, (cx) => onOpenUsed(error.usedId, cx))] : [])] : [])
    .child(h_flex().gap(8).pt(4).flex_wrap()
      .child(btn(t, "new-go", busy ? "Starting…" : "Start", onStart, true))
      .child(btn(t, "new-cancel", "Cancel", onCancel)));
  return onViewSize ? root.on_size_change((size, cx) => onViewSize(size.width / (Number(settings().zoom) || 1), cx)) : root;
}
