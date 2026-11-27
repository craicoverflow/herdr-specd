// The dispatch list's non-model parts: validation of a decomposition, done items, staleness, prompts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkItems, activeItems, changedFiles, makeManifest, describeChange, singleItem, normalizeItems, decomposePrompt, retryPrompt, viaFor, sameList, singleRepo } from "../mods/specd/core/manifest.js";
import { buildPrompt, planNote } from "../mods/specd/core/tasks.js";
import { skipPlan } from "../mods/specd/core/state.js";
import { loadAdapter } from "../mods/specd/core/adapters.js";
import { readFileSync } from "node:fs";

const docs = [{ file: "plan.md", text: "# A\nbody\n# B\nmore\n", role: "plan" }];
const item = (o) => ({ id: "t1", title: "A", kind: "task", repo: ".", deps: [], done: false, source: { file: "plan.md", startLine: 1, endLine: 2 }, ...o });
const check = (items) => checkItems(items, { docs, repos: ["."] });

test("a valid decomposition has no errors", () => assert.deepEqual(check([item(), item({ id: "t2", deps: ["t1"], source: { file: "plan.md", startLine: 3, endLine: 4 } })]), []));
test("errors come all at once: repo, dep, lines, file, duplicate id", () => {
  const e = check([item({ repo: "api" }), item({ deps: ["zz"], source: { file: "plan.md", startLine: 3, endLine: 9 } }), item({ id: "T 3", source: { file: "x.md", startLine: 1, endLine: 1 } })]);
  assert.equal(e.length, 6);
  assert.ok(e.some((m) => /repo "api"/.test(m)) && e.some((m) => /"zz"/.test(m)) && e.some((m) => /outside plan.md/.test(m)) && e.some((m) => /duplicate/.test(m)));
});
test("a cycle is an error", () => assert.match(check([item({ deps: ["t2"] }), item({ id: "t2", deps: ["t1"] })])[0], /cycle/));
test("empty list is an error", () => assert.equal(check([]).length, 1));

test("done items are not dispatched and nothing waits for them", () => {
  const a = activeItems([item({ done: true }), item({ id: "t2", deps: ["t1"] })]);
  assert.deepEqual(a.map((i) => [i.id, i.deps]), [["t2", []]]);
});
test("a checkpoint with no checks gets one", () => assert.equal(normalizeItems([item({ kind: "checkpoint" })])[0].checks.length, 1));
test("single item: the heading minus a ticket key, the whole file", () => {
  const [i] = singleItem({ title: "# PROJ-123: Export it", file: "P.md", text: "a\nb", repo: "." });
  assert.deepEqual([i.title, i.source.endLine], ["Export it", 2]);
});

test("staleness: a changed or new file is reported, and described", () => {
  const m = makeManifest({ spec: "s", via: "llm", items: [item()], docs });
  assert.deepEqual(changedFiles(m, docs), []);
  assert.deepEqual(changedFiles(m, [{ ...docs[0], text: docs[0].text + "x" }]), ["plan.md"]);
  assert.match(describeChange(["plan.md"], [item()], [item(), item({ id: "t2", title: "New" })]), /1 → 2 tasks · new: New/);
});

