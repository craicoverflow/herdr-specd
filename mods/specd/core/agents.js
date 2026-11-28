// Instructions for the agents specd starts. Pure: text in, text out.
// The folder's .specd/config.json ({"instructions": {"worker", "coordinator"}}) overrides the user's default.

const ROLES = { worker: "Worker", coordinator: "Coordinator" };

/** The folder override for a role: a string when the key is present (even ""), else undefined. */
export function folderInstructions(config, role) {
  const v = config?.instructions?.[role];
  return typeof v === "string" ? v : undefined;
}

/** The user's default for a role from the stored JSON text, or undefined. */
export function parseUserInstructions(stored, role) {
  try {
    const v = JSON.parse(stored)?.[role];
    return typeof v === "string" ? v : undefined;
  } catch {
    return undefined;
  }
}

/** { user, folder } -> { text, from }. A folder key that is present (even "") wins over the user's default. */
export function resolveInstructions({ user, folder } = {}) {
  const pick = typeof folder === "string" ? { text: folder, from: "folder" } : { text: typeof user === "string" ? user : "", from: "user" };
  return pick.text.trim() === "" ? { text: "", from: "none" } : pick;
}

/** The prompt, byte-for-byte when there are no instructions, else the instructions above a rule. */
export function withInstructions(prompt, text) {
  return text ? `${text}\n\n---\n\n${prompt}` : prompt;
}

/** The line the UI shows about what applies. */
export function appliesNote(role, { text, from }) {
  const label = `${ROLES[role] ?? role} instructions`;
  if (from === "none") return `${label}: none`;
  const n = text.length;
  return `${label}: ${from === "folder" ? "from this folder" : "your default"} (${n} char${n === 1 ? "" : "s"})`;
}
