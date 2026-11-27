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
const state = { tabs: [], panes: [] };
export function run(command, args = {}) {
  journal.push({ type: "run", command, args });
  if (command === "tab.new") {
    n += 1;
    state.tabs.push({ id: `tab-${n}`, name: args.name });
    state.panes.push({ terminal: `term-${n}`, tab: `tab-${n}` });
  }
}
export const spaces = () => [{ id: "space-1", tabs: state.tabs }];
export const panes = () => state.panes;
export async function hc(args) { journal.push({ type: "hc", args }); return { code: 0, stdout: "", stderr: "" }; }
export const settings = () => ({});
export const theme = () => ({});
export const props = () => ({});
export const focused = () => null;
export const window = () => ({ visible: true });
export const notify = (...a) => journal.push({ type: "notify", args: a });
export const nextCommand = () => null;
export const watchFolder = () => () => {};
export const openOverlay = () => {};
export const closeOverlay = () => {};
export const checking = () => false;
export async function pickFiles() { throw new Error("test/support/herdr.mjs: pickFiles needs a person"); }
export async function pickFolder() { throw new Error("test/support/herdr.mjs: pickFolder needs a person"); }
