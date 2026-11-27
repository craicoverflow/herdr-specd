// The adopt form. Describes elements only; picking and saving start from handlers, never here.
import { div } from "gpui-kit";
import { v_flex, h_flex, Input } from "gpui-base";

const btn = (t, id, label, onClick, primary) =>
  div().id(id).px(10).py(5).rounded(6).cursor_pointer().text_size(13)
    .when(!!primary, (e) => e.bg(t.solid).text_color(t.solid_foreground))
    .when(!primary, (e) => e.border_1().border_color(t.input).text_color(t.foreground))
    .on_click((_e, cx) => onClick(cx)).child(label);

function fileRow({ t, key, label, path, onPick, onClear }) {
  return h_flex().gap(8).items_center()
    .child(div().w(110).flex_none().text_size(13).text_color(t.muted).child(label))
    .child(btn(t, `adopt-pick-${key}`, path ? "Change…" : "Choose…", (cx) => onPick(key, cx)))
    .child(div().flex_1().min_w(0).text_size(12).text_color(path ? t.foreground : t.dim).child(path ?? "none"))
    .children(path && key !== "spec" ? [btn(t, `adopt-clear-${key}`, "Clear", (cx) => onClear(key, cx))] : []);
}

export function adoptView({ t, form, input, error, onPick, onClear, onSubmit, onCancel }) {
  return v_flex().size_full().p(16).gap(10)
    .child(div().text_lg().pb(4).child("Adopt a spec"))
    .child(div().text_size(12).text_color(t.dim).whitespace_normal().child("The files stay where they are, in any format; specd only records their paths. Only the spec is needed."))
    .child(fileRow({ t, key: "spec", label: "Spec (required)", path: form.spec, onPick, onClear }))
    .child(fileRow({ t, key: "plan", label: "Plan", path: form.plan, onPick, onClear }))
    .child(fileRow({ t, key: "tasks", label: "Task list", path: form.tasks, onPick, onClear }))
    .child(h_flex().gap(8).items_center()
      .child(div().w(110).flex_none().text_size(13).text_color(t.muted).child("ID"))
      .child(div().w(240).rounded(6).border_1().border_color(t.input).bg(t.background).child(Input.new(input))))
    .children(error ? [div().text_size(12).text_color(t.blocked).child(error)] : [])
    .child(h_flex().gap(8).pt(4)
      .child(btn(t, "adopt-go", "Adopt", onSubmit, true))
      .child(btn(t, "adopt-cancel", "Cancel", onCancel)));
}
