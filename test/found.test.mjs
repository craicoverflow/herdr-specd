import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadAdapter } from "../mods/specd/core/adapters.js";
import { findSpecs, suggestId, pickPlan, sourceSpecOf, findPlanFor, sameSpec } from "../mods/specd/core/found.js";

const adapter = loadAdapter(readFileSync(new URL("../mods/specd/adapters/agent-skills.json", import.meta.url), "utf8"));
const files = ["specs/PROJ-9/spec.md", "SPEC.md", "SPEC-auth.md", "docs/SPEC.md", "spec/billing.md",
  "docs/notes.md", "specs/PROJ-9/notes.md", "README.md", "specs/a/b/spec.md", "specs/recorded/spec.md", "SPEC-gone.md"];

test("specs are found in specd's layout and the framework's locations", () => {
  const found = findSpecs(adapter, files, { recorded: ["specs/recorded/spec.md"], dismissed: ["SPEC-gone.md"] });
  assert.deepEqual(found, [
    { path: "specs/PROJ-9/spec.md", id: "PROJ-9" }, { path: "SPEC.md", id: null }, { path: "SPEC-auth.md", id: "auth" },
    { path: "docs/SPEC.md", id: null }, { path: "spec/billing.md", id: "billing" }]);
});

test("a folder's own paths.spec override is matched too", () => {
  assert.deepEqual(findSpecs(adapter, ["docs/x.md", "SPEC.md"], { specPattern: "docs/{id}.md" }).map((f) => f.id), ["x", null]);
});

test("adapters without discover still find specd's layout", () => {
  const a = structuredClone(adapter); delete a.discover;
  assert.deepEqual(findSpecs(a, files).map((f) => f.path), ["specs/PROJ-9/spec.md", "specs/recorded/spec.md"]);
});

test("ID suggestion", () => {
  assert.equal(suggestId("# PROJ-123: Login\n\nbody"), "PROJ-123");
  assert.equal(suggestId("# Spec: Login flow\n"), "login-flow");
  assert.equal(suggestId("intro\n\n# Billing & Invoices!\n"), "billing-invoices");
  assert.equal(suggestId("no heading"), "");
});

test("a plan is attached only when its Source spec names the spec", () => {
  const plans = { "tasks/plan.md": "# Plan\n\nSource spec: SPEC-auth.md\n", "other/plan.md": "Source spec: SPEC.md" };
  assert.equal(pickPlan(adapter, "SPEC-auth.md", plans), "tasks/plan.md");
  assert.equal(pickPlan(adapter, "SPEC.md", plans), null); // other/plan.md isn't a discover.plans path
  assert.equal(pickPlan(adapter, "SPEC-auth.md", { "tasks/plan.md": "Source spec: SPEC-auth.md.bak" }), null);
  const a = structuredClone(adapter); delete a.discover;
  assert.equal(pickPlan(a, "SPEC-auth.md", plans), null);
});

import { parseDismissed, withDismissed, unseen } from "../mods/specd/core/found.js";

test("dismissed.json is read tolerantly and written without duplicates", () => {
  assert.deepEqual(parseDismissed('["SPEC.md",3,"a.md"]'), ["SPEC.md", "a.md"]);
  assert.deepEqual(parseDismissed("not json"), []);
  assert.deepEqual(parseDismissed(null), []);
  assert.deepEqual(withDismissed(["a.md"], "a.md"), ["a.md"]);
  assert.deepEqual(withDismissed(["a.md"], "b.md"), ["a.md", "b.md"]);
});

test("unseen: only paths not yet announced, so each gets one notification", () => {
  const seen = new Set(["SPEC.md"]);
  const f = [{ path: "SPEC.md" }, { path: "SPEC-auth.md" }];
  assert.deepEqual(unseen(f, seen).map((x) => x.path), ["SPEC-auth.md"]);
});

test("a file named for a ticket is a spec, its key the ID; deep paths and lower-case names are not", () => {
  const found = findSpecs(adapter, ["PROJ-123.md", "docs/ABC-7-export.md", "a/b/c/PROJ-9.md", "proj-1.md", "rfcs/0001-rate-limit.md"]);
  assert.deepEqual(found, [{ path: "PROJ-123.md", id: "PROJ-123" }, { path: "docs/ABC-7-export.md", id: "ABC-7" }, { path: "rfcs/0001-rate-limit.md", id: "0001-rate-limit" }]);
});

test("sourceSpecOf reads the first Source spec line, dropping code marks and tails", () => {
  assert.equal(sourceSpecOf("# Plan\n\n**Source spec:** `SPEC.md` (delta on docs/SPEC.md)\n"), "SPEC.md");
  assert.equal(sourceSpecOf("Source spec: specs/a/spec.md · Task list: x"), "specs/a/spec.md");
  assert.equal(sourceSpecOf("# Plan\nno line"), null);
});

test("findPlanFor: the plan written for this spec, never another spec's, with its task list", () => {
  const files = {
    "tasks/plan.md": "Source spec: SPEC-other.md\n# Plan",
    "plans/export/plan.md": "# Plan\nSource spec: `SPEC-export.md`\n",
    "plans/export/todo.md": "Source spec: SPEC-export.md\n- [ ] Task 1",
  };
  assert.deepEqual(findPlanFor("SPEC-export.md", files), { plan: "plans/export/plan.md", tasks: "plans/export/todo.md" });
  assert.equal(findPlanFor("SPEC-none.md", files), null);
  assert.ok(sameSpec("SPEC.md", "repo/SPEC.md") && !sameSpec("SPEC.md", "OTHER-SPEC.md"));
});
