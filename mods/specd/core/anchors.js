// Pure: no herdr or gpui imports. Lines are 1-based; offsets are UTF-16 code units.

// Offsets where each line starts.
export function lineStarts(doc) {
  const starts = [0];
  for (let i = 0; i < doc.length; i++) if (doc.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}

// The 1-based line holding a whole-file offset.
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
export function anchor(doc, starts, piece, range) {
  const start = piece.start + range.start;
  const end = piece.start + range.end;
  const quote = doc.slice(start, end);
  return {
    start,
    end,
    lines: [lineOf(starts, start), lineOf(starts, Math.max(start, end - 1))],
    quote,
    ok: quote === piece.text.slice(range.start, range.end),
  };
}

// The parts of whole-file ranges that fall inside one piece, in that piece's own offsets.
export function localRanges(piece, ranges) {
  const out = [];
  for (const r of ranges) {
    const s = Math.max(r.start, piece.start);
    const e = Math.min(r.end, piece.end);
    if (s < e) out.push({ start: s - piece.start, end: e - piece.start, ref: r });
  }
  return out;
}
