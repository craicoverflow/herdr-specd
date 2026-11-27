import test from "node:test";
import assert from "node:assert/strict";
import {
  STATE_VERSION, createSpec, adoptSpec, parseState, serializeState, prepareWrite,
  documentReady, approve, submitReview, setOwner, finishBuild, currentDocPath, shownDocPath,
} from "../mods/specd/core/state.js";

const base = { id: "PROJ-123", brief: "do it", adapter: "agent-skills" };
const paths = { spec: "specs/PROJ-123/spec.md", plan: "specs/PROJ-123/plan.md", tasks: "specs/PROJ-123/tasks.json" };
const comment = { start: 1, end: 5, lines: [1, 1], quote: "abc", body: "fix" };
const inReview = () => documentReady(createSpec({ ...base, paths }));

test("S1 createSpec: spec phase, drafting, round 1, defaults", () => {
  const s = createSpec({ ...base, paths });
  assert.equal(s.state, STATE_VERSION);
  assert.equal(s.phase, "spec");
  assert.equal(s.status, "drafting");
  assert.equal(s.round, 1);
  assert.deepEqual(s.pending, []);
  assert.deepEqual(s.owners, {});
  assert.deepEqual(s.dispatch, { review: false, created: {} });
  assert.deepEqual(s.models, { spec: "opus", plan: "opus", build: "sonnet" });
});

test("S1 createSpec: ID must match [A-Za-z0-9][A-Za-z0-9-]*, brief required", () => {
  for (const id of ["", "-abc", "a b", "a/b", "a_b", "../x"]) {
    assert.throws(() => createSpec({ ...base, id, paths }), /ID/, id);
  }
  assert.throws(() => createSpec({ ...base, brief: "  ", paths }), /brief/i);
  assert.equal(createSpec({ ...base, id: "a", paths }).id, "a");
});

test("S1 createSpec: models can be overridden", () => {
  const s = createSpec({ ...base, paths, models: { build: "haiku" } });
  assert.deepEqual(s.models, { spec: "opus", plan: "opus", build: "haiku" });
});

test("S1 createSpec refuses an ID that already exists in the folder", () => {
  assert.throws(() => createSpec({ ...base, paths, existingIds: ["PROJ-123"] }), /already exists/);
  assert.ok(createSpec({ ...base, paths, existingIds: ["OTHER-1"] }));
});

test("S1 documentReady: drafting -> review; refused otherwise", () => {
  const s = createSpec({ ...base, paths });
  const r = documentReady(s);
  assert.equal(r.status, "review");
  assert.equal(s.status, "drafting", "input not mutated");
  assert.throws(() => documentReady(r), /drafting/);
});

test("S2 adoptSpec: spec only -> spec/review; spec and plan -> plan/review", () => {
  const a = adoptSpec({ id: "PROJ-9", paths: { spec: "PROJ-9.md" } });
  assert.equal(a.phase, "spec");
  assert.equal(a.status, "review");
  assert.deepEqual(a.owners, {});
  assert.equal(a.paths.spec, "PROJ-9.md");
  const b = adoptSpec({ id: "PROJ-9", paths: { spec: "PROJ-9.md", plan: "plan.md", tasks: "t.json" } });
  assert.equal(b.phase, "plan");
  assert.equal(b.status, "review");
  assert.equal(b.round, 1);
  assert.equal(b.paths.tasks, "t.json");
});

test("S2 adoptSpec: refuses no spec file, bad ID, plan without spec, existing ID", () => {
  assert.throws(() => adoptSpec({ id: "X", paths: {} }), /spec file/);
  assert.throws(() => adoptSpec({ id: "X", paths: { plan: "p.md" } }), /spec file/);
  assert.throws(() => adoptSpec({ id: "-9x", paths: { spec: "s.md" } }), /ID/);
  assert.throws(() => adoptSpec({ id: "X", paths: { spec: "s.md" }, existingIds: ["X"] }), /already exists/);
});

test("S6 approve spec: -> plan/drafting, round reset, pending empty", () => {
  const s = approve(inReview());
  assert.equal(s.phase, "plan");
  assert.equal(s.status, "drafting");
  assert.equal(s.round, 1);
});

test("S6 approve is refused while comments are pending", () => {
  const s = { ...inReview(), pending: [comment] };
  assert.throws(() => approve(s), /pending comment/);
});

test("S6 approve is refused unless in review", () => {
  assert.throws(() => approve(createSpec({ ...base, paths })), /review/);
});

