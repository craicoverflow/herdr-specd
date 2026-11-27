// gpui-kit / gpui-base for headless tests: every element builder is inert (render() runs, draws
// nothing), plus the few stateful classes the view constructs.
const inert = new Proxy(function () {}, { get: (_t, k) => (k === "then" ? undefined : inert), apply: () => inert, construct: () => inert });
export const div = inert, v_flex = inert, h_flex = inert, Input = inert, TextView = inert, Button = inert, img = inert, image = inert,
  Popover = inert, Anchor = inert, ClickEvent = inert, Context = inert, Element = inert, NativeElement = inert;
export class View {}
export const ScrollHandle = { new: () => ({ scroll_to_item() {} }) };
export const InputState = {
  new: () => {
    let v = "";
    const handlers = {};
    return { value: () => v, set_value: (x) => { v = x; }, on: (e, f) => { handlers[e] = f; }, focus() {}, fire: (e, cx) => handlers[e]?.({}, cx) };
  },
};
export default inert;
