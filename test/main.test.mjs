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
const cx = { notify() {}, spawn(fn) { if (!/nextCommand/.test(fn)) pending.push(fn(cx)); } /* the dev command loop parks for good */, timer: { every() {} }, sleep: () => Promise.resolve(), write_to_clipboard() {} };
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

// ---- palette commands: panel in the `specd` layout, tab elsewhere (core/place.js) -----------------

const H = await import("./support/herdr.mjs");
const PALETTE = JSON.parse(fs.readFileSync(new URL("../mods/specd/mod.json", import.meta.url), "utf8")).palette;
const runs = (command) => journal.filter((e) => e.type === "run" && e.command === command).map((e) => e.args);
const sharedWrites = () => journal.filter((e) => e.type === "setShared" && e.key === "specd.request").map((e) => e.value);

// What the palette does: tab.new with the entry's args, which starts a copy of the mod in that tab.
async function paletteTab(title) {
  const entry = PALETTE.find((p) => p.title === title);
  H.run(entry.command, entry.args);
  const tabId = H.focused()?.tab;
  H.setProps(entry.args.props ?? {});
  const v = new Specd();
  const timers = [];
  const tcx = { ...cx, timer: { every: (_ms, fn) => timers.push(fn) } };
  v.init({}, tcx);
  v.render(tcx);
  await settle();
  return { v, timers, tcx, tabId };
}
function reset(layoutName) {
  journal.length = 0;
  H.setLayoutName(layoutName);
  H.resetShared();
  H.setProps({});
  H.setFocused(null);
  H.setSpaces(null);
}
after(() => { H.setLayoutName(null); H.setProps({}); H.resetShared(); H.setFocused(null); });

for (const [title, cmd] of [["specd: Open", "open"], ["specd: New spec", "new"], ["specd: Adopt spec", "adopt"]]) {
  test(`${title} in the specd layout: hands the request to the panel, selects it, closes its own tab`, async () => {
    reset("specd");
    const { v, tabId } = await paletteTab(title);
    const req = sharedWrites();
    assert.equal(req.length, 1);
    assert.equal(req[0].cmd, cmd);
    assert.ok(runs("layout.select").some((a) => a.stack === "panel-body" && a.child === "specd"));
    assert.deepEqual(runs("tab.close"), [{ id: tabId }]);
    assert.equal(H.spaces()[0].tabs.some((t) => t.id === tabId), false, "no specd tab left open");
    assert.equal(v.handedOff, true);
  });

  test(`${title} in the specd layout: the panel copy shows the ${cmd === "open" ? "list" : cmd} view`, async () => {
    reset("specd");
    const dir = folder(`place-${cmd}`, { files: TICKET });
    await paletteTab(title);
    // The panel copy starts after the request was written (its stack child was not running).
    H.setProps({});
    const panel = new Specd();
    const timers = [];
    const pcx = { ...cx, timer: { every: (_ms, fn) => timers.push(fn) } };
    panel.init({}, pcx);
    panel.folder = dir;
    await settle();
    assert.deepEqual([!!panel.creating, !!panel.adopting, panel.selected], [cmd === "new", cmd === "adopt", null]);
    assert.equal(panel.handedOff, undefined, "the panel copy never hands off");
    panel.render(pcx);
  });
}

test("a request written while the panel copy runs is taken on its poll, once", async () => {
  reset("specd");
  const panel = new Specd();
  const timers = [];
  const pcx = { ...cx, timer: { every: (_ms, fn) => timers.push(fn) } };
  panel.init({}, pcx);
  panel.folder = folder("place-poll", { files: TICKET });
  H.setFocused({ tab: "t", space: "s1", cwd: panel.folder });
  assert.equal(panel.creating, null);
  await paletteTab("specd: New spec");
  for (const t of timers) t(pcx);
  await settle();
  assert.ok(panel.creating, "the New spec form is up");
  panel.creating = null;
  for (const t of timers) t(pcx);
  await settle();
  assert.equal(panel.creating, null, "the same request is not taken twice");
});

test("a New spec request opens over an open spec; an Open request returns to the list", async () => {
  reset("specd");
  const dir = folder("place-over", { files: TICKET });
  await F.adoptFiles(dir, { id: "PROJ-123", spec: `${dir}/PROJ-123.md` });
  const panel = await open(dir, "PROJ-123", noModel);
  assert.equal(panel.selected, "PROJ-123");
  await paletteTab("specd: Open");
  await panel.pollRequest(cx);
  assert.equal(panel.selected, null);
});

test("an old request is not acted on when the panel copy starts", () => {
  reset("specd");
  H.setShared("specd.request", { cmd: "new", props: { new: true }, at: Date.now() - 11000 });
  const panel = new Specd();
  panel.init({}, cx);
  assert.equal(panel.creating, null);
});

