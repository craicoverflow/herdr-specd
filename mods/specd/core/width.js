// One width rule for the review view: below BREAKPOINT the comment column folds under the document.
export const BREAKPOINT = 640;

/** "wide" (comment column beside the document) or "narrow" (under it). Unknown widths count as wide. */
export function layoutFor(width) {
  return Number(width) > 0 && Number(width) < BREAKPOINT ? "narrow" : "wide";
}

/** How the review body is arranged: its flow direction and the order of its columns. */
export function reviewColumns(layout) {
  return layout === "narrow"
    ? { direction: "column", order: ["document", "comments"] }
    : { direction: "row", order: ["document", "comments"] };
}

/** The list's Phase/Pending/Tasks columns fold into a second line under the title when narrow. */
export function listFolds(layout) {
  return layout === "narrow";
}

/** Form geometry: wide keeps a label column and fixed field widths; narrow stacks label over a full-width field. */
export function formShape(layout) {
  return layout === "narrow"
    ? { stacked: true, labelW: null, fieldW: null, briefW: null }
    : { stacked: false, labelW: 110, fieldW: 240, briefW: 520 };
}
