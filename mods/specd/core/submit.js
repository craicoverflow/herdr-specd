// Pure: no herdr or gpui imports. The data side of S4 (Submit a review).

// Where a round is kept under .specd/specs/<ID>/rounds/. The spec phase uses rounds/<n>; the
// round counter starts again for the plan, so its rounds get a prefix instead of overwriting.
export const roundDir = (phase, n) => (phase === "spec" ? `${n}` : `${phase}-${n}`);

export const baseName = (path) => path.slice(path.lastIndexOf("/") + 1);

// The first message of a new owner tab: one line naming the file, then the review.
export const firstMessage = (file, review) => `Edit ${file} in place. The review of it follows.\n\n${review}`;

// rounds/<n>/review.json
export function reviewRecord({ id, phase, round, file, comments, at }) {
  return { id, phase, round, file, at, comments };
}

// After `tab.new` (which returns nothing), the new tab's terminal: in the tab with this name,
// a terminal that wasn't there before. null until it shows up.
export function findNewTerminal({ tabs, panes, name, before }) {
  const ids = new Set(tabs.filter((t) => t.name === name).map((t) => t.id));
  const p = panes.find((x) => x.terminal && ids.has(x.tab) && !before.has(x.terminal));
  return p ? { terminal: p.terminal, tab: p.tab } : null;
}
