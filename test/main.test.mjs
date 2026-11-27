// main.js's handlers driven the way a person would, headless: a fake model, the fake herdr-task,
// and render() after every step (its builders are inert, so this catches errors in the views' data).
import "./support/register.mjs";
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { setup, folder, fakeLlm, item, tasks, clearTasks, NATIVE, TICKET } from "./support/folder.mjs";

const home = setup();
after(() => fs.rmSync(home, { recursive: true, force: true }));
beforeEach(clearTasks);
const { default: Specd } = await import("../mods/specd/main.js");
const F = await import("../mods/specd/io/files.js");
const { journal } = await import("./support/herdr.mjs");

let pending = [];
const cx = { notify() {}, spawn(fn) { pending.push(fn(cx)); }, timer: { every() {} }, sleep: () => Promise.resolve(), write_to_clipboard() {} };
const settle = async () => { while (pending.length) { const p = pending; pending = []; await Promise.all(p); } };

async function open(dir, id, llm) {
  const v = new Specd();
  v.init({}, cx);
  v.folder = dir;
  v.llm = llm;
  await v.open(id);
  v.render(cx);
  return v;
}
async function step(v, fn) { fn(); v.render(cx); await settle(); v.render(cx); }
const noModel = fakeLlm(() => assert.fail("no model call expected"));

test("a ticket dispatched as one task: no model, nothing changes until Confirm, then build", async () => {
  const dir = folder("one", { files: TICKET });
  await F.adoptFiles(dir, { id: "PROJ-123", spec: `${dir}/PROJ-123.md` });
  const v = await open(dir, "PROJ-123", noModel);
  await step(v, () => v.skip("single", cx));
  assert.deepEqual([v.dispatching.mode, v.dispatching.rows.length, v.spec.state.phase], ["single", 1, "spec"]);
  await step(v, () => v.confirmDispatch(cx));
  assert.ok(v.dispatching.finished, v.dispatching.error);
  assert.deepEqual([v.spec.state.phase, v.spec.state.paths], ["build", { spec: "PROJ-123.md" }]);
  assert.deepEqual(tasks().map((t) => t.title), ["PROJ-123 · Export the monthly report as CSV"]);
  v.dispatching = null;
  await v.pollBuild();
  v.render(cx);
  assert.deepEqual([v.build.done, v.build.total], [0, 1]);
});

