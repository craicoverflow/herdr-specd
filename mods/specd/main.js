// specd: review specs and plans, then dispatch their tasks.
// Never start async work from render(): work starts in init, timers or commands.
import { View, div } from "gpui-kit";
import { ScrollHandle, InputState } from "gpui-base";
import { readTextFile, focused, spaces, props, panes, run, shared, setShared, theme, nextCommand, watchFolder, window, notify, openOverlay, closeOverlay, checking, pickFiles, pickFolder } from "herdr";
import { pieces } from "./core/pieces.js";
import { placeFor, isTabCopy, commandOf, requestFor, takeRequest, tabHost, folderFor } from "./core/place.js";
import { roundChanges } from "./core/rounds.js";
import { loadSpecs, loadSpec, saveState, createState, usedIds, lastRound, specsDir, adoptFiles, saveRound, scanFound, dismissFound, adoptFound, relocatePlan, plansNaming } from "./io/files.js";
import { adapterFor, defaultAdapter, loadAdapterById, folderConfig, ownerAlive, liveAgents, startAgent, sendMessage } from "./io/agents.js";
import { reviewText } from "./core/review.js";
import { firstMessage } from "./core/submit.js";
import { claimOwner, needsOwnerPick } from "./core/owner.js";
import { submitReview, setOwner, approve as approveState, shownDocPath, skipPlan } from "./core/state.js";
import { suggestId } from "./core/adopt.js";
import { unseen, suggestId as suggestFromHeading } from "./core/found.js";
import { adoptView } from "./ui/adopt.js";
import { newView } from "./ui/new.js";
import { planNewSpec, autoReview, planApproval, approveBlock } from "./core/newspec.js";
import { planNote } from "./core/tasks.js";
import { sameList } from "./core/manifest.js";
import { loadPlanned, loadBuildItems, claudeLlm } from "./io/manifest.js";
import { lineStarts } from "./core/anchors.js";
import { addComment, editComment, removeComment, pieceIndexAt, selectionAnchor } from "./core/comments.js";
import { list } from "./ui/list.js";
import { documentView } from "./ui/document.js";
import { layoutFor } from "./core/width.js";
import { Diagrams, isDark } from "./io/mermaid.js";
import { zoomView } from "./ui/diagram.js";
import { dispatchView } from "./ui/dispatch.js";
import { dispatchRows, previewArgvs, runDispatch, dispatchSummary, errorsMessage } from "./core/dispatch.js";
import { addTask, startTask, writePromptFile, parentMode, listTasks, workerModel } from "./io/herdr-task.js";
import { buildView } from "./ui/build.js";
import { buildGroups, repoFolders, shouldPoll, POLL_MS as BUILD_POLL_MS } from "./core/build.js";

const POLL_MS = 1000; // a safety net under watchFolder: the view is never more than this stale
const RELOCATE_MS = 10000; // how often a missing plan is looked for elsewhere (it walks the folder)

