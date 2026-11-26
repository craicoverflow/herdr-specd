import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const root = new URL("../", import.meta.url);

test("mod.json: no place, focusable, palette entry 'specd: Open'", () => {
  const m = JSON.parse(readFileSync(new URL("mods/specd/mod.json", root), "utf8"));
  assert.equal(m.place, "none");
  assert.equal(m.focusable, true);
  assert.ok(m.palette.some((p) => p.title === "specd: Open"));
});

test("fixture spec lives under test/fixtures/specs/PROJ-123", () => {
  assert.ok(existsSync(new URL("test/fixtures/specs/PROJ-123/spec.md", root)));
});

test("fixture folder has two specs with state.json", () => {
  for (const id of ["PROJ-123", "PROJ-456"]) {
    assert.ok(existsSync(new URL(`test/fixtures/folder/.specd/specs/${id}/state.json`, root)));
  }
});
