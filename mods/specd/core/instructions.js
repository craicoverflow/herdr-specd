// Text of the {specd.*} blocks. Pure: paths in, strings out.

export function specInstructions({ specPath }) {
  return [
    "specd is this project's spec system (an external spec tool). Do not write SPEC.md at the repo root.",
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

export function planInstructions({ specPath, planPath, tasksPath }) {
  return [
    `Plan the spec at ${specPath}.`,
    `Save the plan to ${planPath} and the task list to ${tasksPath}.`,
  ].join("\n");
}

export function taskInstructions({ specPath, planPath, section, source }) {
  const focus = source
    ? `Build only this task: "${section}" (${source.file}, lines ${source.startLine}-${source.endLine}, quoted below). Do not start other tasks from the plan, even small ones.`
    : `Build only this task: the plan's section "${section}". Do not start other tasks from the plan, even small ones.`;
  return [
    `Spec: ${specPath}`,
    ...(planPath && planPath !== specPath ? [`Plan: ${planPath}`] : []),
    focus,
    "Don't mark this or any other task complete in plan.md, tasks/todo.md or any checklist. Shepherdr tracks status, and other workers build other tasks in parallel.",
    "When it's committed and its verification passes, run `herdr-task ready`.",
  ].join("\n");
}

export function checkpointInstructions({ specPath, planPath, title, checks }) {
  return [
    `Spec: ${specPath}`,
    ...(planPath && planPath !== specPath ? [`Plan: ${planPath}`] : []),
    `This is the checkpoint "${title}". Run these checks and change nothing:`,
    ...checks.map((c) => `- ${c}`),
    "Report what passed and what failed. Don't mark anything complete in plan.md, tasks/todo.md or any checklist.",
  ].join("\n");
}
