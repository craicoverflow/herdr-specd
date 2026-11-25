// Text of the {specr.*} blocks. Pure: paths in, strings out.

export function specInstructions({ specPath }) {
  return [
    "specr is this project's spec system (an external spec tool). Do not write SPEC.md at the repo root.",
    `Write the spec to exactly this path: ${specPath}`,
    "If a spec already exists elsewhere, write a delta spec at that path instead; do not edit the other file.",
  ].join("\n");
}

export function planInstructions({ specPath, planPath, tasksPath }) {
  return [
    "specr is the external tracker for this plan's task list.",
    `Write the plan to exactly this path: ${planPath}`,
    `Its first line must be: Source spec: ${specPath}`,
    `Record every task and checkpoint in ${tasksPath} (tasks.json, version 1) instead of tasks/todo.md. Do not create tasks/todo.md.`,
    "Keep the plan's Task List as an ordered index of item IDs (t1, t2, c1).",
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
