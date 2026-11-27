// Reading spec state and documents from a folder. Effects live here; the logic is in core/.
import * as fs from "fs/promises";
import { readTextFile, writeTextFile } from "herdr";
import { parseState, prepareWrite, currentDocPath, shownDocPath } from "../core/state.js";
import { planAdoption } from "../core/adopt.js";
import { summarize, sortSummaries } from "../core/summary.js";
import { findSpecs, matcher, pickPlan, parseDismissed, withDismissed, findPlanFor, sourceSpecOf, sameSpec } from "../core/found.js";
import { hashText } from "../core/manifest.js";
import { roundDir, baseName, reviewRecord } from "../core/submit.js";

const join = (folder, rel) => (rel.startsWith("/") ? rel : `${folder.replace(/\/$/, "")}/${rel}`);

export const specsDir = (folder) => `${folder}/.specd/specs`;

async function read(path) {
  try {
    return (await readTextFile(path)) ?? null;
  } catch {
    return null;
  }
}

/** Every spec in the folder: { summaries, errors }. A broken state.json is an error row, not a crash. */
export async function loadSpecs(folder) {
  const dir = specsDir(folder);
  let names = [];
  try {
    if (await fs.exists(dir)) names = await fs.readdir(dir);
  } catch {
    names = [];
  }
  const rows = [];
  const errors = [];
  for (const name of names) {
    const text = await read(`${dir}/${name}/state.json`);
    if (text == null) continue;
    try {
      const state = parseState(text);
      const docPath = currentDocPath(state) ?? state.paths?.spec;
      const docText = docPath ? await read(join(folder, docPath)) : null;
      // the Tasks column: the dispatch list (manifest.json), else a legacy tasks.json
      const tasksText = (await read(`${dir}/${name}/manifest.json`))
        ?? (/\.json$/i.test(state.paths?.tasks ?? "") ? await read(join(folder, state.paths.tasks)) : null);
      rows.push({ ...summarize(state, { docText, tasksText }), dir: name, specPath: state.paths?.spec ?? null });
    } catch (e) {
      errors.push({ id: name, message: String(e?.message ?? e) });
    }
  }
  return { summaries: sortSummaries(rows), errors };
}

/** The shown spec: its state and the text of the phase document (null when the file is missing). */
export async function loadSpec(folder, id) {
  const text = await read(`${specsDir(folder)}/${id}/state.json`);
  if (text == null) throw new Error(`No spec ${id} in this folder.`);
  const state = parseState(text);
  const path = shownDocPath(folder, state);
  return { state, path, doc: path ? await read(path) : null };
}

/** Save a spec's state.json. Refuses (throws) when the file changed on disk since it was read here. */
export async function saveState(folder, state) {
  const path = `${specsDir(folder)}/${state.id}/state.json`;
  const existing = await read(path);
  await writeTextFile(path, prepareWrite(state, existing), existing);
}

/** IDs already taken in the folder: every directory under .specd/specs, readable or not. */
export async function usedIds(folder) {
  try {
    return (await fs.exists(specsDir(folder))) ? await fs.readdir(specsDir(folder)) : [];
  } catch {
    return [];
  }
}

/** The spec file each recorded spec points at: [{ id, spec }]. Unreadable records are left out. */
async function recordedSpecs(folder) {
  const out = [];
  for (const id of await usedIds(folder)) {
    try { out.push({ id, spec: parseState((await read(`${specsDir(folder)}/${id}/state.json`)) ?? "").paths?.spec }); } catch { /* not a spec */ }
  }
  return out;
}

/** S2: register picked files as a spec ({id, spec, plan?, tasks?}); returns the new state. Throws a message fit to show. */
export async function adoptFiles(folder, { id, spec, plan, tasks }) {
  const state = planAdoption({ folder, id, spec, plan, tasks, existingIds: await usedIds(folder), recorded: await recordedSpecs(folder) });
  if (!(await read(spec))) throw new Error(`Can't read ${spec}.`);
  await writeTextFile(`${specsDir(folder)}/${state.id}/state.json`, prepareWrite(state, null), null);
  return state;
}

/** S1: write a new spec's state.json (refused when the ID is taken); returns nothing. */
export async function createState(folder, state) {
  if ((await usedIds(folder)).includes(state.id)) {
    throw Object.assign(new Error(`A spec with ID ${state.id} already exists in this folder.`), { code: "used", id: state.id });
  }
  await writeTextFile(`${specsDir(folder)}/${state.id}/state.json`, prepareWrite(state, null), null);
}

async function writeFresh(path, text) {
  await writeTextFile(path, text, await read(path)); // a retry after a half-finished Submit replaces what it left
}

/**
 * S4: keep a round: the reviewed document and review.json under .specd/specs/<ID>/rounds/<n>/.
 * `state` is the state before Submit (its phase, round and file); returns the round's folder.
 */