test("S6 approve plan: -> build, approved", () => {
  const plan = documentReady(approve(inReview()));
  const s = approve(plan);
  assert.equal(s.phase, "build");
  assert.equal(s.status, "approved");
});

test("S6 approve refused in build and done", () => {
  const build = approve(documentReady(approve(inReview())));
  assert.throws(() => approve(build), /review/);
  assert.throws(() => approve(finishBuild(build)), /review/);
});

test("S6 finishBuild: build -> done; refused otherwise", () => {
  const build = approve(documentReady(approve(inReview())));
  const d = finishBuild(build);
  assert.equal(d.phase, "done");
  assert.throws(() => finishBuild(inReview()), /build/);
  assert.throws(() => finishBuild(d), /build/);
});

test("S4 submitReview: round +1, pending cleared, back to drafting, returns the submitted round", () => {
  const s = { ...inReview(), pending: [comment] };
  const { state, round, comments } = submitReview(s);
  assert.equal(round, 1);
  assert.deepEqual(comments, [comment]);
  assert.equal(state.round, 2);
  assert.deepEqual(state.pending, []);
  assert.equal(state.status, "drafting");
  assert.equal(state.phase, "spec");
  assert.equal(documentReady(state).status, "review");
});

test("S4 submitReview refused with no comments or outside review", () => {
  assert.throws(() => submitReview(inReview()), /no comments/i);
  assert.throws(() => submitReview({ ...createSpec({ ...base, paths }), pending: [comment] }), /review/);
});

test("S4/S6 round is per phase document", () => {
  let s = { ...inReview(), pending: [comment] };
  s = submitReview(s).state; // round 2
  s = documentReady(s);
  s = approve(s);
  assert.equal(s.round, 1, "plan starts at round 1");
});

test("S4 setOwner records the terminal for a phase; replacing keeps other phases", () => {
  let s = setOwner(inReview(), "spec", { terminal: "t7", tab: "tb1", at: 1 });
  assert.equal(s.owners.spec.terminal, "t7");
  s = setOwner(s, "plan", { terminal: "t8", tab: "tb2", at: 2 });
  s = setOwner(s, "spec", { terminal: "t9", tab: "tb3", at: 3 });
  assert.equal(s.owners.spec.terminal, "t9");
  assert.equal(s.owners.plan.terminal, "t8");
  assert.throws(() => setOwner(s, "build", { terminal: "t" }), /phase/);
  assert.throws(() => setOwner(s, "spec", {}), /terminal/);
});

test("currentDocPath: spec/plan phase document", () => {
  const s = inReview();
  assert.equal(currentDocPath(s), paths.spec);
  assert.equal(currentDocPath(approve(s)), paths.plan);
  assert.equal(currentDocPath(finishBuild(approve(documentReady(approve(s))))), null);
});

test("shownDocPath: follows the phase, keeps absolute paths (e2e 2026-11-26: plan view showed the spec path)", () => {
  const s = inReview();
  assert.equal(shownDocPath("/w", s), "/w/specs/PROJ-123/spec.md");
  assert.equal(shownDocPath("/w/", approve(s)), "/w/specs/PROJ-123/plan.md");
  assert.equal(shownDocPath("/w", finishBuild(approve(documentReady(approve(s))))), "/w/specs/PROJ-123/spec.md");
  const adopted = { ...s, paths: { ...s.paths, spec: "/elsewhere/PROJ-9.md" } };
  assert.equal(shownDocPath("/w", adopted), "/elsewhere/PROJ-9.md");
});

test("state.json: round-trips through serialize and parse", () => {
  const s = { ...inReview(), pending: [comment] };
  assert.deepEqual(parseState(serializeState(s)), s);
  assert.ok(serializeState(s).endsWith("\n"));
});

test("state.json: unknown version is refused with a clear message", () => {
  assert.throws(() => parseState(JSON.stringify({ state: 2, id: "X" })), /version 2.*version 1/s);
  assert.throws(() => parseState(JSON.stringify({ id: "X" })), /version/);
  assert.throws(() => parseState("{nope"), /not valid JSON/);
});

test("state.json: an unknown version on disk is never overwritten", () => {
  const s = inReview();
  const existing = JSON.stringify({ state: 2, id: "PROJ-123" });
  assert.throws(() => prepareWrite(s, existing), /version 2/);
  assert.equal(prepareWrite(s, null), serializeState(s));
  assert.equal(prepareWrite(s, serializeState(s)), serializeState(s));
});

test("parseState refuses a malformed shape", () => {
  assert.throws(() => parseState(JSON.stringify({ state: 1, id: "X" })), /phase/);
});
