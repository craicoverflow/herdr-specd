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

/**
 * The folder's config.json text with one role's instructions set (a string, "" included) or, for
 * undefined, removed. Every other key stays. Throws when the existing text isn't a JSON object,
 * so a hand-edited file is never overwritten with something that loses it.
 */
export function withFolderInstructions(configText, role, value) {
  let config = {};
  if (configText != null) {
    try {
      config = JSON.parse(configText);
    } catch {
      config = null;
    }
    if (config === null || typeof config !== "object" || Array.isArray(config)) throw new Error(".specd/config.json is not valid JSON, so it was left alone.");
  }
  const instructions = { ...(config.instructions && typeof config.instructions === "object" ? config.instructions : {}) };
  if (value === undefined) delete instructions[role];
  else instructions[role] = value;
  const { instructions: _old, ...rest } = config;
  const next = Object.keys(instructions).length ? { ...rest, instructions } : rest;
  return `${JSON.stringify(next, null, 2)}\n`;
}

/** The stored user-defaults JSON text with one role set. Bad stored text is replaced. */
export function withUserInstructions(stored, role, value) {
  let all = {};
  try {
    const v = JSON.parse(stored);
    if (v && typeof v === "object" && !Array.isArray(v)) all = v;
  } catch { /* start again */ }
  return JSON.stringify({ ...all, [role]: value });
}