export default class Specd extends View {
  init(_props, cx) {
    // The terminal that was focused when the palette entry ran (or a folder given as a prop).
    // A new tab has no terminal yet, so fall back to the folder of the space it opened in.
    this.folder = folderFor({ prop: props()?.folder, focused: focused(), spaces: spaces() });
    this.specs = [];
    this.errors = [];
    this.found = []; // specs written outside specd (S11)
    this.announced = new Set(); // found paths already notified
    this.selected = null; // spec ID
    this.spec = null; // { state, path, doc }
    this.pieces = [];
    this.changes = null; // S5: the diff against last round's copy
    this.changedOnly = false;
    this.error = null;
    this.scroll = ScrollHandle.new();
    this.at = 0; // piece index for the `next` dev command
    this.sel = null; // the last settled selection as an anchor (ok) or { ok: false, reason }
    this.editing = null; // index of the pending comment being edited
    this.noteError = null;
    this.ownerPick = null; // the open owner picker: { choices, resume, phase, title }
    this.dispatching = null; // S7: the dispatch view's data
    this.llm = claudeLlm; // the model call that makes a dispatch list (a seam for headless tests)
    this.noteInput = InputState.new({ placeholder: "e.g. one task per phase; keep the migration on its own" });
    this.noteInput.on("submit", (_e, cx) => this.askAgain(cx));
    // A natural-size diagram window is this same mod opened with a `diagram` prop: it shows the picture only.
    this.zoom = props()?.diagram ?? null;
    if (this.zoom) return;
    // In the `specd` layout a copy that opened as a tab (a palette command) hands its request to
    // the panel copy and closes its own tab; the panel copy takes it in pollRequest.
    const place = placeFor(shared("layout"));
    if (place === "panel" && isTabCopy(props())) {
      this.handOff(cx);
      return;
    }
    this.lastReq = 0;
    // The panel copy follows the focused space; a tab copy keeps the folder it opened with.
    this.follow = place === "panel" && !isTabCopy(props());
    this.diagrams = new Diagrams();
    this.docW = 800;
    this.viewW = 900;
    this.settingsOpen = false;
    this.mmdcInput = InputState.new({ placeholder: "mmdc" });
    this.mmdcInput.set_value(this.diagrams.settings.mmdc);
    this.puppeteerInput = InputState.new({ placeholder: "/path/to/puppeteer.json" });
    this.puppeteerInput.set_value(this.diagrams.settings.puppeteer);
    this.input = InputState.new({ placeholder: "Comment on the selection" });
    this.input.on("submit", (_e, cx) => this.add(cx));
    this.editInput = InputState.new({ placeholder: "Edit the comment" });
    this.editInput.on("submit", (_e, cx) => this.saveEdit(cx));
    this.adopting = props()?.adopt ? { spec: null, plan: null, tasks: null } : null; // the adopt form's picked files
    this.adoptInput = InputState.new({ placeholder: "PROJ-9" });
    this.adoptError = null;
    this.adoptInput.on("submit", (_e, cx) => this.submitAdopt(cx));
    this.newInputs = {
      id: InputState.new({ placeholder: "PROJ-9" }),
      brief: InputState.new({ placeholder: "What should be built?" }),
      model: InputState.new({ placeholder: "opus" }),
      effort: InputState.new({ placeholder: "high" }),
    };
    this.creating = props()?.new ? { adapter: "agent-skills", folder: this.folder } : null; // the New spec dialog
    this.newError = null;
    this.newInputs.id.on("submit", (_e, cx) => this.startNew(cx));
    this.newInputs.brief.on("submit", (_e, cx) => this.startNew(cx));
    if (this.creating) cx.spawn(async (cx) => { await this.fillModels(); cx.notify(); });
    if (place === "panel") {
      // A request written before this copy started (its stack child wasn't running) is taken now,
      // later ones on the poll.
      const poll = (cx) => cx.spawn(async (cx) => {
        const moved = this.syncFolder(cx);
        if ((await this.pollRequest(cx)) || moved) cx.notify();
      });
      poll(cx);
      cx.timer.every(POLL_MS, poll);
    }
    if (!this.folder && !this.follow) return;

    cx.spawn(async (cx) => {
      await this.reload();
      cx.notify();
    });
    this.startWatch(cx);
    cx.timer.every(POLL_MS, (cx) => {
      this.syncFolder(cx);
      cx.spawn(async (cx) => {
        if (await this.reload()) cx.notify();
      });
      // A theme switch is noticed here and the diagrams are drawn again in the other theme.
      if (this.diagramsDirty || isDark() !== this.diagrams.dark) {
        this.diagramsDirty = false;
        this.renderDiagrams(cx);
      }
    });
    // S9: poll Shepherdr every 10 s, only while the window is visible and the spec is in build.
    cx.timer.every(BUILD_POLL_MS, (cx) => {
      cx.spawn(async (cx) => { await this.pollBuild(); cx.notify(); });
    });
    // Dev command loop: herdr-app do specd.<top|open-first|next|back>
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        await this.command(c, cx);
        cx.notify();
      }
    });
  }

  // Folder watch: reload as soon as something under .specd or the shown document's folder changes.
  // A new watch (generation) starts when the folder changes; the old one ends when it next fires.
  startWatch(cx) {
    const gen = (this.watchGen = (this.watchGen ?? 0) + 1);
    const dir = this.watchDir();
    if (!dir) return;
    cx.spawn(async (cx) => {
      while (gen === this.watchGen) {
        try {
          await watchFolder(this.watchDir());
        } catch {
          return; // the watch was refused (too many folders): the timer keeps the view fresh
        }
        if (gen !== this.watchGen) return;
        if (await this.reload()) cx.notify();
      }
    });
  }

  // Panel copy: take the focused space's folder while at the list. With a spec, the New spec form
  // or the Adopt form open the folder stays until Back or Cancel. True when the folder changed.
  syncFolder(cx) {
    if (!this.follow || this.zoom || this.selected != null || this.creating || this.adopting) return false;
    const next = folderFor({ prop: props()?.folder, focused: focused(), spaces: spaces() });
    if (next === this.folder || (next == null && this.folder)) return false; // focus on a pane with no folder keeps the last one
    this.folder = next;
    this.specs = [];
    this.errors = [];
    this.found = [];
    this.listKey = null;
    this.startWatch(cx);
    cx.spawn(async (cx) => { if (await this.reload()) cx.notify(); });
    return true;
  }

  // Tab copy in the `specd` layout: write the request, show and select the panel's specd child,
  // then close this tab. The focused tab is only this one a moment after init, so it is read then.
  handOff(cx) {
    this.handedOff = true;
    setShared("specd.request", requestFor(commandOf(props()), props(), Date.now()));
    run("layout.show", { id: "panel" });
    run("layout.select", { stack: "panel-body", child: "specd" });
    cx.spawn(async (cx) => {
      await cx.sleep(300);
      const tab = tabHost(panes(), focused()?.tab);
      if (tab) run("tab.close", { id: tab });
    });
  }

  // Panel copy: act on a fresh request from a tab copy. True when one was taken.
  async pollRequest(cx) {
    const r = takeRequest(shared("specd.request"), this.lastReq, Date.now());
    if (!r) return false;
    this.lastReq = r.at;
    this.creating = null;
    this.adopting = null;
    this.newError = null;
    this.adoptError = null;
    if (r.cmd === "open") {
      if (this.folder) await this.back();
      else { this.selected = null; this.spec = null; }
    } else await this.command(r.cmd, cx);
    return true;
  }

  // Draw the shown document's diagrams (one at a time). Called from init's tasks, timers and
  // handlers only, never from render().
  renderDiagrams(cx) {
    if (checking() || !this.pieces.some((p) => p.kind === "mermaid")) return;
    cx.spawn(async (cx) => {
      await this.diagrams.drain(() => this.pieces.filter((p) => p.kind === "mermaid").map((p) => p.code), cx);
    });
  }

  openZoom(pic, cx) {
    openOverlay({ mod: "specd", kind: "window", key: "specd-diagram", width: 0.8, height: 0.8, props: { diagram: pic } });
    cx.notify();
  }

  saveDiagramSettings(cx) {
    this.diagrams.update({ mmdc: this.mmdcInput.value(), puppeteer: this.puppeteerInput.value() });
    this.settingsOpen = false;
    this.renderDiagrams(cx);
    cx.notify();
  }

  watchDir() {
    return this.spec?.path ? this.spec.path.replace(/\/[^/]*$/, "") : this.folder;
  }

  // Reads the folder again; true when something changed (so the caller notifies).
  async reload() {
    if (this.busy || this.saving || !this.folder) return false;
    this.busy = true;
    try {
      let changed = false;
      if (this.selected == null) {
        const { summaries, errors } = await loadSpecs(this.folder);
        const next = JSON.stringify([summaries, errors]);
        changed = next !== this.listKey;
        this.listKey = next;
        this.specs = summaries;
        this.errors = errors;
        if (await this.scan(summaries)) changed = true;
      } else {
        try {
          let spec = await loadSpec(this.folder, this.selected);
          if (await this.relocate(spec)) spec = await loadSpec(this.folder, this.selected);
          const last = await lastRound(this.folder, spec.state);
          const ready = autoReview(spec.state, spec.doc, last?.doc ?? null);
          if (ready) {
            await saveState(this.folder, ready);
            spec.state = ready;
          }
          if (spec.doc !== this.spec?.doc || JSON.stringify(spec.state) !== JSON.stringify(this.spec?.state)) {
            this.spec = spec;
            this.pieces = spec.doc == null ? [] : pieces(spec.doc);
            this.changes = last && spec.doc != null && spec.state.status === "review" ? roundChanges(last.doc, spec.doc, last.comments) : null;
            this.error = null;
            changed = true;
            this.diagramsDirty = true;
            this.build = null;
            await this.pollBuild(); // first fill; reload only runs from tasks and timers
          }
        } catch (e) {
          if (this.error !== String(e.message)) changed = true;
          this.error = String(e.message);
        }
      }
      return changed;
    } finally {
      this.busy = false;
    }
  }

  // The plan agent saved its plan somewhere else than asked: find it by its `Source spec:` line and
  // record where it is. Throttled, since it walks the folder. True when the state was saved.
  async relocate(spec) {
    if (spec.state.phase !== "plan" || spec.doc != null || Date.now() - (this.relocatedAt ?? 0) < RELOCATE_MS) return false;
    this.relocatedAt = Date.now();
    const moved = await relocatePlan(this.folder, spec.state);
    if (!moved) return false;
    await saveState(this.folder, moved);
    notify({ title: `Found the plan for ${moved.id}`, body: moved.paths.plan, level: "info" });
    return true;
  }

  // S11: look for specs nobody registered; one notification per new path. True when the list changed.
  async scan(summaries) {
    let found;
    try {
      this.adapter ??= await defaultAdapter();
      found = await scanFound(this.folder, this.adapter, summaries.map((s) => s.specPath).filter(Boolean));
    } catch {
      return false;
    }
    for (const f of unseen(found, this.announced)) {
      this.announced.add(f.path);
      notify({ title: `New spec found: ${f.path.split("/").pop()}`, body: f.path, level: "info" });
    }
    const key = JSON.stringify(found);
    const changed = key !== this.foundKey;
    this.foundKey = key;
    this.found = found;
    return changed;
  }

  dismissFound(f, cx) {
    cx.spawn(async (cx) => {
      try {
        await dismissFound(this.folder, f.path);
      } catch (e) {
        this.noteError = `Couldn't dismiss: ${e.message ?? e}`;
      }
      this.listKey = null;
      if (await this.reload()) cx.notify();
    });
  }

  // Adopt a found spec: straight away when the path names the ID, else ask (prefilled).
  adoptFound(f, cx) {
    cx.spawn(async (cx) => {
      try {
        if (f.id) {
          const state = await adoptFound(this.folder, this.adapter, f, f.id);
          await this.open(state.id);
        } else {
          const text = await readTextFile(`${this.folder}/${f.path}`);
          this.adopting = { spec: `${this.folder}/${f.path}`, plan: null, tasks: null, found: f };
          this.adoptInput.set_value(suggestFromHeading(text ?? ""));
          this.adoptError = null;
        }
      } catch (e) {
        this.adoptError = String(e?.message ?? e);
        this.listKey = null;
      }
      cx.notify();
    });
  }

  // ---- comments: handlers run from events, never from render() ---------------------------------

  onSelect(i, selection, cx) {
    if (!selection) return; // keep the last selection: clicking the comment box clears it
    this.sel = selectionAnchor(this.spec.doc, this.starts(), this.pieces[i], selection.range);
    if (this.sel.ok) this.input.focus();
    cx.notify();
  }

  starts() {
    if (this.startsDoc !== this.spec.doc) {
      this.startsDoc = this.spec.doc;
      this.startsCache = lineStarts(this.spec.doc);
    }
    return this.startsCache;
  }

  add(cx) {
    if (!this.sel?.ok) return;
    this.change(cx, (s) => addComment(s, this.sel, this.input.value()), () => {
      this.input.set_value("");
      this.sel = null;
    });
  }

  edit(i, cx) {
    this.editing = i;
    this.editInput.set_value(this.spec.state.pending[i].body);
    this.editInput.focus();
    cx.notify();
  }

  saveEdit(cx) {
    if (this.editing == null) return;
    const i = this.editing;
    this.change(cx, (s) => editComment(s, i, this.editInput.value()), () => { this.editing = null; });
  }

  remove(i, cx) {
    this.change(cx, (s) => removeComment(s, i), () => { this.editing = null; });
  }

  jump(i, cx) {
    const at = pieceIndexAt(this.pieces, this.spec.state.pending[i].start);
    if (at >= 0) this.scroll.scroll_to_item(at);
    cx.notify();
  }

  // Apply a pure state change, show it at once, and save it. A refused change shows its reason;
  // a failed save puts the on-disk state back so the panel never shows what isn't saved.
  change(cx, fn, after) {
    let next;
    try {
      next = fn(this.spec.state);
    } catch (e) {
      this.noteError = String(e.message);
      cx.notify();
      return;
    }
    const prev = this.spec.state;
    this.spec = { ...this.spec, state: next };
    this.noteError = null;
    after();
    cx.notify();
    this.saving = true;
    cx.spawn(async (cx) => {
      try {
        await saveState(this.folder, next);
      } catch (e) {
        this.spec = { ...this.spec, state: prev };
        this.noteError = `Couldn't save the comments: ${e.message ?? e}`;
      } finally {
        this.saving = false;
      }
      cx.notify();
    });
  }

  // ---- submit (S4): a handler; nothing is sent anywhere until the person presses Submit ----------

  ownerProps(phase = this.spec.state.phase) {
    const o = this.spec.state.owners?.[phase];
    const label = ownerAlive(o) ? `terminal ${o.terminal}` : "none";
    return { label, pick: this.ownerPick, onOpen: (cx) => this.openOwnerPick(cx), onPick: (c, cx) => this.pickOwner(c, cx),
      onNew: (cx) => this.startNewOwner(cx), onCancel: (cx) => { this.ownerPick = null; cx.notify(); } };
  }

  // ---- owner: claim a live agent terminal as the phase's owner ------------------------------------

  // The picker, when `phase` has no live owner and live agent terminals exist. `resume` is what to
  // run once one is picked ("submit" | "approve" | "errors"); `title` words the question.
  // True when the picker was opened (the caller stops and waits).
  askOwner(cx, phase, resume, title) {
    const owner = this.spec.state.owners?.[phase];
    const choices = ownerAlive(owner) ? [] : liveAgents(owner?.terminal);
    if (!needsOwnerPick({ alive: false, choices })) return false;
    this.ownerPick = { choices, resume, phase, title };
    this.noteError = null;
    cx.notify();
    return true;
  }

  openOwnerPick(cx) {
    if (this.saving || this.submitting) return;
    const { state } = this.spec;
    const owner = state.owners?.[state.phase];
    this.ownerPick = { choices: liveAgents(ownerAlive(owner) ? null : owner?.terminal), resume: null, phase: state.phase };
    cx.notify();
  }

  resumeAfterOwner(cx, resume, fresh) {
    if (resume === "submit") this.submit(cx, fresh);
    else if (resume === "approve") this.approve(cx, fresh);
    else if (resume === "errors") this.sendErrorsToPlan(cx, fresh);
  }

  pickOwner(choice, cx) {
    const pick = this.ownerPick;
    if (!pick || this.saving) return;
    const { state } = this.spec;
    this.saving = true;
    cx.spawn(async (cx) => {
      let failed = null;
      try {
        const next = claimOwner(state, pick.phase ?? state.phase, choice);
        await saveState(this.folder, next);
        this.spec = { ...this.spec, state: next };
        this.ownerPick = null;
        this.noteError = null;
      } catch (e) {
        failed = `Couldn't set the owner: ${e.message ?? e}`;
        this.noteError = failed;
        if (this.dispatching) this.dispatching.error = failed;
      } finally {
        this.saving = false;
      }
      cx.notify();
      if (pick.resume && !failed) this.resumeAfterOwner(cx, pick.resume, false);
    });
  }

  // "Start a new agent": the action goes ahead and opens a tab as before.
  startNewOwner(cx) {
    const resume = this.ownerPick?.resume;
    this.ownerPick = null;
    this.resumeAfterOwner(cx, resume, true);
  }

  submit(cx, fresh = false) {
    if (this.submitting || this.saving) return;
    const { state, doc } = this.spec;
    let out;
    try {
      out = submitReview(state);
      if (doc == null) throw new Error(`The ${state.phase} document isn't there, so there is nothing to keep as this round.`);
    } catch (e) {
      this.noteError = String(e.message);
      cx.notify();
      return;
    }
    if (!fresh && this.askOwner(cx, state.phase, "submit", "Send this review to which agent?")) return;
    this.submitting = true;
    this.saving = true; // the poll must not reload state.json under a half-finished Submit
    this.noteError = null;
    cx.notify();
    cx.spawn(async (cx) => {
      let sent = false;
      try {
        const phase = state.phase;
        const file = state.paths[phase];
        const text = reviewText(file, out.round, out.comments);
        await saveRound(this.folder, state, { doc, comments: out.comments, file });
        let next = out.state;
        const owner = state.owners?.[phase];
        if (ownerAlive(owner)) {
          await sendMessage(owner.terminal, text);
        } else {
          const { adapter, models } = await adapterFor(this.folder, state);
          const started = await startAgent(cx, { folder: this.folder, adapter, model: models[phase], name: `${state.id} ${phase}`, message: firstMessage(file, text) });
          next = setOwner(next, phase, started);
        }
        sent = true;
        await saveState(this.folder, next);
        this.spec = { ...this.spec, state: next };
      } catch (e) {
        this.noteError = sent
          ? `The review was sent, but saving the round failed: ${e.message ?? e}. Don't submit again; remove the comments by hand.`
          : `Couldn't submit: ${e.message ?? e}`;
      } finally {
        this.submitting = false;
        this.saving = false;
      }
      cx.notify();
    });
  }

  // ---- approve (S6): a handler; the plan agent starts only when the person presses Approve -------

  approve(cx, fresh = false) {
    if (this.approving || this.saving) return;
    const { state } = this.spec;
    const block = approveBlock(state);
    if (block) {
      this.noteError = block;
      cx.notify();
      return;
    }
    if (state.phase === "plan") return this.openDispatch(cx, { mode: "plan" });
    if (!fresh && this.askOwner(cx, "plan", "approve", "Send the plan request to which agent?")) return;
    this.approving = true;
    this.saving = true; // the poll must not reload state.json under a half-finished approval
    this.noteError = null;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const { adapter } = await adapterFor(this.folder, state);
        const config = await folderConfig(this.folder);
        const plan = planApproval({ adapter, state, config });
        const planSeen = await plansNaming(this.folder, state.paths.spec); // older plans for this spec, so they're not taken for the new one
        const owner = state.owners?.plan;
        let started = null;
        if (ownerAlive(owner)) await sendMessage(owner.terminal, plan.message);
        else started = await startAgent(cx, { folder: this.folder, adapter, model: plan.model, name: `${state.id} plan`, message: plan.message });
        const next = started ? setOwner({ ...plan.state, planSeen }, "plan", started) : { ...plan.state, planSeen };
        await saveState(this.folder, next);
        this.spec = { ...this.spec, state: next, path: shownDocPath(this.folder, next), doc: null }; // the plan's path, not the spec's
        this.pieces = [];
        this.changes = null;
        this.sel = null;
      } catch (e) {
        this.noteError = `Couldn't approve: ${e.message ?? e}`;
      } finally {
        this.approving = false;
        this.saving = false;
      }
      cx.notify();
    });
  }

  // ---- build status (S9): polled from a timer, never from render() ------------------------------

  async pollBuild() {
    const state = this.spec?.state;
    if (!shouldPoll({ visible: window()?.visible, phase: state?.phase, busy: this.buildBusy })) return;
    this.buildBusy = true;
    try {
      const items = await loadBuildItems(this.folder, state);
      const dirs = repoFolders(items, this.folder);
      const lists = {};
      await Promise.all(dirs.map(async (d) => { lists[d] = await listTasks(d); }));
      this.build = buildGroups({ items, created: state.dispatch?.created, lists, folder: this.folder });
    } finally {
      this.buildBusy = false;
    }
  }

  // Clicking an item: no Herdr command opens a task in the Tasks tab, so copy its ref.
  copyRef(ref, cx) {
    cx.write_to_clipboard(ref);
    this.copied = ref;
    cx.notify();
  }

  // ---- dispatch (S7): handlers only; nothing is created until the person presses Confirm ---------

  refreshPreviews() {
    const d = this.dispatching;
    if (!d?.rows) return;
    const created = this.spec?.state.dispatch?.created ?? {};
    d.previews = previewArgvs(d.rows, created, { review: d.review, adapter: d.adapter, parentMode: d.parentMode });
  }

  // A spec in review skips the plan phase: "spec" (its own text is the plan) or "single" (one task).
  // Nothing changes until Confirm; the refusal reasons are Approve's.
  skip(mode, cx) {
    const { state } = this.spec;
    const block = approveBlock(state);
    if (block || state.phase !== "spec") {
      this.noteError = block ?? "Only a spec in review can skip planning.";
      cx.notify();
      return;
    }
    this.openDispatch(cx, { mode });
  }

  // The state a mode's list is made for: the plan's, or the spec's own paths when planning is skipped.
  dispatchTarget(state, mode) {
    return mode === "plan" ? state : skipPlan(state, { asPlan: mode === "spec" });
  }

  async listRows(target, r) {
    const { adapter } = await adapterFor(this.folder, target);
    const config = await folderConfig(this.folder);
    return { adapter, rows: dispatchRows({ tasks: { items: r.items }, state: target, adapter, config, folder: this.folder, planText: r.planText ?? "", docs: r.docs, workerModel: await workerModel() }) };
  }

  // Preview: the list from manifest.json, worked out again (one model call) when there is none yet,
  // a document changed since, or the person asked again (`note`, or `force` for Try again).
  openDispatch(cx, { mode = this.dispatching?.mode ?? "plan", note, force = false } = {}) {
    const state = this.spec.state;
    let target;
    try {
      target = this.dispatchTarget(state, mode);
    } catch (e) {
      this.noteError = String(e.message);
      cx.notify();
      return;
    }
    const review = this.dispatching?.review ?? Boolean(state.dispatch?.review);
    this.dispatching = { loading: true, mode, legacy: /\.json$/i.test(target.paths.tasks ?? "") };
    this.noteError = null;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const r = await loadPlanned(this.folder, target, { llm: this.llm, note, force });
        if (r.errors) {
          this.dispatching = { mode, errors: r.errors, warnings: r.warnings ?? [], legacy: Boolean(r.legacy) };
        } else {
          const { adapter, rows } = await this.listRows(target, r);
          this.dispatching = {
            mode, target, adapter, rows, errors: [], warnings: r.warnings ?? [], legacy: Boolean(r.legacy), changed: r.changed, done: r.done, review,
            parentMode: await parentMode(this.folder, state), summary: dispatchSummary(rows, state.dispatch ?? {}),
          };
          this.refreshPreviews();
        }
      } catch (e) {
        this.dispatching = { mode, errors: [`Couldn't make the task list: ${e.message ?? e}`] };
      }
      cx.notify();
    });
  }

  askAgain(cx) {
    const d = this.dispatching;
    if (!d?.rows || d.running || d.legacy || d.mode === "single") return;
    const note = this.noteInput.value().trim();
    this.noteInput.set_value("");
    this.openDispatch(cx, { mode: d.mode, note });
  }

  // What is dispatched is the list on screen: when a document changed since it was made, the list is
  // worked out again and, if it differs, shown instead of dispatched. True when it is still good.
  async stillCurrent(d) {
    if (d.legacy) return true;
    d.checking = true;
    const r = await loadPlanned(this.folder, d.target, { llm: this.llm });
    d.checking = false;
    if (r.errors) throw new Error(`Couldn't check the plan again: ${r.errors.join(" ")}`);
    if (!r.derived) return true;
    const before = d.rows.map((row) => row.item);
    const { rows } = await this.listRows(d.target, r);
    d.rows = rows; // same work: the prompts carry the new text
    d.done = r.done;
    if (sameList(before, r.items)) return true;
    d.changed = `${r.changed ?? "The documents changed, so the list was worked out again"}. Check it, then confirm again.`;
    d.summary = dispatchSummary(rows, this.spec.state.dispatch ?? {});
    return false;
  }

  confirmDispatch(cx) {
    const d = this.dispatching;
    if (!d?.rows || d.running || this.saving) return;
    d.running = true;
    d.error = null;
    this.saving = true; // the poll must not reload state.json under a half-finished dispatch
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        if (await this.stillCurrent(d)) await this.dispatchNow(d, cx);
      } catch (e) {
        d.error = `Couldn't dispatch: ${e.message ?? e}`;
      } finally {
        d.running = false;
        d.checking = false;
        this.saving = false;
      }
      this.refreshPreviews();
      cx.notify();
    });
  }

  async dispatchNow(d, cx) {
    d.parentMode = await parentMode(this.folder, this.spec.state); // the mode at Confirm
    let state = this.spec.state;
    const keep = async (next) => {
      state = next;
      await saveState(this.folder, state);
      this.spec = { ...this.spec, state };
    };
    const r = await runDispatch({
      rows: d.rows, dispatch: state.dispatch ?? {}, review: d.review, adapter: d.adapter, parentMode: d.parentMode,
      add: addTask, start: startTask, writePrompt: writePromptFile,
      save: async (dispatch) => { await keep({ ...state, dispatch }); d.summary = dispatchSummary(d.rows, dispatch); this.refreshPreviews(); cx.notify(); },
    });
    d.summary = dispatchSummary(d.rows, r);
    d.error = r.error;
    if (!r.error) {
      // plan -> build; a skipped plan phase goes from spec review straight to build
      await keep(d.mode === "plan" ? approveState(state) : skipPlan(state, { asPlan: d.mode === "spec" }));
      d.finished = true;
    }
  }

  toggleDispatchReview(cx) {
    if (!this.dispatching?.rows || this.dispatching.running) return;
    this.dispatching.review = !this.dispatching.review;
    this.refreshPreviews();
    cx.notify();
  }

  sendErrorsToPlan(cx, fresh = false) {
    const d = this.dispatching;
    if (!d?.errors?.length || d.sending) return;
    if (!fresh && this.askOwner(cx, "plan", "errors", "Send these errors to which agent?")) return;
    d.sending = true;
    d.error = null;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const { state } = this.spec;
        const text = errorsMessage(state.paths.tasks, d.errors);
        const owner = state.owners?.plan;
        if (ownerAlive(owner)) {
          await sendMessage(owner.terminal, text);
        } else {
          const { adapter, models } = await adapterFor(this.folder, state);
          const started = await startAgent(cx, { folder: this.folder, adapter, model: models.plan, name: `${state.id} plan`, message: firstMessage(state.paths.tasks, text) });
          const next = setOwner(state, "plan", started);
          await saveState(this.folder, next);
          this.spec = { ...this.spec, state: next };
        }
        this.dispatching = null;
      } catch (e) {
        d.error = `Couldn't send: ${e.message ?? e}`;
        d.sending = false;
      }
      cx.notify();
    });
  }

  // ---- new spec (S1): handlers only ------------------------------------------------------------

  async fillModels() {
    try {
      const adapter = await loadAdapterById(this.creating.adapter);
      const m = adapter.phases.spec;
      this.newInputs.model.set_value(m.model);
      this.newInputs.effort.set_value(m.effort ?? "");
    } catch (e) {
      this.newError = { message: String(e?.message ?? e) };
    }
  }

  startNewForm(cx) {
    this.creating = { adapter: "agent-skills", folder: this.folder };
    this.newError = null;
    this.newInputs.id.set_value("");
    this.newInputs.brief.set_value("");
    cx.spawn(async (cx) => { await this.fillModels(); cx.notify(); });
    cx.notify();
  }

  changeNewFolder(cx) {
    cx.spawn(async (cx) => {
      const f = await pickFolder({ prompt: "Choose the folder for the spec" });
      if (f) {
        this.folder = f;
        this.creating = { ...this.creating, folder: f };
        this.listKey = null;
      }
      cx.notify();
    });
  }

  startNew(cx) {
    if (this.newBusy || !this.creating) return;
    this.newBusy = true;
    this.newError = null;
    cx.notify();
    cx.spawn(async (cx) => {
      let id = null;
      try {
        const adapter = await loadAdapterById(this.creating.adapter);
        const config = await folderConfig(this.folder);
        const model = this.newInputs.model.value().trim();
        const effort = this.newInputs.effort.value().trim();
        const { state, model: chosen, message } = planNewSpec({
          adapter, config, id: this.newInputs.id.value(), brief: this.newInputs.brief.value(),
          existingIds: await usedIds(this.folder),
          models: model ? { spec: { model, ...(effort ? { effort } : {}) } } : undefined,
        });
        id = state.id;
        await createState(this.folder, state);
        const started = await startAgent(cx, { folder: this.folder, adapter, model: chosen, name: `${state.id} spec`, message });
        await saveState(this.folder, setOwner(state, "spec", started));
        this.creating = null;
        await this.open(state.id);
      } catch (e) {
        this.newError = { message: String(e?.message ?? e), usedId: e?.code === "used" ? e.id : null };
        if (id && e?.code !== "used") this.newError.message = `${this.newError.message} The spec ${id} was created; open it from the list.`;
      } finally {
        this.newBusy = false;
      }
      cx.notify();
    });
  }

  openUsed(id, cx) {
    this.creating = null;
    this.newError = null;
    cx.spawn(async (cx) => { await this.open(id); cx.notify(); });
  }

  // ---- adopt (S2): handlers only ---------------------------------------------------------------

  startAdopt(cx) {
    this.adopting = { spec: null, plan: null, tasks: null };
    this.adoptInput.set_value("");
    this.adoptError = null;
    cx.notify();
  }

  pickAdopt(key, cx) {
    cx.spawn(async (cx) => {
      const picked = await pickFiles({ prompt: { spec: "Choose the spec (markdown)", plan: "Choose the plan (markdown)", tasks: "Choose the task list (todo.md, tasks.md or tasks.json)" }[key] });
      const path = picked?.[0];
      if (path) {
        this.adopting = { ...this.adopting, [key]: path };
        // Prefill the ID from the spec's name, but never over what the person typed.
        if (key === "spec" && !this.adoptInput.value().trim()) this.adoptInput.set_value(suggestId(path));
        this.adoptError = null;
      }
      cx.notify();
    });
  }

  clearAdopt(key, cx) {
    this.adopting = { ...this.adopting, [key]: null };
    cx.notify();
  }

  submitAdopt(cx) {
    if (this.adoptBusy) return;
    this.adoptBusy = true;
    cx.spawn(async (cx) => {
      try {
        const f = this.adopting.found;
        const state = f
          ? await adoptFound(this.folder, this.adapter ?? (this.adapter = await defaultAdapter()), f, this.adoptInput.value())
          : await adoptFiles(this.folder, { ...this.adopting, id: this.adoptInput.value() });
        this.adopting = null;
        this.adoptError = null;
        await this.open(state.id);
      } catch (e) {
        this.adoptError = String(e?.message ?? e);
      } finally {
        this.adoptBusy = false;
      }
      cx.notify();
    });
  }

  async open(id) {
    this.selected = id;
    this.spec = null;
    this.pieces = [];
    this.error = null;
    this.at = 0;
    this.sel = null;
    this.editing = null;
    this.noteError = null;
    this.ownerPick = null;
    this.dispatching = null;
    await this.reload();
  }

  async back() {
    this.selected = null;
    this.spec = null;
    this.listKey = null;
    await this.reload();
  }

  async command(c, cx) {
    if (c === "top") this.scroll.scroll_to_item(0);
    else if (c === "open-first") {
      if (this.selected == null) await this.reload();
      if (this.specs[0]) await this.open(this.specs[0].id);
    } else if (c === "next") {
      this.at = Math.min(this.at + 1, Math.max(0, this.pieces.length - 1));
      this.scroll.scroll_to_item(this.at);
    } else if (c === "back") await this.back();
    else if (c === "approve") this.approve(cx);
    else if (c === "confirm") this.confirmDispatch(cx);
    else if (c === "one-task") this.skip("single", cx);
    else if (c === "spec-as-plan") this.skip("spec", cx);
    else if (c === "new") {
      this.creating = { adapter: "agent-skills", folder: this.folder };
      await this.fillModels();
    } else if (c === "adopt") {
      this.adopting = { spec: null, plan: null, tasks: null };
      this.adoptInput.set_value("");
    }
  }

  // The width rule every view reads: the layout now, and the hook that keeps viewW current.
  fit() { return { layout: layoutFor(this.viewW), onViewSize: (w, cx) => { if (Math.abs(w - this.viewW) > 2) { this.viewW = w; cx.notify(); } } }; }

  render(_cx) {
    const t = theme();
    if (this.handedOff) return div().size_full().p(16).bg(t.background).text_color(t.muted ?? t.foreground).child("specd opens in the panel");
    if (this.zoom) return zoomView({ t, pic: this.zoom, onClose: () => closeOverlay(props().overlay) });
    if (!this.folder) return div().size_full().p(16).bg(t.background).text_color(t.foreground).child("No folder: focus a terminal first");
    if (this.creating) {
      return div().size_full().bg(t.background).text_color(t.foreground).child(
        newView({ t, form: this.creating, inputs: this.newInputs, error: this.newError, busy: this.newBusy,
          onChangeFolder: (cx) => this.changeNewFolder(cx), onOpenUsed: (id, cx) => this.openUsed(id, cx),
          onStart: (cx) => this.startNew(cx), onCancel: (cx) => { this.creating = null; this.newError = null; cx.notify(); }, ...this.fit() }));
    }
    if (this.adopting) {
      return div().size_full().bg(t.background).text_color(t.foreground).child(
        adoptView({ t, form: this.adopting, input: this.adoptInput, error: this.adoptError,
          onPick: (k, cx) => this.pickAdopt(k, cx), onClear: (k, cx) => this.clearAdopt(k, cx),
          onSubmit: (cx) => this.submitAdopt(cx), onCancel: (cx) => { this.adopting = null; this.adoptError = null; cx.notify(); }, ...this.fit() }));
    }
    if (this.selected == null) {
      return div().size_full().bg(t.background).text_color(t.foreground).child(
        list({ t, specs: this.specs, errors: this.errors, found: this.found, onFoundAdopt: (f, cx) => this.adoptFound(f, cx), onFoundDismiss: (f, cx) => this.dismissFound(f, cx), onAdopt: (cx) => this.startAdopt(cx), onNew: (cx) => this.startNewForm(cx), onOpen: (id, cx) => cx.spawn(async (cx) => { await this.open(id); cx.notify(); }), ...this.fit() }));
    }
    if (this.dispatching && this.spec) {
      return div().size_full().bg(t.background).text_color(t.foreground).child(
        dispatchView({ t, d: this.dispatching, created: this.spec.state.dispatch?.created, noteInput: this.noteInput,
          onConfirm: (cx) => this.confirmDispatch(cx), onToggle: (cx) => this.toggleDispatchReview(cx),
          owner: this.ownerPick ? this.ownerProps("plan") : null, onSendToPlan: (cx) => this.sendErrorsToPlan(cx), onRetry: (cx) => this.openDispatch(cx, { force: true }),
          onAskAgain: (cx) => this.askAgain(cx), onClose: (cx) => { this.dispatching = null; cx.notify(); }, ...this.fit() }));
    }
    if (!this.spec) {
      return div().size_full().p(16).bg(t.background).text_color(t.muted).child(this.error ?? "Loading…");
    }
    if (this.spec.state.phase === "build") {
      return div().size_full().bg(t.background).text_color(t.foreground).child(
        buildView({ t, id: this.spec.state.id, build: this.build, copied: this.copied, onCopy: (r, cx) => this.copyRef(r, cx),
          onBack: (cx) => cx.spawn(async (cx) => { await this.back(); cx.notify(); }), ...this.fit() }));
    }
    return div().size_full().bg(t.background).text_color(t.foreground).child(
      documentView({ t, spec: this.spec, doc: this.spec.doc, pieces: this.pieces, scroll: this.scroll, error: this.error,
        changes: this.changes, changedOnly: this.changedOnly, onToggleChanged: (cx) => { this.changedOnly = !this.changedOnly; cx.notify(); },
        comments: { sel: this.sel, changes: this.changes, input: this.input, editInput: this.editInput, editing: this.editing, error: this.noteError,
          onSelect: (i, s, cx) => this.onSelect(i, s, cx), onEdit: (i, cx) => this.edit(i, cx),
          onRemove: (i, cx) => this.remove(i, cx), submitting: this.submitting, onSubmit: (cx) => this.submit(cx),
          owner: this.spec.state.phase === "spec" || this.spec.state.phase === "plan" ? this.ownerProps() : null, approveBlock: approveBlock(this.spec.state), approving: this.approving, approveLabel: this.spec.state.phase === "plan" ? "Approve plan" : "Approve spec", onApprove: this.spec.state.phase === "spec" || this.spec.state.phase === "plan" ? (cx) => this.approve(cx) : null,
          onSkip: this.spec.state.phase === "spec" ? (mode, cx) => this.skip(mode, cx) : null,
          planCheck: this.spec.state.phase === "plan" && this.spec.doc != null ? planNote(this.spec.doc, this.spec.state.paths.spec) : null, onJump: (i, cx) => this.jump(i, cx) },
        layout: layoutFor(this.viewW), onViewSize: (w, cx) => { if (Math.abs(w - this.viewW) > 2) { this.viewW = w; cx.notify(); } },
        diagrams: { store: this.diagrams, availW: this.docW - (layoutFor(this.viewW) === "narrow" ? 24 : 48), onOpen: (p, cx) => this.openZoom(p, cx),
          onSize: (w, cx) => { if (Math.abs(w - this.docW) > 4) { this.docW = w; cx.notify(); } },
          settings: { open: this.settingsOpen, onOpenChange: (o, cx) => { this.settingsOpen = o; cx.notify(); },
            mmdcInput: this.mmdcInput, puppeteerInput: this.puppeteerInput, onSave: (cx) => this.saveDiagramSettings(cx) } },
        onBack: (cx) => cx.spawn(async (cx) => { await this.back(); cx.notify(); }) }));
  }
}
