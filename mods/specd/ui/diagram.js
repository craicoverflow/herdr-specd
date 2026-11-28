// A mermaid piece as a picture, its source while rendering or on failure.
// Describes elements only: work starts in init, timers or event handlers, never here.
import { div, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { fitSize, INSTALL_NOTE } from "../core/diagram.js";

const MONO = "JetBrains Mono";

const source = (t, code) =>
  div().w_full().p(10).rounded(6).bg(t.surface).font_family(MONO).text_size(12).text_color(t.muted).whitespace_normal().child(code);

const note = (t, text, color) => div().text_size(12).text_color(color ?? t.muted).whitespace_normal().child(text);

/**
 * One diagram. `pic` is null while it hasn't been rendered (spinner over the source), or
 * { state: "ready", path, w, h } or { state: "failed", error }. `missing`: mmdc wasn't found;
 * `showInstall`: this is the one diagram that carries the install instructions.
 */
export function diagram({ t, i, code, pic, missing, showInstall, availW, onOpen }) {
  if (pic?.state === "ready") {
    const fit = fitSize(pic, availW);
    return v_flex().gap(4).py(6)
      .child(div().id(`diagram-${i}`).cursor_pointer().on_click((_e, cx) => onOpen(pic, cx)).child(image(pic.path).w(fit.w).h(fit.h)))
      .child(div().text_size(11).text_color(t.dim).child(fit.scaled ? "Click to open at full size" : "Click to open in a window"));
  }
  const body = v_flex().gap(4).py(6).child(source(t, code));
  if (pic?.state === "failed") return body.child(note(t, `Couldn't draw this diagram: ${pic.error}`, t.blocked));
  if (missing) {
    return body
      .child(note(t, "mmdc isn't installed, so the diagram shows as source."))
      .when(showInstall, (el) => el.child(note(t, INSTALL_NOTE, t.dim)));
  }
  return body.child(h_flex().gap(6)
    .child(div().text_size(12).text_color(t.muted).frames(["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"], 90))
    .child(note(t, "Rendering the diagram…")));
}

/** The natural-size window's body: the picture at its own size, scrolling both ways. */
export function zoomView({ t, pic, onClose }) {
  return v_flex().size_full().bg(t.background)
    .child(h_flex().justify_between().px(12).py(6).border_b_1().border_color(t.border)
      .child(div().text_size(12).text_color(t.muted).child(`${pic.w} × ${pic.h}`))
      .child(div().id("zoom-close").text_size(13).text_color(t.muted).cursor_pointer().hover((e) => e.text_color(t.foreground))
        .on_click((_e, cx) => onClose(cx)).child("Close")))
    .child(div().id("zoom-scroll").flex_1().min_h(0).overflow_scroll().p(12).child(image(pic.path).w(pic.w).h(pic.h)));
}
