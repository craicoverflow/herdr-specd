// Which running coordinators still need the coordinator instructions. Pure: terminals in, list out.
// A coordinator is told once: the io layer labels its terminal `specd.instructed` after sending, so a
// restarted coordinator (a new terminal, no label) is told again and an edit never resends.

export const INSTRUCTED = "specd.instructed";

/** The folder a terminal works in. */
export const terminalFolder = (k) => k.foreground?.cwd ?? k.cwd ?? null;

/**
 * The live coordinator terminals (`herdr.role=coordinator`) not yet labelled, each with the text
 * `resolve(folder)` gives for its folder. Empty text means nothing to send, so not pending.
 * -> [{ address, folder, text }]
 */
export function pending(terminals, resolve) {
  const out = [];
  for (const k of terminals) {
    if (k?.state !== "live" || k.labels?.["herdr.role"] !== "coordinator" || k.labels?.[INSTRUCTED]) continue;
    const folder = terminalFolder(k);
    const text = resolve(folder) ?? "";
    if (text.trim() !== "") out.push({ address: k.address, folder, text });
  }
  return out;
}
