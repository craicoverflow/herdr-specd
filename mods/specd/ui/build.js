// The build view (S9): the spec's items by repo with Shepherdr's state. Describes elements only.
import { div } from "gpui-kit";
import { settings } from "herdr";
import { v_flex, h_flex } from "gpui-base";

const color = (t, s) => ({ working: t.working, ready: t.accent, done: t.muted, unknown: t.dim, "not created": t.dim })[s] ?? t.foreground;

function item({ t, i, onCopy, copied, narrow }) {
  const row = h_flex().id(`build-${i.id}`).gap(narrow ? 6 : 10).px(8).py(4).rounded(6).items_center()
    .when(!!i.ref, (e) => e.cursor_pointer().hover((x) => x.bg(t.surface)).on_click((_e, cx) => onCopy(i.ref, cx)))
    .child(div().w(narrow ? 64 : 88).flex_none().truncate().text_size(12).text_color(color(t, i.state)).child(i.state))
    .child(div().flex_1().min_w(0).truncate().text_size(13).child(`${i.id} · ${i.title}`))
    .child(div().flex_none().max_w(narrow ? 90 : 200).truncate().text_size(11).text_color(t.muted).child(i.ref ? (copied === i.ref ? `${i.ref} copied` : i.ref) : ""));
  return i.pr ? v_flex().child(row).child(div().pl(narrow ? 78 : 106).min_w(0).truncate().text_size(11).text_color(t.accent).child(i.pr)) : row;
}

/** build: buildGroups() or null while loading. Handlers: onCopy(ref, cx), onBack(cx). */
export function buildView({ t, id, build, copied, onCopy, onBack, layout = "wide", onViewSize }) {
  const narrow = layout === "narrow";
  const header = h_flex().gap(narrow ? 8 : 12).px(narrow ? 12 : 24).py(10).items_center().flex_wrap().border_b_1().border_color(t.border)
    .child(div().id("back").text_size(13).text_color(t.muted).cursor_pointer()
      .hover((e) => e.text_color(t.foreground)).on_click((_e, cx) => onBack(cx)).child("‹ Specs"))
    .child(div().min_w(0).truncate().text_size(14).font_semibold().child(id))
    .child(div().text_size(12).text_color(t.muted).whitespace_normal().child(build ? `build · ${build.done}/${build.total} done` : "build"));
  const body = !build
    ? [div().text_color(t.muted).whitespace_normal().child("Loading tasks from Shepherdr…")]
    : build.groups.map((g) => v_flex().gap(2)
      .child(h_flex().gap(8).child(div().min_w(0).truncate().text_size(13).font_semibold().child(g.repo))
        .child(div().flex_none().text_size(12).text_color(t.muted).child(`${g.done}/${g.total} done`)))
      .children(g.items.map((i) => item({ t, i, onCopy, copied, narrow }))));
  const root = v_flex().id("build").size_full().min_w(0).child(header)
    .child(v_flex().flex_1().min_h(0).min_w(0).overflow_y_scrollbar().p(narrow ? 12 : 24).gap(14).children(body)
      .children(build ? [div().text_size(11).text_color(t.dim).whitespace_normal().child("Click an item to copy its task ref. Updates every 10 s while the window is visible.")] : []));
  return onViewSize ? root.on_size_change((size, cx) => onViewSize(size.width / (Number(settings().zoom) || 1), cx)) : root;
}
