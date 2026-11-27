// tasks.json validation, dependency order, prompts and herdr-task argv. Pure: no herdr, gpui or fs
// imports (the transcript file reader takes readFile as a parameter).
import { fillPrompt } from "./adapters.js";
import { checkpointInstructions } from "./instructions.js";
import { sourceBlock } from "./manifest.js";
import { sourceSpecOf, sameSpec } from "./found.js";

const ID_RE = /^[a-z][a-z0-9-]*$/;
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const str = (v) => typeof v === "string" && v.trim() !== "";

/** Heading texts of a markdown plan (ATX headings, outside nothing fancy). */
function headings(planText) {
  const out = [];
  planText.split("\n").forEach((line, i) => {
    const m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (m) out.push({ level: m[1].length, text: m[2], line: i });
  });
  return out;
}

/** A heading's section: the heading line down to the next heading of the same or higher level. */
export function extractSection(planText, heading) {
  const lines = planText.split("\n");
  const hs = headings(planText);
  const at = hs.findIndex((h) => h.text === heading.trim());
  if (at < 0) return null;
  const next = hs.slice(at + 1).find((h) => h.level <= hs[at].level);
  return lines.slice(hs[at].line, next ? next.line : lines.length).join("\n").trimEnd();
}

export function findCycle(items) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const state = new Map(); // id -> 1 visiting, 2 done
  const stack = [];
  const visit = (id) => {
    state.set(id, 1); stack.push(id);
    for (const d of byId.get(id).deps) {
      if (!byId.has(d)) continue;
      if (state.get(d) === 1) return [...stack.slice(stack.indexOf(d)), d];
      if (!state.has(d)) { const c = visit(d); if (c) return c; }
    }
    stack.pop(); state.set(id, 2);
    return null;
  };
  for (const i of items) if (!state.has(i.id)) { const c = visit(i.id); if (c) return c; }
  return null;
}

/** The plan view's note: an error only when the plan says it is for another spec. Native plans need no `Source spec:` line. */
export function planNote(planText, specPath) {
  const named = sourceSpecOf(planText);
  const errors = named && !sameSpec(named, specPath) ? [`This plan says it is for ${named}, not ${specPath}.`] : [];
  return { errors, warnings: [] };
}

/** tasks.json (version 1, legacy): the plan's `Source spec:` line against the spec's path: { errors, warnings }. */
export function checkSourceSpec(planText, specPath) {
  const errors = [];
  const warnings = [];
  const first = planText.split("\n").find((l) => l.trim() !== "");
  const m = first && /^Source spec:\s*(.*?)\s*$/.exec(first);
  if (!m) warnings.push("plan.md has no Source spec: line");
  else if (m[1].replace(/^`|`$/g, "") !== specPath) {
    errors.push(`plan.md: Source spec is ${JSON.stringify(m[1])}, expected ${JSON.stringify(specPath)}`);
  }
  return { errors, warnings };
}

/**
 * Every rule at once. ctx: { specId, specPath, planText, isRepo(relPath) -> boolean }.
 * Returns { errors, warnings }.
 */
export function validateTasks(tasks, { specId, specPath, planText, isRepo }) {
  const errors = [];
  const warnings = [];
  if (!isObj(tasks)) return { errors: ["tasks.json must be a JSON object"], warnings };
  if (tasks.tasks !== 1) errors.push(`tasks: expected 1, got ${JSON.stringify(tasks.tasks)}`);
  if (tasks.spec !== specId) errors.push(`spec: expected ${JSON.stringify(specId)}, got ${JSON.stringify(tasks.spec)}`);

  if (planText !== undefined) {
    const c = checkSourceSpec(planText, specPath);
    errors.push(...c.errors);
    warnings.push(...c.warnings);
  }

  if (!Array.isArray(tasks.items) || tasks.items.length === 0) {
    errors.push("items: must be a non-empty array");
    return { errors, warnings };
  }

  const items = tasks.items;
  const ids = new Set();
  const valid = []; // items with a usable id, for graph checks
  items.forEach((it, n) => {
    if (!isObj(it)) { errors.push(`items[${n}]: must be an object`); return; }
    if (typeof it.id !== "string" || !ID_RE.test(it.id)) {
      errors.push(`items[${n}]: invalid id ${JSON.stringify(it.id)} (lowercase letters, digits and dashes, starting with a letter)`);
      return;
    }
    if (ids.has(it.id)) { errors.push(`items[${n}]: duplicate id ${JSON.stringify(it.id)}`); return; }
    ids.add(it.id);
    valid.push(it);
  });

  const cycle = findCycle(valid.map((i) => ({ id: i.id, deps: Array.isArray(i.deps) ? i.deps : [] })));
  if (cycle) errors.push(`dependency cycle: ${cycle.join(" → ")}`);

  const headingTexts = planText === undefined ? null : new Set(headings(planText).map((h) => h.text));
  for (const it of valid) {
    const deps = Array.isArray(it.deps) ? it.deps : [];
    if (it.deps !== undefined && !Array.isArray(it.deps)) errors.push(`${it.id}: deps must be an array`);
    if (it.kind !== "task" && it.kind !== "checkpoint") errors.push(`${it.id}: kind must be "task" or "checkpoint"`);
    if (!str(it.title)) errors.push(`${it.id}: title is required`);
    for (const d of deps) if (!ids.has(d)) errors.push(`${it.id}: dep ${JSON.stringify(d)} is not an item`);
    if (!str(it.repo) || it.repo.startsWith("/") || /^[A-Za-z]:[\\/]/.test(it.repo)) {
      errors.push(`${it.id}: repo ${JSON.stringify(it.repo)} must be a path relative to the spec folder`);
    } else if (isRepo && !isRepo(it.repo)) {
      errors.push(`${it.id}: repo ${JSON.stringify(it.repo)} is not a git repository`);
    }
    if (it.kind === "task") {
      if (!str(it.section)) errors.push(`${it.id}: a task needs a section`);
      else if (headingTexts && !headingTexts.has(it.section.trim())) {
        errors.push(`${it.id}: section ${JSON.stringify(it.section)} is not a heading in plan.md`);
      }
    } else if (it.kind === "checkpoint") {
      if (!Array.isArray(it.checks) || it.checks.filter(str).length === 0) errors.push(`${it.id}: a checkpoint needs at least one check`);
      if (deps.length === 0) errors.push(`${it.id}: a checkpoint needs at least one dep`);
    }
  }

  return { errors, warnings };
}

