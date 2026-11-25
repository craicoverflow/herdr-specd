// Specs written outside specr (S11): match file lists against the adapter's patterns. Pure.
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
    for (const m of ms) { const hit = m(path); if (hit) { out.push({ path, id: hit.id }); break; } }
  }
  return out;
}

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
