import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sections, diffSections, reanchor, roundChanges } from "../mods/specr/core/rounds.js";

const read = (n) => readFileSync(new URL(`./fixtures/rounds/${n}`, import.meta.url), "utf8");
const oldDoc = read("old.md");
const newDoc = read("new.md");

test("sections split at headings and tile the file", () => {
  const s = sections(newDoc);
  assert.deepEqual(s.map((x) => x.heading), ["Title", "Goals", "Hazards", "Non-goals"]);
  assert.equal(s.map((x) => x.text).join(""), newDoc);
});

test("sections: no headings gives one preamble section; fenced # is not a heading", () => {
  assert.deepEqual(sections("just text\n").map((x) => x.heading), [""]);
  assert.equal(sections("# A\n```\n# not\n```\n").length, 1);
});

test("diff: edited, added, removed and renamed sections", () => {
  const d = diffSections(oldDoc, newDoc);
  const status = Object.fromEntries(d.sections.map((s) => [s.heading, s.status]));
  assert.deepEqual(status, { Title: "unchanged", Goals: "changed", Hazards: "new", "Non-goals": "new" });
  // renamed heading: the old name is removed, the new name is new
  assert.deepEqual(d.removed.map((s) => s.heading), ["Risks", "Appendix"]);
});

test("diff: identical files are all unchanged, nothing removed", () => {
  const d = diffSections(newDoc, newDoc);
  assert.ok(d.sections.every((s) => s.status === "unchanged"));
  assert.deepEqual(d.removed, []);
});

test("diff: appending a section does not mark the previous one changed", () => {
  const d = diffSections("# A\n\ntext", "# A\n\ntext\n\n# B\n\nmore\n");
  assert.deepEqual(d.sections.map((s) => s.status), ["unchanged", "new"]);
});

test("diff: repeated headings pair up in order", () => {
  const d = diffSections("# A\none\n# A\ntwo\n", "# A\none\n# A\nTWO\n");
  assert.deepEqual(d.sections.map((s) => s.status), ["unchanged", "changed"]);
});

const c = (quote, start, body = "b") => ({ quote, start, end: start + quote.length, body });

test("reanchor: found once is anchored at its new offset, with lines", () => {
  const quote = "Ship it safely.";
  const [r] = reanchor(oldDoc, newDoc, [c(quote, oldDoc.indexOf(quote))]);
  assert.equal(r.status, "outdated"); // that sentence was edited away
  const q2 = "Risk one.";
  const [a] = reanchor(oldDoc, newDoc, [c(q2, oldDoc.indexOf(q2))]);
  assert.equal(a.status, "anchored");
  assert.equal(a.start, newDoc.indexOf(q2));
  assert.equal(newDoc.slice(a.start, a.end), q2);
  assert.deepEqual(a.lines, [newDoc.slice(0, a.start).split("\n").length, newDoc.slice(0, a.start).split("\n").length]);
});

test("reanchor: several matches pick the nearest to the old offset and say moved", () => {
  const doc = "x foo\n" + "y".repeat(50) + "\nfoo\n" + "z".repeat(50) + "\nfoo";
  const second = doc.indexOf("foo", 10);
  const [r] = reanchor("", doc, [c("foo", second + 3)]);
  assert.equal(r.status, "moved");
  assert.equal(r.start, second);
});

test("reanchor: missing or empty quote is outdated and keeps its body", () => {
  const out = reanchor(oldDoc, newDoc, [c("gone text", 0, "say why"), { quote: "", start: 0, end: 0, body: "empty" }]);
  assert.deepEqual(out.map((x) => x.status), ["outdated", "outdated"]);
  assert.deepEqual(out.map((x) => x.body), ["say why", "empty"]);
});

test("reanchor: none dropped, order kept", () => {
  const input = [c("Intro text.", 9), c("nope", 1), c("Risk one.", 50), c("Nothing else.", 70)];
  const out = reanchor(oldDoc, newDoc, input);
  assert.equal(out.length, input.length);
  assert.deepEqual(out.map((x) => x.status), ["anchored", "outdated", "anchored", "anchored"]);
});

test("roundChanges: marks a piece by its section and re-anchors last round's comments", () => {
  const { pieces } = await_pieces();
  const comments = [c("Intro text.", 9), c("nope", 1)];
  const r = roundChanges(oldDoc, newDoc, comments);
  assert.deepEqual(r.comments.map((x) => x.status), ["anchored", "outdated"]);
  assert.equal(r.sections.length, sections(newDoc).length);
  assert.ok(r.sections.some((s) => s.status !== "unchanged"));
  for (const p of pieces) {
    const st = r.statusAt(p.start);
    assert.ok(["new", "changed", "unchanged"].includes(st));
  }
  assert.deepEqual(r.removed.map((x) => x.heading), diffSections(oldDoc, newDoc).removed.map((x) => x.heading));
  assert.equal(roundChanges(null, newDoc, comments), null);
});

function await_pieces() {
  return { pieces: sections(newDoc) };
}

test("roundChanges: editing one section marks only that section", () => {
  const a = "# T\n\n## A\nalpha\n\n## B\nbeta\n\n## C\ngamma\n";
  const b = a.replace("beta", "beta two");
  const r = roundChanges(a, b, []);
  assert.deepEqual(r.sections.map((s) => s.status), ["unchanged", "unchanged", "changed", "unchanged"]);
  assert.equal(r.statusAt(b.indexOf("beta")), "changed");
  assert.equal(r.statusAt(b.indexOf("gamma")), "unchanged");
});
