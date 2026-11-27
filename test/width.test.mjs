import { test } from "node:test";
import assert from "node:assert/strict";
import { BREAKPOINT, layoutFor, reviewColumns } from "../mods/specd/core/width.js";

test("layoutFor edges", () => {
  assert.equal(BREAKPOINT, 640);
  for (const [w, l] of [[279, "narrow"], [280, "narrow"], [510, "narrow"], [639, "narrow"], [640, "wide"], [900, "wide"], [0, "wide"], [undefined, "wide"], [NaN, "wide"]]) {
    assert.equal(layoutFor(w), l, String(w));
  }
});

test("narrow stacks the comment column under the document; wide puts it beside", () => {
  assert.deepEqual(reviewColumns("narrow"), { direction: "column", order: ["document", "comments"] });
  assert.deepEqual(reviewColumns("wide"), { direction: "row", order: ["document", "comments"] });
});
