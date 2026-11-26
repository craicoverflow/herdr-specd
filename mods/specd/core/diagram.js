// Pure: no herdr or gpui imports. Cache keys, mmdc arguments, PNG size, fit-to-width, settings.
import { hash } from "./pieces.js";

export const INSTALL_NOTE =
  "Diagrams need mermaid-cli. Install it with `PUPPETEER_SKIP_DOWNLOAD=1 npm i -g @mermaid-js/mermaid-cli@12.2.0`, " +
  "then point a puppeteer config at an installed Chrome (`{\"executablePath\": \"/path/to/chrome\", \"headless\": \"shell\"}`). " +
  "Set the mmdc path and config in the diagram settings if mmdc isn't on PATH.";

/** The cache file stem for a diagram: hash(source)-theme. */
export const cacheKey = (code, dark) => `${hash(code)}-${dark ? "dark" : "light"}`;

/** mmdc arguments: theme, transparent background, scale 2. `puppeteer` is optional. */
export function mmdcArgs({ input, output, dark, puppeteer }) {
  return [...(puppeteer ? ["-p", puppeteer] : []), "-q", "-i", input, "-o", output, "-s", "2", "-b", "transparent", "-t", dark ? "dark" : "default"];
}

const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Natural size in layout px of a scale-2 PNG, from its IHDR; null when it isn't a PNG. */
export function pngSize(b) {
  if (!b || b.length < 24 || SIG.some((x, i) => b[i] !== x)) return null;
  const u32 = (o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  return { w: u32(16) / 2, h: u32(20) / 2 };
}

/** Draw size for an available width: shrinks to fit, never grows. `scaled` says it was shrunk. */
export function fitSize(size, avail) {
  if (!(avail > 0) || size.w <= avail) return { w: size.w, h: size.h, scaled: false };
  return { w: avail, h: (avail * size.h) / size.w, scaled: true };
}

/** Diagram settings as stored in localStorage (JSON): both are strings, empty when unset. */
export function cleanSettings(raw) {
  let o = {};
  try {
    o = JSON.parse(raw ?? "") ?? {};
  } catch {
    o = {};
  }
  const s = (v) => (typeof v === "string" ? v.trim() : "");
  return { mmdc: s(o.mmdc), puppeteer: s(o.puppeteer) };
}

/** A one-line, clipped reason for a failed render. */
export function failureNote(out) {
  const line = String(out ?? "").split("\n").map((l) => l.trim()).find(Boolean);
  if (!line) return "mmdc failed without a message";
  return line.length > 150 ? `${line.slice(0, 149)}…` : line;
}
