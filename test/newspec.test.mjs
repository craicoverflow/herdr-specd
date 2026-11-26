import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadAdapter } from "../mods/specd/core/adapters.js";
import { planNewSpec, autoReview } from "../mods/specd/core/newspec.js";

const adapter = loadAdapter(readFileSync(new URL("../mods/specd/adapters/agent-skills.json", import.meta.url), "utf8"));

test("a new spec records the adapter's paths, drafting, and the models chosen", () => {
  const { state } = planNewSpec({ adapter, id: "DEMO-1", brief: "Add login", existingIds: [] });
  assert.equal(state.paths.spec, "specs/DEMO-1/spec.md");
  assert.equal(state.phase, "spec");
  assert.equal(state.status, "drafting");
  assert.deepEqual(state.models.spec, "opus");
});

test("the first message names the exact path and not SPEC.md as the target", () => {
  const { message } = planNewSpec({ adapter, id: "DEMO-1", brief: "Add login", existingIds: [] });
  assert.match(message, /^\/agent-skills:spec Add login/);
  assert.match(message, /exactly this path: specs\/DEMO-1\/spec\.md/);
});

test("the agent runs the adapter's model and effort, with a changed model applied", () => {
  const a = planNewSpec({ adapter, id: "D-1", brief: "x", existingIds: [] });
  assert.deepEqual(a.model, { model: "opus", effort: "high" });
  const b = planNewSpec({ adapter, id: "D-1", brief: "x", existingIds: [], models: { spec: { model: "sonnet", effort: "low" } } });
  assert.deepEqual(b.model, { model: "sonnet", effort: "low" });
  assert.equal(b.state.models.spec.model, "sonnet");
});

test("a used ID is refused and says which one", () => {
  assert.throws(() => planNewSpec({ adapter, id: "DEMO-1", brief: "x", existingIds: ["DEMO-1"] }), (e) => e.code === "used" && /DEMO-1 already exists/.test(e.message));
});

test("a bad ID or empty brief is refused", () => {
  assert.throws(() => planNewSpec({ adapter, id: "1x", brief: "x", existingIds: [] }), /Invalid ID/);
  assert.throws(() => planNewSpec({ adapter, id: "A-1", brief: " ", existingIds: [] }), /brief/);
});

test("autoReview: drafting with the document present moves to review, once", () => {
  const { state } = planNewSpec({ adapter, id: "A-1", brief: "x", existingIds: [] });
  assert.equal(autoReview(state, null), null);
  assert.equal(autoReview(state, "   "), null);
  assert.equal(autoReview(state, "# Spec").status, "review");
  assert.equal(autoReview({ ...state, status: "review" }, "# Spec"), null);
});

test("autoReview: after a submitted round, waits until the document differs from what was submitted", () => {
  const { state } = planNewSpec({ adapter, id: "A-1", brief: "x", existingIds: [] });
  assert.equal(autoReview(state, "# Spec", "# Spec"), null);
  assert.equal(autoReview(state, "# Spec v2", "# Spec").status, "review");
});

import { planApproval, approveBlock } from "../mods/specd/core/newspec.js";
import { documentReady } from "../mods/specd/core/state.js";
import { checkSourceSpec } from "../mods/specd/core/tasks.js";

const inReview = () => documentReady(planNewSpec({ adapter, id: "DEMO-1", brief: "Add login", existingIds: [] }).state);

test("approve: disabled with one pending comment, enabled with none", () => {
  const s = inReview();
  assert.equal(approveBlock(s), null);
  const withOne = { ...s, pending: [{ lines: [1, 1], quote: "q", body: "b", start: 0, end: 1 }] };
  assert.match(approveBlock(withOne), /1 pending comment first/);
  assert.throws(() => planApproval({ adapter, state: withOne }), /pending comment/);
});

test("approve: not in review gives a reason; a plan in review can be approved (S7 dispatches it)", () => {
  const drafting = planNewSpec({ adapter, id: "D-1", brief: "x", existingIds: [] }).state;
  assert.match(approveBlock(drafting), /drafting/);
  assert.equal(approveBlock({ ...inReview(), phase: "plan" }), null);
  assert.match(approveBlock({ ...inReview(), phase: "build" }), /already approved/);
});

test("approve: Plan drafting, plan model, prompt names plan.md, Source spec, tasks.json, no todo.md", () => {
  const { state, model, message } = planApproval({ adapter, state: inReview() });
  assert.equal(state.phase, "plan");
  assert.equal(state.status, "drafting");
  assert.deepEqual(model, { model: "opus", effort: "high" });
  assert.match(message, /^\/agent-skills:plan/);
  assert.match(message, /exactly this path: specs\/DEMO-1\/plan\.md/);
  assert.match(message, /first line must be: Source spec: specs\/DEMO-1\/spec\.md/);
  assert.match(message, /specs\/DEMO-1\/tasks\.json/);
  assert.match(message, /Do not create tasks\/todo\.md/);
});

test("a plan whose Source spec names another file shows the error", () => {
  const c = checkSourceSpec("Source spec: specs/OTHER/spec.md\n# Plan", "specs/DEMO-1/spec.md");
  assert.equal(c.errors.length, 1);
  assert.match(c.errors[0], /specs\/OTHER\/spec\.md/);
  assert.deepEqual(checkSourceSpec("Source spec: specs/DEMO-1/spec.md\n", "specs/DEMO-1/spec.md"), { errors: [], warnings: [] });
  assert.equal(checkSourceSpec("# Plan", "x").warnings.length, 1);
});
