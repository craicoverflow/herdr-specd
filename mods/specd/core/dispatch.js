// S7: dispatch a plan's tasks to Shepherdr. Pure: no herdr, gpui or fs imports. The effects
// (running herdr-task, writing prompt files, saving state) are passed in by io/herdr-task.js.
import { orderItems, buildPrompt, addArgv, startArgv, planRetry } from "./tasks.js";
import { resolveModels } from "./adapters.js";
import { validateTasks } from "./tasks.js";

/** `repo` (relative to the spec folder, "." for the folder itself) as a normalised absolute path. */
export function resolveRepo(folder, repo) {
  const out = folder.split("/").filter(Boolean);
  for (const part of repo.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return "/" + out.join("/");
}

const absolute = (folder, path) => (path.startsWith("/") ? path : resolveRepo(folder, path));

/**
 * One row per item in dependency order: what to create and the prompt it gets.
 * `folder` is the spec folder (the one holding .specd).
 */
export function dispatchRows({ tasks, state, adapter, config, folder, planText }) {
  const build = adapter.phases.build;
  const { model, effort } = resolveModels(adapter, config, state).build;
  const specPath = absolute(folder, state.paths.spec);
  const planPath = absolute(folder, state.paths.plan);
  return orderItems(tasks.items).map((item) => ({
    item,
    specId: state.id,
    deps: item.deps ?? [],
    folder: resolveRepo(folder, item.repo),
    agent: build.agent ?? "claude",
    model,
    effort,
    promptFile: `${folder.replace(/\/$/, "")}/.specd/specs/${state.id}/prompts/${item.id}.md`,
    promptText: buildPrompt(item, { adapter, specPath, planPath, planText }),
  }));
}

const finishNotesOf = (adapter, review) => (review ? adapter.phases.build.review?.finishNotes : undefined);

function addFor(row, { created, review, adapter }) {
  return addArgv(row.item, {
    id: row.specId, folder: row.folder, agent: row.agent, model: row.model, effort: row.effort,
    promptFile: row.promptFile, finishNotes: finishNotesOf(adapter, review),
    after: row.deps.map((d) => created[d] ?? `<${d}>`),
  });
}

/** `[{ add, start }]` per row, the exact argv. Deps without a ref yet show as `<id>`. */
export function previewArgvs(rows, created, { review, adapter, parentMode }) {
  return rows.map((row) => ({
    add: addFor(row, { created, review, adapter }),
    start: startArgv(created[row.item.id] ?? `<${row.item.id}>`, {
      folder: row.folder, parentMode, workerArgv: workerArgvFor(row.agent, row.model, row.effort),
    }),
  }));
}

/** The worker's argv as Shepherdr would build it, for `start --argv`. Only claude takes a permission mode. */
export function workerArgvFor(agent, model, effort) {
  if (agent !== "claude") return null;
  return ["claude", "--model", model, ...(effort ? ["--effort", effort] : [])];
}

/** `herdr-task add --json` output -> { ref, mode }. Throws a message fit to show. */
export function parseAddResult(stdout) {
  let o;
  try { o = JSON.parse(stdout); } catch { throw new Error(`herdr-task add printed something that isn't JSON: ${String(stdout).trim().slice(0, 200)}`); }
  if (!o || typeof o.ref !== "string" || !o.ref) throw new Error("herdr-task add returned no ref");
  return { ref: o.ref, mode: o.mode };
}

/**
 * Create and start what isn't yet. `dispatch` is the saved { created, started, modes }; effects:
 * add(argv) -> { ref, mode }, start(argv), writePrompt(file, text), save(dispatch). Adds all
 * come first, so nothing starts after a failed add. Never throws: { created, started, modes, error }.
 */
export async function runDispatch({ rows, dispatch, review, adapter, parentMode, add, start, writePrompt, save }) {
  const created = { ...(dispatch.created ?? {}) };
  const started = [...(dispatch.started ?? [])];
  const modes = { ...(dispatch.modes ?? {}) };
  const result = (error) => ({ created, started, modes, error });
  const remember = () => save({ ...dispatch, review, created: { ...created }, started: [...started], modes: { ...modes } });
  const byId = new Map(rows.map((r) => [r.item.id, r]));
  const plan = planRetry(rows.map((r) => r.item), created, started);
  try {
    for (const { id } of plan.toAdd) {
      const row = byId.get(id);
      const missing = row.deps.find((d) => !created[d]);
      if (missing) throw new Error(`${id} depends on ${missing}, which has no task yet`);
      await writePrompt(row.promptFile, row.promptText);
      const r = await add(addFor(row, { created, review, adapter }));
      created[id] = r.ref;
      modes[id] = r.mode;
      await remember();
    }
    for (const { id } of plan.toStart) {
      const row = byId.get(id);
      await start(startArgv(created[id], { folder: row.folder, parentMode, workerArgv: workerArgvFor(row.agent, row.model, row.effort) }));
      started.push(id);
      await remember();
    }
  } catch (e) {
    return result(String(e?.message ?? e));
  }
  return result(null);
}

/** Counts, and the items Shepherdr put in the folder itself instead of a worktree. */
export function dispatchSummary(rows, dispatch) {
  const created = dispatch.created ?? {};
  const here = rows
    .filter((r) => dispatch.modes?.[r.item.id] === "here")
    .map((r) => ({ id: r.item.id, ref: created[r.item.id], title: r.item.title, note: `${created[r.item.id]} runs in ${r.folder} itself, not in a worktree (worktrees are off for that repo).` }));
  return { total: rows.length, created: Object.keys(created).length, started: (dispatch.started ?? []).length, here };
}

/** Claude Code's transcript for a session: ~/.claude/projects/<folder with every non-alphanumeric as "-">/<session>.jsonl. */
export function claudeSessionFile(home, folder, session) {
  return `${home}/.claude/projects/${folder.replace(/[^A-Za-z0-9]/g, "-")}/${session}.jsonl`;
}

/** tasks.json text (null when missing) -> { tasks, errors, warnings }; tasks is null unless valid. */
export function checkTasksText(text, ctx) {
  if (text == null) return { tasks: null, errors: ["tasks.json isn't there yet"], warnings: [] };
  let tasks;
  try { tasks = JSON.parse(text); } catch (e) { return { tasks: null, errors: [`tasks.json is not valid JSON: ${e.message}`], warnings: [] }; }
  const { errors, warnings } = validateTasks(tasks, ctx);
  return { tasks: errors.length ? null : tasks, errors, warnings };
}

/** The message that sends a failed validation back to the plan agent. */
export function errorsMessage(tasksPath, errors) {
  const list = errors.map((e, i) => `${i + 1}. ${e}`).join("\n");
  return `${tasksPath} has ${errors.length} error${errors.length === 1 ? "" : "s"}:\n\n${list}\n\nPlease fix them in place (and plan.md if they point there), then say what changed.`;
}
