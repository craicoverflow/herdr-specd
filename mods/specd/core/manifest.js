// The dispatch list: one model decomposition of the spec's documents, whatever their format, kept in
// .specd/specs/<ID>/manifest.json with the hashes of the files it came from (docs/uat/2026-11-27-format-rigidity.md).
// Pure: no herdr, gpui or fs imports. The call itself is passed in by io/manifest.js.
import { findCycle } from "./tasks.js";

export const MANIFEST_VERSION = 1;
const ID_RE = /^[a-z][a-z0-9-]*$/;

export const DECOMPOSE_SCHEMA = {
  type: "object",
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "title", "kind", "repo", "deps", "done", "source"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          kind: { type: "string", enum: ["task", "checkpoint"] },
          repo: { type: "string" },
          deps: { type: "array", items: { type: "string" } },
          done: { type: "boolean" },
          checks: { type: "array", items: { type: "string" } },
          notes: { type: "string" },
          source: {
            type: "object",
            required: ["file", "startLine", "endLine"],
            properties: { file: { type: "string" }, startLine: { type: "integer" }, endLine: { type: "integer" } },
          },
        },
      },
    },
  },
};

const numbered = (text) => text.split("\n").map((l, i) => `${String(i + 1).padStart(4)}| ${l}`).join("\n");

