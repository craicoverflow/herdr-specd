// herdr-task and the files dispatch needs. Effects live here; the logic is in core/dispatch.js.
// Call from handlers and tasks, never from render().
import * as fs from "fs/promises";
import { exec, home, readTextFile, writeTextFile } from "herdr";
import { readPermissionModeFile } from "../core/tasks.js";
import { claudeSessionFile, checkTasksText, parseAddResult, resolveRepo } from "../core/dispatch.js";

const TIMEOUT = 60000;
let found = null;

// The herdr-task to run: the first on PATH (through a shell, so the user's PATH applies), else ~/.local/bin.
async function taskBin() {
  if (found) return found;
  try {
    const r = await exec("/bin/sh", ["-c", "command -v herdr-task"], { timeout: 10000 });
    const p = r.code === 0 ? r.stdout.trim().split("\n")[0] : "";
    if (p) return (found = p);
  } catch { /* fall through */ }
  return (found = `${home()}/.local/bin/herdr-task`);
}

/** Run a `herdr-task ...` argv (the first entry is the name) with no shell. Returns stdout; throws a message fit to show. */
export async function runTask(argv) {
  const r = await exec(await taskBin(), argv.slice(1), { timeout: TIMEOUT });
  if (r.code !== 0) throw new Error(`${argv.slice(0, 3).join(" ")} failed: ${(r.stderr || r.stdout).trim() || `exit ${r.code}`}`);
  return r.stdout;
}

export const addTask = async (argv) => parseAddResult(await runTask(argv));
export const startTask = async (argv) => { await runTask(argv); };

async function read(path) {
  try { return (await readTextFile(path)) ?? null; } catch { return null; }
}

/** Write a prompt file (replacing what an earlier try left). */
export async function writePromptFile(path, text) {
  await fs.mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  await writeTextFile(path, text, await read(path));
}

/** Read and validate the spec's tasks.json against plan.md and the repos on disk: { tasks, errors, warnings, planText }. */
export async function loadTasks(folder, state) {
  const abs = (p) => (p.startsWith("/") ? p : resolveRepo(folder, p));
  const text = await read(abs(state.paths.tasks));
  const planText = (await read(abs(state.paths.plan))) ?? undefined;
  let repos = new Set();
  try {
    const items = JSON.parse(text ?? "null")?.items;
    const rels = [...new Set((Array.isArray(items) ? items : []).map((i) => i?.repo).filter((r) => typeof r === "string" && !r.startsWith("/")))];
    const ok = await Promise.all(rels.map(async (r) => { try { return await fs.exists(`${resolveRepo(folder, r)}/.git`); } catch { return false; } }));
    repos = new Set(rels.filter((_, i) => ok[i]));
  } catch { /* checkTasksText reports it */ }
  const r = checkTasksText(text, { specId: state.id, specPath: state.paths.spec, planText, isRepo: (rel) => repos.has(rel) });
  return { ...r, planText };
}

/** The plan agent's permission mode now, from its session transcript; undefined when unknown (an adopted plan). */
export async function parentMode(folder, state) {
  const session = state.owners?.plan?.session;
  if (!session) return undefined;
  return readPermissionModeFile(claudeSessionFile(home(), folder, session), (p, enc) => fs.readFile(p, enc));
}
