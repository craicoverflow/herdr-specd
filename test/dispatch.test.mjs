import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadAdapter } from "../mods/specd/core/adapters.js";
import { createSpec } from "../mods/specd/core/state.js";
import {
  resolveRepo, dispatchRows, previewArgvs, parseAddResult, workerArgvFor, runDispatch, dispatchSummary,
} from "../mods/specd/core/dispatch.js";

const fx = (f) => readFileSync(new URL(`./fixtures/plans/valid/${f}`, import.meta.url), "utf8");
const planText = fx("plan.md");
const tasks = JSON.parse(fx("tasks.json"));
const adapter = loadAdapter(readFileSync(new URL("../mods/specd/adapters/agent-skills.json", import.meta.url), "utf8"));
const paths = { spec: "specs/PROJ-1/spec.md", plan: "specs/PROJ-1/plan.md", tasks: "specs/PROJ-1/tasks.json" };
const state = createSpec({ id: "PROJ-1", brief: "b", adapter: "agent-skills", paths });
const good = () => JSON.parse(fx("tasks.json"));
const base = { tasks, state, adapter, config: null, folder: "/work/proj", planText, review: false };

test("resolveRepo joins and normalises against the spec folder", () => {
  assert.equal(resolveRepo("/work/proj", "api"), "/work/proj/api");
  assert.equal(resolveRepo("/work/proj/", "."), "/work/proj");
  assert.equal(resolveRepo("/work/proj", "../other/web"), "/work/other/web");
  assert.equal(resolveRepo("/work/proj", "./a//b"), "/work/proj/a/b");
});

test("dispatchRows: one row per item, dependency order, build model and absolute repo", () => {
  const rows = dispatchRows(base);
  assert.deepEqual(rows.map((r) => r.item.id), ["t1", "t2", "c1"]);
  assert.equal(rows[0].folder, "/work/proj/api");
  assert.equal(rows[1].folder, "/work/proj/web");
  assert.equal(rows[0].model, "sonnet");
  assert.equal(rows[0].agent, "claude");
  assert.equal(rows[0].promptFile, "/work/proj/.specd/specs/PROJ-1/prompts/t1.md");
  assert.match(rows[0].promptText, /Task 1: OAuth callback endpoint/);
  assert.match(rows[2].promptText, /All tests pass/);
});

test("dispatchRows: the build model follows the spec's own choice", () => {
  const rows = dispatchRows({ ...base, state: { ...state, models: { ...state.models, build: { model: "haiku", effort: "low" } } } });
  assert.equal(rows[0].model, "haiku");
  assert.equal(rows[0].effort, "low");
});

test("previewArgvs: titles, folder, deps as placeholders until a ref exists, finish notes only with review", () => {
  const rows = dispatchRows(base);
  const p = previewArgvs(rows, {}, { review: false, adapter });
  assert.deepEqual(p[0].add.slice(0, 3), ["herdr-task", "add", "PROJ-1 · OAuth callback endpoint"]);
  assert.ok(p[0].add.includes("--worktree"));
  assert.equal(p[0].add[p[0].add.indexOf("--folder") + 1], "/work/proj/api");
  assert.equal(p[1].add[p[1].add.indexOf("--after") + 1], "<t1>");
  assert.equal(p[2].add[p[2].add.indexOf("--after") + 1], "<t1>,<t2>");
  assert.ok(!p[0].add.includes("--finish-notes"));
  const r = previewArgvs(rows, { t1: "API-14" }, { review: true, adapter });
  assert.equal(r[1].add[r[1].add.indexOf("--after") + 1], "API-14");
  assert.match(r[0].add[r[0].add.indexOf("--finish-notes") + 1], /agent-skills:review/);
});

test("parseAddResult: ref and mode, or a message fit to show", () => {
  assert.deepEqual(parseAddResult('{"ref":"API-14","mode":"worktree","state":"todo"}'), { ref: "API-14", mode: "worktree" });
  assert.throws(() => parseAddResult("not json"), /herdr-task add/);
  assert.throws(() => parseAddResult('{"state":"todo"}'), /no ref/);
});

