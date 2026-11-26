import test from "node:test";
import assert from "node:assert/strict";
import { reviewText } from "../mods/specd/core/review.js";

// The spec's example, with its header count corrected to the two comments it shows.
const expected = `Review of specs/PROJ-123/spec.md, round 2: 2 comments.

1. Lines 42-44
   > The person opens the pane from the spec's card or the palette.
   Which card? There's no spec card in the MVP.

2. Line 118
   > Outdated
   Say what happens to an outdated comment on Submit.

Please address each comment by number, edit the file in place, and say what changed for each.`;

test("matches the spec's example byte for byte", () => {
  const out = reviewText("specs/PROJ-123/spec.md", 2, [
    { lines: [42, 44], quote: "The person opens the pane from the spec's card or the palette.", body: "Which card? There's no spec card in the MVP." },
    { lines: [118, 118], quote: "Outdated", body: "Say what happens to an outdated comment on Submit." },
  ]);
  assert.equal(out, expected);
});

test("one comment is singular", () => {
  const out = reviewText("a.md", 1, [{ lines: [1, 1], quote: "x", body: "y" }]);
  assert.match(out, /^Review of a\.md, round 1: 1 comment\.\n/);
});

test("quotes are cut to four lines", () => {
  const quote = ["a", "b", "c", "d", "e", "f"].join("\n");
  const out = reviewText("a.md", 1, [{ lines: [1, 6], quote, body: "z" }]);
  assert.match(out, /   > a\n   > b\n   > c\n   > d\n   z/);
  assert.ok(!out.includes("> e"));
});

test("multi-line bodies are indented", () => {
  const out = reviewText("a.md", 1, [{ lines: [3, 3], quote: "q", body: "one\ntwo" }]);
  assert.match(out, /   one\n   two\n/);
});
