// The committed `specd` layout: structure, mod references, and that link/--remove only touch what
// this repo installs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { tmpdir, homedir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const layout = JSON.parse(readFileSync(join(root, "layouts/specd.json"), "utf8"));
const realHome = process.env.HERDR_APP_HOME || join(homedir(), ".config/herdr-app");

const walk = (n, out = []) => { out.push(n); for (const c of n.children || []) walk(c, out); for (const f of n.floating || []) out.push(f); return out; };
const nodes = walk(layout);
const byId = (id) => nodes.find((n) => n.id === id);

test("ids are unique", () => {
  const ids = nodes.map((n) => n.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("no Artifacts stack or art-* mod", () => {
  for (const n of nodes) {
    assert.ok(!/artifacts/.test(n.id), n.id);
    const m = n.content?.mod;
    assert.ok(!m || (m !== "artifacts" && !m.startsWith("art-")), `${n.id} -> ${m}`);
  }
});

test("tasks stack and a specd block after it in panel-body; active stays tasks", () => {
  const body = byId("panel-body");
  const kids = body.children.map((c) => c.id);
  assert.ok(kids.includes("tasks"));
  assert.equal(byId("tasks").type, "stack");
  assert.equal(kids.indexOf("specd"), kids.indexOf("tasks") + 1);
  assert.deepEqual(byId("specd").content, { mod: "specd" });
  assert.equal(body.active, "tasks");
});

test("cloned_from names shepherdr; preview points at the svg that exists", () => {
  assert.equal(layout.cloned_from.name, "shepherdr");
  assert.match(layout.cloned_from.version, /^\d+\.\d+\.\d+$/);
  assert.equal(layout.preview, "layouts/specd.svg");
  assert.ok(existsSync(join(root, "layouts/specd.svg")));
  assert.match(readFileSync(join(root, "layouts/specd.svg"), "utf8"), /<svg/);
});

test("agenttrail (a personal block) is not in the committed layout", () => {
  assert.ok(!nodes.some((n) => n.content?.mod === "agenttrail"));
});

test("every content.mod exists in mods/ here or in the Herdr home", () => {
  const home = join(realHome, "mods");
  for (const n of nodes) {
    const m = n.content?.mod;
    if (!m) continue;
    if (existsSync(join(root, "mods", m))) continue;
    if (!existsSync(home)) continue; // can't check Herdr-home names without a home
    assert.ok(existsSync(join(home, m)), `${n.id} uses missing mod ${m}`);
  }
});

test("sizes, sidebar and tabs match shepherdr.json when it exists", { skip: !existsSync(join(realHome, "layouts/shepherdr.json")) }, () => {
  const shep = JSON.parse(readFileSync(join(realHome, "layouts/shepherdr.json"), "utf8"));
  const sn = walk(shep);
  // The live shepherdr.json carries run-time state: terminal ids, hidden flags, per-task terminal views.
  const norm = (n) => {
    const { hidden, ...rest } = n; // eslint-disable-line no-unused-vars
    if (rest.content?.terminal) rest.content = { terminal: "*" };
    if (rest.children) rest.children = rest.children.filter((c) => !/-browser-view$/.test(c.id)).map(norm);
    return rest;
  };
  for (const id of ["sidebar", "tabs", "files", "changes", "tasks", "main", "status"]) {
    assert.deepEqual(norm(byId(id)), norm(sn.find((n) => n.id === id)), id);
  }
  const { size, min, max } = sn.find((n) => n.id === "panel");
  assert.deepEqual({ size: byId("panel").size, min: byId("panel").min, max: byId("panel").max }, { size, min, max });
  assert.deepEqual(byId("panel").size, { px: 510 });
  assert.equal(byId("panel").min, 280);
  assert.equal(byId("panel").max, 900);
});

// ---- link.sh against a temp Herdr home
const files = (dir, base = dir, out = {}) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) files(p, base, out); else out[relative(base, p)] = readFileSync(p).toString("base64");
  }
  return out;
};
const link = (home, ...args) => spawnSync("bash", [join(root, "scripts/link.sh"), ...args], { env: { ...process.env, HERDR_APP_HOME: home }, encoding: "utf8" });

test("link installs layouts and mods; --remove leaves pre-existing files byte-identical", () => {
  const home = mkdtempSync(join(tmpdir(), "specd-home-"));
  try {
    mkdirSync(join(home, "layouts"), { recursive: true });
    mkdirSync(join(home, "mods/tasks"), { recursive: true });
    mkdirSync(join(home, "mods/pane-chat"), { recursive: true });
    writeFileSync(join(home, "layouts/shepherdr.json"), '{"id":"root"}\n');
    writeFileSync(join(home, "layouts/win98.svg"), "<svg/>");
    writeFileSync(join(home, "mods/tasks/mod.json"), "{}");
    writeFileSync(join(home, "mods/pane-chat/mod.json"), "{}");
    const before = files(home);

    let r = link(home);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(existsSync(join(home, "layouts/specd.json")));
    assert.ok(existsSync(join(home, "layouts/specd.svg")));
    assert.ok(existsSync(join(home, "mods/specd/mod.json")));
    r = link(home); // idempotent
    assert.equal(r.status, 0, r.stderr);

    r = link(home, "--remove");
    assert.equal(r.status, 0, r.stderr);
    assert.ok(!existsSync(join(home, "layouts/specd.json")));
    assert.ok(!existsSync(join(home, "layouts/specd.svg")));
    assert.ok(!existsSync(join(home, "mods/specd")));
    assert.deepEqual(files(home), before);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("--remove on an empty home is a no-op that succeeds", () => {
  const home = mkdtempSync(join(tmpdir(), "specd-home-"));
  try { assert.equal(link(home, "--remove").status, 0); } finally { rmSync(home, { recursive: true, force: true }); }
});