/** FNV-1a, hex: enough to notice that a file changed. */
export function hashText(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

/** How a state's list is made: "single" (no plan: the whole spec is one task), "spec" (the spec is the plan) or "plan". */
export const viaFor = (state) => (!state.paths.plan ? "single" : state.paths.plan === state.paths.spec ? "spec" : "plan");

/**
 * The decompose prompt. docs: [{ file, text, role }] (role: spec, plan, task list, or spec+plan);
 * repos: folder-relative git repo paths; previous: the earlier items, to keep ids stable on a re-derive;
 * note: what the person asked for when they asked again (kept for later re-derives).
 */
export function decomposePrompt({ docs, repos, previous, note }) {
  const parts = [
    "You turn the documents of one piece of planned software work into the dispatch list for a team of coding agents. Each item you return becomes one agent working in one git repository, in its own worktree and branch, started once its dependencies are finished. The documents may be in any format: a spec, a plan, a task list, a ticket, an RFC, spec-kit files. Judge from what they say, not from their layout.",
    "",
    "Rules:",
    "- Cover all the planned work, and nothing else. Do not invent tasks, and do not make tasks of open questions, risks or verification notes.",
    "- Granularity: one item per coherent unit one agent can build and commit in one sitting. Where the documents already split the work into substantial tasks or steps, keep one item per task, with its own title. Where they list many tiny steps (one-line tasks, T001-style ids, several touching the same file), group them into one item per phase, user story or heading, so that agents do not collide. A small ticket with no plan is a single item.",
    "- When one task appears twice (a plan section and again in a checklist or task list), make one item, and point its source at the place with the fuller description.",
    "- A checkpoint item (kind \"checkpoint\") is only for a gate the documents give its own section, heading or checklist entry: it runs checks and changes nothing. Give it deps (the items it gates) and checks (what to verify). A one-line note inside a phase is not a checkpoint; leave it out. Everything else is kind \"task\".",
    "- deps are ids of items that must finish first. Take them from what the documents say (Dependencies, needs, after, blocked by, phase and story order, contract-first ordering across repos), and from explicit advice to run tasks one after another (for example because they edit the same file). List direct dependencies only. Never add a dependency the documents do not support, and no cycles.",
    "- done: true for work the documents mark finished (checked boxes, struck-out, done, completed). Done items stay in the list, so that others can depend on them.",
    "- repo: exactly one of the repository paths below, chosen from an explicit tag or Repo: line, else from the file paths the item touches, else the only repository. Never invent a path.",
    "- source: the file and the 1-based line range (as numbered below) that holds the item's full description: its heading, details, acceptance criteria and notes, nothing of the next item. The worker is shown exactly these lines, so include everything it needs. For a grouped item use the range that spans its group.",
    "- id: short, lowercase letters, digits and dashes, unique. Use t<N> when the documents number their tasks (task 3 is t3), otherwise a short slug such as foundation or us1. Use c1, c2 and so on for checkpoints. title: the document's own task title, without a Task N prefix. notes: constraints the worker must know that are not in its source lines (such as advice from another section), or an empty string.",
    "",
    `Git repositories in the folder: ${repos.map((r) => JSON.stringify(r)).join(", ")}`,
  ];
  if (previous?.length) {
    parts.push("", "An earlier version of this list exists. Keep the id and title of any item whose work is unchanged; add, remove or change only what the documents now say differently:", JSON.stringify(previous.map(({ id, title, kind, deps, done }) => ({ id, title, kind, deps, done }))));
  }
  if (note?.trim()) parts.push("", "The person reviewing the list asks for this. Follow it where the documents allow:", note.trim());
  for (const d of docs) parts.push("", `=== ${d.file} (${d.role}) ===`, numbered(d.text));
  parts.push("", "Return the items as JSON in the given schema.");
  return parts.join("\n");
}

/** Errors in a decomposition, all at once. docs: [{ file, text }]; repos: allowed repo paths. */
export function checkItems(items, { docs, repos }) {
  const errors = [];
  if (!Array.isArray(items) || items.length === 0) return ["items: must be a non-empty array"];
  const ids = new Set(items.map((i) => i?.id));
  const lines = new Map(docs.map((d) => [d.file, d.text.split("\n").length]));
  const seen = new Set();
  items.forEach((it, n) => {
    const at = `${JSON.stringify(it?.id)}${typeof it?.title === "string" && it.title ? ` (${it.title})` : ` (items[${n}])`}`;
    if (typeof it?.id !== "string" || !ID_RE.test(it.id)) errors.push(`${at}: id must be lowercase letters, digits and dashes, starting with a letter`);
    else if (seen.has(it.id)) errors.push(`${at}: duplicate id`);
    seen.add(it?.id);
    if (it?.kind !== "task" && it?.kind !== "checkpoint") errors.push(`${at}: kind must be "task" or "checkpoint"`);
    if (typeof it?.title !== "string" || !it.title.trim()) errors.push(`${at}: title is required`);
    if (!repos.includes(it?.repo)) errors.push(`${at}: repo ${JSON.stringify(it?.repo)} is not one of ${repos.map((r) => JSON.stringify(r)).join(", ")}`);
    for (const d of it?.deps ?? []) if (!ids.has(d)) errors.push(`${at}: dep ${JSON.stringify(d)} is not an item`); else if (d === it.id) errors.push(`${at}: depends on itself`);
    const s = it?.source;
    if (!lines.has(s?.file)) errors.push(`${at}: source.file ${JSON.stringify(s?.file)} is not one of the documents`);
    else if (!(s.startLine >= 1 && s.endLine >= s.startLine && s.endLine <= lines.get(s.file))) errors.push(`${at}: source lines ${s.startLine}-${s.endLine} are outside ${s.file} (${lines.get(s.file)} lines)`);
  });
  if (!errors.length) {
    const cycle = findCycle(items.map((i) => ({ id: i.id, deps: i.deps ?? [] })));
    if (cycle) errors.push(`dependency cycle: ${cycle.join(" → ")}`);
  }
  return errors;
}

/** The message that sends a failed decomposition back to the model. */
export function retryPrompt(prompt, answer, errors) {
  return `${prompt}\n\nYour previous answer:\n${JSON.stringify(answer)}\n\nIt has ${errors.length} error${errors.length === 1 ? "" : "s"}:\n- ${errors.join("\n- ")}\n\nReturn the complete corrected list.`;
}

/** Fill defaults the model may leave out: checks on a checkpoint, notes, deps. */
export function normalizeItems(items) {
  return items.map((it) => ({
    ...it,
    deps: [...new Set(it.deps ?? [])],
    notes: it.notes ?? "",
    ...(it.kind === "checkpoint" ? { checks: it.checks?.length ? it.checks : [`Everything "${it.title}" describes passes`] } : {}),
  }));
}

/** One item for the whole spec (a small ticket with no plan). */
export function singleItem({ title, file, text, repo }) {
  const clean = title.replace(/^#+\s*/, "").replace(/^[A-Z][A-Z0-9]+-\d+\s*[:\-–]?\s*/, "").trim() || title;
  return [{ id: "one", title: clean, kind: "task", repo, deps: [], done: false, notes: "", source: { file, startLine: 1, endLine: text.split("\n").length } }];
}

/** The repo a one-task dispatch runs in: the folder when it is a repo, else the only one. Throws a message naming the task. */
export function singleRepo(repos, title) {
  if (repos.includes(".")) return ".";
  if (repos.length === 1) return repos[0];
  if (!repos.length) throw new Error(`No git repository found in this folder, so "${title}" has nowhere to run.`);
  throw new Error(`Can't tell which repository "${title}" runs in: this folder isn't a git repository and holds ${repos.join(", ")}. Approve the spec so it gets a plan, or use the spec as the plan.`);
}

/** What gets dispatched: not the done items, and no waiting for them. */
export function activeItems(items) {
  const done = new Set(items.filter((i) => i.done).map((i) => i.id));
  return items.filter((i) => !i.done).map((i) => ({ ...i, deps: (i.deps ?? []).filter((d) => !done.has(d)) }));
}

export function makeManifest({ spec, via, items, docs, note }) {
  return { manifest: MANIFEST_VERSION, spec, via, ...(note?.trim() ? { note: note.trim() } : {}), items, hashes: Object.fromEntries(docs.map((d) => [d.file, hashText(d.text)])) };
}

/** Do two lists dispatch the same work? Ids, titles, kinds, repos, deps and done marks; not source lines. */
export function sameList(a, b) {
  const key = (xs) => JSON.stringify(xs.map((i) => [i.id, i.title, i.kind, i.repo, [...(i.deps ?? [])].sort(), Boolean(i.done)]));
  return key(a) === key(b);
}

/** Files whose text no longer matches the manifest's hashes. */
export function changedFiles(manifest, docs) {
  const now = Object.fromEntries(docs.map((d) => [d.file, hashText(d.text)]));
  const files = new Set([...Object.keys(manifest.hashes ?? {}), ...Object.keys(now)]);
  return [...files].filter((f) => manifest.hashes?.[f] !== now[f]);
}

/** One line for the person: what a re-derive changed. `files`: what changed, or a reason such as "Asked again". */
export function describeChange(files, before, after) {
  const a = activeItems(before), b = activeItems(after);
  const titles = (xs) => new Set(xs.map((x) => x.title));
  const added = b.filter((x) => !titles(a).has(x.title)).map((x) => x.title);
  const removed = a.filter((x) => !titles(b).has(x.title)).map((x) => x.title);
  const bits = [`${a.length} → ${b.length} tasks`];
  if (added.length) bits.push(`new: ${added.join("; ")}`);
  if (removed.length) bits.push(`gone: ${removed.join("; ")}`);
  const why = Array.isArray(files) ? `${files.join(", ")} changed since this list was made` : files;
  return `${why}: ${bits.join(" · ")}`;
}

/** The lines of a source range. */
export function sourceBlock(text, { startLine, endLine }) {
  return text.split("\n").slice(startLine - 1, endLine).join("\n").trimEnd();
}