test("workerArgvFor: only claude, with effort when set", () => {
  assert.deepEqual(workerArgvFor("claude", "sonnet", "medium"), ["claude", "--model", "sonnet", "--effort", "medium"]);
  assert.deepEqual(workerArgvFor("claude", "sonnet"), ["claude", "--model", "sonnet"]);
  assert.equal(workerArgvFor("codex", "gpt", "high"), null);
});

// A fake herdr-task: add hands out refs in order and can be made to fail on the nth add.
function fake({ failAddAt = Infinity, failStartAt = Infinity } = {}) {
  const f = { adds: [], starts: [], prompts: [], saves: [], n: 13 };
  f.add = async (argv) => {
    if (f.adds.length + 1 >= failAddAt && !f.failed) { f.failed = true; throw new Error("add blew up"); }
    f.adds.push(argv);
    return { ref: `API-${++f.n}`, mode: argv.includes("/work/proj/web") ? "here" : "worktree" };
  };
  f.start = async (argv) => {
    if (f.starts.length + 1 >= failStartAt && !f.startFailed) { f.startFailed = true; throw new Error("start blew up"); }
    f.starts.push(argv);
  };
  f.writePrompt = async (file, text) => { f.prompts.push(file); };
  f.save = async (d) => { f.saves.push(JSON.parse(JSON.stringify(d))); };
  return f;
}

test("runDispatch: adds in order with refs in --after, then starts each, records everything", async () => {
  const rows = dispatchRows(base);
  const f = fake();
  const r = await runDispatch({ rows, dispatch: { created: {}, started: [], modes: {} }, review: false, adapter, parentMode: undefined, ...f });
  assert.equal(r.error, null);
  assert.deepEqual(r.created, { t1: "API-14", t2: "API-15", c1: "API-16" });
  assert.deepEqual(r.started, ["t1", "t2", "c1"]);
  assert.equal(f.adds[1][f.adds[1].indexOf("--after") + 1], "API-14");
  assert.equal(f.adds[2][f.adds[2].indexOf("--after") + 1], "API-14,API-15");
  assert.deepEqual(f.starts.map((a) => a[2]), ["API-14", "API-15", "API-16"]);
  assert.ok(f.starts.every((a) => !a.includes("--argv")), "Settings decide when the parent isn't in auto mode");
  assert.equal(r.modes.t2, "here");
  assert.deepEqual(f.saves.at(-1).created, r.created, "refs are saved as they are made");
  assert.equal(f.saves.length, 6);
});

test("runDispatch: a parent in auto mode starts every item with --permission-mode auto", async () => {
  const f = fake();
  await runDispatch({ rows: dispatchRows(base), dispatch: { created: {}, started: [], modes: {} }, review: false, adapter, parentMode: "auto", ...f });
  for (const a of f.starts) {
    const argv = JSON.parse(a[a.indexOf("--argv") + 1]);
    assert.deepEqual(argv.slice(-2), ["--permission-mode", "auto"]);
    assert.equal(a[a.indexOf("--folder") + 1].startsWith("/work/proj/"), true);
  }
});

test("runDispatch: another mode is never passed on", async () => {
  const f = fake();
  await runDispatch({ rows: dispatchRows(base), dispatch: { created: {}, started: [], modes: {} }, review: false, adapter, parentMode: "bypassPermissions", ...f });
  assert.ok(f.starts.every((a) => !a.includes("--argv")));
});

test("runDispatch: a failed add stops, keeps refs, and running again creates only the missing items", async () => {
  const rows = dispatchRows(base);
  const f = fake({ failAddAt: 2 });
  const first = await runDispatch({ rows, dispatch: { created: {}, started: [], modes: {} }, review: false, adapter, ...f });
  assert.match(first.error, /add blew up/);
  assert.deepEqual(first.created, { t1: "API-14" });
  assert.deepEqual(f.starts, [], "nothing starts before every add succeeds");
  const second = await runDispatch({ rows, dispatch: { created: first.created, started: first.started, modes: first.modes }, review: false, adapter, ...f });
  assert.equal(second.error, null);
  assert.equal(f.adds.length, 3, "t1 isn't added twice");
  assert.deepEqual(second.created, { t1: "API-14", t2: "API-15", c1: "API-16" });
  assert.equal(f.adds[1][f.adds[1].indexOf("--after") + 1], "API-14");
  assert.deepEqual(second.started, ["t1", "t2", "c1"]);
});

