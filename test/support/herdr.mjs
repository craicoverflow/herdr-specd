// The `herdr` module for headless tests. Files are real (in a temp folder). exec() puts this folder
// first on PATH, so `herdr-task` is always the fake one beside this file, and it refuses to run a
// real herdr-task or claude. Tabs, agents, hc and notifications are only recorded in `journal`.
// Set SPECD_TEST_HOME (home() and appHome() live under it) and SPECD_TEST_TASKDB (the fake's tasks).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const BIN = path.dirname(fileURLToPath(import.meta.url));
const need = (k) => { const v = process.env[k]; if (!v) throw new Error(`test/support/herdr.mjs: ${k} is not set`); return v; };
export const journal = [];

export async function readTextFile(p) { try { return fs.readFileSync(p, "utf8"); } catch { return null; } }
export async function writeTextFile(p, text, expected) {
  let current = null;
  try { current = fs.readFileSync(p, "utf8"); } catch { /* missing */ }
  if (expected !== undefined && (expected ?? null) !== current) throw new Error(`${p} changed on disk`);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
}
export const home = () => `${need("SPECD_TEST_HOME")}/home`;
export const appHome = () => `${need("SPECD_TEST_HOME")}/app`;

export async function exec(cmd, args = [], opts = {}) {
  const line = [cmd, ...args].join(" ");
  if (/\bclaude\b.* -p /.test(line)) throw new Error("test/support/herdr.mjs: tests never call the model; pass a fake llm");
  if (/\/herdr-task\b/.test(line) && !line.includes(`${BIN}/herdr-task`)) throw new Error(`test/support/herdr.mjs: refusing a real herdr-task in ${line}`);
  const target = path.basename(cmd) === "herdr-task" ? `${BIN}/herdr-task` : cmd;
  const env = { ...process.env, PATH: `${BIN}:${process.env.PATH}`, SPECD_TEST_TASKDB: need("SPECD_TEST_TASKDB") };
  const r = spawnSync(target, args, { env, encoding: "utf8", cwd: opts.cwd, timeout: opts.timeout ?? 60000 });
  journal.push({ type: "exec", argv: [cmd, ...args], code: r.status });
  return { code: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? (r.error ? String(r.error) : "") };
}

let n = 0;
const state = { tabs: [], panes: [], focused: null, shared: {} };
export function run(command, args = {}) {
  journal.push({ type: "run", command, args });
  if (command === "tab.new") {
    n += 1;
    state.tabs.push({ id: `tab-${n}`, name: args.name });
    state.panes.push({ terminal: `term-${n}`, tab: `tab-${n}`, pane: `pane-${n}`, mod: args.mod });
    if (args.focus) state.focused = { tab: `tab-${n}`, space: "space-1" };
  }
  if (command === "tab.close") {
    state.tabs = state.tabs.filter((t) => t.id !== args.id);
    state.panes = state.panes.filter((p) => p.tab !== args.id);
    if (state.focused?.tab === args.id) state.focused = null;
  }
}
// Test seams: the shared store (`shared`/`setShared`, set to {} to reset) and the layout's name.
export const shared = (k) => (k === "layout" ? state.layout ?? null : state.shared[k] ?? null);
export function setShared(k, v) { journal.push({ type: "setShared", key: k, value: v }); state.shared[k] = v; }
export const setLayoutName = (name) => { state.layout = name; };
export const resetShared = () => { state.shared = {}; };
export const spaces = () => state.spaces ?? [{ id: "space-1", tabs: state.tabs }];
export const setSpaces = (v) => { state.spaces = v; };
export const setFocused = (v) => { state.focused = v; };
export const panes = () => state.panes;
export async function hc(args) { journal.push({ type: "hc", args }); return { code: 0, stdout: "", stderr: "" }; }
export const settings = () => ({});
export const theme = () => ({});
let currentProps = {};
export const props = () => currentProps;
export const setProps = (p) => { currentProps = p ?? {}; };
export const focused = () => state.focused;
export const window = () => ({ visible: true });
export const notify = (...a) => journal.push({ type: "notify", args: a });
export const nextCommand = () => new Promise(() => {}); // no dev commands: the loop parks here
// Refused like a watch over the limit, so a watch loop ends at once; the call is recorded.
export async function watchFolder(dir) { journal.push({ type: "watch", dir }); throw new Error("test/support/herdr.mjs: no folder watching"); }
export const openOverlay = () => {};
export const closeOverlay = () => {};
export const checking = () => false;
export async function pickFiles() { throw new Error("test/support/herdr.mjs: pickFiles needs a person"); }
export async function pickFolder() { throw new Error("test/support/herdr.mjs: pickFolder needs a person"); }
