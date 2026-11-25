import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  validateTasks, orderItems, extractSection, buildPrompt, addArgv, startArgv,
  readPermissionMode, readPermissionModeFile, planRetry,
} from "../mods/specr/core/tasks.js";
import { loadAdapter } from "../mods/specr/core/adapters.js";

const fx = (f) => readFileSync(new URL(`./fixtures/plans/valid/${f}`, import.meta.url), "utf8");
const planText = fx("plan.md");
const good = () => JSON.parse(fx("tasks.json"));
const adapter = loadAdapter(readFileSync(new URL("../mods/specr/adapters/agent-skills.json", import.meta.url), "utf8"));
const ctx = (over = {}) => ({ specId: "PROJ-1", specPath: "specs/PROJ-1/spec.md", planText, isRepo: () => true, ...over });
const check = (tasks, over) => validateTasks(tasks, ctx(over));

test("valid fixture: no errors, no warnings", () => {
  assert.deepEqual(check(good()), { errors: [], warnings: [] });
});

test("rule: tasks must be 1", () => {
  const t = good(); t.tasks = 2;
  assert.deepEqual(check(t).errors, ["tasks: expected 1, got 2"]);
});
test("rule: spec must equal the spec ID", () => {
  const t = good(); t.spec = "OTHER";
  assert.deepEqual(check(t).errors, ['spec: expected "PROJ-1", got "OTHER"']);
});
test("rule: items must be non-empty", () => {
  const t = good(); t.items = [];
  assert.deepEqual(check(t).errors, ["items: must be a non-empty array"]);
});
test("rule: item IDs unique", () => {
  const t = good(); t.items[1].id = "t1"; t.items[2].deps = ["t1"];
  assert.deepEqual(check(t).errors, ['items[1]: duplicate id "t1"']);
});
test("rule: item ID format", () => {
  const t = good(); t.items[0].id = "T 1"; t.items[1].deps = []; t.items[2].deps = ["t2"];
  assert.deepEqual(check(t).errors, ['items[0]: invalid id "T 1" (lowercase letters, digits and dashes, starting with a letter)']);
});
test("rule: deps name an item", () => {
  const t = good(); t.items[1].deps = ["t9"];
  assert.deepEqual(check(t).errors, ['t2: dep "t9" is not an item']);
});
test("rule: no cycles", () => {
  const t = good(); t.items[0].deps = ["t2"];
  assert.deepEqual(check(t).errors, ["dependency cycle: t1 → t2 → t1"]);
});
test("rule: repo must be relative", () => {
  const t = good(); t.items[0].repo = "/abs/api";
  assert.deepEqual(check(t).errors, ['t1: repo "/abs/api" must be a path relative to the spec folder']);
});
test("rule: repo must be a git repository", () => {
  const t = good();
  assert.deepEqual(check(t, { isRepo: (r) => r !== "web" }).errors, ['t2: repo "web" is not a git repository']);
});
test("rule: task section must be a heading in plan.md", () => {
  const t = good(); t.items[1].section = "Task 99: Nope";
  assert.deepEqual(check(t).errors, ['t2: section "Task 99: Nope" is not a heading in plan.md']);
});
test("rule: task needs a section", () => {
  const t = good(); delete t.items[0].section;
  assert.deepEqual(check(t).errors, ["t1: a task needs a section"]);
});
test("rule: checkpoint needs a check", () => {
  const t = good(); t.items[2].checks = [];
  assert.deepEqual(check(t).errors, ["c1: a checkpoint needs at least one check"]);
});
test("rule: checkpoint needs a dep", () => {
  const t = good(); t.items[2].deps = [];
  assert.deepEqual(check(t).errors, ["c1: a checkpoint needs at least one dep"]);
});
test("rule: kind and title", () => {
  const t = good(); t.items[0].kind = "story"; t.items[1].title = " ";
  assert.deepEqual(check(t).errors, ['t1: kind must be "task" or "checkpoint"', "t2: title is required"]);
});
test("Source spec: a different path is an error", () => {
  const r = check(good(), { planText: planText.replace("specs/PROJ-1/spec.md", "specs/OTHER/spec.md") });
  assert.deepEqual(r.errors, ['plan.md: Source spec is "specs/OTHER/spec.md", expected "specs/PROJ-1/spec.md"']);
});
test("Source spec: missing is a warning only", () => {
  const r = check(good(), { planText: planText.replace(/^Source spec:.*\n/, "") });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, ["plan.md has no Source spec: line"]);
});
test("a cycle and an unknown repo are both reported", () => {
  const t = good(); t.items[0].deps = ["t2"];
  const r = check(t, { isRepo: (p) => p !== "api" });
  assert.deepEqual(r.errors, [
    "dependency cycle: t1 → t2 → t1",
    't1: repo "api" is not a git repository',
    't3: repo "api" is not a git repository'.replace("t3", "c1"),
  ]);
});
test("non-object input reports one error", () => {
  assert.deepEqual(check(null).errors, ["tasks.json must be a JSON object"]);
});

test("orderItems: dependencies first, file order otherwise", () => {
  const items = [
    { id: "b", deps: ["a"] }, { id: "a", deps: [] }, { id: "c", deps: [] }, { id: "d", deps: ["b", "c"] },
  ];
  assert.deepEqual(orderItems(items).map((i) => i.id), ["a", "b", "c", "d"]);
  assert.throws(() => orderItems([{ id: "a", deps: ["a"] }]), /cycle/);
});

