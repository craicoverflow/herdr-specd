// Shepherdr's worker model, read from `herdr-task config --json`. Pure: parsing only.

/** The worker model name in that JSON (settings.worker.model), or null when absent or unreadable. */
export function parseWorkerModel(text) {
  try {
    const model = JSON.parse(text)?.settings?.worker?.model;
    return typeof model === "string" && model.trim() ? model.trim() : null;
  } catch {
    return null;
  }
}

/** Layer for resolveModels: the worker model stands in for the build phase when nothing else sets one. */
export const modelDefaults = (workerModel) => (workerModel ? { build: workerModel } : undefined);
