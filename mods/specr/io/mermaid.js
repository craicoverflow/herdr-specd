// Rendering mermaid pieces to PNG with mmdc. Effects live here; the logic is in core/diagram.js.
// Work only starts from init, a timer or an event handler, never from render() (spike finding).
import * as fs from "fs/promises";
import { exec, appHome, settings } from "herdr";
import { cacheKey, mmdcArgs, pngSize, cleanSettings, failureNote } from "../core/diagram.js";

const MOD_DIR = "mods/specr";
const SETTINGS_KEY = "specr.diagram.settings";

export function loadSettings() {
  try {
    return cleanSettings(localStorage.getItem(SETTINGS_KEY));
  } catch {
    return cleanSettings(null);
  }
}

export function saveSettings(s) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(cleanSettings(JSON.stringify(s))));
  } catch {
    /* storage can be unavailable: the settings then last for this run only */
  }
}

export const isDark = () => Boolean(settings().dark);

export class Diagrams {
  constructor() {
    this.pics = new Map(); // key -> { state: "ready" | "failed", path, w, h, error }
    this.settings = loadSettings();
    this.missing = false; // mmdc couldn't be found on the last look
    this.busy = false;
    this.again = false; // a drain was asked for while one ran
    this.dark = isDark();
  }

  keyFor(code, dark = this.dark) {
    return cacheKey(code, dark);
  }

  pic(code) {
    return this.pics.get(this.keyFor(code)) ?? null;
  }

  // The mmdc to run: the configured path, else the first on PATH (through a shell, so the user's PATH applies).
  async findMmdc() {
    if (this.settings.mmdc) return this.settings.mmdc;
    try {
      const r = await exec("/bin/sh", ["-c", "command -v mmdc"], { timeout: 10000 });
      const path = r.code === 0 ? r.stdout.trim().split("\n")[0] : "";
      return path || null;
    } catch {
      return null;
    }
  }

  update(settingsNext) {
    this.settings = cleanSettings(JSON.stringify(settingsNext));
    saveSettings(this.settings);
    for (const [k, p] of this.pics) if (p.state === "failed") this.pics.delete(k);
    this.missing = false;
  }

  // Render every diagram that is missing for the current theme, one at a time (one Chrome at a time).
  // `codes` is a function so a drain that outlives a reload sees the current diagrams.
  async drain(codes, cx) {
    if (this.busy) {
      this.again = true;
      return;
    }
    this.busy = true;
    try {
      do {
        this.again = false;
        this.dark = isDark();
        const todo = [...new Set(codes())].filter((c) => this.pics.get(this.keyFor(c))?.state !== "ready" && !this.pics.get(this.keyFor(c)));
        if (!todo.length) break;
        const mmdc = await this.findMmdc();
        this.missing = !mmdc;
        cx.notify();
        if (!mmdc) break;
        for (const code of todo) {
          const dark = this.dark;
          this.pics.set(cacheKey(code, dark), await this.draw(mmdc, code, dark));
          cx.notify();
        }
      } while (this.again);
    } finally {
      this.busy = false;
    }
  }

  async draw(mmdc, code, dark) {
    const key = cacheKey(code, dark);
    const rel = `${MOD_DIR}/.cache`;
    const dir = `${appHome()}/${rel}`;
    const png = `${dir}/${key}.png`;
    try {
      await fs.mkdir(dir, { recursive: true });
      if (!(await fs.exists(png))) {
        const mmd = `${dir}/${key}.mmd`;
        await fs.writeFile(mmd, code);
        const r = await exec(mmdc, mmdcArgs({ input: mmd, output: png, dark, puppeteer: this.settings.puppeteer }), { timeout: 90000 });
        if (r.code !== 0) return { state: "failed", error: failureNote(r.stderr || r.stdout) };
      }
      const size = pngSize(await fs.readFile(png));
      if (!size) return { state: "failed", error: "mmdc wrote no usable picture" };
      return { state: "ready", path: `${rel}/${key}.png`, ...size };
    } catch (e) {
      return { state: "failed", error: failureNote(e?.message ?? e) };
    }
  }
}
