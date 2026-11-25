// Phase agents: start one in a tab, find its terminal, check an owner still exists, send to it.
// Effects live here; the logic is in core/. Call from handlers and tasks, never from render().
import { randomUUID } from "crypto";
import { run, panes, spaces, hc, readTextFile, appHome } from "herdr";
import { loadAdapter, resolveModels, agentArgv } from "../core/adapters.js";
import { findNewTerminal } from "../core/submit.js";

const tabs = () => spaces().flatMap((s) => s.tabs);

async function readJson(path) {
  try {
    const text = await readTextFile(path);
    return text == null ? null : JSON.parse(text);
  } catch {
    return null;
  }
}

/** The state's adapter, and the model and effort for a phase (spec > folder config > adapter). */
export async function adapterFor(folder, state) {
  const text = await readTextFile(`${appHome()}/mods/specr/adapters/${state.adapter}.json`);
  if (text == null) throw new Error(`No adapter "${state.adapter}" is installed.`);
  const adapter = loadAdapter(text);
  const config = await readJson(`${folder}/.specr/config.json`);
  return { adapter, models: resolveModels(adapter, config, state) };
}

/** The adapter new specs use (S11 scans with its patterns before any spec record exists). */
export async function defaultAdapter() {
  const text = await readTextFile(`${appHome()}/mods/specr/adapters/agent-skills.json`);
  if (text == null) throw new Error("No adapter \"agent-skills\" is installed.");
  return loadAdapter(text);
}

/** Does this owner's terminal still exist? */
export function ownerAlive(owner) {
  return Boolean(owner?.terminal) && panes().some((p) => p.terminal === owner.terminal);
}

/**
 * Open a tab named `name` running the phase's agent with `message` as its first message. Resolves
 * to { terminal, tab, session, at } (what the owner record needs) once the terminal shows up.
 */
export async function startAgent(cx, { folder, adapter, model, name, message }) {
  const session = randomUUID();
  const before = new Set(panes().map((p) => p.terminal).filter(Boolean));
  run("tab.new", { name, folder, argv: agentArgv(adapter, { ...model, session }), task: message, focus: false });
  for (let i = 0; i < 50; i++) {
    await cx.sleep(200);
    const found = findNewTerminal({ tabs: tabs(), panes: panes(), name, before });
    if (found) return { ...found, session, at: Date.now() };
  }
  throw new Error(`Opened the ${name} tab, but couldn't find its terminal.`);
}

/** Send one message to a terminal: pasted whole, then enter. */
export async function sendMessage(terminal, text) {
  const r = await hc(["send", terminal, text]);
  if (r.code !== 0) throw new Error(`Couldn't send to ${terminal}: ${(r.stderr || r.stdout).trim() || `hc exited ${r.code}`}`);
}
