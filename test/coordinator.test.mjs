import "./support/register.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { setup, folder } from "./support/folder.mjs";
import { pending, INSTRUCTED } from "../mods/specd/core/coordinator.js";

const term = (address, labels = {}, extra = {}) => ({ address, state: "live", labels: { "herdr.role": "coordinator", ...labels }, cwd: "/work/a", ...extra });
const resolve = (text) => () => text;

test("pending: a live coordinator without the instructed label, with the text for its folder", () => {
  assert.deepEqual(pending([term("t1")], resolve("Be brief.")), [{ address: "t1", folder: "/work/a", text: "Be brief." }]);
});

test("pending: skips coordinators already instructed, other roles, dead terminals", () => {
  const all = [
    term("done", { [INSTRUCTED]: "1" }),
    term("worker", { "herdr.role": "worker" }),
    term("gone", {}, { state: "exited" }),
    term("t1"),
  ];
  assert.deepEqual(pending(all, resolve("x")).map((p) => p.address), ["t1"]);
});

test("pending: empty or blank text is not pending", () => {
  assert.deepEqual(pending([term("t1")], resolve("")), []);
  assert.deepEqual(pending([term("t1")], resolve("  \n")), []);
});

test("pending: each coordinator gets the text for its own folder (foreground cwd first)", () => {
  const all = [term("t1", {}, { cwd: "/work/a" }), term("t2", {}, { cwd: "/work/b", foreground: { cwd: "/work/c" } })];
  const r = pending(all, (f) => ({ "/work/a": "A", "/work/c": "C" })[f] ?? "");
  assert.deepEqual(r.map((p) => [p.address, p.text]), [["t1", "A"], ["t2", "C"]]);
});
