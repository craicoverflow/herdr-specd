import test from "node:test";
import assert from "node:assert/strict";
import { addComment, editComment, removeComment, pieceIndexAt, selectionAnchor } from "../mods/specr/core/comments.js";
import { createSpec, parseState, serializeState } from "../mods/specr/core/state.js";
import { pieces } from "../mods/specr/core/pieces.js";
import { lineStarts } from "../mods/specr/core/anchors.js";

const paths = { spec: "s.md" };
const fresh = () => createSpec({ id: "A-1", brief: "b", paths });
const a = (start, end, lines = [1, 1]) => ({ start, end, lines, quote: "q" + start });

test("addComment keeps pending in document order and trims the body", () => {
  let s = addComment(fresh(), a(50, 60), "  second  ");
  s = addComment(s, a(10, 20), "first");
  assert.deepEqual(s.pending.map((c) => c.start), [10, 50]);
  assert.equal(s.pending[1].body, "second");
});

test("addComment refuses an empty body and leaves state alone", () => {
  const s = fresh();
  assert.throws(() => addComment(s, a(1, 2), "   "), /empty/i);
  assert.equal(s.pending.length, 0);
});

test("addComment does not mutate its input", () => {
  const s = fresh();
  addComment(s, a(1, 2), "x");
  assert.equal(s.pending.length, 0);
});

test("editComment changes only the body of the indexed comment", () => {
  let s = addComment(addComment(fresh(), a(1, 2), "one"), a(5, 6), "two");
  s = editComment(s, 1, "two!");
  assert.equal(s.pending[1].body, "two!");
  assert.equal(s.pending[1].quote, "q5");
  assert.equal(s.pending[0].body, "one");
});

test("editComment refuses empty body and unknown index", () => {
  const s = addComment(fresh(), a(1, 2), "one");
  assert.throws(() => editComment(s, 0, ""), /empty/i);
  assert.throws(() => editComment(s, 3, "x"), /no comment/i);
});

test("removeComment drops the comment; the rest keep their order", () => {
  let s = addComment(addComment(addComment(fresh(), a(1, 2), "a"), a(5, 6), "b"), a(9, 10), "c");
  s = removeComment(s, 1);
  assert.deepEqual(s.pending.map((c) => c.body), ["a", "c"]);
  assert.throws(() => removeComment(s, 5), /no comment/i);
});

test("pending comments survive a state.json round trip", () => {
  const s = addComment(fresh(), a(10, 20, [2, 3]), "keep me");
  assert.deepEqual(parseState(serializeState(s)).pending, s.pending);
});

const doc = "# One\n\nalpha\n\n```mermaid\ngraph TD\nA-->B\n```\n\n## Two\n\nbeta\n";

test("pieceIndexAt finds the piece holding an offset", () => {
  const ps = pieces(doc);
  assert.equal(pieceIndexAt(ps, 0), 0);
  assert.equal(pieceIndexAt(ps, doc.indexOf("alpha")), 0);
  assert.equal(pieceIndexAt(ps, doc.indexOf("graph")), 1);
  assert.equal(pieceIndexAt(ps, doc.indexOf("beta")), ps.length - 1);
});

test("pieceIndexAt returns -1 outside every piece", () => {
  assert.equal(pieceIndexAt(pieces(doc), 9999), -1);
});

test("selectionAnchor maps a piece-local range to lines matching the file", () => {
  const ps = pieces(doc);
  const starts = lineStarts(doc);
  const i = ps.length - 1;
  const local = ps[i].text.indexOf("beta");
  const r = selectionAnchor(doc, starts, ps[i], { start: local, end: local + 4 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.lines, [12, 12]);
  assert.equal(doc.split("\n").slice(11, 12).join("\n"), "beta");
});

test("selectionAnchor says why when there is no range", () => {
  const r = selectionAnchor(doc, lineStarts(doc), pieces(doc)[0], undefined);
  assert.equal(r.ok, false);
  assert.match(r.reason, /can't comment/i);
});

test("selectionAnchor rejects an empty or non round-tripping range", () => {
  const ps = pieces(doc);
  assert.equal(selectionAnchor(doc, lineStarts(doc), ps[0], { start: 3, end: 3 }).ok, false);
});

// The four selections from the acceptance criteria, on the PROJ-123 fixture spec: the reported
// lines must hold the selected text, as `sed -n '<a>,<b>p'` shows it.
import { readFileSync } from "node:fs";
const big = readFileSync(new URL("fixtures/specs/PROJ-123/spec.md", import.meta.url), "utf8");
const cases = {
  "a paragraph": "Rendering a diagram takes about a second once the browser is warm",
  "a table cell": "A source range `[start, end)` in UTF-16 offsets",
  "two list items": "a comment whose text is found keeps its place, moved to the new offsets;\n- a comment whose text is gone",
  "text after a diagram": "send comments one at a time",
};
for (const [name, needle] of Object.entries(cases)) {
  test(`selection in ${name}: lines match sed -n`, () => {
    const ps = pieces(big);
    const at = big.indexOf(needle);
    assert.ok(at >= 0, "needle is in the fixture");
    const p = ps[pieceIndexAt(ps, at)];
    const r = selectionAnchor(big, lineStarts(big), p, { start: at - p.start, end: at - p.start + needle.length });
    assert.equal(r.ok, true);
    const sed = big.split("\n").slice(r.lines[0] - 1, r.lines[1]).join("\n");
    assert.ok(sed.includes(needle), `lines ${r.lines} contain the selection`);
    assert.ok(r.lines[0] === r.lines[1] || needle.includes("\n"));
  });
}
