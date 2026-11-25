import test from "node:test";
import assert from "node:assert/strict";
import { docTitle, summarize, sortSummaries } from "../mods/specr/core/summary.js";

test("docTitle: first heading text, heading marks and closing hashes stripped", () => {
  assert.equal(docTitle("\n# Hello world ##\n\n## Other"), "Hello world");
});
test("docTitle: ignores headings inside code fences", () => {
  assert.equal(docTitle("```\n# not me\n```\n## Real"), "Real");
});
test("docTitle: null without heading", () => {
  assert.equal(docTitle("just text"), null);
  assert.equal(docTitle(null), null);
});

const state = (o) => ({ id: "A-1", phase: "plan", status: "review", pending: [], paths: {}, ...o });

test("summarize: id, title from document, phase, pending and task counts", () => {
  const s = summarize(state({ pending: [{}, {}] }), { docText: "# T\n", tasksText: JSON.stringify({ items: [{}, {}, {}] }) });
  assert.deepEqual(s, { id: "A-1", title: "T", phase: "plan", status: "review", pending: 2, tasks: 3 });
});
test("summarize: falls back to the ID when there is no document or heading; no tasks file is null", () => {
  assert.equal(summarize(state(), { docText: null, tasksText: null }).title, "A-1");
  assert.equal(summarize(state(), { docText: "x", tasksText: null }).tasks, null);
});
test("summarize: broken tasks.json counts as no tasks", () => {
  assert.equal(summarize(state(), { docText: "# T", tasksText: "{nope" }).tasks, null);
});
test("sortSummaries: by ID, natural order", () => {
  const out = sortSummaries([{ id: "P-10" }, { id: "P-2" }, { id: "A-1" }]).map((s) => s.id);
  assert.deepEqual(out, ["A-1", "P-2", "P-10"]);
});
