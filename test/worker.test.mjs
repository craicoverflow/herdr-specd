import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadAdapter, resolveModels } from "../mods/specd/core/adapters.js";
import { parseWorkerModel, modelDefaults } from "../mods/specd/core/worker.js";

const adapter = loadAdapter(readFileSync(new URL("../mods/specd/adapters/agent-skills.json", import.meta.url), "utf8"));
const cfg = JSON.stringify({ settings: { worker: { agent: "claude", model: "haiku" } } });

test("parseWorkerModel reads settings.worker.model and tolerates anything else", () => {
  assert.equal(parseWorkerModel(cfg), "haiku");
  for (const bad of ["", "not json", "null", "{}", '{"settings":{}}', '{"settings":{"worker":{"model":""}}}', '{"settings":{"worker":{"model":3}}}', undefined]) {
    assert.equal(parseWorkerModel(bad), null, String(bad));
  }
});

test("build model: spec state > folder config > Shepherdr worker model > adapter", () => {
  const d = modelDefaults("haiku");
  assert.equal(resolveModels(adapter, null, { models: {} }, d).build.model, "haiku");
  assert.equal(resolveModels(adapter, { models: { build: "opus" } }, { models: {} }, d).build.model, "opus");
  assert.equal(resolveModels(adapter, { models: { build: "opus" } }, { models: { build: "sonnet" } }, d).build.model, "sonnet");
  assert.equal(resolveModels(adapter, null, { models: {} }, modelDefaults(null)).build.model, adapter.phases.build.model);
  assert.equal(resolveModels(adapter, null, { models: {} }, d).spec.model, adapter.phases.spec.model);
});
