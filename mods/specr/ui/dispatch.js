// The dispatch view (S7): errors, or the preview with the review toggle, then the result.
// Describes elements only; nothing runs here.
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";

const btn = (t, id, label, onClick, primary, disabled) =>
  (disabled
    ? div().id(id).px(10).py(5).rounded(6).text_size(13).bg(t.border).text_color(t.dim)
    : div().id(id).px(10).py(5).rounded(6).cursor_pointer().text_size(13)
        .when(!!primary, (e) => e.bg(t.accent).text_color(t.background))
        .when(!primary, (e) => e.border_1().border_color(t.input).text_color(t.foreground))
        .on_click((_e, cx) => onClick(cx))).child(label);

const shell = (a) => a.map((x) => (/^[\w@%+=:,./<>·-]+$/.test(x) ? x : JSON.stringify(x))).join(" ");

function row({ t, r, p, ref }) {
  return v_flex().gap(3).p(8).rounded(6).border_1().border_color(t.border)
    .child(h_flex().gap(8).justify_between()
      .child(div().text_size(13).font_semibold().child(`${r.item.id} · ${r.item.title}`))
      .child(div().text_size(11).text_color(t.muted).child(ref ? `${ref}` : r.item.kind)))
    .child(div().text_size(12).text_color(t.muted).whitespace_normal()
      .child(`${r.folder} · after ${r.deps.length ? r.deps.join(", ") : "nothing"} · ${r.model}${r.effort ? ` ${r.effort}` : ""}`))
    .child(div().text_size(11).text_color(t.dim).whitespace_normal().child(shell(p.add)))
    .child(div().text_size(11).text_color(t.dim).whitespace_normal().child(shell(p.start)));
}

const toggle = (t, on, onToggle) =>
  div().id("review-toggle").cursor_pointer().text_size(13).on_click((_e, cx) => onToggle(cx))
    .child(`${on ? "[x]" : "[ ]"} Review each task with /agent-skills:review`);

/**
 * d: { loading, errors, warnings, rows, previews, review, running, done, error, summary, canSend }
 * summary: dispatchSummary(). Handlers: onConfirm, onToggle, onSendToPlan, onClose.
 */
export function dispatchView({ t, d, created, onConfirm, onToggle, onSendToPlan, onClose }) {
  const head = div().text_lg().pb(4).child("Dispatch to Shepherdr");
  if (d.loading) return v_flex().size_full().p(16).gap(10).child(head).child(div().text_color(t.muted).child("Checking tasks.json…"));
  if (d.errors?.length) {
    return v_flex().size_full().p(16).gap(10).overflow_y_scrollbar().child(head)
      .child(div().text_size(13).text_color(t.blocked).child(`${d.errors.length} error${d.errors.length === 1 ? "" : "s"} in tasks.json. Nothing was created.`))
      .children(d.errors.map((e) => div().text_size(13).whitespace_normal().child(`• ${e}`)))
      .children(d.error ? [div().text_size(12).text_color(t.blocked).whitespace_normal().child(d.error)] : [])
      .child(h_flex().gap(8).pt(4)
        .child(btn(t, "send-plan", d.sending ? "Sending…" : "Send to plan agent", onSendToPlan, true, d.sending))
        .child(btn(t, "dispatch-close", "Close", onClose)));
  }
  const s = d.summary;
  const body = v_flex().gap(6)
    .children(d.warnings?.length ? d.warnings.map((w) => div().text_size(12).text_color(t.working).child(`Warning: ${w}`)) : [])
    .children(d.rows.map((r, i) => row({ t, r, p: d.previews[i], ref: created?.[r.item.id] })));
  const status = [];
  if (d.error) status.push(div().text_size(13).text_color(t.blocked).whitespace_normal().child(`${d.error} Confirm again to finish the rest; what was created is kept.`));
  if (d.done) status.push(div().text_size(13).child(`Dispatched: ${s.created} tasks created, ${s.started} started.`));
  else if (s && s.created > 0 && !d.error) status.push(div().text_size(13).text_color(t.muted).child(`${s.created} of ${s.total} created, ${s.started} started.`));
  for (const h of s?.here ?? []) status.push(div().text_size(13).text_color(t.working).whitespace_normal().child(`Flag: ${h.note}`));
  return v_flex().size_full().p(16).gap(10).overflow_y_scrollbar().child(head)
    .child(div().text_size(13).text_color(t.muted).child(`${d.rows.length} item${d.rows.length === 1 ? "" : "s"} to create, in this order. Nothing runs until you confirm.`))
    .children(d.done ? [] : [toggle(t, d.review, onToggle)])
    .child(body)
    .children(status)
    .child(h_flex().gap(8).pt(4)
      .children(d.done ? [] : [btn(t, "dispatch-go", d.running ? "Dispatching…" : d.error || (s && s.created) ? "Finish dispatch" : "Confirm", onConfirm, true, d.running)])
      .child(btn(t, "dispatch-close", d.done ? "Done" : "Cancel", onClose, false, d.running)));
}
