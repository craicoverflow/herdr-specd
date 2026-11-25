// Pure: no herdr or gpui imports.

// One message for the owner agent: every comment with its lines and the quoted source (at most
// four lines each). `file` is the path relative to the spec's folder.
// comments: [{ lines: [a, b], quote, body }]
export function reviewText(file, round, comments) {
  const n = comments.length;
  const head = `Review of ${file}, round ${round}: ${n} comment${n === 1 ? "" : "s"}.`;
  const body = comments.map((c, i) => {
    const [a, b] = c.lines;
    const quote = c.quote.split("\n").slice(0, 4).map((l) => `   > ${l}`).join("\n");
    return `${i + 1}. ${a === b ? `Line ${a}` : `Lines ${a}-${b}`}\n${quote}\n   ${c.body.replace(/\n/g, "\n   ")}`;
  });
  return [head, ...body, "Please address each comment by number, edit the file in place, and say what changed for each."].join("\n\n");
}
