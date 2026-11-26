import test from "node:test";
import assert from "node:assert/strict";
import { roundDir, firstMessage, reviewRecord, baseName, findNewTerminal } from "../mods/specd/core/submit.js";
import { agentArgv, loadAdapter } from "../mods/specd/core/adapters.js";
import { readFileSync } from "node:fs";

test("round dirs: the spec phase is rounds/<n>, later phases are prefixed so rounds never collide", () => {
  assert.equal(roundDir("spec", 1), "1");
  assert.equal(roundDir("plan", 1), "plan-1");
});

test("first message names the file to edit, then the review", () => {
  const m = firstMessage("specs/P-1/spec.md", "Review of x\n\n1. Line 3");
  assert.equal(m, "Edit specs/P-1/spec.md in place. The review of it follows.\n\nReview of x\n\n1. Line 3");
});

test("review.json records the round, file and comments", () => {
  const r = reviewRecord({ id: "P-1", phase: "spec", round: 1, file: "specs/P-1/spec.md", comments: [{ lines: [1, 1], quote: "q", body: "b", start: 0, end: 1 }], at: 5 });
  assert.deepEqual(r, { id: "P-1", phase: "spec", round: 1, file: "specs/P-1/spec.md", at: 5, comments: [{ lines: [1, 1], quote: "q", body: "b", start: 0, end: 1 }] });
});

test("baseName", () => {
  assert.equal(baseName("a/b/spec.md"), "spec.md");
  assert.equal(baseName("spec.md"), "spec.md");
});

test("findNewTerminal: the terminal of a tab with that name that wasn't there before", () => {
  const tabs = [{ id: "tb1", name: "P-1 spec" }, { id: "tb2", name: "other" }];
  const panes = [{ tab: "tb1", terminal: "t1" }, { tab: "tb1", terminal: "t9" }, { tab: "tb2", terminal: "t2" }];
  assert.deepEqual(findNewTerminal({ tabs, panes, name: "P-1 spec", before: new Set(["t1"]) }), { terminal: "t9", tab: "tb1" });
  assert.equal(findNewTerminal({ tabs, panes, name: "P-1 spec", before: new Set(["t1", "t9"]) }), null);
  assert.equal(findNewTerminal({ tabs, panes, name: "gone", before: new Set() }), null);
});

test("agent argv fills the session id, and drops its flag without one", () => {
  const a = loadAdapter(readFileSync(new URL("../mods/specd/adapters/agent-skills.json", import.meta.url), "utf8"));
  assert.deepEqual(agentArgv(a, { model: "opus", effort: "high", session: "abc" }), ["claude", "--model", "opus", "--effort", "high", "--session-id", "abc"]);
  assert.deepEqual(agentArgv(a, { model: "opus", session: "abc" }), ["claude", "--model", "opus", "--session-id", "abc"]);
});
