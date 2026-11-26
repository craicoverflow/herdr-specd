// Adapter version 1: load, validate, resolve paths, models and prompts. Pure.
import { specInstructions, planInstructions, taskInstructions } from "./instructions.js";

const PHASES = ["spec", "plan", "build"];
const PATH_KEYS = ["spec", "plan", "tasks"];
const BLOCKS = ["{specd.spec}", "{specd.plan}", "{specd.task}"];
const str = (v) => typeof v === "string" && v.trim() !== "";
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// Returns every problem at once.
export function validateAdapter(a) {
  const errors = [];
  if (!isObj(a)) return ["adapter must be a JSON object"];
  if (a.adapter !== 1) errors.push(`adapter: expected version 1, got ${JSON.stringify(a.adapter)}`);
  if (!str(a.id) || !/^[a-z][a-z0-9-]*$/.test(a.id)) errors.push("id: required, lowercase letters, digits and dashes");
  if (!str(a.name)) errors.push("name: required string");
  if (!isObj(a.paths)) errors.push("paths: required object");
  else for (const k of PATH_KEYS) {
    if (!str(a.paths[k])) errors.push(`paths.${k}: required string`);
    else if (!a.paths[k].includes("{id}")) errors.push(`paths.${k}: must contain {id}`);
  }
  if (a.discover !== undefined) {
    if (!isObj(a.discover)) errors.push("discover: must be an object");
    else for (const k of ["specs", "plans"]) {
      const v = a.discover[k];
      if (v !== undefined && !(Array.isArray(v) && v.every(str))) errors.push(`discover.${k}: must be an array of path patterns`);
    }
  }
  const argv = a.agent?.argv;
  if (!Array.isArray(argv) || argv.length === 0 || !argv.every(str)) errors.push("agent.argv: required non-empty array of strings");
  if (!isObj(a.phases)) errors.push("phases: required object");
  else for (const p of PHASES) {
    const ph = a.phases[p];
    if (!isObj(ph)) { errors.push(`phases.${p}: required object`); continue; }
    if (!str(ph.model)) errors.push(`phases.${p}.model: required string`);
    if (ph.effort !== undefined && !str(ph.effort)) errors.push(`phases.${p}.effort: must be a non-empty string`);
    if (!str(ph.prompt)) { errors.push(`phases.${p}.prompt: required string`); continue; }
    const block = { spec: "{specd.spec}", plan: "{specd.plan}", build: "{specd.task}" }[p];
    if (!ph.prompt.includes(block)) errors.push(`phases.${p}.prompt: must contain ${block}`);
    if (p === "spec" && !ph.prompt.includes("{brief}")) errors.push("phases.spec.prompt: must contain {brief}");
    for (const m of ph.prompt.match(/\{[A-Za-z][\w.]*\}/g) || [])
      if (m !== "{brief}" && !BLOCKS.includes(m)) errors.push(`phases.${p}.prompt: unknown placeholder ${m}`);
    if (p === "build" && startsWithAutoOrAll(ph.prompt)) errors.push("phases.build.prompt: must not start with auto or all");
    if (ph.review !== undefined && !(isObj(ph.review) && str(ph.review.finishNotes))) errors.push(`phases.${p}.review.finishNotes: required string`);
  }
  return errors;
}

export function loadAdapter(text) {
  let a;
  try { a = typeof text === "string" ? JSON.parse(text) : text; }
  catch (e) { throw new AdapterError([`invalid JSON: ${e.message}`]); }
  const errors = validateAdapter(a);
  if (errors.length) throw new AdapterError(errors);
  return a;
}

export class AdapterError extends Error {
  constructor(errors) { super(`Adapter invalid:\n- ${errors.join("\n- ")}`); this.errors = errors; }
}

// folder: contents of .specd/config.json ({paths?, models?}); both may be undefined.
export function resolvePaths(adapter, id, folder) {
  const out = {};
  for (const k of PATH_KEYS) out[k] = (folder?.paths?.[k] ?? adapter.paths[k]).replaceAll("{id}", id);
  return out;
}

// Precedence: spec state > folder config > adapter. `models` entries are a model name
// or { model, effort }.
export function resolveModels(adapter, folder, spec) {
  const out = {};
  for (const p of PHASES) {
    const base = adapter.phases[p];
    let model = base.model, effort = base.effort;
    for (const layer of [folder?.models?.[p], spec?.models?.[p]]) {
      if (layer === undefined) continue;
      if (typeof layer === "string") model = layer;
      else { if (layer.model) model = layer.model; if (layer.effort) effort = layer.effort; }
    }
    out[p] = { model, effort };
  }
  return out;
}

export function agentArgv(adapter, { model, effort, session }) {
  const argv = [];
  for (const a of adapter.agent.argv) {
    if (a === "{effort}") { if (effort) argv.push(effort); else argv.pop(); continue; } // drop "--effort" too
    if (a === "{session}") { if (session) argv.push(session); else argv.pop(); continue; }
    argv.push(a.replaceAll("{model}", model));
  }
  return argv;
}

const startsWithAutoOrAll = (s) => /^(auto|all)(\s|$)/i.test(s.trim());

// vars: { brief, specPath, planPath, tasksPath, section }. {brief} and {specd.*} are
// substituted in one pass so inserted text is never re-expanded.
export function fillPrompt(adapter, phase, vars) {
  const tpl = adapter.phases[phase].prompt;
  const blocks = {
    "{brief}": () => vars.brief ?? "",
    "{specd.spec}": () => specInstructions(vars),
    "{specd.plan}": () => planInstructions(vars),
    "{specd.task}": () => taskInstructions(vars),
  };
  const out = tpl.replace(/\{brief\}|\{specd\.(?:spec|plan|task)\}/g, (m) => blocks[m]());
  if (phase === "build") {
    // The text after a build slash command must never start with auto or all.
    const arg = out.replace(/^\/\S+\s*/, "");
    if (startsWithAutoOrAll(out) || startsWithAutoOrAll(arg)) throw new Error("build prompt must not start with auto or all");
  }
  return out;
}