export async function saveRound(folder, state, { doc, comments, file }) {
  const dir = `${specsDir(folder)}/${state.id}/rounds/${roundDir(state.phase, state.round)}`;
  // No fs.mkdir: outside ~/.config/herdr-app, fs/promises writes never settle (e2e 2026-11-26).
  // writeTextFile creates the missing folders itself.
  await writeFresh(`${dir}/${baseName(file)}`, doc);
  const record = reviewRecord({ id: state.id, phase: state.phase, round: state.round, file, comments, at: Date.now() });
  await writeFresh(`${dir}/review.json`, JSON.stringify(record, null, 2) + "\n");
  return dir;
}

// ---- S11: specs written outside specd ------------------------------------------------------------

const SKIP_DIRS = new Set(["node_modules", "target", "dist", "build", "vendor"]);

/** Relative paths of markdown files within 3 levels of the folder (no dot-folders, no build folders). */
export async function listMarkdown(folder, dir = "", depth = 0) {
  let entries;
  try {
    entries = await fs.readdir(dir ? `${folder}/${dir}` : folder, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (depth < 3 && !e.name.startsWith(".") && !SKIP_DIRS.has(e.name)) out.push(...(await listMarkdown(folder, rel, depth + 1)));
    } else if (/\.md$/i.test(e.name)) out.push(rel);
  }
  return out;
}

const dismissedPath = (folder) => `${folder}/.specd/dismissed.json`;

export async function loadDismissed(folder) {
  return parseDismissed(await read(dismissedPath(folder)));
}

export async function dismissFound(folder, path) {
  const existing = await read(dismissedPath(folder));
  await writeTextFile(dismissedPath(folder), JSON.stringify(withDismissed(parseDismissed(existing), path), null, 2) + "\n", existing);
}

/** Specs on disk that no spec record points at: [{ path, id }] with folder-relative paths. */
export async function scanFound(folder, adapter, recorded) {
  const [files, dismissed] = await Promise.all([listMarkdown(folder), loadDismissed(folder)]);
  return findSpecs(adapter, files, { recorded, dismissed });
}

/** Adopt a found spec: the plan whose `Source spec:` names it comes along. Returns the new state. */
export async function adoptFound(folder, adapter, found, id) {
  const patterns = adapter.discover?.plans ?? [];
  const files = await listMarkdown(folder);
  const candidates = files.filter((p) => patterns.some((pat) => matcher(pat)(p)));
  const plans = {};
  for (const p of candidates) plans[p] = (await read(`${folder}/${p}`)) ?? "";
  const plan = pickPlan(adapter, found.path, plans);
  return adoptFiles(folder, { id, spec: `${folder}/${found.path}`, plan: plan ? `${folder}/${plan}` : null, tasks: null });
}

/**
 * Markdown files that already name this spec on a `Source spec:` line, as { path: hash }: taken when
 * the plan agent starts, so an older plan for the same spec is never mistaken for the new one.
 */
export async function plansNaming(folder, specPath) {
  const out = {};
  for (const f of await listMarkdown(folder)) {
    const text = (await read(`${folder}/${f}`)) ?? "";
    if (sameSpec(sourceSpecOf(text) ?? "", specPath)) out[f] = hashText(text);
  }
  return out;
}

/**
 * The plan agent saved somewhere other than the asked-for path: the plan (and task list beside it)
 * whose `Source spec:` line names this spec and that is new or changed since the agent started
 * (state.planSeen). Returns the state with those paths, or null.
 */
export async function relocatePlan(folder, state) {
  const p = state.paths;
  if (!p.plan || !state.planSeen || (await read(join(folder, p.plan))) != null) return null;
  const files = {};
  for (const f of await listMarkdown(folder)) {
    const text = (await read(`${folder}/${f}`)) ?? "";
    if (state.planSeen[f] !== hashText(text)) files[f] = text;
  }
  const hit = findPlanFor(p.spec, files);
  if (!hit) return null;
  const { planSeen: _, ...rest } = state;
  return { ...rest, paths: { ...p, plan: hit.plan, ...(hit.tasks ? { tasks: hit.tasks } : {}) } };
}

/** The document text kept at the last Submit (round n-1), or null when there was none. */
export async function submittedDoc(folder, state) {
  if (state.round <= 1) return null;
  const file = currentDocPath(state);
  if (!file) return null;
  return read(`${specsDir(folder)}/${state.id}/rounds/${roundDir(state.phase, state.round - 1)}/${baseName(file)}`);
}

/** Last round's kept document and comments ({ doc, comments }), or null when there was none. */
export async function lastRound(folder, state) {
  const doc = await submittedDoc(folder, state);
  if (doc == null) return null;
  let comments = [];
  try {
    comments = JSON.parse((await read(`${specsDir(folder)}/${state.id}/rounds/${roundDir(state.phase, state.round - 1)}/review.json`)) ?? "{}").comments ?? [];
  } catch {
    // an unreadable review.json: still show the section marks
  }
  return { doc, comments };
}
