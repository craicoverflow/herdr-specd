import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadAdapter } from "../mods/specr/core/adapters.js";
import { findSpecs, suggestId, pickPlan } from "../mods/specr/core/found.js";

const adapter = loadAdapter(readFileSync(new URL("../mods/specr/adapters/agent-skills.json", import.meta.url), "utf8"));
const files = ["specs/PROJ-9/spec.md", "SPEC.md", "SPEC-auth.md", "docs/SPEC.md", "spec/billing.md",
  "docs/notes.md", "specs/PROJ-9/notes.md", "README.md", "specs/a/b/spec.md", "specs/recorded/spec.md", "SPEC-gone.md"];

test("specs are found in specr's layout and the framework's locations", () => {
  const found = findSpecs(adapter, files, { recorded: ["specs/recorded/spec.md"], dismissed: ["SPEC-gone.md"] });
  assert.deepEqual(found, [
    { path: "specs/PROJ-9/spec.md", id: "PROJ-9" }, { path: "SPEC.md", id: null }, { path: "SPEC-auth.md", id: "auth" },
    { path: "docs/SPEC.md", id: null }, { path: "spec/billing.md", id: "billing" }]);
});

test("a folder's own paths.spec override is matched too", () => {
  assert.deepEqual(findSpecs(adapter, ["docs/x.md", "SPEC.md"], { specPattern: "docs/{id}.md" }).map((f) => f.id), ["x", null]);
});

test("adapters without discover still find specr's layout", () => {
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
