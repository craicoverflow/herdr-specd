// Spec state and phase transitions. Pure: no herdr, gpui or fs imports. Every transition returns
// a new state and throws an Error with a message fit to show the person when it refuses.

export const STATE_VERSION = 1;
export const PHASES = ["spec", "plan", "build", "done"];
const STATUSES = ["drafting", "review", "approved"];
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9-]*$/;
const DEFAULT_MODELS = { spec: "opus", plan: "opus", build: "sonnet" };

const clone = (x) => JSON.parse(JSON.stringify(x));

function checkId(id, existingIds) {
  if (typeof id !== "string" || !ID_RE.test(id)) {
    throw new Error(`Invalid ID "${id}": use letters, digits and dashes, starting with a letter or digit.`);
  }
  if ((existingIds ?? []).includes(id)) throw new Error(`A spec with ID ${id} already exists in this folder.`);
}

function fresh(fields) {
  return {
    state: STATE_VERSION,
    adapter: "agent-skills",
    brief: "",
    models: { ...DEFAULT_MODELS },
    round: 1,
    owners: {},
    pending: [],
    dispatch: { review: false, created: {} },
    ...fields,
  };
}

/** S1: a new spec, drafting. `paths` is where the agent must write ({spec, plan, tasks}). */
export function createSpec({ id, brief, adapter, paths, models, existingIds }) {
  checkId(id, existingIds);
  if (typeof brief !== "string" || !brief.trim()) throw new Error("The brief (what to build) is required.");
  return fresh({
    id,
    adapter: adapter ?? "agent-skills",
    brief,
    paths: { ...paths },
    models: { ...DEFAULT_MODELS, ...models },
    phase: "spec",
    status: "drafting",
  });
}

/** S2: register existing files. Phase follows the files: spec only -> spec, spec + plan -> plan. */
export function adoptSpec({ id, paths, adapter, brief, models, existingIds }) {
  checkId(id, existingIds);
  if (!paths?.spec) throw new Error("Adopting needs a spec file.");
  if (paths.plan === undefined && paths.tasks === undefined) paths = { spec: paths.spec };
  return fresh({
    id,
    adapter: adapter ?? "agent-skills",
    brief: brief ?? "",
    paths: { ...paths },
    models: { ...DEFAULT_MODELS, ...models },
    phase: paths.plan ? "plan" : "spec",
    status: "review",
  });
}

/** S1: the document appeared (or was rewritten after a submitted review): drafting -> review. */
export function documentReady(s) {
  if (s.status !== "drafting") throw new Error(`Can't start review: the document is ${s.status}, not drafting.`);
  return { ...clone(s), status: "review" };
}

/** S6: approve the phase document. Spec -> plan (drafting), plan -> build. */
export function approve(s) {
  if (s.status !== "review" || (s.phase !== "spec" && s.phase !== "plan")) {
    throw new Error(`Nothing to approve: ${s.phase} is ${s.status}, approval needs a document in review.`);
  }
  if (s.pending.length > 0) {
    const n = s.pending.length;
    throw new Error(`Submit or remove the ${n} pending comment${n === 1 ? "" : "s"} before approving.`);
  }
  const next = clone(s);
  next.round = 1;
  if (s.phase === "spec") {
    next.phase = "plan";
    next.status = "drafting";
  } else {
    next.phase = "build";
    next.status = "approved";
  }
  return next;
}

/**
 * Skip the plan phase: the spec in review goes straight to build (saved once its dispatch is done).
 * `asPlan`: the spec is also the plan (an RFC, a plan-mode document), so its text is what gets
 * split into tasks. Otherwise the whole spec is one task.
 */
export function skipPlan(s, { asPlan }) {
  if (s.phase !== "spec" || s.status !== "review") throw new Error(`Nothing to skip: the spec is ${s.phase === "spec" ? s.status : "past review"}.`);
  if (s.pending.length > 0) throw new Error(`Submit or remove the ${s.pending.length} pending comment${s.pending.length === 1 ? "" : "s"} first.`);
  const next = clone(s);
  // as the plan: the spec's own text is split into tasks; else the whole spec is one task (no plan, no task list)
  next.paths = asPlan ? { ...next.paths, plan: s.paths.spec } : { spec: s.paths.spec };
  next.phase = "build";
  next.status = "approved";
  next.round = 1;
  return next;
}

/** S6: build -> done. */
export function finishBuild(s) {
  if (s.phase !== "build") throw new Error(`Can't finish: the spec is in ${s.phase}, not build.`);
  return { ...clone(s), phase: "done", status: "approved" };
}

/**
 * S4: submit the pending comments. Returns the new state (round + 1, no pending, back to
 * drafting while the owner revises) plus the round just submitted and its comments.
 */
export function submitReview(s) {
  if (s.status !== "review") throw new Error(`Can't submit: the document is ${s.status}, not in review.`);
  if (s.pending.length === 0) throw new Error("Can't submit: there are no comments.");
  const state = clone(s);
  state.pending = [];
  state.round = s.round + 1;
  state.status = "drafting";
  return { state, round: s.round, comments: clone(s.pending) };
}

/** S4: record (or replace, when the owner is gone) the agent that owns a phase document. */
export function setOwner(s, phase, owner) {
  if (phase !== "spec" && phase !== "plan") throw new Error(`No owner for phase "${phase}".`);
  if (!owner?.terminal) throw new Error("An owner needs a terminal.");
  const next = clone(s);
  next.owners[phase] = { ...owner };
  return next;
}

/** The document under review in the current phase, or null in build and done. */
export function currentDocPath(s) {
  return s.phase === "spec" || s.phase === "plan" ? (s.paths?.[s.phase] ?? null) : null;
}

/** The absolute path of the document the pane shows: the phase document, else the spec. Absolute paths (adopted files) are kept. */
export function shownDocPath(folder, s) {
  const rel = currentDocPath(s) ?? s.paths?.spec ?? null;
  if (!rel) return null;
  return rel.startsWith("/") ? rel : `${folder.replace(/\/$/, "")}/${rel}`;
}

function validate(s) {
  if (!s || typeof s !== "object") throw new Error("state.json is not an object.");
  if (typeof s.id !== "string") throw new Error("state.json has no id.");
  if (!PHASES.includes(s.phase)) throw new Error(`state.json has an unknown phase "${s.phase}".`);
  if (!STATUSES.includes(s.status)) throw new Error(`state.json has an unknown status "${s.status}".`);
  if (!Array.isArray(s.pending)) throw new Error("state.json has no pending list.");
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("state.json is not valid JSON.");
  }
}

function checkVersion(obj) {
  if (obj?.state !== STATE_VERSION) {
    const got = obj?.state === undefined ? "no version" : `version ${obj.state}`;
    throw new Error(`state.json has ${got}; this specd reads version ${STATE_VERSION}. Update specd or leave the file alone.`);
  }
}

export function parseState(text) {
  const obj = parseJson(text);
  checkVersion(obj);
  validate(obj);
  return obj;
}

export function serializeState(s) {
  return JSON.stringify(s, null, 2) + "\n";
}

/** Text to write for `s`; throws (so nothing is written) when the file on disk has another version. */
export function prepareWrite(s, existingText) {
  if (existingText != null) checkVersion(parseJson(existingText));
  return serializeState(s);
}
