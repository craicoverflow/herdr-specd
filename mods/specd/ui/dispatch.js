// The dispatch view (S7): errors, or the preview with the review toggle, then the result.
// Describes elements only; nothing runs here.
import { div } from "gpui-kit";
import { settings } from "herdr";
import { v_flex, h_flex, Input } from "gpui-base";
import { ownerBlock } from "./side.js";

const btn = (t, id, label, onClick, primary, disabled) =>
  (disabled
    ? div().id(id).px(10).py(5).rounded(6).text_size(13).bg(t.border).text_color(t.dim)
    : div().id(id).px(10).py(5).rounded(6).cursor_pointer().text_size(13)
        .when(!!primary, (e) => e.bg(t.accent).text_color(t.background))
        .when(!primary, (e) => e.border_1().border_color(t.input).text_color(t.foreground))
        .on_click((_e, cx) => onClick(cx))).child(label);

const shell = (a) => a.map((x) => (/^[\w@%+=:,./<>·-]+$/.test(x) ? x : JSON.stringify(x))).join(" ");
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const fileName = (p) => String(p).split("/").pop();

const MODES = {
  plan: { loading: "Working out the tasks from the spec and plan (one model call, usually 10–20 s)…" },
  spec: { loading: "Working out the tasks from the spec (one model call, usually 10–20 s)…", intro: "The spec is the plan: no plan phase." },
  single: { loading: "Reading the spec…", intro: "The whole spec is one task: no plan phase." },
};

function row({ t, r, p, ref, narrow }) {
  const src = r.item.source ? ` · ${fileName(r.item.source.file)} lines ${r.item.source.startLine}–${r.item.source.endLine}` : "";
  return v_flex().gap(3).p(8).rounded(6).border_1().border_color(t.border)
    .child(h_flex().gap(8).justify_between().flex_wrap()
      .child(div().flex_1().min_w(narrow ? 0 : 120).text_size(13).font_semibold().whitespace_normal().child(`${r.item.id} · ${r.item.title}`))
      .child(div().text_size(11).text_color(t.muted).child(ref ? `${ref}` : r.item.kind)))
    .child(div().text_size(12).text_color(t.muted).whitespace_normal()
      .child(`${r.folder} · after ${r.deps.length ? r.deps.join(", ") : "nothing"} · ${r.model}${r.effort ? ` ${r.effort}` : ""}${src}`))
    .children(r.item.notes ? [div().text_size(12).text_color(t.muted).whitespace_normal().child(`Notes: ${r.item.notes}`)] : [])
    .child(div().text_size(11).text_color(t.dim).whitespace_normal().child(shell(p.add)))
    .child(div().text_size(11).text_color(t.dim).whitespace_normal().child(shell(p.start)));
}

const toggle = (t, on, onToggle) =>
  div().id("review-toggle").cursor_pointer().text_size(13).whitespace_normal().on_click((_e, cx) => onToggle(cx))
    .child(`${on ? "[x]" : "[ ]"} Review each task with /agent-skills:review`);

// Not the list you wanted? Say so and the model works it out again (kept for later re-derives).
function askAgain({ t, d, noteInput, onAskAgain, narrow }) {
  return v_flex().gap(4).pt(4)
    .child(div().text_size(12).text_color(t.muted).child("Not the split you want? Say what to change and ask again."))
    .child((narrow ? v_flex().gap(6) : h_flex().gap(8).items_center())
      .child(div().flex_1().min_w(0).rounded(6).border_1().border_color(t.input).bg(t.background).child(Input.new(noteInput)))
      .child(btn(t, "ask-again", "Ask again", onAskAgain, false, d.running)));
}

/**
 * d: { mode, loading, legacy, errors, warnings, changed, done (left-out items), rows, previews, review,
 * running, finished, error, summary }. summary: dispatchSummary().
 * Handlers: onConfirm, onToggle, onSendToPlan, onRetry, onAskAgain, onClose.
 */
