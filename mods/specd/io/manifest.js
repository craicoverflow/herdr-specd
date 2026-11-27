// The dispatch list, effects: read the spec's documents, ask the model for the list, keep it in
// .specd/specs/<ID>/manifest.json. The logic is in core/manifest.js. Call from handlers, never render().
import * as fs from "fs/promises";
import { exec, readTextFile, writeTextFile } from "herdr";
import {
  MANIFEST_VERSION, DECOMPOSE_SCHEMA, decomposePrompt, checkItems, retryPrompt, normalizeItems, singleItem, singleRepo,
  activeItems, makeManifest, changedFiles, describeChange, viaFor,
} from "../core/manifest.js";
import { resolveRepo } from "../core/dispatch.js";
import { docTitle } from "../core/summary.js";
import { loadTasks } from "./herdr-task.js";
import { specsDir } from "./files.js";

const DECOMPOSE_MODEL = "sonnet";
const DECOMPOSE_TIMEOUT = 120000; // one call took 7-22 s in the UAT; Herdr allows up to 10 minutes

const read = async (p) => { try { return (await readTextFile(p)) ?? null; } catch { return null; } };
const abs = (folder, p) => (p.startsWith("/") ? p : resolveRepo(folder, p));
const manifestPath = (folder, id) => `${specsDir(folder)}/${id}/manifest.json`;
const isJson = (p) => /\.json$/i.test(p ?? "");

/** The model call: `claude -p` with no tools and a JSON schema. `llm({ prompt, schema })` -> { ok, json } or { ok: false, error }. */
export async function claudeLlm({ prompt, schema }) {
  const script = `exec "$(command -v claude || echo "$HOME/.local/bin/claude")" -p "$0" --model ${DECOMPOSE_MODEL} --output-format json --no-session-persistence --tools "" --json-schema "$1"`;
  let r;
  try {
    r = await exec("/bin/sh", ["-c", script, prompt, JSON.stringify(schema)], { timeout: DECOMPOSE_TIMEOUT });
  } catch (e) {
    return { ok: false, error: `claude didn't answer: ${e?.message ?? e}` };
  }
  try {
    const out = JSON.parse(r.stdout);
    if (!out.is_error && out.structured_output) return { ok: true, json: out.structured_output };
    return { ok: false, error: String(out.result ?? "no structured output").slice(0, 500) };
  } catch {
    return { ok: false, error: (r.stderr || r.stdout || `claude exited ${r.code}`).trim().slice(0, 500) };
  }
}

