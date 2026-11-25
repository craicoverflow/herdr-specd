// S2: turning picked files into a spec's state. Pure: no herdr, gpui or fs imports.
import { adoptSpec } from "./state.js";

/** An ID to prefill from the picked file: PROJ-9.md -> PROJ-9; <ID>/spec.md -> <ID>. "" when nothing fits. */
export function suggestId(path) {
  const parts = String(path).split("/").filter(Boolean);
  const file = (parts.pop() ?? "").replace(/\.[^.]*$/, "");
  const generic = /^(spec|plan|readme)$/i.test(file);
  const raw = generic ? (parts.pop() ?? "") : file;
  return raw.trim().replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").replace(/^[^A-Za-z]+/, "");
}

/** `path` relative to `folder` when it lies inside it, else unchanged. */
export function relativeTo(folder, path) {
  const base = folder.replace(/\/+$/, "") + "/";
  return path.startsWith(base) ? path.slice(base.length) : path;
}

/** The state of an adopted spec. Files stay where they are. Throws a message fit to show. */
export function planAdoption({ folder, id, spec, plan, tasks, existingIds }) {
  if (!spec) throw new Error("Pick the spec file to adopt.");
  if (!/\.(md|markdown)$/i.test(spec)) throw new Error("The spec must be a markdown file (.md).");
  const paths = { spec: relativeTo(folder, spec) };
  if (plan) paths.plan = relativeTo(folder, plan);
  if (tasks) paths.tasks = relativeTo(folder, tasks);
  return adoptSpec({ id: id?.trim(), paths, existingIds });
}
