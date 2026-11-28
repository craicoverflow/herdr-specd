import test from "node:test";
import assert from "node:assert/strict";
import { resolveInstructions, withInstructions, appliesNote, parseUserInstructions, folderInstructions } from "../mods/specd/core/agents.js";

test("resolveInstructions: none, user only, folder wins, folder \"\" disables, both empty", () => {
  assert.deepEqual(resolveInstructions({}), { text: "", from: "none" });
  assert.deepEqual(resolveInstructions({ user: "u" }), { text: "u", from: "user" });
  assert.deepEqual(resolveInstructions({ user: "u", folder: "f" }), { text: "f", from: "folder" });
  assert.deepEqual(resolveInstructions({ user: "u", folder: "" }), { text: "", from: "none" });
  assert.deepEqual(resolveInstructions({ user: "", folder: "" }), { text: "", from: "none" });
  assert.deepEqual(resolveInstructions({ user: "  ", folder: undefined }), { text: "", from: "none" });
});

test("withInstructions: prompt untouched when empty, else text, blank line, ---, blank line, prompt", () => {
  assert.equal(withInstructions("P\n", ""), "P\n");
  assert.equal(withInstructions("P", undefined), "P");
  assert.equal(withInstructions("P", "Be brief."), "Be brief.\n\n---\n\nP");
});

test("appliesNote: the line the UI shows", () => {
  assert.equal(appliesNote("worker", { text: "abc", from: "folder" }), "Worker instructions: from this folder (3 chars)");
  assert.equal(appliesNote("worker", { text: "a", from: "user" }), "Worker instructions: your default (1 char)");
  assert.equal(appliesNote("worker", { text: "", from: "none" }), "Worker instructions: none");
  assert.equal(appliesNote("coordinator", { text: "", from: "none" }), "Coordinator instructions: none");
});

test("parseUserInstructions and folderInstructions read what storage and config hold", () => {
  assert.equal(parseUserInstructions('{"worker":"w","coordinator":"c"}', "worker"), "w");
  assert.equal(parseUserInstructions("nope", "worker"), undefined);
  assert.equal(parseUserInstructions(null, "worker"), undefined);
  assert.equal(parseUserInstructions('{"worker":5}', "worker"), undefined);
  assert.equal(folderInstructions({ instructions: { worker: "" } }, "worker"), "");
  assert.equal(folderInstructions({ instructions: { coordinator: "c" } }, "worker"), undefined);
  assert.equal(folderInstructions(null, "worker"), undefined);
});

import { withFolderInstructions, withUserInstructions } from "../mods/specd/core/agents.js";

test("withFolderInstructions: merges into the config so models survive; \"\" is kept; undefined removes only the key", () => {
  const cfg = JSON.stringify({ models: { worker: "opus" }, instructions: { worker: "w", coordinator: "c" } });
  const set = JSON.parse(withFolderInstructions(cfg, "worker", "new"));
  assert.deepEqual(set, { models: { worker: "opus" }, instructions: { worker: "new", coordinator: "c" } });
  assert.equal(JSON.parse(withFolderInstructions(cfg, "worker", "")).instructions.worker, "");
  const reset = JSON.parse(withFolderInstructions(cfg, "worker", undefined));
  assert.deepEqual(reset, { models: { worker: "opus" }, instructions: { coordinator: "c" } });
  const last = JSON.parse(withFolderInstructions(JSON.stringify({ models: {}, instructions: { worker: "w" } }), "worker", undefined));
  assert.deepEqual(last, { models: {} }, "an emptied instructions object goes too");
  assert.deepEqual(JSON.parse(withFolderInstructions(null, "worker", "x")), { instructions: { worker: "x" } });
  assert.deepEqual(JSON.parse(withFolderInstructions(null, "worker", undefined)), {});
});

test("withFolderInstructions refuses a config that isn't a JSON object", () => {
  assert.throws(() => withFolderInstructions("{nope", "worker", "x"), /not valid JSON/);
  assert.throws(() => withFolderInstructions("[1]", "worker", "x"), /not valid JSON/);
});

test("withUserInstructions: keeps the other role, tolerates bad stored text", () => {
  assert.deepEqual(JSON.parse(withUserInstructions('{"worker":"w"}', "coordinator", "c")), { worker: "w", coordinator: "c" });
  assert.deepEqual(JSON.parse(withUserInstructions("garbage", "worker", "w")), { worker: "w" });
  assert.deepEqual(JSON.parse(withUserInstructions(null, "worker", "w")), { worker: "w" });
});
