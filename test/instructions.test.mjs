// The plan prompt names only a location (native planning is untouched). tasksExample is still the
// legacy tasks.json v1 shape, which must keep validating.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planInstructions, tasksExample } from "../mods/specd/core/instructions.js";
import { validateTasks } from "../mods/specd/core/tasks.js";
import { loadAdapter } from "../mods/specd/core/adapters.js";
import { planApproval } from "../mods/specd/core/newspec.js";
import { createSpec, documentReady } from "../mods/specd/core/state.js";

const paths = { spec: "specs/PROJ-1/spec.md", plan: "specs/PROJ-1/plan.md", tasks: "specs/PROJ-1/tasks.json" };
const block = () => planInstructions({ id: "PROJ-1", specPath: paths.spec, planPath: paths.plan, tasksPath: paths.tasks });

test("plan prompt: only the location, no format override", () => {
  const b = block();
  assert.equal(b, "Plan the spec at specs/PROJ-1/spec.md.\nSave the plan to specs/PROJ-1/plan.md and the task list to specs/PROJ-1/tasks.json.");
  assert.doesNotMatch(b, /Source spec|## Task N|"tasks": 1|Do not create/);
});

test("plan prompt: its example passes specd's own validator", () => {
  const ex = tasksExample("PROJ-1");
  const planText = `Source spec: ${paths.spec}\n\n# Plan\n\n` + ex.items.filter((i) => i.kind === "task").map((i) => `## ${i.section}\n\nBody.\n`).join("\n");
  assert.deepEqual(validateTasks(ex, { specId: "PROJ-1", specPath: paths.spec, planText, isRepo: () => true }), { errors: [], warnings: [] });
});

test("planApproval: the plan agent's first message is the native command plus a location", () => {
  const adapter = loadAdapter(readFileSync(new URL("../mods/specd/adapters/agent-skills.json", import.meta.url), "utf8"));
  const state = documentReady(createSpec({ id: "PROJ-1", brief: "b", adapter: "agent-skills", paths, models: {} }));
  const { message } = planApproval({ adapter, state, config: null });
  assert.match(message, /^\/agent-skills:plan\n\nPlan the spec at specs\/PROJ-1\/spec\.md\./);
  // the spec was made with an older specd's tasks.json path: the native planner gets todo.md beside it
  assert.match(message, /Save the plan to specs\/PROJ-1\/plan\.md and the task list to specs\/PROJ-1\/todo\.md\.$/);
});
