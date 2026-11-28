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
