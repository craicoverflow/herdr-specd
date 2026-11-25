// specr spike: the pure part. No herdr or gpui imports, so Node can test it outside the window.
// Offsets are UTF-16 code units (JS string indices), which is what TextView reports.

// Split a markdown document into text pieces and ```mermaid fences, each with its offsets in the whole file.
export function segments(doc) {
  const out = [];
  const re = /^```mermaid[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm;
  let last = 0;
  let m;
  while ((m = re.exec(doc))) {
    if (m.index > last) out.push({ kind: "md", start: last, end: m.index, text: doc.slice(last, m.index) });
    out.push({ kind: "mermaid", start: m.index, end: m.index + m[0].length, code: m[1] });
    last = m.index + m[0].length;
  }
  if (last < doc.length) out.push({ kind: "md", start: last, end: doc.length, text: doc.slice(last) });
  return out;
}

// Offsets where each line starts; line numbers are 1-based.
export function lineStarts(doc) {
  const starts = [0];
  for (let i = 0; i < doc.length; i++) if (doc.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}

export function lineOf(starts, offset) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

// A piece-local selection range -> a whole-file anchor. `ok` proves the round trip:
// slicing the whole file at the global offsets gives the same markdown as slicing the piece.
export function anchor(doc, starts, seg, range) {
  const start = seg.start + range.start;
  const end = seg.start + range.end;
  const quote = doc.slice(start, end);
  return {
    start,
    end,
    lines: [lineOf(starts, start), lineOf(starts, Math.max(start, end - 1))],
    quote,
    ok: quote === seg.text.slice(range.start, range.end),
  };
}

// The parts of whole-file ranges that fall inside one piece, in that piece's own offsets.
export function localRanges(seg, ranges) {
  const out = [];
  for (const r of ranges) {
    const s = Math.max(r.start, seg.start);
    const e = Math.min(r.end, seg.end);
    if (s < e) out.push({ start: s - seg.start, end: e - seg.start, ref: r });
  }
  return out;
}

// One message for the owner agent: every comment with its lines and the quoted source.
export function reviewText(file, round, comments) {
  const head = `Review of ${file}, round ${round}: ${comments.length} comment${comments.length === 1 ? "" : "s"}.`;
  const body = comments.map((c, i) => {
    const [a, b] = c.lines;
    const quote = c.quote.split("\n").slice(0, 4).map((l) => `   > ${l}`).join("\n");
    return `${i + 1}. ${a === b ? `Line ${a}` : `Lines ${a}-${b}`}\n${quote}\n   ${c.body.replace(/\n/g, "\n   ")}`;
  });
  return [head, ...body, "Please address each comment by number, edit the file in place, and say what changed for each."].join("\n\n");
}

// FNV-1a, 32-bit: a stable cache key for a diagram's source.
export function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

// "#rgb" / "#rrggbb" / "#rrggbbaa" -> "#rrggbb" + alpha byte.
export function alpha(color, a) {
  let c = String(color || "#888888");
  if (c.length === 4) c = `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
  return `${c.slice(0, 7)}${Math.round(a * 255).toString(16).padStart(2, "0")}`;
}