test("runDispatch: a failed start keeps what started; again starts only the rest", async () => {
  const rows = dispatchRows(base);
  const f = fake({ failStartAt: 2 });
  const first = await runDispatch({ rows, dispatch: { created: {}, started: [], modes: {} }, review: false, adapter, ...f });
  assert.match(first.error, /start blew up/);
  assert.deepEqual(first.started, ["t1"]);
  const second = await runDispatch({ rows, dispatch: { created: first.created, started: first.started, modes: first.modes }, review: false, adapter, ...f });
  assert.equal(second.error, null);
  assert.equal(f.adds.length, 3);
  assert.deepEqual(f.starts.map((a) => a[2]), ["API-14", "API-15", "API-16"]);
});

test("dispatchSummary: counts and the here-mode flags", () => {
  const rows = dispatchRows(base);
  const s = dispatchSummary(rows, { created: { t1: "A-1", t2: "A-2", c1: "A-3" }, started: ["t1", "t2", "c1"], modes: { t1: "worktree", t2: "here", c1: "worktree" } });
  assert.equal(s.created, 3);
  assert.equal(s.started, 3);
  assert.deepEqual(s.here.map((h) => h.ref), ["A-2"]);
  assert.match(s.here[0].note, /not in a worktree/i);
});

import { claudeSessionFile, checkTasksText, errorsMessage } from "../mods/specd/core/dispatch.js";
import { approveBlock } from "../mods/specd/core/newspec.js";

test("claudeSessionFile: Claude's transcript path for a folder and session", () => {
  assert.equal(
    claudeSessionFile("/Users/me", "/Users/me/.herdr/code/a_b", "abc-123"),
    "/Users/me/.claude/projects/-Users-me--herdr-code-a-b/abc-123.jsonl",
  );
});

test("checkTasksText: a cycle and an unknown repo are both listed, and nothing is valid", () => {
  const t = good();
  t.items[0].deps = ["t2"]; // t1 <-> t2
  t.items[1].repo = "nope";
  const r = checkTasksText(JSON.stringify(t), { specId: "PROJ-1", specPath: paths.spec, planText, isRepo: (p) => p !== "nope" });
  assert.equal(r.tasks, null);
  assert.ok(r.errors.some((e) => /cycle/.test(e)));
  assert.ok(r.errors.some((e) => /nope.*not a git repository/.test(e)));
});

test("checkTasksText: missing or broken files are one error each", () => {
  const ctx = { specId: "PROJ-1", specPath: paths.spec, planText, isRepo: () => true };
  assert.deepEqual(checkTasksText(null, ctx).errors, ["tasks.json isn't there yet"]);
  assert.match(checkTasksText("{oops", ctx).errors[0], /not valid JSON/);
  const ok = checkTasksText(JSON.stringify(good()), ctx);
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.tasks.items.length, 3);
});

test("errorsMessage lists every error for the plan agent", () => {
  const m = errorsMessage("specs/PROJ-1/tasks.json", ["a is wrong", "b is wrong"]);
  assert.match(m, /specs\/PROJ-1\/tasks\.json/);
  assert.match(m, /1\. a is wrong\n2\. b is wrong/);
});

test("approveBlock: a plan in review can be approved, a drafting one can't", () => {
  const plan = { ...state, phase: "plan", status: "review", pending: [] };
  assert.equal(approveBlock(plan), null);
  assert.match(approveBlock({ ...plan, status: "drafting" }), /drafting/);
  assert.match(approveBlock({ ...plan, pending: [{}] }), /pending comment/);
  assert.match(approveBlock({ ...state, phase: "build" }), /already/);
});
