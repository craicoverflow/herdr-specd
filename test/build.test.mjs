import test from "node:test";
import assert from "node:assert/strict";
import { buildGroups, taskState, prLink, shouldPoll, repoFolders, POLL_MS } from "../mods/specd/core/build.js";

const items = [
  { id: "t1", title: "API", repo: "api" },
  { id: "t2", title: "Web", repo: "web" },
  { id: "t3", title: "Docs", repo: "api" },
];
const created = { t1: "HS-1", t2: "HS-2" };
const lists = {
  "/w/api": [{ ref: "HS-1", state: "done", pr_url: "https://github.com/o/r/pull/3" }],
  "/w/web": [{ ref: "HS-2", state: "running" }],
};

test("groups items by repo with done/total", () => {
  const g = buildGroups({ items, created, lists, folder: "/w" });
  assert.deepEqual(g.groups.map((x) => [x.repo, x.done, x.total]), [["api", 1, 2], ["web", 0, 1]]);
  assert.equal(g.done, 1);
  assert.equal(g.total, 3);
});

test("each row carries Shepherdr's state, ref and PR link", () => {
  const [api, web] = buildGroups({ items, created, lists, folder: "/w" }).groups;
  assert.deepEqual(api.items.map((i) => [i.id, i.ref, i.state, i.pr]), [
    ["t1", "HS-1", "done", "https://github.com/o/r/pull/3"],
    ["t3", null, "not created", null],
  ]);
  assert.equal(web.items[0].state, "working");
});

test("a created task missing from the list shows as unknown, and a repo that failed to list too", () => {
  const g = buildGroups({ items, created, lists: { "/w/api": [], "/w/web": null }, folder: "/w" });
  assert.equal(g.groups[0].items[0].state, "unknown");
  assert.equal(g.groups[1].items[0].state, "unknown");
});

test("taskState maps Shepherdr states", () => {
  assert.equal(taskState({ state: "queued" }), "queued");
  assert.equal(taskState({ state: "running" }), "working");
  assert.equal(taskState({ state: "ready" }), "ready");
  assert.equal(taskState({ state: "done" }), "done");
  assert.equal(taskState({ state: "weird" }), "weird");
});

test("prLink reads a url from the usual fields, else null", () => {
  assert.equal(prLink({ pr_url: "u" }), "u");
  assert.equal(prLink({ pr: { url: "v" } }), "v");
  assert.equal(prLink({ pr: "w" }), "w");
  assert.equal(prLink({}), null);
});

test("repoFolders lists each repo folder once", () => {
  assert.deepEqual(repoFolders(items, "/w"), ["/w/api", "/w/web"]);
});

test("shouldPoll only when the window is visible, in build, with nothing in flight", () => {
  assert.equal(shouldPoll({ visible: true, phase: "build", busy: false }), true);
  assert.equal(shouldPoll({ visible: false, phase: "build", busy: false }), false);
  assert.equal(shouldPoll({ visible: null, phase: "build", busy: false }), false);
  assert.equal(shouldPoll({ visible: true, phase: "plan", busy: false }), false);
  assert.equal(shouldPoll({ visible: true, phase: "build", busy: true }), false);
  assert.equal(POLL_MS, 10000);
});

test("an item the plan had already marked done counts as done without a task", () => {
  const g = buildGroups({ items: [{ id: "t0", title: "Schema", repo: "api", done: true }, ...items], created, lists, folder: "/w" });
  assert.equal(g.groups[0].items[0].state, "done");
  assert.deepEqual([g.done, g.total], [2, 4]);
});
