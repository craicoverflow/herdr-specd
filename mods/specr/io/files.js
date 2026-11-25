// Reading spec state and documents from a folder. Effects live here; the logic is in core/.
import * as fs from "fs/promises";
import { readTextFile, writeTextFile } from "herdr";
import { parseState, prepareWrite, currentDocPath } from "../core/state.js";
import { planAdoption } from "../core/adopt.js";
import { summarize, sortSummaries } from "../core/summary.js";
import { roundDir, baseName, reviewRecord } from "../core/submit.js";

const join = (folder, rel) => (rel.startsWith("/") ? rel : `${folder.replace(/\/$/, "")}/${rel}`);

export const specsDir = (folder) => `${folder}/.specr/specs`;

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
      const tasksText = state.paths?.tasks ? await read(join(folder, state.paths.tasks)) : null;
      rows.push({ ...summarize(state, { docText, tasksText }), dir: name });
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
  const rel = currentDocPath(state) ?? state.paths?.spec ?? null;
  const path = rel ? join(folder, rel) : null;
  return { state, path, doc: path ? await read(path) : null };
}

/** Save a spec's state.json. Refuses (throws) when the file changed on disk since it was read here. */
export async function saveState(folder, state) {
  const path = `${specsDir(folder)}/${state.id}/state.json`;
  const existing = await read(path);
  await writeTextFile(path, prepareWrite(state, existing), existing);
}

/** IDs already taken in the folder: every directory under .specr/specs, readable or not. */
export async function usedIds(folder) {
  try {
    return (await fs.exists(specsDir(folder))) ? await fs.readdir(specsDir(folder)) : [];
  } catch {
    return [];
  }
}

/** S2: register picked files as a spec ({id, spec, plan?, tasks?}); returns the new state. Throws a message fit to show. */
export async function adoptFiles(folder, { id, spec, plan, tasks }) {
  const state = planAdoption({ folder, id, spec, plan, tasks, existingIds: await usedIds(folder) });
  if (!(await read(spec))) throw new Error(`Can't read ${spec}.`);
  await writeTextFile(`${specsDir(folder)}/${state.id}/state.json`, prepareWrite(state, null), null);
  return state;
}

async function writeFresh(path, text) {
  await writeTextFile(path, text, await read(path)); // a retry after a half-finished Submit replaces what it left
}

/**
 * S4: keep a round: the reviewed document and review.json under .specr/specs/<ID>/rounds/<n>/.
 * `state` is the state before Submit (its phase, round and file); returns the round's folder.
 */
export async function saveRound(folder, state, { doc, comments, file }) {
  const dir = `${specsDir(folder)}/${state.id}/rounds/${roundDir(state.phase, state.round)}`;
  await fs.mkdir(dir, { recursive: true });
  await writeFresh(`${dir}/${baseName(file)}`, doc);
  const record = reviewRecord({ id: state.id, phase: state.phase, round: state.round, file, comments, at: Date.now() });
  await writeFresh(`${dir}/review.json`, JSON.stringify(record, null, 2) + "\n");
  return dir;
}
