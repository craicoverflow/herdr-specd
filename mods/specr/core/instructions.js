// Text of the {specr.*} blocks. Pure: paths in, strings out.

export function specInstructions({ specPath }) {
  return [
    "specr is this project's spec system (an external spec tool). Do not write SPEC.md at the repo root.",
    `Write the spec to exactly this path: ${specPath}`,
    "If a spec already exists elsewhere, write a delta spec at that path instead; do not edit the other file.",
  ].join("\n");
}

/**
 * tasks.json version 1, as an example the plan agent can copy. It is what core/tasks.js validates:
 * test/instructions.test.mjs runs it through validateTasks so the two can't drift apart.
 */
export function tasksExample(id) {
  return {
    tasks: 1,
    spec: id,
    items: [
      { id: "t1", kind: "task", title: "Add the endpoint", repo: ".", section: "Task 1: Add the endpoint", deps: [] },
      { id: "t2", kind: "task", title: "Show the badge", repo: ".", section: "Task 2: Show the badge", deps: ["t1"] },
      { id: "c1", kind: "checkpoint", title: "Checkpoint: Foundation", repo: ".", deps: ["t1", "t2"], checks: ["Tests pass", "The badge shows Up"] },
    ],
  };
}

export function planInstructions({ id, specPath, planPath, tasksPath }) {
  return [
    "specr is the external tracker for this plan's task list.",
    `Write the plan to exactly this path: ${planPath}`,
    `Its first line must be: Source spec: ${specPath}`,
    "Give each task its own section headed \"## Task N: <title>\" (for example \"## Task 1: Add the endpoint\").",
    `Record every task and checkpoint in ${tasksPath} instead of tasks/todo.md. Do not create tasks/todo.md.`,
    "Keep the plan's Task List as an ordered index of item IDs (t1, t2, c1).",
    "",
    `${tasksPath} must have exactly this shape (specr checks it before anything is dispatched; nothing else is needed):`,
    JSON.stringify(tasksExample(id), null, 2),
    "",
    "Rules:",
    `- "tasks" is 1 and "spec" is the spec's ID, ${id}.`,
    '- "id": lowercase letters, digits and dashes, unique (t1, t2, c1).',
    '- "kind": "task" or "checkpoint".',
    '- "repo": the git repository the item runs in, as a path relative to the folder this spec lives in ("." when that folder is the repository).',
    '- "section" (tasks only): the exact text of that task\'s heading in the plan, without the "## ".',
    '- "deps": the ids of items that must be done first; no cycles.',
    '- A checkpoint has at least one dep and at least one entry in "checks".',
  ].join("\n");
}

export function taskInstructions({ specPath, planPath, section }) {
  return [
    `Spec: ${specPath}`,
    `Plan: ${planPath}`,
    `Build only this task: the plan's section "${section}". Do not start other tasks from the plan, even small ones.`,
    "Don't mark this or any other task complete in plan.md, tasks/todo.md or any checklist. Shepherdr tracks status, and other workers build other tasks in parallel.",
    "When it's committed and its verification passes, run `herdr-task ready`.",
  ].join("\n");
}

export function checkpointInstructions({ specPath, planPath, title, checks }) {
  return [
    `Spec: ${specPath}`,
    `Plan: ${planPath}`,
    `This is the checkpoint "${title}". Run these checks and change nothing:`,
    ...checks.map((c) => `- ${c}`),
    "Report what passed and what failed. Don't mark anything complete in plan.md, tasks/todo.md or any checklist.",
  ].join("\n");
}
