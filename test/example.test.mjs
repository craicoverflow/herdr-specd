// The shipped example (examples/checkout) must pass the same checks dispatch runs.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateTasks } from "../mods/specd/core/tasks.js";

const dir = new URL("../examples/checkout/", import.meta.url);
const read = (p) => readFileSync(new URL(p, dir), "utf8");

test("examples/checkout: SHOP-42 tasks.json is valid against its plan", () => {
  const r = validateTasks(JSON.parse(read("specs/SHOP-42/tasks.json")), {
    specId: "SHOP-42",
    specPath: "specs/SHOP-42/spec.md",
    planText: read("specs/SHOP-42/plan.md"),
    isRepo: (rel) => rel === "api" || rel === "web",
  });
  assert.deepEqual(r, { errors: [], warnings: [] });
});
