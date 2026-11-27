// Helpers for the headless tests: a temp home for the stand-ins, spec folders with git repos, the
// fake herdr-task's tasks and a fake model. Import ./register.mjs first.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = new URL("../..", import.meta.url).pathname;

/** A temp home with the agent-skills adapter installed and an empty task DB. Call before importing the mod. */
export function setup() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "specd-test-"));
  process.env.SPECD_TEST_HOME = home;
  process.env.SPECD_TEST_TASKDB = `${home}/tasks.json`;
  fs.mkdirSync(`${home}/app/mods/specd/adapters`, { recursive: true });
  fs.copyFileSync(`${ROOT}mods/specd/adapters/agent-skills.json`, `${home}/app/mods/specd/adapters/agent-skills.json`);
  return home;
}

/** A spec folder: `files` ({ path: text }) and/or a copy of `from` (repo-relative), with a git repo at each of `repos`. */
export function folder(name, { files = {}, from, repos = ["."] } = {}) {
  const dir = path.join(process.env.SPECD_TEST_HOME, name);
  if (from) fs.cpSync(path.join(ROOT, from), dir, { recursive: true });
  for (const [p, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true });
    fs.writeFileSync(path.join(dir, p), text);
  }
  for (const r of repos) {
    fs.mkdirSync(path.join(dir, r), { recursive: true });
    execSync("git init -q", { cwd: path.join(dir, r) });
  }
  return dir;
}

/** The fake herdr-task's tasks; `clearTasks()` empties them. */
export const tasks = () => { try { return JSON.parse(fs.readFileSync(process.env.SPECD_TEST_TASKDB, "utf8")).tasks; } catch { return []; } };
export const clearTasks = () => fs.rmSync(process.env.SPECD_TEST_TASKDB, { force: true });

/** A model that answers `answer` (a list, or a function of the prompt returning { ok, json | error }); counts calls, keeps prompts. */
export function fakeLlm(answer) {
  const f = async ({ prompt }) => {
    f.calls++;
    f.prompts.push(prompt);
    return typeof answer === "function" ? answer(prompt) : { ok: true, json: { items: answer } };
  };
  f.calls = 0;
  f.prompts = [];
  f.last = () => f.prompts.at(-1) ?? "";
  return f;
}

/** One decomposed item. */
export const item = (id, title, deps = [], extra = {}) =>
  ({ id, title, kind: "task", repo: ".", deps, done: false, source: { file: "tasks/plan.md", startLine: 1, endLine: 3 }, ...extra });

/** A small native plan for a habit tracker (the layout /agent-skills:plan writes). */
export const NATIVE = {
  "SPEC.md": "# Spec: Streaks\n\nShow each habit's current and longest streak.\n",
  "tasks/plan.md": "# Implementation Plan: Streaks\n\nSource spec: SPEC.md\n\n## Task 1: Streak list\n\nPrint every habit's streak.\n\n## Task 2: Done stamps the date\n\n## Task 3: Warn on a second done\n\nDepends on Task 2.\n",
  "tasks/todo.md": "# Todo\n\n- [ ] Task 1: Streak list\n- [x] Task 2: Done stamps the date\n- [ ] Task 3: Warn on a second done\n",
};

/** A small ticket. */
export const TICKET = { "PROJ-123.md": "# PROJ-123: Export the monthly report as CSV\n\nAdd a CSV download next to the PDF one.\n" };
