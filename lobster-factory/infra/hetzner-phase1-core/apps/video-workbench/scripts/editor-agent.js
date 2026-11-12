"use strict";
// Card ED.13 剪輯 Agent (docs/ed13-edit-agent-design-20261110.md; spec §1.8): a floating, draggable window. A message sends
// the project summary to POST /editor/agent (the text price is on the send button before the click, data-paid) and gets
// back a checked list of
// editor operations. The list runs on a copy through the same tool functions the buttons use (edAgentTools below ->
// tools-editor.js and the pane files); any failing step voids the whole round and the project stays as it was. A good round replaces the
// project after one edCheckpoint, so one Ctrl+Z undoes it all. Paid work is only proposed: its card opens the pane whose
// own priced button runs it. The conversation lives in memory only and is never saved with the project.
const edAgent = { open: false, busy: false, turns: [], x: null, y: null, draft: "" };
const edAgentQuick = ["整片上字幕", "刪語氣詞與停頓", "改成直式 9:16", "配樂淡出＋讓位旁白", "中英雙語字幕"];
// propose_paid kind -> the left pane that runs it with its own price and confirm (ED.10 字幕, ED.11 剪贅字).
const edAgentPaidPane = { transcribe: "字幕", translate: "字幕", fillers: "剪贅字" };
const edAgentPaidText = {
  transcribe: (a) => `辨識整片字幕${a.language ? "（" + a.language + "）" : ""}`,
  translate: (a) => `翻譯字幕${a.target ? "成 " + a.target : ""}`,
  fillers: () => "剪掉贅字與停頓",
};
const edAgentHistory = () => edAgent.turns.filter((t) => t.text && !t.error).slice(-6).map(({ role, text }) => ({ role, text }));
const edAgentSummary = (p) => EditorAgentPlan.summarize(p, { filters: edFilters });
const edAgentReady = () => !!window.VideoWorkbench?.capabilities?.editorAgent?.ready && !!edProject();
function edAgentOpen() {
  edAgent.open = true;
  window.VideoWorkbench.loadCapabilities?.().then(edAgentPaint, VideoWorkbench.reportError);
  edAgentPaint();
  document.querySelector("[data-ed-agent] textarea")?.focus();
}
function edAgentClose() {
  edAgent.open = false;
  document.querySelector("[data-ed-agent]")?.remove();
}
function edAgentTurn(t) {
  if (t.role === "user") return `<div class="editor-agent-msg user">${esc(t.text)}</div>`;
  const cards = (t.paid || [])
    .map(
      (a, i) =>
        `<div class="editor-agent-card"><b>需要另計費用：${esc(edAgentPaidText[a.kind](a))}</b><p class="note">費用在下一步的按鈕上顯示，按下確認才會開始。</p><button type="button" class="btn small" data-ed-agent-paid="${t.id}:${i}">前往確認</button></div>`,
    )
    .join("");
  return `<div class="editor-agent-msg agent${t.error ? " error" : ""}">${esc(t.text)}${t.error ? `<p class="editor-agent-error">${esc(t.error)}</p>` : ""}${t.applied ? `<p class="note">已套用 ${t.applied} 個操作；按 Ctrl+Z 一次可整輪還原。</p>` : ""}${cards}</div>`;
}
function edAgentPaint() {
  let box = document.querySelector("[data-ed-agent]");
  if (!edAgent.open) return box?.remove();
  if (!box) {
    box = document.createElement("section");
    box.className = "editor-agent";
    box.dataset.edAgent = "";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", "剪輯 Agent");
    document.body.append(box);
  }
  const draft = box.querySelector("textarea")?.value ?? edAgent.draft,
    ready = edAgentReady();
  if (edAgent.x !== null) Object.assign(box.style, { left: edAgent.x + "px", top: edAgent.y + "px", right: "auto", bottom: "auto" });
  box.innerHTML = VideoWorkbench.sanitize(
    `<header class="editor-agent-head" data-ed-agent-drag><b>用文字完成剪輯與生成</b><span class="editor-agent-tools"><button type="button" class="btn small" data-ed-agent-do="new">新對話</button><button type="button" class="btn small" data-ed-agent-do="retry" ${edAgent.turns.some((t) => t.role === "user") ? "" : "disabled"}>重來</button><button type="button" class="btn small" data-ed-agent-do="close" aria-label="關閉">×</button></span></header>` +
      `<p class="note">每則訊息依用量扣點，送出前顯示約略費用；辨識、翻譯等其他生成另計，要你另外確認。</p>` +
      `<div class="editor-agent-log" aria-live="polite">${edAgent.turns.map(edAgentTurn).join("")}${edAgent.busy ? '<div class="editor-agent-msg agent">處理中…</div>' : ""}</div>` +
      `<div class="flow-choices" role="group" aria-label="快捷需求">${edAgentQuick.map((q) => `<button type="button" class="btn small" data-ed-agent-quick="${esc(q)}" ${ready && !edAgent.busy ? "" : "disabled"}>${esc(q)}</button>`).join("")}</div>` +
      `<textarea class="text-input" rows="3" maxlength="2000" aria-label="剪輯需求" placeholder="說說你想怎麼剪（Enter 傳送，Shift+Enter 換行）">${esc(draft)}</textarea>` +
      `<div class="editor-agent-send">${ready ? "" : '<span class="note">剪輯 Agent 尚未設定。</span>'}<button type="button" class="btn primary small" data-ed-agent-do="send" data-paid="video.script" ${ready && !edAgent.busy ? "" : "disabled"}>傳送</button></div>`,
  );
  const log = box.querySelector(".editor-agent-log");
  log.scrollTop = log.scrollHeight;
}
const edAgentClip = (p, id) => {
  const c = p.clips.find((x) => x.id === id);
  if (!c) throw Error("找不到片段 " + id);
  return c;
};
// Tool name (shared/editor-agent-plan.js TOOLS) -> the editor's own function, the one its button runs (tools-editor.js,
// editor-panes/transition.js, editor-panes/subtitles.js). Each gets the round's copy; a truthy return = the step must
// not close main-track gaps (磁性主軌), as its button sets ed.skipMagnet.
const edAgentTools = {
  split_clip: (p, a) => void edSplitAt(p, edAgentClip(p, a.clipId), Timebase.toFrames(a.atSec, p.timebase)),
  delete_clips: (p, a) => edDeleteClips(p, new Set(a.clipIds.map((id) => edAgentClip(p, id).id)), !!a.ripple),
  duplicate_clips: (p, a) => edDuplicate(p, a.clipIds.map((id) => edAgentClip(p, id))).skipMagnet,
  move_clip_track: (p, a) => edMoveTrack(p, edAgentClip(p, a.clipId), a.trackId),
  add_track: (p, a) => void edAddTrack(p, a.kind),
  set_ratio: (p, a) => (edSetRatio(p, a.ratio), true),
  set_timebase: (p, a) => (edSetTimebase(p, a.label), true),
  set_loudness: (p, a) => edSetLoudness(p, a.lufs),
  set_filter: (p, a) => edSetFilter(p, a.clipId ? edAgentClip(p, a.clipId) : null, a.name, a.scope),
  set_speed: (p, a) => edSetSpeed(p, edAgentClip(p, a.clipId), a.rate),
  set_mask: (p, a) => edSetMask(edAgentClip(p, a.clipId), a.value),
  set_background: (p, a) => edSetBackground(p, edAgentClip(p, a.clipId), a.value),
  set_volume_db: (p, a) => edApplyDb(edAgentClip(p, a.clipId), a.db),
  set_fades: (p, a) => edSetFades(edAgentClip(p, a.clipId), { fadeIn: a.inSec, fadeOut: a.outSec }),
  set_duck: (p, a) => edSetDuck(edAgentClip(p, a.clipId), a.on),
  // The transition pane's own rules: only at a cut of the main track (edPrevious), length clamped by edTrSet.
  set_transition: (p, a) => {
    const c = edAgentClip(p, a.clipId),
      name = EditorModel.transitionName(a.name);
    if (c.track !== edMain(p) || !edPrevious(p, c)) throw Error("轉場只能放在主視訊軌兩段相接的剪點");
    if (name === null) throw Error("轉場不存在");
    if (name === "無") {
      c.transition = "無";
      delete c.transitionCurve;
    } else edTrSet(p, c, name, c.transitionCurve || "線性", a.sec);
  },
  add_text: (p, a) => void edAddText(p, a.text, a.startSec, a.durSec, a.trackId),
  // The SRT import's rules (字幕 pane): the language's own track is replaced, cues after the video's end are dropped.
  import_cues: (p, a) => {
    const id = edSubTracks(p).find((t) => t.language === a.language && !t.translatedFrom)?.id || edSubNewTrack(p, a.language, false);
    edSubFill(p, id, a.cues, edSubLook(p, id), edSubLimit(p));
  },
  transform_key: (p, a) => edTransformKey(p, edAgentClip(p, a.clipId), a.op, a.frame ?? 0, a.values),
  detach_audio: (p, a) => edDetachAudio(p, edAgentClip(p, a.clipId)),
  // Adds only: a marker already there stays (the M key toggles).
  add_marker: (p, a) => {
    if (!(p.markers || []).some((m) => Math.abs(m - a.atSec) < 0.005)) edToggleMarker(p, a.atSec);
  },
};
// Runs the plan on a copy, 磁性主軌 after each step as its button would; returns the copy and the proposals. Throws
// (project untouched) on the first failing step.
function edAgentDryRun(p, ops) {
  const copy = structuredClone(p),
    paid = [];
  ops.forEach((op, i) => {
    if (op.tool === "propose_paid") return void paid.push(op.args);
    try {
      const before = structuredClone(copy);
      if (!edAgentTools[op.tool](copy, op.args)) edMagnetFrom(copy, before);
    } catch (e) {
      throw Error(`第 ${i + 1} 步（${op.tool}）失敗，整份不套用：${e.message}`);
    }
  });
  return { copy, paid };
}
const edAgentConfirm = (cut) =>
  new Promise((resolve) => {
    const d = edDialog(`<h3>將刪除 ${cut.count} 段</h3><p>這一輪會刪除 ${cut.count} 段片段（共 ${cut.seconds.toFixed(1)} 秒）。確定要套用嗎？可用「復原」還原。</p><button class="btn primary" type="button" data-ed-agent-ok>確定套用</button>`);
    d.querySelector("[data-ed-agent-ok]").onclick = () => {
      resolve(true);
      d.close();
    };
    d.addEventListener("close", () => resolve(false));
  });