/** Dependencies first; otherwise the file's order. Throws on a cycle. */
export function orderItems(items) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const out = [];
  const done = new Set();
  const visiting = new Set();
  const visit = (i) => {
    if (done.has(i.id)) return;
    if (visiting.has(i.id)) throw new Error(`dependency cycle through ${i.id}`);
    visiting.add(i.id);
    for (const d of i.deps ?? []) if (byId.has(d)) visit(byId.get(d));
    visiting.delete(i.id);
    done.add(i.id);
    out.push(i);
  };
  items.forEach(visit);
  return out;
}

/** The prompt file text for one item. */
export function buildPrompt(item, { adapter, specPath, planPath, planText, docs }) {
  const block = item.source && docs?.[item.source.file] != null ? sourceBlock(docs[item.source.file], item.source) : null;
  const notes = item.notes ? `\n\nNotes: ${item.notes}` : "";
  if (item.kind === "checkpoint") {
    const head = checkpointInstructions({ specPath, planPath, title: item.title, checks: item.checks });
    return block ? `${head}\n\n---\n\n${block}\n${notes}` : head;
  }
  if (item.source) {
    const head = fillPrompt(adapter, "build", { specPath, planPath, section: item.title, source: item.source });
    return `${head}\n\n---\n\n${block ?? ""}\n${notes}`;
  }
  const head = fillPrompt(adapter, "build", { specPath, planPath, section: item.section });
  const body = extractSection(planText, item.section);
  return body === null ? head : `${head}\n\n---\n\n${body}\n`;
}

/** `herdr-task add` argv. `after` holds refs that `add` returned, never ids from tasks.json. */
export function addArgv(item, { id, folder, agent, model, effort, promptFile, after = [], finishNotes }) {
  const argv = ["herdr-task", "add", `${id} · ${item.title}`, "--json", "--folder", folder, "--worktree",
    "--agent", agent, "--model", model];
  if (effort) argv.push("--effort", effort);
  argv.push("--prompt-file", promptFile);
  if (after.length) argv.push("--after", after.join(","));
  if (finishNotes) argv.push("--finish-notes", finishNotes);
  return argv;
}

/** `herdr-task start` argv. Only a parent in auto mode passes its mode on, and only `auto`. */
export function startArgv(ref, { folder, parentMode, workerArgv }) {
  const argv = ["herdr-task", "start", ref, "--folder", folder];
  if (parentMode === "auto" && Array.isArray(workerArgv)) {
    argv.push("--argv", JSON.stringify([...workerArgv, "--permission-mode", "auto"]));
  }
  return argv;
}

/**
 * The session's current mode: the latest `permissionMode` in a Claude transcript (.jsonl text), from
 * a user entry or a "permission-mode" entry (Claude Code 2.1.x writes the latter, also on a mode
 * switch with no user message).
 */
export function readPermissionMode(text) {
  let mode;
  for (const line of String(text).split("\n")) {
    if (!line.trim()) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if ((e?.type === "user" || e?.type === "permission-mode") && typeof e.permissionMode === "string") mode = e.permissionMode;
  }
  return mode;
}

/** As readPermissionMode, from a file; undefined when it can't be read. */
export async function readPermissionModeFile(path, readFile) {
  try { return readPermissionMode(await readFile(path, "utf8")); } catch { return undefined; }
}

/**
 * What a re-run must do after a partial dispatch. `created` maps item id -> ref, `started` lists
 * item ids already started. toAdd: items with no ref. toStart: those plus created-but-unstarted.
 */
export function planRetry(items, created, started = []) {
  const ordered = orderItems(items);
  const startedSet = new Set(started);
  const toAdd = ordered.filter((i) => !created[i.id]);
  const toStart = ordered.filter((i) => !created[i.id] || !startedSet.has(i.id));
  return { toAdd, toStart };
}
