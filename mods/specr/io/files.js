// Reading spec state and documents from a folder. Effects live here; the logic is in core/.
import * as fs from "fs/promises";
import { readTextFile } from "herdr";
import { parseState, currentDocPath } from "../core/state.js";
import { summarize, sortSummaries } from "../core/summary.js";

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
