import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadAdapter, validateAdapter, resolvePaths, resolveModels, agentArgv, fillPrompt, AdapterError } from "../mods/specd/core/adapters.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const shipped = () => loadAdapter(read("../mods/specd/adapters/agent-skills.json"));
const vars = { brief: "Add login", specPath: "specs/P-1/spec.md", planPath: "specs/P-1/plan.md", tasksPath: "specs/P-1/tasks.json", section: "Task 1: X" };

test("agent-skills adapter loads", () => {
  const a = shipped();
  assert.equal(a.id, "agent-skills");
  assert.deepEqual(resolvePaths(a, "P-1"), { spec: "specs/P-1/spec.md", plan: "specs/P-1/plan.md", tasks: "specs/P-1/tasks.json" });
});

test("a broken adapter reports every problem at once", () => {
  const bad = { adapter: 2, id: "Bad Id", paths: { spec: "x" }, agent: { argv: [] },
    phases: { spec: { prompt: "no brief" }, plan: { model: "m", prompt: "{nope}" } } };
  const errs = validateAdapter(bad);
  for (const frag of ["adapter:", "id:", "name:", "paths.spec: must contain {id}", "paths.plan", "paths.tasks", "agent.argv",
    "phases.spec.model", "phases.spec.prompt: must contain {specd.spec}", "phases.spec.prompt: must contain {brief}",
    "phases.plan.prompt: must contain {specd.plan}", "unknown placeholder {nope}", "phases.build: required"])
    assert.ok(errs.some((e) => e.includes(frag)), `missing: ${frag}\n${errs.join("\n")}`);
  assert.throws(() => loadAdapter(bad), (e) => e instanceof AdapterError && e.errors.length === errs.length);
  assert.throws(() => loadAdapter("{oops"), /invalid JSON/);
});

test("contract: spec-kit and Kiro fixtures load with no new fields", () => {
  for (const f of ["spec-kit", "kiro"]) {
    const raw = JSON.parse(read(`./fixtures/adapters/${f}.json`));
    assert.deepEqual(Object.keys(raw).sort(), ["adapter", "agent", "id", "name", "paths", "phases"]);
    const a = loadAdapter(raw);
    assert.equal(a.id, f);
    assert.ok(fillPrompt(a, "build", vars).includes("herdr-task ready"));
  }
});

test("precedence: spec > folder > adapter", () => {
  const a = shipped();
  assert.deepEqual(resolveModels(a).build, { model: "sonnet", effort: "medium" });
  assert.deepEqual(resolveModels(a, { models: { build: "haiku" } }).build, { model: "haiku", effort: "medium" });
  assert.deepEqual(resolveModels(a, { models: { build: "haiku" } }, { models: { build: { model: "opus", effort: "low" } } }).build, { model: "opus", effort: "low" });
  assert.equal(resolvePaths(a, "P-1", { paths: { spec: "docs/{id}.md" } }).spec, "docs/P-1.md");
});

test("agent argv fills model and effort", () => {
  const a = shipped();
  assert.deepEqual(agentArgv(a, { model: "opus", effort: "high" }), ["claude", "--model", "opus", "--effort", "high"]);
  assert.deepEqual(agentArgv(a, { model: "opus" }), ["claude", "--model", "opus"]);
});

test("prompts are filled with specd blocks", () => {
  const a = shipped();
  const spec = fillPrompt(a, "spec", vars);
  assert.ok(spec.startsWith("/agent-skills:spec Add login"));
  assert.ok(spec.includes("specs/P-1/spec.md") && spec.includes("SPEC.md"));
  const plan = fillPrompt(a, "plan", vars);
  assert.ok(plan.includes("Source spec: specs/P-1/spec.md") && plan.includes("specs/P-1/tasks.json") && plan.includes("tasks/todo.md"));
  const build = fillPrompt(a, "build", vars);
  for (const s of ["Task 1: X", "specs/P-1/plan.md", "herdr-task ready", "Don't mark", "incremental-implementation", "test-driven-development"])
    assert.ok(build.includes(s), s);
  assert.ok(!/\{(brief|specd\.\w+)\}/.test(build));
});

test("a filled build prompt never starts its argument text with auto or all", () => {
  const a = shipped();
  assert.ok(!/^(auto|all)\b/i.test(fillPrompt(a, "build", vars)));
  for (const p of ["auto {specd.task}", "All {specd.task}", "/agent-skills:build auto {specd.task}"]) {
    const bad = structuredClone(a); bad.phases.build.prompt = p;
    assert.throws(() => fillPrompt(bad, "build", vars), /auto or all/);
  }
  const bad = structuredClone(a); bad.phases.build.prompt = "auto {specd.task}";
  assert.ok(validateAdapter(bad).some((e) => e.includes("auto or all")));
  // a brief that starts with "all" can't leak into the build prompt
  assert.ok(!/^(auto|all)\b/i.test(fillPrompt(a, "build", { ...vars, brief: "all of it" })));
});

test("discover is optional and validated", () => {
  const a = shipped();
  assert.deepEqual(a.discover.specs, ["SPEC.md", "SPEC-{id}.md", "docs/SPEC.md", "spec/{id}.md"]);
  assert.deepEqual(a.discover.plans, ["tasks/plan.md"]);
  const bad = structuredClone(a); bad.discover = { specs: "SPEC.md", plans: [""] };
  const errs = validateAdapter(bad);
  assert.ok(errs.some((e) => e.includes("discover.specs")) && errs.some((e) => e.includes("discover.plans")));
  const notObj = structuredClone(a); notObj.discover = [];
  assert.ok(validateAdapter(notObj).some((e) => e.includes("discover:")));
  const none = structuredClone(a); delete none.discover;
  assert.deepEqual(validateAdapter(none), []);
});
