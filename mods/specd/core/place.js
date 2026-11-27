// Where specd opens, and the hand-off from a tab copy to the panel copy (pure).
// In the `specd` layout specd lives in the right panel; elsewhere a palette command opens a tab.
// A hidden panel child doesn't run, so a tab copy writes a request to the shared store and the
// panel copy takes it when it starts or on its poll.

export const REQUEST_TTL_MS = 10000;

/** "panel" in the `specd` layout, otherwise "tab". */
export const placeFor = (layoutName) => (layoutName === "specd" ? "panel" : "tab");

/** True for a copy a palette command opened as a tab: the three entries pass `tab`, `new` or `adopt`. The panel copy has no props. */
export const isTabCopy = (props) => !!(props?.tab || props?.new || props?.adopt);

/** Which palette command opened this copy, from its props. */
export const commandOf = (props) => (props?.new ? "new" : props?.adopt ? "adopt" : "open");

export const requestFor = (cmd, props, at) => ({ cmd, props: props ?? {}, at });

/** The request to act on, or null: none, malformed, already taken (at <= lastAt) or older than 10 s. */
export function takeRequest(shared, lastAt, now) {
  const r = shared;
  if (!r || typeof r !== "object" || typeof r.at !== "number" || !["open", "new", "adopt"].includes(r.cmd)) return null;
  if (r.at <= (lastAt ?? 0) || now - r.at > REQUEST_TTL_MS) return null;
  return r;
}

/** The tab this copy is shown in when it is a tab copy (that tab holds a specd pane), else null (the panel copy). */
export function tabHost(panes, tab, mod = "specd") {
  return tab && panes.some((p) => p.tab === tab && p.mod === mod) ? tab : null;
}

/** The folder the panel shows: the `folder` prop, else the focused terminal's cwd, else its space's folder, else null. */
export const folderFor = ({ prop, focused, spaces } = {}) =>
  prop ?? focused?.cwd ?? (spaces ?? []).find((s) => s.id === focused?.space)?.folder ?? null;
