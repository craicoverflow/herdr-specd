import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestId, relativeTo, planAdoption } from "../mods/specd/core/adopt.js";

test("suggestId: PROJ-9.md -> PROJ-9; spec.md in a folder -> the folder name", () => {
  assert.equal(suggestId("/w/docs/PROJ-9.md"), "PROJ-9");
  assert.equal(suggestId("/w/specs/PROJ-9/spec.md"), "PROJ-9");
  assert.equal(suggestId("/w/my notes.md"), "my-notes");
  assert.equal(suggestId("/w/9lives.md"), "9lives"); // IDs may start with a digit
  assert.equal(suggestId("/w/specs/003-photo-albums/spec.md"), "003-photo-albums"); // spec-kit
  assert.equal(suggestId("/w/123.md"), "123");
  assert.equal(suggestId("/w/--.md"), "");
});

test("relativeTo: inside the folder it's relative, outside it stays absolute", () => {
  assert.equal(relativeTo("/w", "/w/docs/a.md"), "docs/a.md");
  assert.equal(relativeTo("/w/", "/w/a.md"), "a.md");
  assert.equal(relativeTo("/w", "/other/a.md"), "/other/a.md");
  assert.equal(relativeTo("/w", "/wx/a.md"), "/wx/a.md");
});

test("planAdoption: PROJ-9.md alone -> spec review, file left where it is", () => {
  const s = planAdoption({ folder: "/w", id: "PROJ-9", spec: "/w/PROJ-9.md", existingIds: [] });
  assert.equal(s.id, "PROJ-9");
  assert.equal(s.phase, "spec");
  assert.equal(s.status, "review");
  assert.deepEqual(s.paths, { spec: "PROJ-9.md" });
});

test("planAdoption: with a plan -> plan review; tasks recorded", () => {
  const s = planAdoption({ folder: "/w", id: "P", spec: "/w/s.md", plan: "/w/p.md", tasks: "/w/t.json", existingIds: [] });
  assert.equal(s.phase, "plan");
  assert.equal(s.status, "review");
  assert.deepEqual(s.paths, { spec: "s.md", plan: "p.md", tasks: "t.json" });
});

test("planAdoption: refuses a used ID, a missing spec, a non-markdown spec", () => {
  assert.throws(() => planAdoption({ folder: "/w", id: "P", spec: "/w/s.md", existingIds: ["P"] }), /already exists/);
  assert.throws(() => planAdoption({ folder: "/w", id: "P", existingIds: [] }), /spec file/);
  assert.throws(() => planAdoption({ folder: "/w", id: "P", spec: "/w/s.txt", existingIds: [] }), /markdown/);
});

test("planAdoption: one file is adopted once", () => {
  const recorded = [{ id: "PROJ-1", spec: "docs/SPEC.md" }];
  assert.throws(() => planAdoption({ folder: "/w", id: "PROJ-2", spec: "/w/docs/SPEC.md", existingIds: ["PROJ-1"], recorded }), /already adopted as PROJ-1/);
  assert.equal(planAdoption({ folder: "/w", id: "PROJ-2", spec: "/w/docs/OTHER.md", existingIds: ["PROJ-1"], recorded }).id, "PROJ-2");
});
