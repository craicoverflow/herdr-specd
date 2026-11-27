// Import first, then load the mod with dynamic import(): maps the mod's bare imports to headless
// stand-ins so io/ and main.js run under plain node. "herdr", "gpui-kit", "gpui-base", and (for
// files under mods/) Herdr's "fs/promises", which has exists() where node's doesn't.
import { registerHooks } from "node:module";

const here = (f) => new URL(`./${f}`, import.meta.url).href;
const map = { herdr: here("herdr.mjs"), "gpui-kit": here("gpui.mjs"), "gpui-base": here("gpui.mjs") };
registerHooks({
  resolve(specifier, context, next) {
    if (map[specifier]) return { url: map[specifier], shortCircuit: true };
    if ((specifier === "fs/promises" || specifier === "node:fs/promises") && context.parentURL?.includes("/mods/")) {
      return { url: here("fs-promises.mjs"), shortCircuit: true };
    }
    return next(specifier, context);
  },
});
