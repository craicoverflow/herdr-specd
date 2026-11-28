// The settings page: one section per area, Diagrams for now. Describes elements only.
import { div } from "gpui-kit";
import { settings } from "herdr";
import { v_flex, h_flex, Input } from "gpui-base";

const field = (t, label, state) =>
  v_flex().gap(4)
    .child(div().text_size(12).text_color(t.muted).child(label))
    .child(div().w_full().min_w(0).rounded(6).border_1().border_color(t.input).bg(t.background).child(Input.new(state)));

/** The gear that opens the page; sits in the list and review headers. */
export const gear = (t, onOpen) =>
  div().id("open-settings").text_size(13).text_color(t.muted).cursor_pointer()
    .hover((e) => e.text_color(t.foreground)).on_click((_e, cx) => onOpen(cx)).child("⚙ Settings");

/** Diagrams: the mmdc path and puppeteer config, kept in localStorage by Diagrams. */
export function settingsView({ t, mmdcInput, puppeteerInput, saved, onSave, onBack, layout = "wide", onViewSize }) {
  const narrow = layout === "narrow";
  const root = v_flex().id("settings-page").size_full().min_w(0).bg(t.background).text_color(t.foreground)
    .child(h_flex().gap(narrow ? 8 : 12).px(narrow ? 12 : 24).py(10).items_center().border_b_1().border_color(t.border)
      .child(div().id("settings-back").text_size(13).text_color(t.muted).cursor_pointer()
        .hover((e) => e.text_color(t.foreground)).on_click((_e, cx) => onBack(cx)).child("‹ Back"))
      .child(div().text_size(14).font_semibold().child("Settings")))
    .child(v_flex().flex_1().min_h(0).min_w(0).overflow_y_scrollbar().p(narrow ? 12 : 24).gap(10)
      .child(div().text_size(13).font_semibold().child("Diagrams"))
      .child(field(t, "mmdc path (empty: find it on PATH)", mmdcInput))
      .child(field(t, "Puppeteer config file (empty: none)", puppeteerInput))
      .child(h_flex().gap(8).items_center().flex_wrap()
        .child(div().id("diagram-settings-save").px(12).py(5).rounded(6).bg(t.solid).text_color(t.solid_foreground).cursor_pointer()
          .on_click((_e, cx) => onSave(cx)).child(div().text_size(13).font_semibold().child("Save and render again")))
        .children(saved ? [div().text_size(12).text_color(t.muted).child("Saved")] : [])));
  return onViewSize ? root.on_size_change((size, cx) => onViewSize(size.width / (Number(settings().zoom) || 1), cx)) : root;
}
