import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pieces } from "../mods/specd/core/pieces.js";
import { lineStarts, lineOf, anchor, localRanges } from "../mods/specd/core/anchors.js";

const doc = readFileSync(new URL("./fixtures/specs/PROJ-123/spec.md", import.meta.url), "utf8");
const ps = pieces(doc);
const starts = lineStarts(doc);
// Independent oracle: count newlines before the offset.
const oracle = (off) => doc.slice(0, off).split("\n").length;

// Select `needle` inside the md piece holding it, as TextView reports it (piece-local).
function select(needle) {
  const idx = doc.indexOf(needle);
  assert.ok(idx >= 0, `fixture lacks ${JSON.stringify(needle)}`);
  const piece = ps.find((p) => p.kind === "md" && p.start <= idx && idx + needle.length <= p.end);
  assert.ok(piece, "selection crosses a piece");
  const local = { start: idx - piece.start, end: idx - piece.start + needle.length };
  return { piece, local, idx, a: anchor(doc, starts, piece, local) };
}

const cases = [
  ["a paragraph", "comment on exactly the passage they mean"],
  ["a table cell", "A source range `[start, end)` in UTF-16 offsets"],
  ["two list items", "a comment whose text is found keeps its place, moved to the new offsets;\n- a comment whose text is gone"],
  ["text after the astral 𝑓", "which\n  takes two UTF-16 code units"],
  ["text after a diagram", "The rendered text is not the source"],
];
for (const [name, needle] of cases) {
  test(`anchor lines match an independent count: ${name}`, () => {
    const { a, idx } = select(needle);
    assert.equal(a.ok, true);
    assert.equal(a.start, idx);
    assert.equal(a.quote, needle);
    assert.deepEqual(a.lines, [oracle(idx), oracle(idx + needle.length - 1)]);
  });
}

test("the astral 𝑓 is two code units", () => {
  const { a } = select("𝑓");
  assert.equal(a.end - a.start, 2);
});

test("lineOf on boundaries", () => {
  const s = lineStarts("a\nbc\n\nd");
  assert.deepEqual(s, [0, 2, 5, 6]);
  assert.equal(lineOf(s, 0), 1);
  assert.equal(lineOf(s, 1), 1);
  assert.equal(lineOf(s, 2), 2);
  assert.equal(lineOf(s, 5), 3);
  assert.equal(lineOf(s, 6), 4);
});

test("an empty selection anchors to one line", () => {
  const p = ps[0];
  const a = anchor(doc, starts, p, { start: 3, end: 3 });
  assert.deepEqual(a.lines, [1, 1]);
});

test("localRanges clips a whole-file range to each piece", () => {
  const span = { start: ps[0].end - 10, end: ps[1].start + 10 };
  assert.deepEqual(localRanges(ps[0], [span]).map((r) => [r.start, r.end]), [[ps[0].text.length - 10, ps[0].text.length]]);
  assert.deepEqual(localRanges(ps[1], [span]).map((r) => [r.start, r.end]), [[0, 10]]);
  assert.deepEqual(localRanges(ps[2], [span]), []);
});
