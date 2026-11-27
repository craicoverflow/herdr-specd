// The comment side panel: selection and comment box, then the pending comments. Elements only.
import { div } from "gpui-kit";
import { v_flex, h_flex, Input } from "gpui-base";

const range = (lines) => (lines[0] === lines[1] ? `Line ${lines[0]}` : `Lines ${lines[0]}-${lines[1]}`);
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const box = (t, state) => div().w_full().rounded(6).border_1().border_color(t.input).bg(t.background).child(Input.new(state));
const link = (t, id, label, onClick, hoverColor) =>
  div().id(id).text_size(12).text_color(t.muted).cursor_pointer().hover((e) => e.text_color(hoverColor ?? t.foreground))
    .on_click((_e, cx) => onClick(cx)).child(label);

function selection({ t, sel, input }) {
  if (!sel) return div().text_size(13).text_color(t.muted).whitespace_normal().child("Select text in the document to comment on it.");
  if (!sel.ok) return div().text_size(13).text_color(t.blocked).whitespace_normal().child(sel.reason);
  return v_flex().gap(6)
    .child(div().text_size(13).font_semibold().child(range(sel.lines)))
    .child(div().text_size(12).text_color(t.muted).whitespace_normal().child(clip(sel.quote, 160)))
    .child(box(t, input))
    .child(div().text_size(11).text_color(t.dim).child("Enter adds the comment"));
}

function card({ t, c, i, editing, editInput, onJump, onEdit, onRemove }) {
  const head = h_flex().justify_between().gap(8)
    .child(div().id(`jump-${i}`).text_size(12).font_semibold().cursor_pointer().on_click((_e, cx) => onJump(i, cx)).child(range(c.lines)))
    .child(h_flex().gap(10)
      .child(link(t, `edit-${i}`, "edit", (cx) => onEdit(i, cx)))
      .child(link(t, `rm-${i}`, "remove", (cx) => onRemove(i, cx), t.blocked)));
  return v_flex().gap(4).p(8).rounded(6).bg(t.background).border_1().border_color(t.border)
    .child(head)
    .child(div().text_size(12).text_color(t.dim).whitespace_normal().child(`> ${clip(c.quote.split("\n")[0], 80)}`))
    .child(editing === i
      ? v_flex().gap(4).child(box(t, editInput)).child(div().text_size(11).text_color(t.dim).child("Enter saves"))
      : div().text_size(13).whitespace_normal().child(c.body));
}

function submitButton({ t, pending, status, submitting, onSubmit }) {
  const ok = pending.length > 0 && status === "review" && !submitting;
  const b = div().id("submit").w_full().py(6).rounded(6).text_size(13).font_semibold().text_center()
    .bg(ok ? t.accent : t.border).text_color(ok ? t.background : t.dim);
  const label = submitting ? "Submitting…" : `Submit ${pending.length} comment${pending.length === 1 ? "" : "s"}`;
  return (ok ? b.cursor_pointer().on_click((_e, cx) => onSubmit(cx)) : b).child(label);
}

function approveButton({ t, approveBlock, approving, onApprove, approveLabel }) {
  const ok = !approveBlock && !approving;
  const b = div().id("approve").w_full().py(6).rounded(6).text_size(13).font_semibold().text_center()
    .bg(ok ? t.accent : t.border).text_color(ok ? t.background : t.dim);
  const button = (ok ? b.cursor_pointer().on_click((_e, cx) => onApprove(cx)) : b).child(approving ? "Approving…" : approveLabel ?? "Approve spec");
  return v_flex().gap(4).child(button)
    .children(approveBlock ? [div().text_size(11).text_color(t.muted).whitespace_normal().child(approveBlock)] : []);
}

