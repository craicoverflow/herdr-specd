import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { agentChoices, claimOwner, needsOwnerPick } from "../mods/specd/core/owner.js";
import { adoptSpec } from "../mods/specd/core/state.js";
import { resolveModels, loadAdapter } from "../mods/specd/core/adapters.js";

const tabs = [{ id: "tb1", name: "claude work" }, { id: "tb2", name: "shell" }];
const adapter = () => loadAdapter(readFileSync(new URL("../mods/specd/adapters/agent-skills.json", import.meta.url), "utf8"));

test("agentChoices: only panes that name an agent, when Herdr says so", () => {
  const panes = [{ terminal: "t1", tab: "tb1", agent: "claude" }, { terminal: "t2", tab: "tb2" }, { tab: "tb2" }];
  assert.deepEqual(agentChoices({ panes, tabs }), [{ terminal: "t1", tab: "tb1", label: "claude work · claude" }]);
});

test("agentChoices: with no agent hints every terminal is offered; skip leaves one out", () => {
  const panes = [{ terminal: "t1", tab: "tb1" }, { terminal: "t2", tab: "tb2" }];
  assert.deepEqual(agentChoices({ panes, tabs }).map((c) => c.terminal), ["t1", "t2"]);
  assert.deepEqual(agentChoices({ panes, tabs, skip: "t1" }).map((c) => c.terminal), ["t2"]);
  assert.deepEqual(agentChoices({ panes: [], tabs }), []);
});

test("claimOwner records the terminal for the phase and leaves the input alone", () => {
  const s = adoptSpec({ id: "A-1", paths: { spec: "a.md" } });
  const n = claimOwner(s, "spec", { terminal: "t1", tab: "tb1" }, 5);
  assert.deepEqual(n.owners.spec, { terminal: "t1", tab: "tb1", at: 5 });
  assert.deepEqual(s.owners, {});
  assert.throws(() => claimOwner(s, "spec", {}), /terminal/);
  assert.throws(() => claimOwner(s, "build", { terminal: "t1" }), /owner/);
});

test("needsOwnerPick: only with no live owner and someone to pick", () => {
  assert.equal(needsOwnerPick({ alive: false, choices: [{}] }), true);
  assert.equal(needsOwnerPick({ alive: true, choices: [{}] }), false);
  assert.equal(needsOwnerPick({ alive: false, choices: [] }), false);
});

test("adoptSpec writes no models, so folder config and the adapter take effect", () => {
  const a = adapter();
  const s = adoptSpec({ id: "A-1", paths: { spec: "a.md" } });
  assert.deepEqual(s.models, {});
  assert.equal(resolveModels(a, { models: { plan: "haiku" } }, s).plan.model, "haiku");
  assert.equal(resolveModels(a, undefined, s).spec.model, a.phases.spec.model);
  const chosen = adoptSpec({ id: "A-2", paths: { spec: "a.md" }, models: { spec: "sonnet" } });
  assert.deepEqual(chosen.models, { spec: "sonnet" });
});

test("an existing state.json with models still outranks folder config", () => {
  const old = { models: { spec: "opus", plan: "opus", build: "sonnet" } };
  assert.equal(resolveModels(adapter(), { models: { plan: "haiku" } }, old).plan.model, "opus");
});
