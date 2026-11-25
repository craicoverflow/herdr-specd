// Node test for the spike's pure logic, against the fixture spec. Run: node spike/logic.test.mjs
// It simulates what TextView reports (piece-local UTF-16 ranges) and checks the mapping back to
// whole-file offsets and 1-based source lines, using an independent line count as the oracle.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const L = await import("./mod/logic.js");
const doc = readFileSync(new URL("./fixtures/specs/PROJ-123/spec.md", import.meta.url), "utf8");
const segs = L.segments(doc);
const starts = L.lineStarts(doc);

// Oracle: the 1-based line of a whole-file offset, by counting newlines before it.
const oracleLine = (off) => doc.slice(0, off).split("\n").length;

let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`ok  ${name}`); };

check("pieces tile the file exactly, in order", () => {
  let at = 0;
  for (const s of segs) { assert.equal(s.start, at); at = s.end; }
  assert.equal(at, doc.length);
  assert.equal(segs.filter((s) => s.kind === "mermaid").length, 2);
  assert.ok(segs.find((s) => s.kind === "mermaid").code.startsWith("flowchart TD"));
});

check("a ```js fence is not mistaken for mermaid", () => {
  const md = segs.filter((s) => s.kind === "md").map((s) => s.text).join("");
  assert.ok(md.includes("const global = { start: piece.start"));
});

// Select `needle` inside whichever md piece holds it, the way TextView would report it.
function select(needle, nth = 0) {
  let from = 0, idx = -1;
  for (let i = 0; i <= nth; i++) { idx = doc.indexOf(needle, from); from = idx + 1; }
  assert.ok(idx >= 0, `fixture lacks ${JSON.stringify(needle)}`);
  const seg = segs.find((s) => s.kind === "md" && s.start <= idx && idx + needle.length <= s.end);
  assert.ok(seg, `${JSON.stringify(needle)} crosses a piece boundary`);
  const local = { start: idx - seg.start, end: idx - seg.start + needle.length };
  return { seg, local, idx, a: L.anchor(doc, starts, seg, local) };
}

const cases = [
  ["first paragraph, piece 0", "comment on exactly the passage they mean"],
  ["after the flowchart (piece 2)", "The rendered text is not the source"],
  ["table cell", "A source range `[start, end)` in UTF-16 offsets"],
  ["across two list items", "a comment whose text is found keeps its place, moved to the new offsets;\n- a comment whose text is gone"],
  ["text after the astral 𝑓 (2 UTF-16 units)", "which\n  takes two UTF-16 code units"],
  ["the 𝑓 itself", "𝑓"],
  ["after the second diagram (last piece)", "send comments one at a time"],
];
for (const [name, needle] of cases) {
  check(`anchor: ${name}`, () => {
    const { a, idx } = select(needle);
    assert.equal(a.ok, true, "round trip");
    assert.equal(a.start, idx);
    assert.equal(a.quote, needle);
    assert.deepEqual(a.lines, [oracleLine(idx), oracleLine(idx + needle.length - 1)]);
  });
}

check("the 𝑓 is 2 code units and lines stay right after it", () => {
  const { a } = select("𝑓");
  assert.equal(a.end - a.start, 2);
  const after = select("café → bistro arrow");
  assert.equal(after.a.lines[0], oracleLine(after.idx));
});

check("localRanges clips a whole-file range to each piece", () => {
  const md = segs.filter((s) => s.kind === "md");
  const span = { start: md[0].end - 10, end: md[1].start + 10 }; // straddles the first diagram
  assert.deepEqual(L.localRanges(md[0], [span]).map((r) => [r.start, r.end]), [[md[0].text.length - 10, md[0].text.length]]);
  assert.deepEqual(L.localRanges(md[1], [span]).map((r) => [r.start, r.end]), [[0, 10]]);
});

check("reviewText numbers comments and quotes source lines", () => {
  const { a } = select("The person opens the pane from the spec's card or the palette.");
  const t = L.reviewText("specs/PROJ-123/spec.md", 1, [{ ...a, body: "Which card?" }]);
  assert.match(t, /^Review of specs\/PROJ-123\/spec\.md, round 1: 1 comment\./);
  assert.match(t, new RegExp(`1\\. Line ${a.lines[0]}\\n   > The person opens the pane`));
});

check("hash is stable and alpha appends a byte", () => {
  assert.equal(L.hash("flowchart LR"), L.hash("flowchart LR"));
  assert.notEqual(L.hash("a"), L.hash("b"));
  assert.equal(L.alpha("#abc", 0.5), "#aabbcc80");
  assert.equal(L.alpha("#112233ff", 0.25), "#11223340");
});

console.log(`\n${passed} checks passed · ${doc.split("\n").length} lines · ${segs.length} pieces`);