/** Git repositories in the folder: the folder itself and directories up to two levels down. Paths relative to the folder. */
export async function listRepos(folder, dir = "", depth = 0) {
  const here = dir ? `${folder}/${dir}` : folder;
  const out = (await fs.exists(`${here}/.git`)) ? [dir || "."] : [];
  if (depth >= 2) return out;
  let entries = [];
  try { entries = await fs.readdir(here, { withFileTypes: true }); } catch { /* unreadable */ }
  for (const e of entries) {
    if (e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules") out.push(...(await listRepos(folder, dir ? `${dir}/${e.name}` : e.name, depth + 1)));
  }
  return out;
}

/** The spec's documents: [{ file, text, role }]; file is the path as stored in state. Missing files are left out. */
export async function readDocs(folder, state) {
  const { spec, plan, tasks } = state.paths;
  const want = [[spec, plan === spec ? "spec+plan" : "spec"], [plan && plan !== spec ? plan : null, "plan"], [tasks && !isJson(tasks) ? tasks : null, "task list"]];
  const docs = [];
  for (const [file, role] of want) {
    const text = file ? await read(abs(folder, file)) : null;
    if (text != null) docs.push({ file, text, role });
  }
  return docs;
}

/** Decompose with one retry on validation errors. Returns { items } or { errors }. */
export async function decompose({ docs, repos, previous, note, llm }) {
  if (!repos.length) return { errors: ["No git repository found in this folder, so there is nowhere to run the tasks."] };
  const prompt = decomposePrompt({ docs, repos, previous, note });
  let answer = await llm({ prompt, schema: DECOMPOSE_SCHEMA });
  if (!answer.ok) return { errors: [`Couldn't work out the tasks: ${answer.error}`] };
  let errors = checkItems(answer.json.items, { docs, repos });
  if (errors.length) {
    answer = await llm({ prompt: retryPrompt(prompt, answer.json, errors), schema: DECOMPOSE_SCHEMA });
    if (!answer.ok) return { errors: [`Couldn't work out the tasks: ${answer.error}`] };
    errors = checkItems(answer.json.items, { docs, repos });
  }
  return errors.length ? { errors: ["The model's task list was still invalid after one retry:", ...errors] } : { items: normalizeItems(answer.json.items) };
}

/** A tasks.json from an older specd, when it is there: read as it is, through the version 1 checks. */
async function legacyTasks(folder, state) {
  if (!isJson(state.paths.tasks) || (await read(abs(folder, state.paths.tasks))) == null) return null;
  const r = await loadTasks(folder, state);
  return r.errors.length
    ? { legacy: true, errors: r.errors, warnings: r.warnings }
    : { legacy: true, items: r.tasks.items, done: [], planText: r.planText, docs: {}, warnings: r.warnings, derived: false };
}

/**
 * The dispatch list for a state (its paths say how it is made: see viaFor). A legacy tasks.json is
 * used as it is. Otherwise manifest.json is used while its documents are unchanged; when one
 * changed, or on `force` or a `note`, it is derived again, passing the earlier items so ids stay
 * stable. `note`: what the person asked for when asking again (kept for later re-derives; "" clears it).
 * Returns { items (to dispatch), done (left out), docs: { file: text }, derived, changed?: string, warnings? } or { errors, legacy? }.
 */
export async function loadPlanned(folder, state, { llm, note, force = false } = {}) {
  const legacy = await legacyTasks(folder, state);
  if (legacy) return legacy;
  const docs = await readDocs(folder, state);
  if (!docs.length) return { errors: [`Can't read ${state.paths.spec}.`] };
  const path = manifestPath(folder, state.id);
  const existing = await read(path);
  let manifest = null;
  try { manifest = JSON.parse(existing ?? "null"); } catch { /* derive again */ }
  const via = viaFor(state);
  const same = manifest?.manifest === MANIFEST_VERSION && manifest.via === via && Array.isArray(manifest.items);
  const stale = same ? changedFiles(manifest, docs) : [];
  const texts = Object.fromEntries(docs.map((d) => [d.file, d.text]));
  if (same && !stale.length && !force && note == null) {
    return { items: activeItems(manifest.items), done: manifest.items.filter((i) => i.done), docs: texts, derived: false };
  }
  const previous = same ? manifest.items : null;
  const keepNote = note ?? (same ? manifest.note : undefined);
  let items;
  if (via === "single") {
    const title = docTitle(docs[0].text) ?? state.id;
    try {
      items = singleItem({ title, file: docs[0].file, text: docs[0].text, repo: singleRepo(await listRepos(folder), title) });
    } catch (e) {
      return { errors: [String(e?.message ?? e)] };
    }
  } else {
    const r = await decompose({ docs, repos: await listRepos(folder), previous, note: keepNote, llm });
    if (r.errors) return { errors: r.errors };
    items = r.items;
  }
  await writeTextFile(path, JSON.stringify(makeManifest({ spec: state.id, via, items, docs, note: keepNote }), null, 2) + "\n", existing);
  const why = note != null ? "Asked again" : stale.length ? stale : "Worked out again";
  return {
    items: activeItems(items), done: items.filter((i) => i.done), docs: texts, derived: true,
    changed: previous ? describeChange(why, previous, items) : undefined,
  };
}

/** Every item of the spec's list for the build view (done ones too): manifest.json, else a legacy tasks.json; [] when there is none. */
export async function loadBuildItems(folder, state) {
  const parse = (text) => { try { const items = JSON.parse(text ?? "null")?.items; return Array.isArray(items) ? items : null; } catch { return null; } };
  const fromManifest = parse(await read(manifestPath(folder, state.id)));
  if (fromManifest) return fromManifest;
  return (isJson(state.paths.tasks) && parse(await read(abs(folder, state.paths.tasks)))) || [];
}
