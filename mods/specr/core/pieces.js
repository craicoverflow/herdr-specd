// Pure: no herdr or gpui imports, so Node can test it. Offsets are UTF-16 code units
// (JS string indices), which is what TextView reports.

const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)/;

// FNV-1a, 32-bit: a stable key part for a diagram's source.
export function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

const slug = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");

// Split a markdown document into pieces that tile it exactly: a new "md" piece starts at every
// heading (outside code fences), and every ```mermaid fence is its own "mermaid" piece (with
// `code`). Each piece: { kind, start, end, text, heading, key }. `heading` is the section heading
// the piece sits under ("" before the first one). `key` is stable across edits elsewhere in the
// file: heading slug (or diagram source hash) plus a counter for repeats.
export function pieces(doc) {
  const raw = [];
  let cur = null; // open md piece
  let heading = "";
  let fence = null; // { mark, mermaid, start, codeStart }
  let pos = 0;

  const closeMd = (at) => {
    if (cur && at > cur.start) raw.push({ kind: "md", start: cur.start, end: at, heading: cur.heading });
    cur = null;
  };

  while (pos < doc.length) {
    let eol = doc.indexOf("\n", pos);
    const next = eol < 0 ? doc.length : eol + 1;
    const line = doc.slice(pos, eol < 0 ? doc.length : eol).replace(/\r$/, "");

    if (fence) {
      const m = FENCE.exec(line);
      if (m && m[1][0] === fence.mark[0] && m[1].length >= fence.mark.length && !m[2]) {
        if (fence.mermaid) {
          raw.push({ kind: "mermaid", start: fence.start, end: next, heading, code: doc.slice(fence.codeStart, pos) });
        }
        fence = null;
      }
    } else {
      const f = FENCE.exec(line);
      if (f) {
        const mermaid = f[2].toLowerCase() === "mermaid";
        if (mermaid) closeMd(pos);
        else if (!cur) cur = { start: pos, heading };
        fence = { mark: f[1], mermaid, start: pos, codeStart: next };
      } else {
        const h = HEADING.exec(line);
        if (h) {
          closeMd(pos);
          heading = h[2];
          cur = { start: pos, heading };
        } else if (!cur) {
          cur = { start: pos, heading };
        }
      }
    }
    pos = next;
  }
  // An unterminated mermaid fence is plain markdown, not a diagram.
  if (fence?.mermaid) cur = { start: fence.start, heading };
  else if (fence && !cur) cur = { start: fence.start, heading };
  closeMd(doc.length);

  const seen = new Map();
  return raw.map((p) => {
    const base = p.kind === "mermaid" ? `mermaid:${hash(p.code)}` : `md:${slug(p.heading)}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return { ...p, text: doc.slice(p.start, p.end), key: `${base}:${n}` };
  });
}
