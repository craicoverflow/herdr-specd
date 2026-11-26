// The plan prompt must carry tasks.json's schema (e2e 2026-11-26: without it, 1 of 3 plan agents
// wrote a valid file on its own). Its example must pass specr's own validator.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planInstructions, tasksExample } from "../mods/specr/core/instructions.js";
import { validateTasks } from "../mods/specr/core/tasks.js";
import { loadAdapter } from "../mods/specr/core/adapters.js";
import { planApproval } from "../mods/specr/core/newspec.js";
import { createSpec, documentReady } from "../mods/specr/core/state.js";

const paths = { spec: "specs/PROJ-1/spec.md", plan: "specs/PROJ-1/plan.md", tasks: "specs/PROJ-1/tasks.json" };
const block = () => planInstructions({ id: "PROJ-1", specPath: paths.spec, planPath: paths.plan, tasksPath: paths.tasks });

test("plan prompt: names the paths, the Source spec line and no todo.md", () => {
  const b = block();
  assert.match(b, /exactly this path: specs\/PROJ-1\/plan\.md/);
  assert.match(b, /Source spec: specs\/PROJ-1\/spec\.md/);
  assert.match(b, /Do not create tasks\/todo\.md/);
});

test("plan prompt: carries tasks.json's schema as an example with this spec's ID", () => {
  const b = block();
  const example = JSON.stringify(tasksExample("PROJ-1"), null, 2);
  assert.ok(b.includes(example), "the example JSON is in the prompt verbatim");
  for (const field of ['"tasks": 1', '"spec": "PROJ-1"', '"kind": "task"', '"kind": "checkpoint"', '"repo"', '"section"', '"deps"', '"checks"']) {
    assert.ok(b.includes(field), `prompt mentions ${field}`);
  }
  assert.match(b, /## Task 1:/, "says each task gets its own '## Task N: …' section");
});

test("plan prompt: its example passes specr's own validator", () => {
  const ex = tasksExample("PROJ-1");
  const planText = `Source spec: ${paths.spec}\n\n# Plan\n\n` + ex.items.filter((i) => i.kind === "task").map((i) => `## ${i.section}\n\nBody.\n`).join("\n");
  assert.deepEqual(validateTasks(ex, { specId: "PROJ-1", specPath: paths.spec, planText, isRepo: () => true }), { errors: [], warnings: [] });
});

test("planApproval: the plan agent's first message has the schema with the spec's ID", () => {
  const adapter = loadAdapter(readFileSync(new URL("../mods/specr/adapters/agent-skills.json", import.meta.url), "utf8"));
  const state = documentReady(createSpec({ id: "PROJ-1", brief: "b", adapter: "agent-skills", paths, models: {} }));
  const { message } = planApproval({ adapter, state, config: null });
  assert.match(message, /^\/agent-skills:plan/);
  assert.ok(message.includes('"spec": "PROJ-1"'));
});