// A spec in review can skip the plan phase: its own text is the plan, or the whole spec is one task.
function skipButtons({ t, approveBlock, approving, onSkip }) {
  if (!onSkip || approveBlock) return [];
  const b = (id, label, mode) => div().id(id).w_full().py(5).rounded(6).text_size(12).text_center().border_1().border_color(t.input)
    .when(!approving, (e) => e.cursor_pointer().hover((x) => x.bg(t.background)).on_click((_e, cx) => onSkip(mode, cx))).child(label);
  return [v_flex().gap(4)
    .child(div().text_size(11).text_color(t.muted).whitespace_normal().child("Or skip planning:"))
    .child(b("skip-as-plan", "Use the spec as the plan", "spec"))
    .child(b("skip-single", "Dispatch as one task", "single"))];
}

// Who owns this phase, and the pick list when Submit (or the Owner link) asks.
export function ownerBlock({ t, owner }) {
  const row = (id, text, onClick) => div().id(id).w_full().py(4).px(8).rounded(6).border_1().border_color(t.border).text_size(12)
    .cursor_pointer().hover((e) => e.bg(t.background)).on_click((_e, cx) => onClick(cx)).child(text);
  if (!owner.pick) {
    return h_flex().gap(8).child(div().text_size(12).text_color(t.muted).child(`Owner: ${owner.label}`)).child(link(t, "owner-set", "set", owner.onOpen));
  }
  return v_flex().gap(4)
    .child(div().text_size(12).text_color(t.muted).whitespace_normal().child(owner.pick.title ?? (owner.pick.resume ? "Send this review to which agent?" : "Which agent owns this document?")))
    .children(owner.pick.choices.map((c, i) => row(`owner-${i}`, c.label, (cx) => owner.onPick(c, cx))))
    .children(owner.pick.resume ? [row("owner-new", "Start a new agent", owner.onNew)] : [])
    .child(link(t, "owner-cancel", "cancel", owner.onCancel));
}

const STATUS = { anchored: "anchored", moved: "moved?", outdated: "outdated" };

// Last round's comments, read-only, each with where it landed in the current file.
function lastRoundCard({ t, c, i }) {
  const color = c.status === "outdated" ? t.blocked : c.status === "moved" ? t.working : t.muted;
  return v_flex().gap(4).p(8).rounded(6).border_1().border_color(t.border)
    .child(h_flex().justify_between().gap(8)
      .child(div().text_size(12).font_semibold().text_color(t.muted).child(c.status === "outdated" ? `Was ${range(c.lines)}` : range(c.lines)))
      .child(div().id(`last-${i}`).text_size(11).font_semibold().text_color(color).child(STATUS[c.status])))
    .child(div().text_size(12).text_color(t.dim).whitespace_normal().child(`> ${clip(c.quote.split("\n")[0], 80)}`))
    .child(div().text_size(13).text_color(t.muted).whitespace_normal().child(c.body));
}

export function sidePanel(p) {
  const { t, pending, error } = p;
  const label = (s) => div().text_size(11).font_semibold().text_color(t.dim).child(s.toUpperCase());
  return v_flex().id("side").w(300).flex_none().h_full().overflow_y_scrollbar().border_l_1().border_color(t.border).bg(t.surface).p(14).gap(12)
    .child(label("Selection"))
    .child(selection({ t, sel: p.sel, input: p.input }))
    .child(label(`Pending comments · ${pending.length}`))
    .children(pending.length ? pending.map((c, i) => card({ ...p, c, i })) : [div().text_size(13).text_color(t.muted).child("None yet.")])
    .children(p.changes?.comments.length ? [label(`Last round · ${p.changes.comments.length}`)] : [])
    .children((p.changes?.comments ?? []).map((c, i) => lastRoundCard({ t, c, i })))
    .children(p.owner ? [ownerBlock(p)] : [])
    .children(pending.length || p.submitting ? [submitButton(p)] : [])
    .children(p.onApprove ? [approveButton(p)] : [])
    .children(skipButtons(p))
    .children(error ? [div().text_size(12).text_color(t.blocked).whitespace_normal().child(error)] : []);
}