test("extractSection: heading to the next heading of the same or higher level", () => {
  const s = extractSection(planText, "Task 1: OAuth callback endpoint");
  assert.match(s, /^## Task 1: OAuth callback endpoint\n/);
  assert.match(s, /### Acceptance/);
  assert.match(s, /Returns a token/);
  assert.doesNotMatch(s, /Task 2/);
  assert.equal(extractSection(planText, "Nope"), null);
  assert.match(extractSection(planText, "Task 2: Login button"), /Button in the web app\.\s*$/);
});

test("buildPrompt: task prompt holds the adapter build prompt and the section text", () => {
  const item = good().items[0];
  const p = buildPrompt(item, { adapter, specPath: "specs/PROJ-1/spec.md", planPath: "specs/PROJ-1/plan.md", planText });
  assert.match(p, /^Use the agent-skills:incremental-implementation/);
  assert.match(p, /Build only this task: the plan's section "Task 1: OAuth callback endpoint"/);
  assert.match(p, /Returns a token/);
});
test("buildPrompt: checkpoint prompt lists its checks", () => {
  const item = good().items[2];
  const p = buildPrompt(item, { adapter, specPath: "s", planPath: "p", planText });
  assert.match(p, /- All tests pass\n- Login works end to end/);
  assert.match(p, /change nothing/);
});

const base = { id: "PROJ-1", folder: "/w/api", agent: "claude", model: "sonnet", effort: "medium" };
const item = (over = {}) => ({ id: "t1", kind: "task", title: "OAuth callback endpoint", ...over });

test("addArgv: a task", () => {
  assert.deepEqual(addArgv(item(), { ...base, promptFile: ".specr/specs/PROJ-1/prompts/t1.md", after: [] }), [
    "herdr-task", "add", "PROJ-1 · OAuth callback endpoint", "--json",
    "--folder", "/w/api", "--worktree",
    "--agent", "claude", "--model", "sonnet", "--effort", "medium",
    "--prompt-file", ".specr/specs/PROJ-1/prompts/t1.md",
  ]);
});
test("addArgv: a checkpoint with --after refs from two folders", () => {
  assert.deepEqual(addArgv(item({ id: "c1", kind: "checkpoint", title: "Checkpoint: Foundation" }), {
    ...base, promptFile: "p/c1.md", after: ["API-14", "WEB-3"],
  }), [
    "herdr-task", "add", "PROJ-1 · Checkpoint: Foundation", "--json",
    "--folder", "/w/api", "--worktree",
    "--agent", "claude", "--model", "sonnet", "--effort", "medium",
    "--prompt-file", "p/c1.md",
    "--after", "API-14,WEB-3",
  ]);
});
test("addArgv: review toggle adds finish notes; effort optional", () => {
  const argv = addArgv(item(), { ...base, effort: undefined, promptFile: "p.md", after: [], finishNotes: "Run review." });
  assert.deepEqual(argv.slice(-2), ["--finish-notes", "Run review."]);
  assert.ok(!argv.includes("--effort"));
});
test("startArgv: plain, parent in auto mode, parent in another mode", () => {
  const worker = ["claude", "--model", "sonnet", "--effort", "medium"];
  assert.deepEqual(startArgv("API-14", { folder: "/w/api" }), ["herdr-task", "start", "API-14", "--folder", "/w/api"]);
  assert.deepEqual(startArgv("API-14", { folder: "/w/api", parentMode: "auto", workerArgv: worker }), [
    "herdr-task", "start", "API-14", "--folder", "/w/api",
    "--argv", JSON.stringify([...worker, "--permission-mode", "auto"]),
  ]);
  for (const m of ["bypassPermissions", "acceptEdits", "default", undefined]) {
    assert.deepEqual(startArgv("API-14", { folder: "/w/api", parentMode: m, workerArgv: worker }),
      ["herdr-task", "start", "API-14", "--folder", "/w/api"], String(m));
  }
});

const jsonl = (...lines) => lines.map((l) => (typeof l === "string" ? l : JSON.stringify(l))).join("\n") + "\n";
test("readPermissionMode: latest permissionMode on a user entry", () => {
  const text = jsonl(
    { type: "user", permissionMode: "default" },
    { type: "assistant", message: {} },
    { type: "user", permissionMode: "auto" },
    "not json {",
    { type: "assistant", permissionMode: "bypassPermissions" },
  );
  assert.equal(readPermissionMode(text), "auto");
  assert.equal(readPermissionMode(jsonl({ type: "user" })), undefined);
  assert.equal(readPermissionMode(""), undefined);
});
test("readPermissionModeFile: reads a fixture, nothing for a missing file", async () => {
  const dir = mkdtempSync(join(tmpdir(), "specr-"));
  const f = join(dir, "s.jsonl");
  writeFileSync(f, jsonl({ type: "user", permissionMode: "default" }, { type: "user", permissionMode: "auto" }));
  assert.equal(await readPermissionModeFile(f, readFile), "auto");
  assert.equal(await readPermissionModeFile(join(dir, "none.jsonl"), readFile), undefined);
});

test("planRetry: only uncreated items and created-but-unstarted ones", () => {
  const items = [{ id: "t1", deps: [] }, { id: "t2", deps: ["t1"] }, { id: "t3", deps: ["t2"] }, { id: "c1", deps: ["t3"] }];
  const r = planRetry(items, { t1: "A-1", t2: "A-2" }, ["t1"]);
  assert.deepEqual(r.toAdd.map((i) => i.id), ["t3", "c1"]);
  assert.deepEqual(r.toStart.map((i) => i.id), ["t2", "t3", "c1"]);
  const fresh = planRetry(items, {}, []);
  assert.equal(fresh.toAdd.length, 4);
  const done = planRetry(items, { t1: "A-1", t2: "A-2", t3: "A-3", c1: "A-4" }, ["t1", "t2", "t3", "c1"]);
  assert.deepEqual(done, { toAdd: [], toStart: [] });
});
