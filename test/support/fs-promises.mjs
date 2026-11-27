// Herdr's fs/promises: node's, plus exists(path) -> boolean.
import * as fsp from "node:fs/promises";
export * from "node:fs/promises";
export async function exists(p) { try { await fsp.access(p); return true; } catch { return false; } }
export default { ...fsp, exists };
