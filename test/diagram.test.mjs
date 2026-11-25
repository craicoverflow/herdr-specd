import test from "node:test";
import assert from "node:assert/strict";
import { cacheKey, mmdcArgs, pngSize, fitSize, cleanSettings, failureNote, INSTALL_NOTE } from "../mods/specr/core/diagram.js";
import { hash } from "../mods/specr/core/pieces.js";

test("cacheKey is hash(source)-theme", () => {
  assert.equal(cacheKey("graph TD", true), `${hash("graph TD")}-dark`);
  assert.equal(cacheKey("graph TD", false), `${hash("graph TD")}-light`);
  assert.notEqual(cacheKey("a", true), cacheKey("b", true));
});

test("mmdcArgs: theme, transparent, scale 2, optional puppeteer config", () => {
  const a = mmdcArgs({ input: "/c/k.mmd", output: "/c/k.png", dark: true, puppeteer: "/p.json" });
  assert.deepEqual(a, ["-p", "/p.json", "-q", "-i", "/c/k.mmd", "-o", "/c/k.png", "-s", "2", "-b", "transparent", "-t", "dark"]);
  const b = mmdcArgs({ input: "i", output: "o", dark: false, puppeteer: "" });
  assert.ok(!b.includes("-p"));
  assert.equal(b[b.indexOf("-t") + 1], "default");
});

test("pngSize reads IHDR and halves it for the 2x scale", () => {
  const b = new Uint8Array(24);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  b.set([0, 0, 0x07, 0xd0], 16); // 2000
  b.set([0, 0, 0x03, 0xe8], 20); // 1000
  assert.deepEqual(pngSize(b), { w: 1000, h: 500 });
  assert.equal(pngSize(new Uint8Array(10)), null);
  assert.equal(pngSize(new Uint8Array(24)), null); // no PNG signature
});

test("fitSize shrinks to the available width, never grows", () => {
  assert.deepEqual(fitSize({ w: 1000, h: 500 }, 500), { w: 500, h: 250, scaled: true });
  assert.deepEqual(fitSize({ w: 300, h: 100 }, 500), { w: 300, h: 100, scaled: false });
  assert.deepEqual(fitSize({ w: 300, h: 100 }, 0), { w: 300, h: 100, scaled: false });
});

test("cleanSettings trims and tolerates junk", () => {
  assert.deepEqual(cleanSettings('{"mmdc":" /x/mmdc ","puppeteer":"/p.json"}'), { mmdc: "/x/mmdc", puppeteer: "/p.json" });
  assert.deepEqual(cleanSettings("not json"), { mmdc: "", puppeteer: "" });
  assert.deepEqual(cleanSettings(null), { mmdc: "", puppeteer: "" });
  assert.deepEqual(cleanSettings('{"mmdc":5}'), { mmdc: "", puppeteer: "" });
});

test("failureNote is one line, clipped", () => {
  const n = failureNote("Error: boom\n  at x\n" + "y".repeat(500));
  assert.ok(!n.includes("\n"));
  assert.ok(n.length <= 160);
  assert.match(n, /boom/);
  assert.match(failureNote(""), /mmdc/);
});

test("install note names the package and the Chrome setup", () => {
  assert.match(INSTALL_NOTE, /@mermaid-js\/mermaid-cli/);
  assert.match(INSTALL_NOTE, /PUPPETEER_SKIP_DOWNLOAD/);
  assert.match(INSTALL_NOTE, /executablePath/);
});
