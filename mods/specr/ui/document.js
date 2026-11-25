// The phase document as pieces of rendered markdown. Describes elements only.
import { div } from "gpui-kit";
import { v_flex, h_flex, TextView } from "gpui-base";

export function documentView({ t, spec, doc, pieces, scroll, error, onBack }) {
  const s = spec.state;
  const header = h_flex().gap(12).px(24).py(10).items_center().border_b_1().border_color(t.border)
    .child(div().id("back").text_size(13).text_color(t.muted).cursor_pointer()
      .hover((e) => e.text_color(t.foreground)).on_click((_e, cx) => onBack(cx)).child("‹ Specs"))
    .child(div().text_size(14).font_semibold().child(s.id))
    .child(div().text_size(12).text_color(t.muted).child(`${s.phase} · ${s.status} · round ${s.round}`));
  let body;
  if (error) body = div().p(24).text_color(t.blocked).child(error);
  else if (doc == null) body = div().p(24).text_color(t.muted).child(`The ${s.phase} document isn't there yet (${spec.path ?? "no path"}).`);
  else {
    body = v_flex().id("doc").flex_1().min_h(0).overflow_y_scrollbar().track_scroll(scroll).px(24).py(16).gap(6)
      .children(pieces.map((p, i) =>
        div().w_full().min_w(0).text_size(14).text_color(t.foreground)
          .child(TextView.markdown(`md-${i}-${p.key}`, p.text).selectable(true))));
  }
  return v_flex().size_full().bg(t.background).child(header).child(body);
}