test("outside the specd layout the palette commands still open a tab", async () => {
  for (const layoutName of ["shepherdr", null]) {
    reset(layoutName);
    const { v } = await paletteTab("specd: New spec");
    assert.deepEqual([sharedWrites().length, runs("tab.close").length, runs("layout.select").length], [0, 0, 0]);
    assert.ok(v.creating, "the tab copy shows the New spec form itself");
    assert.equal(v.handedOff, undefined);
  }
});

test("the diagram zoom window is never redirected", () => {
  reset("specd");
  H.run("tab.new", { mod: "specd", name: "specd", focus: true });
  H.setProps({ diagram: { svg: "x" } });
  const v = new Specd();
  v.init({}, cx);
  assert.deepEqual([sharedWrites().length, runs("tab.close").length], [0, 0]);
  assert.ok(v.zoom);
});

// ---- the panel follows the focused space -----------------------------------------------------------

async function panelAt(dirA) {
  reset("specd");
  H.setFocused({ tab: "t", space: "s1", cwd: dirA });
  const v = new Specd();
  const timers = [];
  const pcx = { ...cx, timer: { every: (_ms, fn) => timers.push(fn) } };
  v.init({}, pcx);
  await settle();
  const tick = async () => { for (const t of timers) t(pcx); await settle(); };
  return { v, tick };
}
const titles = (v) => v.specs.map((s) => s.id);

test("at the list, focusing a terminal in another folder shows that folder's specs", async () => {
  const a = folder("follow-a", { files: TICKET });
  await F.adoptFiles(a, { id: "AAA-1", spec: `${a}/PROJ-123.md` });
  const b = folder("follow-b", { files: TICKET });
  await F.adoptFiles(b, { id: "BBB-1", spec: `${b}/PROJ-123.md` });
  const { v, tick } = await panelAt(a);
  assert.deepEqual([v.folder, titles(v)], [a, ["AAA-1"]]);
  H.setFocused({ tab: "t2", space: "s2", cwd: b });
  await tick();
  assert.deepEqual([v.folder, titles(v)], [b, ["BBB-1"]]);
  assert.deepEqual(journal.filter((e) => e.type === "watch").map((e) => e.dir).slice(-2), [a, b], "the watcher follows");
});

test("with a spec, the New spec form or the Adopt form open, the folder stays until Back or Cancel", async () => {
  const a = folder("pin-a", { files: TICKET });
  await F.adoptFiles(a, { id: "AAA-1", spec: `${a}/PROJ-123.md` });
  const b = folder("pin-b", { files: TICKET });
  const { v, tick } = await panelAt(a);
  await v.open("AAA-1");
  H.setFocused({ tab: "t2", space: "s2", cwd: b });
  await tick();
  assert.deepEqual([v.folder, v.selected], [a, "AAA-1"]);
  await v.back();
  await tick();
  assert.equal(v.folder, b);
  H.setFocused({ tab: "t", space: "s1", cwd: a });
  v.creating = { adapter: "agent-skills", folder: b };
  await tick();
  assert.equal(v.folder, b, "New spec form open");
  v.creating = null;
  v.adopting = { spec: null, plan: null, tasks: null };
  await tick();
  assert.equal(v.folder, b, "Adopt form open");
  v.adopting = null;
  await tick();
  assert.equal(v.folder, a, "after Cancel");
});

test("no folder shows the message and recovers when a terminal is focused", async () => {
  const a = folder("rec-a", { files: TICKET });
  await F.adoptFiles(a, { id: "AAA-1", spec: `${a}/PROJ-123.md` });
  const { v, tick } = await panelAt(null);
  H.setFocused(null);
  await tick();
  assert.equal(v.folder, null);
  H.setFocused({ tab: "t", space: "s1", cwd: a });
  await tick();
  H.setFocused({ tab: "p", space: "s9" }); // focus on the panel itself: no cwd, no space folder
  await tick();
  assert.equal(v.folder, a, "keeps the last folder");
  v.folder = null;
  v.render(cx);
  H.setFocused({ tab: "t", space: "s1", cwd: a });
  await tick();
  assert.deepEqual([v.folder, titles(v)], [a, ["AAA-1"]]);
});

test("a tab copy never follows the focus", async () => {
  const a = folder("tab-a", { files: TICKET });
  const b = folder("tab-b", { files: TICKET });
  reset(null);
  H.setFocused({ tab: "t", space: "s1", cwd: a });
  H.setProps({ tab: true });
  const v = new Specd();
  const timers = [];
  const tcx = { ...cx, timer: { every: (_ms, fn) => timers.push(fn) } };
  v.init({}, tcx);
  await settle();
  H.setFocused({ tab: "t2", space: "s2", cwd: b });
  for (const t of timers) t(tcx);
  await settle();
  assert.equal(v.folder, a);
});
