// Pure: no herdr or gpui imports. Pending comments live in state.pending, kept in document order.
// Each: { start, end, lines: [a, b], quote, body }. Every function returns a new state.
import { anchor } from "./anchors.js";

const clone = (x) => JSON.parse(JSON.stringify(x));

function cleanBody(body) {
  const b = String(body ?? "").trim();
  if (!b) throw new Error("The comment is empty.");
  return b;
}

function at(s, i) {
  if (!Number.isInteger(i) || i < 0 || i >= s.pending.length) throw new Error(`No comment ${i + 1} to change.`);
}

export function addComment(s, a, body) {
  const c = { start: a.start, end: a.end, lines: [...a.lines], quote: a.quote, body: cleanBody(body) };
  const next = clone(s);
  next.pending.push(c);
  next.pending.sort((x, y) => x.start - y.start || x.end - y.end); // stable: ties keep insertion order
  return next;
}

export function editComment(s, i, body) {
  at(s, i);
  const b = cleanBody(body);
  const next = clone(s);
  next.pending[i].body = b;
  return next;
}

export function removeComment(s, i) {
  at(s, i);
  const next = clone(s);
  next.pending.splice(i, 1);
  return next;
}

// Index of the piece holding a whole-file offset, or -1.
export function pieceIndexAt(pieces, offset) {
  return pieces.findIndex((p) => offset >= p.start && offset < p.end);
}

// A TextView selection range in `piece` -> { ok: true, ...anchor } or { ok: false, reason }.
export function selectionAnchor(doc, starts, piece, range) {
  if (!range || !(range.end > range.start)) return { ok: false, reason: "Can't comment on this selection." };
  const a = anchor(doc, starts, piece, range);
  if (!a.ok) return { ok: false, reason: "Can't comment on this selection: its source text doesn't match." };
  return a;
}
