// The build view (S9): the spec's items by repo with Shepherdr's state. Describes elements only.
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";

const color = (t, s) => ({ working: t.working, ready: t.accent, done: t.muted, unknown: t.dim, "not created": t.dim })[s] ?? t.foreground;

function item({ t, i, onCopy, copied }) {
  const row = h_flex().id(`build-${i.id}`).gap(10).px(8).py(4).rounded(6).items_center()
    .when(!!i.ref, (e) => e.cursor_pointer().hover((x) => x.bg(t.surface)).on_click((_e, cx) => onCopy(i.ref, cx)))
    .child(div().w(88).text_size(12).text_color(color(t, i.state)).child(i.state))
    .child(div().flex_1().min_w(0).text_size(13).child(`${i.id} · ${i.title}`))
    .child(div().text_size(11).text_color(t.muted).child(i.ref ? (copied === i.ref ? `${i.ref} copied` : i.ref) : ""));
  return i.pr ? v_flex().child(row).child(div().pl(106).text_size(11).text_color(t.accent).child(i.pr)) : row;
}

/** build: buildGroups() or null while loading. Handlers: onCopy(ref, cx), onBack(cx). */
export function buildView({ t, id, build, copied, onCopy, onBack }) {
  const header = h_flex().gap(12).px(24).py(10).items_center().border_b_1().border_color(t.border)
    .child(div().id("back").text_size(13).text_color(t.muted).cursor_pointer()
      .hover((e) => e.text_color(t.foreground)).on_click((_e, cx) => onBack(cx)).child("‹ Specs"))
    .child(div().text_size(14).font_semibold().child(id))
    .child(div().text_size(12).text_color(t.muted).child(build ? `build · ${build.done}/${build.total} done` : "build"));
  const body = !build
    ? [div().text_color(t.muted).child("Loading tasks from Shepherdr…")]
    : build.groups.map((g) => v_flex().gap(2)
      .child(h_flex().gap(8).child(div().text_size(13).font_semibold().child(g.repo))
        .child(div().text_size(12).text_color(t.muted).child(`${g.done}/${g.total} done`)))
      .children(g.items.map((i) => item({ t, i, onCopy, copied }))));
  return v_flex().size_full().child(header)
    .child(v_flex().flex_1().min_h(0).overflow_y_scrollbar().p(24).gap(14).children(body)
      .children(build ? [div().text_size(11).text_color(t.dim).child("Click an item to copy its task ref. Updates every 10 s while the window is visible.")] : []));
}
