// One row of the spec list. Pure: the caller reads the files and passes their text.

/** Text of the first ATX heading outside code fences, or null. */
export function docTitle(text) {
  if (typeof text !== "string") return null;
  let fence = null;
  for (const line of text.split("\n")) {
    const f = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      continue;
    }
    if (fence) continue;
    const h = /^ {0,3}#{1,6}[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*\r?$/.exec(line);
    if (h && h[1]) return h[1];
  }
  return null;
}

/** Items to dispatch in a manifest.json or tasks.json text: done ones don't count. */
function taskCount(text) {
  if (typeof text !== "string") return null;
  try {
    const items = JSON.parse(text)?.items;
    return Array.isArray(items) ? items.filter((i) => !i?.done).length : null;
  } catch {
    return null;
  }
}

/** { id, title, phase, status, pending, tasks } for a parsed state and the texts of its files. */
export function summarize(state, { docText, tasksText }) {
  return {
    id: state.id,
    title: docTitle(docText) ?? state.id,
    phase: state.phase,
    status: state.status,
    pending: state.pending.length,
    tasks: taskCount(tasksText),
  };
}

export function sortSummaries(list) {
  return [...list].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}
