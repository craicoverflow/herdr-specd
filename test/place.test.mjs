// core/place.js: where specd opens (panel or tab) and the request a tab copy hands to the panel copy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { placeFor, requestFor, takeRequest, commandOf, isTabCopy, tabHost, folderFor, REQUEST_TTL_MS } from "../mods/specd/core/place.js";

test("placeFor: the specd layout is a panel, anything else a tab", () => {
  assert.equal(placeFor("specd"), "panel");
  for (const name of ["shepherdr", "", null, undefined, "specd-copy"]) assert.equal(placeFor(name), "tab", String(name));
});

test("commandOf names the palette command from the props it opens with", () => {
  assert.equal(commandOf({}), "open");
  assert.equal(commandOf(undefined), "open");
  assert.equal(commandOf({ new: true }), "new");
  assert.equal(commandOf({ adopt: true }), "adopt");
});

test("isTabCopy: the palette's tab copies, never the panel copy", () => {
  for (const p of [{ tab: true }, { new: true }, { adopt: true }]) assert.equal(isTabCopy(p), true);
  for (const p of [{}, undefined, null, { folder: "/x" }, { diagram: {} }]) assert.equal(isTabCopy(p), false);
});

test("requestFor keeps the command, its props and the time", () => {
  assert.deepEqual(requestFor("new", { new: true }, 5), { cmd: "new", props: { new: true }, at: 5 });
  assert.deepEqual(requestFor("open", undefined, 7), { cmd: "open", props: {}, at: 7 });
});

test("takeRequest: a fresh request is taken once", () => {
  const r = requestFor("adopt", { adopt: true }, 1000);
  assert.deepEqual(takeRequest(r, 0, 2000), r);
  assert.equal(takeRequest(r, 1000, 2000), null, "already taken");
  assert.equal(takeRequest(r, 1500, 2000), null, "an older one than the last taken");
});

test("takeRequest ignores requests older than 10 s and malformed ones", () => {
  const r = requestFor("open", {}, 1000);
  assert.equal(REQUEST_TTL_MS, 10000);
  assert.deepEqual(takeRequest(r, 0, 11000), r, "exactly 10 s is still fresh");
  assert.equal(takeRequest(r, 0, 11001), null);
  for (const bad of [null, undefined, {}, { cmd: "open" }, { cmd: "x", at: 1 }, "open"]) assert.equal(takeRequest(bad, 0, 1), null);
});

test("tabHost: the tab this copy is shown in, only when the tab holds a specd pane", () => {
  const panes = [{ tab: "t1", mod: "specd" }, { tab: "t2", mod: undefined }, { tab: "t3", mod: "chat" }];
  assert.equal(tabHost(panes, "t1"), "t1");
  assert.equal(tabHost(panes, "t2"), null, "the panel copy: the focused tab is a task tab");
  assert.equal(tabHost(panes, "t3"), null);
  assert.equal(tabHost(panes, undefined), null);
});

test("folderFor: the folder prop, else the focused terminal's cwd, else its space's folder, else null", () => {
  const spaces = [{ id: "s1", folder: "/space1" }, { id: "s2" }];
  assert.equal(folderFor({ prop: "/p", focused: { cwd: "/c", space: "s1" }, spaces }), "/p");
  assert.equal(folderFor({ focused: { cwd: "/c", space: "s1" }, spaces }), "/c");
  assert.equal(folderFor({ focused: { space: "s1" }, spaces }), "/space1");
  assert.equal(folderFor({ focused: { space: "s2" }, spaces }), null);
  assert.equal(folderFor({ focused: null, spaces }), null);
  assert.equal(folderFor({}), null);
});
