// S9: the build status. Pure: no herdr, gpui or fs imports. io/herdr-task.js lists the tasks.
import { resolveRepo } from "./dispatch.js";

export const POLL_MS = 10000; // acceptance: states change within 15 s

/** Poll only while the window is presented, the spec is in build and the last poll has finished. */
export const shouldPoll = ({ visible, phase, busy }) => visible === true && phase === "build" && !busy;

/** The distinct repo folders of the items. */
export const repoFolders = (items, folder) => [...new Set(items.map((i) => resolveRepo(folder, i.repo)))];

const STATES = { queued: "queued", running: "working", ready: "ready", done: "done" };
/** Shepherdr's state word for a listed task, as the pane shows it. */
export const taskState = (t) => STATES[t.state] ?? String(t.state ?? "unknown");

/** The PR link of a listed task, when Shepherdr gives one. */
export function prLink(t) {
  const v = t.pr_url ?? t.pr?.url ?? t.pr;
  return typeof v === "string" && v ? v : null;
}

/**
 * items: the dispatch list (manifest or tasks.json items). created: item id -> task ref. lists:
 * repo folder -> listed tasks (null when listing failed). An item the plan had already marked done
 * was never dispatched and counts as done. Returns { groups: [{ repo, done, total, items }], done, total }.
 */
export function buildGroups({ items, created = {}, lists = {}, folder }) {
  const groups = new Map();
  for (const item of items) {
    const dir = resolveRepo(folder, item.repo);
    const ref = created[item.id] ?? null;
    const listed = ref ? lists[dir]?.find((t) => t.ref === ref) : null;
    const row = {
      id: item.id, title: item.title, ref,
      state: item.done && !ref ? "done" : !ref ? "not created" : listed ? taskState(listed) : "unknown",
      pr: listed ? prLink(listed) : null,
    };
    if (!groups.has(item.repo)) groups.set(item.repo, { repo: item.repo, done: 0, total: 0, items: [] });
    const g = groups.get(item.repo);
    g.items.push(row);
    g.total++;
    if (row.state === "done") g.done++;
  }
  const all = [...groups.values()];
  return { groups: all, done: all.reduce((n, g) => n + g.done, 0), total: all.reduce((n, g) => n + g.total, 0) };
}
