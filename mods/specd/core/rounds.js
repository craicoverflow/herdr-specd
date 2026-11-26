// Pure: no herdr or gpui imports. Compares a file with the last round's copy, section by
// section, and re-finds last round's comments by their quoted text. Offsets are UTF-16.
import { pieces } from "./pieces.js";
import { lineStarts, lineOf } from "./anchors.js";

const HEADING_LINE = /^ {0,3}#{1,6}[ \t]+/;

// Split at headings: [{ heading, key, start, end, text }] tiling the doc. `key` is the heading
// plus a counter for repeats; text before the first heading is a section with heading "".
export function sections(doc) {
  const out = [];
  for (const p of pieces(doc)) {
    const last = out[out.length - 1];
    const startsSection = p.kind === "md" && HEADING_LINE.test(p.text);
    if (last && !startsSection) {
      last.end = p.end;
    } else {
      out.push({ heading: p.heading, start: p.start, end: p.end });
    }
  }
  const seen = new Map();
  return out.map((s) => {
    const n = seen.get(s.heading) ?? 0;
    seen.set(s.heading, n + 1);
    return { ...s, key: `${s.heading}\u0000${n}`, text: doc.slice(s.start, s.end) };
  });
}

// Current sections tagged "new" | "changed" | "unchanged" (against the same heading in the old
// file); old sections whose heading is gone are `removed`. A renamed heading is therefore one
// removed section plus one new one. Trailing whitespace is ignored so appending a section does
// not mark the one before it changed.
export function diffSections(oldDoc, newDoc) {
  const before = new Map(sections(oldDoc).map((s) => [s.key, s]));
  const cur = sections(newDoc).map((s) => {
    const old = before.get(s.key);
    before.delete(s.key);
    const status = !old ? "new" : old.text.trimEnd() === s.text.trimEnd() ? "unchanged" : "changed";
    return { ...s, status };
  });
  return { sections: cur, removed: [...before.values()] };
}

// Re-anchor comments ({ start, end, quote, body, ... }) in newDoc by quote. Every comment comes
// back, in order, with status "anchored" (one match), "moved" (several: nearest the old start)
// or "outdated" (none; offsets and lines are left as they were).
export function reanchor(_oldDoc, newDoc, comments) {
  const starts = lineStarts(newDoc);
  return comments.map((c) => {
    const hits = [];
    if (c.quote) for (let i = newDoc.indexOf(c.quote); i >= 0; i = newDoc.indexOf(c.quote, i + 1)) hits.push(i);
    if (!hits.length) return { ...c, status: "outdated" };
    const at = hits.reduce((b, h) => (Math.abs(h - c.start) < Math.abs(b - c.start) ? h : b));
    const end = at + c.quote.length;
    return {
      ...c,
      start: at,
      end,
      lines: [lineOf(starts, at), lineOf(starts, Math.max(at, end - 1))],
      status: hits.length === 1 ? "anchored" : "moved",
    };
  });
}

// Everything the document view needs about the last round: tagged sections, removed sections,
// last round's comments re-found in newDoc, and statusAt(offset) -> the status of the section
// holding that offset. null when there is no last round, or nothing differs and no comments.
export function roundChanges(oldDoc, newDoc, oldComments = []) {
  if (oldDoc == null || newDoc == null) return null;
  const { sections: secs, removed } = diffSections(oldDoc, newDoc);
  const statusAt = (at) => (secs.find((s) => at >= s.start && at < s.end) ?? secs[secs.length - 1])?.status ?? "unchanged";
  return { sections: secs, removed, comments: reanchor(oldDoc, newDoc, oldComments), statusAt };
}