export function dispatchView({ t, d, created, noteInput, onConfirm, onToggle, onSendToPlan, onRetry, onAskAgain, onClose, owner, layout = "wide", onViewSize }) {
  const narrow = layout === "narrow";
  const pad = narrow ? 12 : 16;
  const sized = (el) => (onViewSize ? el.id("dispatch").on_size_change((size, cx) => onViewSize(size.width / (Number(settings().zoom) || 1), cx)) : el);
  const mode = MODES[d.mode] ?? MODES.plan;
  const head = div().text_lg().pb(4).child("Dispatch to Shepherdr");
  if (d.loading) return sized(v_flex().size_full().p(pad).gap(10).child(head).child(div().text_color(t.muted).whitespace_normal().child(d.legacy ? "Checking tasks.json…" : mode.loading)));
  if (d.errors?.length) {
    return sized(v_flex().size_full().p(pad).gap(10).overflow_y_scrollbar().child(head)
      .child(div().text_size(13).text_color(t.blocked).whitespace_normal().child(d.legacy
        ? `${plural(d.errors.length, "error")} in tasks.json. Nothing was created.`
        : "Couldn't work out the tasks. Nothing was created."))
      .children(d.errors.map((e) => div().text_size(13).whitespace_normal().child(`• ${e}`)))
      .children(d.error ? [div().text_size(12).text_color(t.blocked).whitespace_normal().child(d.error)] : [])
      .children(owner?.pick ? [ownerBlock({ t, owner })] : [])
      .child(h_flex().gap(8).pt(4).flex_wrap()
        .children(d.legacy
          ? [btn(t, "send-plan", d.sending ? "Sending…" : "Send to plan agent", onSendToPlan, true, d.sending)]
          : [btn(t, "dispatch-retry", "Try again", onRetry, true)])
        .child(btn(t, "dispatch-close", "Close", onClose))));
  }
  const s = d.summary;
  const started = Boolean(s?.created);
  const body = v_flex().gap(6)
    .children(d.warnings?.length ? d.warnings.map((w) => div().text_size(12).text_color(t.working).child(`Warning: ${w}`)) : [])
    .children(d.rows.map((r, i) => row({ t, r, p: d.previews[i], ref: created?.[r.item.id], narrow })));
  const top = [];
  if (mode.intro) top.push(div().text_size(13).text_color(t.muted).child(mode.intro));
  if (d.changed) top.push(div().text_size(13).text_color(t.working).whitespace_normal().child(d.changed));
  if (d.done?.length) top.push(div().text_size(12).text_color(t.muted).whitespace_normal()
    .child(`Already done, so left out: ${d.done.map((i) => i.title).join("; ")}.`));
  const status = [];
  if (d.error) status.push(div().text_size(13).text_color(t.blocked).whitespace_normal().child(`${d.error}${started ? " Confirm again to finish the rest; what was created is kept." : ""}`));
  if (d.finished) status.push(div().text_size(13).child(`Dispatched: ${s.created} tasks created, ${s.started} started.`));
  else if (started && !d.error) status.push(div().text_size(13).text_color(t.muted).child(`${s.created} of ${s.total} created, ${s.started} started.`));
  for (const h of s?.here ?? []) status.push(div().text_size(13).text_color(t.working).whitespace_normal().child(`Flag: ${h.note}`));
  return sized(v_flex().size_full().p(pad).gap(10).overflow_y_scrollbar().child(head)
    .children(top)
    .child(div().text_size(13).text_color(t.muted).whitespace_normal().child(`${plural(d.rows.length, "item")} to create, in this order. Nothing runs until you confirm.`))
    .children(d.finished ? [] : [toggle(t, d.review, onToggle)])
    .child(body)
    .children(!d.finished && !started && !d.legacy && d.mode !== "single" ? [askAgain({ t, d, noteInput, onAskAgain, narrow })] : [])
    .children(status)
    .child(h_flex().gap(8).pt(4).flex_wrap()
      .children(d.finished ? [] : [btn(t, "dispatch-go", d.running ? (d.checking ? "Checking the plan…" : "Dispatching…") : d.error || started ? "Finish dispatch" : "Confirm", onConfirm, true, d.running)])
      .child(btn(t, "dispatch-close", d.finished ? "Done" : "Cancel", onClose, false, d.running))));
}
