import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadAdapter } from "../mods/specr/core/adapters.js";
import { planNewSpec, autoReview } from "../mods/specr/core/newspec.js";

const adapter = loadAdapter(readFileSync(new URL("../mods/specr/adapters/agent-skills.json", import.meta.url), "utf8"));

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