test("a native plan: preview, ask again, an edit makes Confirm refuse once, then dispatch", async () => {
  const dir = folder("plan", { files: NATIVE });
  await F.adoptFiles(dir, { id: "streaks", spec: `${dir}/SPEC.md`, plan: `${dir}/tasks/plan.md`, tasks: `${dir}/tasks/todo.md` });
  let answer = [item("t1", "Streak list"), item("t2", "Done stamps the date", [], { done: true }), item("t3", "Warn on a second done", ["t2"])];
  const llm = fakeLlm(() => ({ ok: true, json: { items: answer } }));
  const v = await open(dir, "streaks", llm);
  assert.equal(v.spec.state.phase, "plan");

  await step(v, () => v.approve(cx));
  assert.deepEqual(v.dispatching.rows.map((r) => [r.item.id, r.deps]), [["t1", []], ["t3", []]]);
  assert.deepEqual(v.dispatching.done.map((i) => i.title), ["Done stamps the date"]);

  answer = [item("t1", "Streak list and warnings")];
  v.noteInput.set_value("one task for the CLI");
  await step(v, () => v.noteInput.fire("submit", cx));
  assert.match(llm.last(), /one task for the CLI/);
  assert.equal(v.noteInput.value(), "");
  assert.match(v.dispatching.changed, /^Asked again: 2 → 1 tasks/);

  fs.appendFileSync(`${dir}/tasks/todo.md`, "- [ ] Task 4: README section\n");
  answer = [item("t1", "Streak list and warnings"), item("t4", "README section", ["t1"])];
  await step(v, () => v.confirmDispatch(cx));
  assert.equal(tasks().length, 0, "nothing created while the list on screen is out of date");
  assert.equal(v.dispatching.changed, "tasks/todo.md changed since this list was made: 1 → 2 tasks · new: README section. Check it, then confirm again.");
  assert.match(llm.last(), /one task for the CLI/, "the note is kept on a re-derive");

  const calls = llm.calls;
  await step(v, () => v.confirmDispatch(cx));
  assert.equal(llm.calls, calls, "the second Confirm reads the manifest");
  assert.ok(v.dispatching.finished, v.dispatching.error);
  assert.equal(v.spec.state.phase, "build");
  const made = tasks();
  assert.deepEqual(made.map((t) => [t.title, t.after]), [["streaks · Streak list and warnings", []], ["streaks · README section", [made[0].ref]]]);
  assert.match(fs.readFileSync(made[0].promptFile, "utf8"), /Build only this task: "Streak list and warnings" \(tasks\/plan.md, lines 1-3/);
});

test("the spec as its own plan: a model failure shows, Try again works, Confirm moves it to build", async () => {
  const dir = folder("asplan", { files: { "docs/plans/sso.md": "# SSO with Okta\n\n## Steps\n\n1. Add the OIDC client\n2. Map groups to roles\n" } });
  await F.adoptFiles(dir, { id: "sso", spec: `${dir}/docs/plans/sso.md` });
  let fail = true;
  const llm = fakeLlm((prompt) => (fail
    ? { ok: false, error: "You've hit your limit" }
    : (assert.match(prompt, /=== docs\/plans\/sso.md \(spec\+plan\) ===/),
      { ok: true, json: { items: [item("s1", "Add the OIDC client", [], { source: { file: "docs/plans/sso.md", startLine: 5, endLine: 5 } })] } })));
  const v = await open(dir, "sso", llm);
  await step(v, () => v.skip("spec", cx));
  assert.deepEqual(v.dispatching.errors, ["Couldn't work out the tasks: You've hit your limit"]);
  fail = false;
  await step(v, () => v.openDispatch(cx, { force: true }));
  assert.deepEqual([v.dispatching.mode, v.dispatching.rows.length], ["spec", 1]);
  await step(v, () => v.confirmDispatch(cx));
  assert.deepEqual([v.spec.state.phase, v.spec.state.paths.plan], ["build", "docs/plans/sso.md"]);
});

test("pending comments block skipping planning, with Approve's reason", async () => {
  const dir = folder("pending", { files: TICKET });
  await F.adoptFiles(dir, { id: "PROJ-123", spec: `${dir}/PROJ-123.md` });
  const v = await open(dir, "PROJ-123", noModel);
  v.spec.state = { ...v.spec.state, pending: [{ lines: [1, 1], quote: "# PROJ-123", body: "Which date format?", start: 0, end: 10 }] };
  await step(v, () => v.skip("single", cx));
  assert.equal(v.dispatching, null);
  assert.match(v.noteError, /pending comment/);
});

test("a legacy tasks.json dispatches with no model call, and the list counts it", async () => {
  const dir = folder("legacy", { from: "examples/checkout", repos: ["api", "web"] });
  await F.adoptFiles(dir, { id: "SHOP-42", spec: `${dir}/specs/SHOP-42/spec.md`, plan: `${dir}/specs/SHOP-42/plan.md`, tasks: `${dir}/specs/SHOP-42/tasks.json` });
  const v = await open(dir, "SHOP-42", noModel);
  await step(v, () => v.approve(cx));
  assert.ok(v.dispatching.legacy && v.dispatching.rows?.length, JSON.stringify(v.dispatching.errors));
  const n = v.dispatching.rows.length;
  await step(v, () => v.confirmDispatch(cx));
  assert.ok(v.dispatching.finished, v.dispatching.error);
  assert.equal(tasks().length, n);
  v.dispatching = null;
  await v.pollBuild();
  assert.equal(v.build.total, n);
  await v.back();
  v.render(cx);
  assert.equal(v.specs.find((s) => s.id === "SHOP-42").tasks, n);
});

test("only the fake herdr-task ever ran", () => {
  const ran = journal.filter((e) => e.type === "exec").map((e) => e.argv[0]);
  assert.ok(ran.length > 0);
  for (const cmd of ran) assert.ok(cmd === "/bin/sh" || cmd.endsWith("test/support/herdr-task"), cmd);
});