// One checked round: dry run, 破壞性門檻, then one checkpoint and one commit. Returns { applied, paid } or throws.
async function edAgentApply(p, ops) {
  EditorAgentPlan.validate(ops);
  const { copy, paid } = edAgentDryRun(p, ops),
    applied = ops.length - paid.length;
  if (!applied) return { applied, paid };
  const cut = EditorAgentPlan.removal(p.clips, copy.clips),
    before = JSON.stringify(p);
  if (cut.confirm && !(await edAgentConfirm(cut))) throw Error(`已取消：這一輪會刪除 ${cut.count} 段，專案沒有改變`);
  // The copy was made before the question: a project switched or edited while it was open is never overwritten.
  if (edProject() !== p || JSON.stringify(p) !== before) throw Error("等待確認時專案有變動，這一輪沒有套用；請再送一次");
  edCheckpoint();
  ed.projects[ed.projects.indexOf(p)] = copy;
  if (ed.selected && !copy.clips.some((c) => c.id === ed.selected)) ed.selected = null;
  ed.picks = new Set([...ed.picks].filter((id) => copy.clips.some((c) => c.id === id)));
  ed.skipMagnet = true; // already applied step by step in the dry run
  await edCommit(copy);
  return { applied, paid };
}
async function edAgentSend(message) {
  const p = edProject();
  message = String(message || "").trim();
  // busy = one request at a time and never re-sent by itself, so one click is at most one charge.
  if (!p || !message || edAgent.busy || !edAgentReady()) return;
  const history = edAgentHistory();
  edAgent.turns.push({ role: "user", text: message });
  edAgent.draft = "";
  const area = document.querySelector("[data-ed-agent] textarea");
  if (area) area.value = "";
  edAgent.busy = true;
  edAgentPaint();
  const turn = { id: crypto.randomUUID(), role: "assistant", text: "" };
  try {
    const answer = await VideoWorkbench.request("/editor/agent", { summary: edAgentSummary(p), history, message });
    turn.text = answer.reply;
    const done = await edAgentApply(p, answer.ops);
    turn.applied = done.applied;
    turn.paid = done.paid;
  } catch (e) {
    turn.error = e.message;
  }
  edAgent.turns.push(turn);
  edAgent.busy = false;
  edAgentPaint();
}
function edAgentPaid(ref) {
  const [id, i] = ref.split(":"),
    a = edAgent.turns.find((t) => t.id === id)?.paid?.[Number(i)];
  if (!a) return;
  if (a.kind !== "fillers" && typeof edSubUi === "object") {
    edSubUi.tab = "辨識翻譯";
    if (a.language) edSubUi.language = a.language;
  }
  edAction("pane:" + edAgentPaidPane[a.kind]).catch(VideoWorkbench.reportError);
}
document.addEventListener("click", (e) => {
  const box = e.target.closest?.("[data-ed-agent]");
  if (!box) return;
  const act = e.target.closest("[data-ed-agent-do]")?.dataset.edAgentDo,
    quick = e.target.closest("[data-ed-agent-quick]")?.dataset.edAgentQuick,
    paid = e.target.closest("[data-ed-agent-paid]")?.dataset.edAgentPaid;
  if (act === "close") edAgentClose();
  if (act === "new") {
    edAgent.turns = [];
    edAgent.draft = "";
    box.querySelector("textarea").value = "";
    edAgentPaint();
  }
  // 重來: the last request goes back into the box (priced again before it is sent); its answer leaves the conversation.
  if (act === "retry") {
    const last = edAgent.turns.findLastIndex((t) => t.role === "user");
    if (last < 0 || edAgent.busy) return;
    edAgent.draft = edAgent.turns[last].text;
    edAgent.turns = edAgent.turns.slice(0, last);
    box.querySelector("textarea").value = edAgent.draft;
    edAgentPaint();
  }
  if (act === "send") edAgentSend(box.querySelector("textarea").value);
  if (quick) edAgentSend(quick);
  if (paid) edAgentPaid(paid);
});
document.addEventListener("keydown", (e) => {
  if (!e.target.matches?.("[data-ed-agent] textarea") || e.key !== "Enter" || e.shiftKey || e.isComposing) return;
  e.preventDefault();
  edAgentSend(e.target.value);
});
document.addEventListener("input", (e) => {
  if (e.target.matches?.("[data-ed-agent] textarea")) edAgent.draft = e.target.value;
});
// Dragging the header moves the window (kept inside the viewport).
document.addEventListener("pointerdown", (e) => {
  const head = e.target.closest?.("[data-ed-agent-drag]");
  if (!head || e.target.closest("button")) return;
  const box = head.closest("[data-ed-agent]"),
    r = box.getBoundingClientRect(),
    dx = e.clientX - r.left,
    dy = e.clientY - r.top;
  const move = (m) => {
    edAgent.x = Math.max(0, Math.min(window.innerWidth - r.width, m.clientX - dx));
    edAgent.y = Math.max(0, Math.min(window.innerHeight - 40, m.clientY - dy));
    Object.assign(box.style, { left: edAgent.x + "px", top: edAgent.y + "px", right: "auto", bottom: "auto" });
  };
  const up = () => {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
  };
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
});
