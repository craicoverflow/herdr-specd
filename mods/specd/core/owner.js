// Claiming a live agent terminal as a phase's owner. Pure: no herdr, gpui or fs imports.
import { setOwner } from "./state.js";

const agentOf = (p) => p.agent ?? p.agent_status ?? p.agentStatus ?? null;

/**
 * The terminals the person can pick as an owner. `panes` and `tabs` are Herdr's. When any pane says
 * what agent it runs, only those are offered; otherwise every terminal is (Herdr gave no hint).
 * `skip` is a terminal to leave out (the owner that just died, or one already claimed).
 */
export function agentChoices({ panes, tabs, skip }) {
  const withTerminal = (panes ?? []).filter((p) => p.terminal && p.terminal !== skip);
  const known = withTerminal.some((p) => agentOf(p));
  const names = new Map((tabs ?? []).map((t) => [t.id, t.name]));
  return withTerminal
    .filter((p) => !known || agentOf(p))
    .map((p) => {
      const kind = typeof agentOf(p) === "string" ? agentOf(p) : "";
      const tab = names.get(p.tab) ?? p.tab ?? "";
      return { terminal: p.terminal, tab: p.tab, label: [tab, kind].filter(Boolean).join(" · ") || String(p.terminal) };
    });
}

/** The state with `choice` ({terminal, tab}) recorded as the owner of `phase`. No session: we didn't start it. */
export function claimOwner(state, phase, choice, at = Date.now()) {
  if (!choice?.terminal) throw new Error("Pick an agent terminal to claim.");
  const owner = { terminal: choice.terminal, at };
  if (choice.tab !== undefined) owner.tab = choice.tab;
  return setOwner(state, phase, owner);
}

/** Does Submit need to ask who owns the phase? Only when nobody live does and there is someone to pick. */
export const needsOwnerPick = ({ alive, choices }) => !alive && choices.length > 0;
