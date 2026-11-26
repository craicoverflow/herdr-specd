// S1: a new spec. Pure: the state to save, the agent's model and the first message.
import { createSpec, documentReady } from "./state.js";
import { resolvePaths, resolveModels, fillPrompt } from "./adapters.js";

/** `models` is the dialog's choice ({spec?}); `config` is .specr/config.json. Throws a message fit to show; `code: "used"` for a taken ID. */
export function planNewSpec({ adapter, id, brief, existingIds, models, config }) {
  id = id?.trim();
  if ((existingIds ?? []).includes(id)) {
    throw Object.assign(new Error(`A spec with ID ${id} already exists in this folder.`), { code: "used", id });
  }
  const paths = resolvePaths(adapter, id, config);
  const chosen = resolveModels(adapter, config, { models });
  const state = createSpec({ id, brief, adapter: adapter.id, paths, models: models?.spec ? { spec: models.spec } : {}, existingIds });
  const message = fillPrompt(adapter, "spec", { brief: state.brief, specPath: paths.spec, planPath: paths.plan, tasksPath: paths.tasks });
  return { state, model: chosen.spec, message };
}

/**
 * The new state when a drafting spec's document has appeared, else null. `submitted` is the text
 * kept at the last Submit: the agent hasn't revised until the document differs from it.
 */
export function autoReview(state, doc, submitted = null) {
  if (state.status !== "drafting" || doc == null || !doc.trim()) return null;
  if (submitted != null && doc === submitted) return null;
  return documentReady(state);
}
