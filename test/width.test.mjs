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

test("the list folds Phase/Pending/Tasks under the title when narrow", async () => {
  const { listFolds } = await import("../mods/specd/core/width.js");
  assert.equal(listFolds("narrow"), true);
  assert.equal(listFolds("wide"), false);
});

test("forms stack each label above its field when narrow, and keep fixed widths when wide", async () => {
  const { formShape } = await import("../mods/specd/core/width.js");
  assert.deepEqual(formShape("wide"), { stacked: false, labelW: 110, fieldW: 240, briefW: 520 });
  assert.deepEqual(formShape("narrow"), { stacked: true, labelW: null, fieldW: null, briefW: null });
});