test("prompts carry numbered lines, repos, previous items and errors", () => {
  const p = decomposePrompt({ docs, repos: [".", "api"], previous: [item()] });
  assert.match(p, /\n   3\| # B/);
  assert.match(p, /"api"/);
  assert.match(p, /earlier version/);
  assert.match(retryPrompt("P", { items: [] }, ["bad"]), /1 error:\n- bad/);
});

test("worker prompt: the source lines, notes, paths; no plan line for a combined doc", () => {
  const adapter = loadAdapter(readFileSync(new URL("../mods/specd/adapters/agent-skills.json", import.meta.url), "utf8"));
  const out = buildPrompt(item({ notes: "run after t3", source: { file: "plan.md", startLine: 3, endLine: 4 } }), { adapter, specPath: "/s.md", planPath: "/s.md", docs: { "plan.md": docs[0].text } });
  assert.match(out, /# B\nmore/);
  assert.doesNotMatch(out, /# A/);
  assert.match(out, /Notes: run after t3/);
  assert.doesNotMatch(out, /Plan:/);
});

test("skipPlan: spec in review goes to build; as plan, the spec is the plan", () => {
  const s = { phase: "spec", status: "review", pending: [], paths: { spec: "S.md" }, round: 1 };
  assert.equal(skipPlan(s, { asPlan: true }).paths.plan, "S.md");
  assert.equal(skipPlan(s, { asPlan: false }).paths.plan, undefined);
  assert.throws(() => skipPlan({ ...s, status: "drafting" }, { asPlan: false }), /Nothing to skip/);
});

test("errors name the item by id and title, so the person can find it", () => {
  assert.match(check([item({ repo: "api", title: "Add the endpoint" })])[0], /^"t1" \(Add the endpoint\): repo "api"/);
});

test("viaFor: no plan is one task, the spec as its own plan, else a plan", () => {
  assert.equal(viaFor({ paths: { spec: "S.md" } }), "single");
  assert.equal(viaFor({ paths: { spec: "S.md", plan: "S.md" } }), "spec");
  assert.equal(viaFor({ paths: { spec: "S.md", plan: "P.md", tasks: "T.md" } }), "plan");
});

test("skipPlan as one task keeps only the spec path, so the list is the whole spec", () => {
  const s = { phase: "spec", status: "review", pending: [], paths: { spec: "S.md", plan: "P.md", tasks: "T.md" }, round: 1 };
  assert.deepEqual(skipPlan(s, { asPlan: false }).paths, { spec: "S.md" });
  assert.equal(viaFor(skipPlan(s, { asPlan: false })), "single");
  assert.equal(viaFor(skipPlan(s, { asPlan: true })), "spec");
});

test("singleRepo: the folder when it is a repo, else the only one; else an error naming the task", () => {
  assert.equal(singleRepo([".", "api"], "X"), ".");
  assert.equal(singleRepo(["api"], "X"), "api");
  assert.throws(() => singleRepo([], "Export"), /"Export" has nowhere to run/);
  assert.throws(() => singleRepo(["api", "web"], "Export"), /which repository "Export".*api, web/);
});

test("the person's note goes into the prompt and is kept in the manifest", () => {
  assert.match(decomposePrompt({ docs, repos: ["."], note: "one task per phase" }), /reviewing the list asks[^\n]*\none task per phase/);
  assert.doesNotMatch(decomposePrompt({ docs, repos: ["."], note: " " }), /reviewing the list asks/);
  assert.equal(makeManifest({ spec: "s", via: "plan", items: [item()], docs, note: " one per phase " }).note, "one per phase");
  assert.equal("note" in makeManifest({ spec: "s", via: "plan", items: [item()], docs }), false);
});

test("describeChange takes a reason instead of files", () => {
  assert.match(describeChange("Asked again", [item(), item({ id: "t2", title: "B" })], [item({ title: "A and B" })]), /^Asked again: 2 → 1 tasks · new: A and B · gone: A; B$/);
  assert.match(describeChange(["todo.md"], [item()], [item()]), /^todo.md changed since this list was made: 1 → 1 tasks$/);
});

test("sameList: the same work despite moved source lines; a new dep or title is different", () => {
  const a = [item(), item({ id: "t2", deps: ["t1"] })];
  assert.ok(sameList(a, [item({ source: { file: "plan.md", startLine: 2, endLine: 3 } }), item({ id: "t2", deps: ["t1"] })]));
  assert.ok(!sameList(a, [item(), item({ id: "t2" })]));
  assert.ok(!sameList(a, [item({ title: "Other" }), item({ id: "t2", deps: ["t1"] })]));
});

test("planNote: native plans need no Source spec line; one naming another spec is an error", () => {
  assert.deepEqual(planNote("# Plan\n## Task 1", "SPEC.md"), { errors: [], warnings: [] });
  assert.deepEqual(planNote("Source spec: `SPEC.md`\n# Plan", "repo/SPEC.md").errors, []);
  assert.match(planNote("Source spec: SPEC-other.md\n# Plan", "SPEC.md").errors[0], /for SPEC-other.md, not SPEC.md/);
});
