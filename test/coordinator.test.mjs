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

// --- delivery: fake terminals and an hc journal ---------------------------------------------------
const home = setup();
const H = await import("./support/herdr.mjs");
const { instructCoordinators, forgetInstructed } = await import("../mods/specd/io/agents.js");
const hcCalls = () => H.journal.filter((e) => e.type === "hc").map((e) => e.args);
let store = {};
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, x) => { store[k] = x; } };
const setDefault = (text) => { store = { "specd.instructions": JSON.stringify({ coordinator: text }) }; };

beforeEach(() => { H.journal.length = 0; H.setTerminals([]); store = {}; forgetInstructed(); });

test("a coordinator started after instructions are set gets them once, then is labelled", async () => {
  setDefault("Always answer with the word PINEAPPLE first");
  const dir = folder("c1");
  H.setTerminals([term("t1", {}, { cwd: dir })]);
  await instructCoordinators();
  await instructCoordinators();
  assert.deepEqual(hcCalls(), [["send", "t1", "Always answer with the word PINEAPPLE first"], ["label", "t1", "specd.instructed=1"]]);
});

test("editing the instructions does not resend to a running coordinator", async () => {
  setDefault("one");
  const dir = folder("c2");
  H.setTerminals([term("t1", {}, { cwd: dir })]);
  await instructCoordinators();
  setDefault("two");
  await instructCoordinators();
  assert.equal(hcCalls().filter((a) => a[0] === "send").length, 1);
});

test("a restarted coordinator (a new terminal) gets them again", async () => {
  setDefault("one");
  const dir = folder("c3");
  H.setTerminals([term("t1", {}, { cwd: dir })]);
  await instructCoordinators();
  H.setTerminals([term("t2", {}, { cwd: dir })]);
  await instructCoordinators();
  assert.deepEqual(hcCalls().filter((a) => a[0] === "send").map((a) => a[1]), ["t1", "t2"]);
});

test("no instructions: no hc call at all", async () => {
  const dir = folder("c4");
  H.setTerminals([term("t1", {}, { cwd: dir })]);
  await instructCoordinators();
  setDefault("   ");
  await instructCoordinators();
  assert.deepEqual(hcCalls(), []);
});

test("the folder's override beats the default; \"\" there switches it off", async () => {
  setDefault("default");
  const a = folder("c5a", { files: { ".specd/config.json": JSON.stringify({ instructions: { coordinator: "for a" } }) } });
  const b = folder("c5b", { files: { ".specd/config.json": JSON.stringify({ instructions: { coordinator: "" } }) } });
  const c = folder("c5c");
  H.setTerminals([term("ta", {}, { cwd: a }), term("tb", {}, { cwd: b }), term("tc", {}, { cwd: c })]);
  await instructCoordinators();
  assert.deepEqual(hcCalls().filter((x) => x[0] === "send").map((x) => [x[1], x[2]]), [["ta", "for a"], ["tc", "default"]]);
});

test("a send that fails is tried again on the next look and not labelled", async () => {
  setDefault("x");
  const dir = folder("c6");
  H.setTerminals([term("t1", {}, { cwd: dir })]);
  await instructCoordinators(async () => { throw new Error("no"); });
  assert.deepEqual(hcCalls().filter((a) => a[0] === "label"), []);
  await instructCoordinators();
  assert.deepEqual(hcCalls().map((a) => a[0]), ["send", "label"]);
});
