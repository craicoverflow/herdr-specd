import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pieces } from "../mods/specd/core/pieces.js";

const doc = readFileSync(new URL("./fixtures/specs/PROJ-123/spec.md", import.meta.url), "utf8");
const ps = pieces(doc);

test("fixture spec has 272 lines", () => {
  assert.equal(doc.split("\n").length, 272);
});

test("pieces tile the file exactly, in order", () => {
  let at = 0;
  for (const p of ps) {
    assert.equal(p.start, at);
    assert.equal(p.text, doc.slice(p.start, p.end));
    at = p.end;
  }
  assert.equal(at, doc.length);
  assert.equal(ps.map((p) => p.text).join(""), doc);
});

test("a piece starts at every heading outside code fences", () => {
  const starts = new Set(ps.map((p) => p.start));
  let off = 0;
  let fence = false;
  let headings = 0;
  for (const line of doc.split("\n")) {
    if (/^(```|~~~)/.test(line)) fence = !fence;
    else if (!fence && /^#{1,6}\s/.test(line)) {
      headings++;
      assert.ok(starts.has(off), `no piece at heading ${JSON.stringify(line)}`);
    }
    off += line.length + 1;
  }
  assert.ok(headings > 10);
});

test("mermaid fences are their own pieces, with code", () => {
  const m = ps.filter((p) => p.kind === "mermaid");
  assert.equal(m.length, 2);
  assert.ok(m[0].code.startsWith("flowchart TD"));
  assert.ok(m[0].text.startsWith("```mermaid"));
});

test("a js or text fence is not split or mistaken for mermaid", () => {
  assert.ok(ps.every((p) => p.kind === "md" || p.kind === "mermaid"));
  const holder = ps.find((p) => p.text.includes("const global = { start: piece.start"));
  assert.equal(holder.kind, "md");
  // a '#' line inside a code fence must not start a piece
  const fenced = pieces("# A\n\n```sh\n# not a heading\n```\n\n## B\n");
  assert.deepEqual(fenced.map((p) => p.heading), ["A", "B"]);
});

test("each piece has a heading and a unique stable key", () => {
  const keys = ps.map((p) => p.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(ps.every((p) => typeof p.heading === "string"));
  assert.equal(ps[0].heading, "PROJ-123: Review pane for agent-written specs");
  // a diagram belongs to the heading above it
  assert.equal(ps.find((p) => p.kind === "mermaid").heading, "How a review flows");
  // keys survive an edit elsewhere in the file
  const edited = pieces("Intro line\n\n" + doc);
  const k = (arr) => arr.filter((p) => p.heading === "Objective").map((p) => p.key);
  assert.deepEqual(k(edited), k(ps));
});

test("duplicate headings get distinct keys", () => {
  const p = pieces("## X\na\n## X\nb\n");
  assert.notEqual(p[0].key, p[1].key);
});

test("empty doc has no pieces; text before the first heading is a piece", () => {
  assert.deepEqual(pieces(""), []);
  const p = pieces("hello\n# H\nx");
  assert.equal(p.length, 2);
  assert.equal(p[0].heading, "");
});
