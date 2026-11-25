// specr: review specs and plans, then dispatch their tasks. Scaffold: shows the folder it works in.
// Never start async work from render() (spike finding): work starts in init, timers or commands.
import { View, div } from "gpui-kit";
import { v_flex } from "gpui-base";
import { focused, spaces, props } from "herdr";

export default class Specr extends View {
  init(_props, _cx) {
    // The terminal that was focused when the palette entry ran (or a folder given as a prop).
    // A new tab has no terminal yet, so fall back to the folder of the space it opened in.
    const f = focused();
    this.folder = props()?.folder ?? f?.cwd ?? spaces().find((s) => s.id === f?.space)?.folder ?? null;
  }

  render(_cx) {
    return v_flex()
      .size_full()
      .p(16)
      .gap(8)
      .child(div().text_lg().child("specr"))
      .child(div().child(this.folder ? `Working in ${this.folder}` : "No folder: focus a terminal first"));
  }
}
