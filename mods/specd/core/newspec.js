// S1: a new spec. Pure: the state to save, the agent's model and the first message.
import { createSpec, documentReady, approve } from "./state.js";
import { resolvePaths, resolveModels, fillPrompt } from "./adapters.js";

/** `models` is the dialog's choice ({spec?}); `config` is .specd/config.json. Throws a message fit to show; `code: "used"` for a taken ID. */
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

/**
 * S6: approve the spec. The state to save (Plan, drafting), the plan agent's model and the first
 * message. Throws a message fit to show while comments are pending or the spec isn't in review.
 */
export function planApproval({ adapter, state, config }) {
  const next = approve(state);
  if (next.phase !== "plan") throw new Error("Only a spec in review is approved here.");
  const chosen = resolveModels(adapter, config, next);
  // An adopted spec has no plan or task-list path yet: the adapter's default location, so the plan
  // agent never gets "undefined". The native planner writes a markdown task list, so a tasks.json
  // path from an older specd becomes todo.md beside it.
  next.paths = { ...resolvePaths(adapter, state.id, config), ...state.paths };
  if (/\.json$/i.test(next.paths.tasks)) next.paths.tasks = next.paths.tasks.replace(/[^/]*$/, "todo.md");
  const { spec, plan, tasks } = next.paths;
  const message = fillPrompt(adapter, "plan", { id: state.id, brief: state.brief, specPath: spec, planPath: plan, tasksPath: tasks });
  return { state: next, model: chosen.plan, message };
}

/** Why Approve is off, or null when it's on. */
export function approveBlock(state) {
  if (state.phase !== "spec" && state.phase !== "plan") return `The ${state.phase} phase is already approved.`;
  if (state.status !== "review") return `The ${state.phase === "plan" ? "plan" : "spec"} is ${state.status}: approve it once it's in review.`;
  if (state.pending.length > 0) {
    const n = state.pending.length;
    return `Submit or remove the ${n} pending comment${n === 1 ? "" : "s"} first.`;
  }
  return null;
}
