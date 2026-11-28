// The adopt form. Describes elements only; picking and saving start from handlers, never here.
import { div } from "gpui-kit";
import { settings } from "herdr";
import { v_flex, h_flex, Input } from "gpui-base";
import { formShape } from "../core/width.js";

const btn = (t, id, label, onClick, primary) =>
  div().id(id).px(10).py(5).rounded(6).cursor_pointer().text_size(13)
    .when(!!primary, (e) => e.bg(t.solid).text_color(t.solid_foreground))
    .when(!primary, (e) => e.border_1().border_color(t.input).text_color(t.foreground))
    .on_click((_e, cx) => onClick(cx)).child(label);

const labelEl = (t, shape, text) => div().when(!shape.stacked, (e) => e.w(shape.labelW).flex_none()).text_size(13).text_color(t.muted).child(text);

function fileRow({ t, key, label, path, onPick, onClear, shape }) {
  const pick = btn(t, `adopt-pick-${key}`, path ? "Change…" : "Choose…", (cx) => onPick(key, cx));
  const name = div().flex_1().min_w(0).text_size(12).text_color(path ? t.foreground : t.dim).whitespace_normal().child(path ?? "none");
  const clear = path && key !== "spec" ? [btn(t, `adopt-clear-${key}`, "Clear", (cx) => onClear(key, cx))] : [];
  // Narrow: the label, then the buttons, then the path wrapping underneath.
  return shape.stacked
    ? v_flex().gap(4).child(labelEl(t, shape, label)).child(h_flex().gap(8).flex_wrap().child(pick).children(clear)).child(name)
    : h_flex().gap(8).items_center().child(labelEl(t, shape, label)).child(pick).child(name).children(clear);
}

export function adoptView({ t, form, input, error, onPick, onClear, onSubmit, onCancel, layout = "wide", onViewSize }) {
  const shape = formShape(layout);
  const root = v_flex().id("adopt-form").size_full().min_w(0).p(shape.stacked ? 12 : 16).gap(10).overflow_y_scrollbar()
    .child(div().text_lg().pb(4).child("Adopt a spec"))
    .child(div().text_size(12).text_color(t.dim).whitespace_normal().child("The files stay where they are, in any format; specd only records their paths. Only the spec is needed."))
    .child(fileRow({ t, key: "spec", label: "Spec (required)", path: form.spec, onPick, onClear, shape }))
    .child(fileRow({ t, key: "plan", label: "Plan", path: form.plan, onPick, onClear, shape }))
    .child(fileRow({ t, key: "tasks", label: "Task list", path: form.tasks, onPick, onClear, shape }))
    .child((shape.stacked ? v_flex().gap(4) : h_flex().gap(8).items_center())
      .child(labelEl(t, shape, "ID"))
      .child(div().when(!shape.stacked, (e) => e.w(shape.fieldW)).when(shape.stacked, (e) => e.w_full().min_w(0)).rounded(6).border_1().border_color(t.input).bg(t.background).child(Input.new(input))))
    .children(error ? [div().text_size(12).text_color(t.blocked).whitespace_normal().child(error)] : [])
    .child(h_flex().gap(8).pt(4).flex_wrap()
      .child(btn(t, "adopt-go", "Adopt", onSubmit, true))
      .child(btn(t, "adopt-cancel", "Cancel", onCancel)));
  return onViewSize ? root.on_size_change((size, cx) => onViewSize(size.width / (Number(settings().zoom) || 1), cx)) : root;
}
