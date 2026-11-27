// Specs written outside specd (S11): match file lists against the adapter's patterns. Pure.
// Patterns use {id} as a wildcard for one path segment's worth of characters.
const esc = (s) => s.replace(/[.*+?^$()|[\]\\]/g, "\\$&");

export function matcher(pattern) {
  const parts = pattern.split("{id}").map((p) => esc(p).replace(/[{}]/g, "\\$&"));
  const re = new RegExp(`^${parts.join("([^/]+)")}$`);
  return (path) => { const m = re.exec(path); return m ? { id: m[1] ?? null } : null; };
}

// opts: { recorded: [paths], dismissed: [paths], specPattern: folder override of paths.spec }
export function findSpecs(adapter, files, { recorded = [], dismissed = [], specPattern } = {}) {
  const skip = new Set([...recorded, ...dismissed]);
  const ms = [specPattern ?? adapter.paths.spec, ...(adapter.discover?.specs ?? [])].map(matcher);
  const out = [];
  for (const path of files) {
    if (skip.has(path)) continue;
    let hit = null;
    for (const m of ms) { hit = m(path); if (hit) break; }
    // A file named for a ticket (PROJ-123.md, docs/PROJ-123-export.md) is a spec too; its ID is the key.
    const key = path.split("/").length <= 3 ? JIRA_FILE.exec(path.split("/").pop())?.[1] : null;
    if (hit) out.push({ path, id: hit.id });
    else if (key) out.push({ path, id: key });
  }
  return out;
}

const JIRA_FILE = /^([A-Z][A-Z0-9]{1,9}-\d+)(?:[-_ .][^/]*)?\.md$/;

// Jira-style key from the first heading, else a slug of it, else "".
export function suggestId(markdown) {
  const h = /^#{1,6}[ \t]+(.+?)[ \t]*$/m.exec(markdown)?.[1];
  if (!h) return "";
  const key = /^([A-Z][A-Z0-9]+-\d+)\b/.exec(h);
  if (key) return key[1];
  return h.replace(/^spec\s*:\s*/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// plans: { path: text } for candidate files. Returns the discover.plans path whose
// `Source spec:` line names specPath, or null.
export function pickPlan(adapter, specPath, plans) {
  const ms = (adapter.discover?.plans ?? []).map(matcher);
  for (const [path, text] of Object.entries(plans ?? {})) {
    if (!ms.some((m) => m(path))) continue;
    for (const line of String(text).split("\n")) {
      const m = /^\s*(?:[-*]\s*)?(?:\*\*)?Source spec:?(?:\*\*)?:?\s*`?([^`\s]+)`?\s*$/i.exec(line);
      if (m && m[1] === specPath) return path;
    }
  }
  return null;
}

export function parseDismissed(text) {
  try {
    const v = JSON.parse(text);
    return Array.isArray(v) ? v.filter((p) => typeof p === "string") : [];
  } catch {
    return [];
  }
}

export const withDismissed = (list, path) => (list.includes(path) ? list : [...list, path]);

// Found specs whose path hasn't been announced yet (`seen` is a Set of paths).
export const unseen = (found, seen) => found.filter((f) => !seen.has(f.path));

/** The spec a plan names on a `Source spec:` line near its top (first path; `code`, "(delta on …)" and "· Task list" tails dropped), or null. */
export function sourceSpecOf(text) {
  for (const line of String(text).split("\n").slice(0, 12)) {
    const m = /^\s*(?:[-*]\s*)?(?:\*\*)?Source spec:?(?:\*\*)?:?\s*`?([^`\s·(]+)`?/i.exec(line);
    if (m) return m[1];
  }
  return null;
}

/** Does the path a plan names mean this spec? Equal, or one is the other with a leading folder. */
export const sameSpec = (named, specPath) => named === specPath || specPath.endsWith(`/${named}`) || named.endsWith(`/${specPath}`);

/**
 * The plan the plan agent wrote for specPath when it saved somewhere else than asked: among
 * markdown files { path: text }, the shortest path whose `Source spec:` line names the spec (task
 * lists are not plans), and its task list beside it. { plan, tasks } or null.
 */
export function findPlanFor(specPath, files) {
  const plans = Object.keys(files).filter((p) => p !== specPath && !/(^|\/)(todo|tasks)\.md$/i.test(p) && sameSpec(sourceSpecOf(files[p]) ?? "", specPath));
  if (!plans.length) return null;
  const plan = plans.sort((a, b) => a.length - b.length)[0];
  const dir = plan.includes("/") ? plan.slice(0, plan.lastIndexOf("/") + 1) : "";
  const tasks = ["todo.md", "tasks.md"].map((n) => dir + n).find((p) => files[p] != null) ?? null;
  return { plan, tasks };
}
