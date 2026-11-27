// io/manifest.js and io/files.js against real files, a fake model and no Herdr.
import "./support/register.mjs";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { setup, folder, fakeLlm, item, NATIVE, TICKET } from "./support/folder.mjs";

const home = setup();
after(() => fs.rmSync(home, { recursive: true, force: true }));
const M = await import("../mods/specd/io/manifest.js");
const F = await import("../mods/specd/io/files.js");
const { skipPlan } = await import("../mods/specd/core/state.js");
const { planApproval } = await import("../mods/specd/core/newspec.js");
const { dispatchRows } = await import("../mods/specd/core/dispatch.js");
const { defaultAdapter } = await import("../mods/specd/io/agents.js");
const adapter = await defaultAdapter();

async function native(name) {
  const dir = folder(name, { files: NATIVE });
  const state = await F.adoptFiles(dir, { id: "streaks", spec: `${dir}/SPEC.md`, plan: `${dir}/tasks/plan.md`, tasks: `${dir}/tasks/todo.md` });
  return { dir, state };
}
const manifestOf = (dir, id) => JSON.parse(fs.readFileSync(`${dir}/.specd/specs/${id}/manifest.json`, "utf8"));

test("a native plan is worked out once, then read from manifest.json; an edit is worked out again with the earlier ids", async () => {
  const { dir, state } = await native("cache");
  const llm = fakeLlm([item("t1", "Streak list"), item("t3", "Warn on a second done", ["t1"])]);
  let r = await M.loadPlanned(dir, state, { llm });
  assert.deepEqual([r.derived, r.items.length, llm.calls], [true, 2, 1]);
  assert.match(llm.last(), /=== SPEC.md \(spec\) ===/);
  assert.match(llm.last(), /=== tasks\/todo.md \(task list\) ===\n {3}1\| # Todo/);
  r = await M.loadPlanned(dir, state, { llm });
  assert.deepEqual([r.derived, llm.calls], [false, 1]);

  fs.appendFileSync(`${dir}/tasks/todo.md`, "- [ ] Task 4: README section\n");
  const again = fakeLlm([item("t1", "Streak list"), item("t3", "Warn on a second done", ["t1"]), item("t4", "README section")]);
  r = await M.loadPlanned(dir, state, { llm: again });
  assert.equal(r.changed, "tasks/todo.md changed since this list was made: 2 → 3 tasks · new: README section");
  assert.match(again.last(), /An earlier version of this list exists[^\n]*\n\[\{"id":"t1"/);
  assert.equal((await M.loadBuildItems(dir, state)).length, 3);
});

test("asking again: the note is in the prompt, kept in the manifest and used on the next re-derive", async () => {
  const { dir, state } = await native("note");
  await M.loadPlanned(dir, state, { llm: fakeLlm([item("t1", "A"), item("t2", "B")]) });
  const llm = fakeLlm([item("t1", "A and B")]);
  const r = await M.loadPlanned(dir, state, { llm, note: "one task for the CLI" });
  assert.match(llm.last(), /The person reviewing the list asks[^\n]*\none task for the CLI/);
  assert.match(r.changed, /^Asked again: 2 → 1 tasks/);
  assert.equal(manifestOf(dir, "streaks").note, "one task for the CLI");
  fs.appendFileSync(`${dir}/tasks/plan.md`, "\nMore detail.\n");
  await M.loadPlanned(dir, state, { llm });
  assert.match(llm.last(), /one task for the CLI/);
});

test("done items are left out and nothing waits for them; the repos offered are the folder's git repos", async () => {
  const dir = folder("done", { files: { "docs/SPEC.md": "# Spec: Saved searches\n", "tasks/plan.md": "# Plan\n- [x] 1\n- [ ] 2\n- [ ] 3\n" }, repos: ["api", "web"] });
  const state = await F.adoptFiles(dir, { id: "search", spec: `${dir}/docs/SPEC.md`, plan: `${dir}/tasks/plan.md` });
  const llm = fakeLlm([item("t1", "Schema", [], { repo: "api", done: true }), item("t2", "Endpoint", ["t1"], { repo: "api" }), item("t3", "Search bar", ["t2"], { repo: "web" })]);
  const r = await M.loadPlanned(dir, state, { llm });
  assert.match(llm.last(), /Git repositories in the folder: "api", "web"/);
  assert.deepEqual(r.items.map((i) => [i.id, i.deps]), [["t2", []], ["t3", ["t2"]]]);
  assert.deepEqual(r.done.map((i) => i.title), ["Schema"]);
  const rows = dispatchRows({ tasks: { items: r.items }, state, adapter, config: null, folder: dir, docs: r.docs });
  assert.deepEqual(rows.map((x) => x.folder), [`${dir}/api`, `${dir}/web`]);
});

test("an item in a repo that isn't there is sent back once, then shown as an error naming it", async () => {
  const dir = folder("repo", { files: { "docs/SPEC.md": "# Spec\n", "tasks/plan.md": "# Plan\n\n1. Producer shim\n" }, repos: ["api", "web"] });
  const state = await F.adoptFiles(dir, { id: "x", spec: `${dir}/docs/SPEC.md`, plan: `${dir}/tasks/plan.md` });
  const llm = fakeLlm([item("t9", "Producer shim", [], { repo: "producer" })]);
  const r = await M.loadPlanned(dir, state, { llm });
  assert.equal(llm.calls, 2);
  assert.match(llm.last(), /It has 1 error:\n- "t9" \(Producer shim\): repo "producer" is not one of "api", "web"/);
  assert.match(r.errors.join("\n"), /"t9" \(Producer shim\): repo "producer"/);
  assert.equal(fs.existsSync(`${dir}/.specd/specs/x/manifest.json`), false);
});

test("a model failure is shown and nothing is saved", async () => {
  const { dir, state } = await native("fail");
  const r = await M.loadPlanned(dir, state, { llm: fakeLlm(() => ({ ok: false, error: "You've hit your limit" })) });
  assert.deepEqual(r.errors, ["Couldn't work out the tasks: You've hit your limit"]);
  assert.equal(fs.existsSync(`${dir}/.specd/specs/streaks/manifest.json`), false);
});

test("one task needs no model; a folder of two repos that isn't one itself is an error naming the task", async () => {
  const dir = folder("ticket", { files: TICKET });
  const state = await F.adoptFiles(dir, { id: "PROJ-123", spec: `${dir}/PROJ-123.md` });
  const none = fakeLlm(() => assert.fail("no model for one task"));
  const r = await M.loadPlanned(dir, skipPlan(state, { asPlan: false }), { llm: none });
  assert.deepEqual(r.items.map((i) => [i.title, i.repo, i.source.endLine]), [["Export the monthly report as CSV", ".", 4]]);

  const two = folder("ticket2", { files: TICKET, repos: ["api", "web"] });
  const s2 = await F.adoptFiles(two, { id: "PROJ-123", spec: `${two}/PROJ-123.md` });
  const e = await M.loadPlanned(two, skipPlan(s2, { asPlan: false }), { llm: none });
  assert.match(e.errors[0], /Can't tell which repository "PROJ-123: Export the monthly report as CSV" runs in: .*api, web/);
});

test("switching from one task to the spec as its own plan works the list out fresh", async () => {
  const dir = folder("switch", { files: TICKET });
  const state = await F.adoptFiles(dir, { id: "PROJ-123", spec: `${dir}/PROJ-123.md` });
  await M.loadPlanned(dir, skipPlan(state, { asPlan: false }), {});
  const llm = fakeLlm([item("a", "CSV writer", [], { source: { file: "PROJ-123.md", startLine: 1, endLine: 3 } })]);
  const r = await M.loadPlanned(dir, skipPlan(state, { asPlan: true }), { llm });
  assert.deepEqual([r.derived, r.changed, llm.calls], [true, undefined, 1]);
  assert.match(llm.last(), /=== PROJ-123.md \(spec\+plan\) ===/);
  assert.equal(manifestOf(dir, "PROJ-123").via, "spec");
});

test("a legacy tasks.json is read as it is, for the preview and the build view", async () => {
  const dir = folder("legacy", { from: "examples/checkout", repos: ["api", "web"] });
  const state = await F.adoptFiles(dir, { id: "SHOP-42", spec: `${dir}/specs/SHOP-42/spec.md`, plan: `${dir}/specs/SHOP-42/plan.md`, tasks: `${dir}/specs/SHOP-42/tasks.json` });
  const r = await M.loadPlanned(dir, state, { llm: fakeLlm(() => assert.fail("no model for tasks.json")) });
  assert.equal(r.legacy, true);
  assert.ok(r.items.length > 0, JSON.stringify(r.errors));
  assert.equal((await M.loadBuildItems(dir, state)).length, r.items.length);
});

test("an adopted spec's plan prompt names real paths; IDs may start with a digit", async () => {
  const dir = folder("digits", { files: { "specs/003-photo-albums/spec.md": "# Photo albums\n" } });
  const [found] = await F.scanFound(dir, adapter, []);
  assert.equal(found.id, "003-photo-albums");
  const state = await F.adoptFound(dir, adapter, found, found.id);
  const { message } = planApproval({ adapter, state, config: null });
  assert.doesNotMatch(message, /undefined/);
  assert.match(message, /Save the plan to specs\/003-photo-albums\/plan\.md and the task list to specs\/003-photo-albums\/todo\.md\.$/);
});

test("a ticket file is found with its key as the ID, and one file is adopted once", async () => {
  const dir = folder("found", { files: { ...TICKET, "rfcs/0001-rate-limit.md": "# RFC\n" } });
  assert.deepEqual(await F.scanFound(dir, adapter, []), [{ path: "PROJ-123.md", id: "PROJ-123" }, { path: "rfcs/0001-rate-limit.md", id: "0001-rate-limit" }]);
  await F.adoptFiles(dir, { id: "PROJ-123", spec: `${dir}/PROJ-123.md` });
  await assert.rejects(F.adoptFiles(dir, { id: "again", spec: `${dir}/PROJ-123.md` }), /PROJ-123.md is already adopted as PROJ-123/);
});

test("a plan saved elsewhere is found by its Source spec line, never one that was there before", async () => {
  const dir = folder("reloc", { files: NATIVE });
  let state = await F.adoptFiles(dir, { id: "streaks", spec: `${dir}/SPEC.md` });
  state = { ...planApproval({ adapter, state, config: null }).state, planSeen: await F.plansNaming(dir, "SPEC.md") };
  assert.deepEqual(Object.keys(state.planSeen), ["tasks/plan.md"]);
  assert.equal(await F.relocatePlan(dir, state), null, "the older tasks/plan.md is not the new plan");
  assert.equal(await F.relocatePlan(dir, { ...state, planSeen: undefined }), null, "no snapshot, no guess");
  fs.mkdirSync(`${dir}/plans`);
  fs.writeFileSync(`${dir}/plans/streaks.md`, "# Plan\n\nSource spec: `SPEC.md`\n");
  fs.writeFileSync(`${dir}/plans/todo.md`, "- [ ] Task 1\n");
  const moved = await F.relocatePlan(dir, state);
  assert.deepEqual([moved.paths.plan, moved.paths.tasks, moved.planSeen], ["plans/streaks.md", "plans/todo.md", undefined]);
});
