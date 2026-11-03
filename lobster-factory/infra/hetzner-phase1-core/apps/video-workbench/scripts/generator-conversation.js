const directorPendingConversations = new Set();
function directorIsBusy() { return directorPendingConversations.has(state.directorConversationId); }
function directorNewConversation() {
  generatorSwitchMode("director");
  Object.assign(state, { directorMessages: [], directorConversationId: crypto.randomUUID(), directorPhase: "consultation", directorScript: "", directorChatInput: "", directorStage: "input", directorGeneration: "idle", directorQuote: null });
  state.data.director = ""; state.refs.director.images = [];
  close(); render();
}
function directorOutputPanel(kind) {
  const capabilities = VideoWorkbench.capabilities || {};
  const spec = kind === "director-ratio" ? { title: "長寬比", values: ["16:9", "9:16", "1:1", "4:5", "4:3"], allowed: capabilities.videoRatios || ["16:9", "9:16"], key: "ratio", attribute: "data-ratio" } : kind === "director-duration" ? { title: "影片長度", values: [4, 5, 6, 8, 10, 12, 15, 20, 25, 30], allowed: capabilities.videoDurations || [4, 8, 12], key: "directorLength", attribute: "data-gen-duration" } : { title: "畫質", values: ["480p", "720p", "1080p"], allowed: capabilities.videoQualities || ["720p"], key: "quality", attribute: "data-quality" };
  return `<h3>${spec.title}</h3><div class="chips">${spec.values.map((value) => `<button ${spec.attribute}="${value}" aria-pressed="${state[spec.key] === value}" ${spec.allowed.includes(value) ? "" : 'disabled title="目前服務尚未支援"'}>${value}${typeof value === "number" ? " 秒" : ""}</button>`).join("")}</div><p class="small-note">可使用的選項依目前接入服務顯示；尚未支援的選項不會送出。</p>`;
}
function generatorRefreshOutputPanel() {
  const panelName = $("popover").dataset.activePanel || "settings";
  render(); panel(panelName);
}
function directorChatWorkspace() {
  const phase = state.directorStage === "video" ? "production" : state.directorPhase;
  return `<section class="director-conversation"><header class="row"><button class="minor" data-director-conversation-action="new">新對話</button><button class="minor" data-director-conversation-action="sessions">對話紀錄</button><b>${phase === "consultation" ? "① 諮詢" : phase === "production" ? "③ 生成" : "② 腳本"}</b></header><div class="director-messages">${state.directorMessages.map((message, index) => `<article class="director-message ${message.role}"><small>${message.role === "user" ? "你" : "AwareWave 導演"}</small><div class="director-message-text">${safe(message.text)}</div>${message.role === "assistant" ? `<div class="row"><button class="minor" data-director-copy="${index}">複製這段回覆</button><button class="minor" data-director-reference="${index}">帶入全能參考</button><button class="minor" data-director-regenerate="${index}" ${directorIsBusy() || index !== state.directorMessages.length - 1 ? "disabled" : ""}>重新生成這則回覆</button></div><div class="director-choice-row">${(message.choices || []).map((choice, option) => `<button data-director-choice="${index}:${option}" ${directorIsBusy() || index !== state.directorMessages.length - 1 ? "disabled" : ""}>${safe(choice)}</button>`).join("")}</div>` : ""}</article>`).join("")}</div>${directorIsBusy() ? '<p role="status">導演正在回覆…</p>' : ""}<div class="director-script-actions">${phase === "production" ? directorVideo() : phase === "consultation" ? '<button class="box-cta" data-director-conversation-action="script">下一階段：開始生成腳本 →</button>' : '<button class="minor" data-director-conversation-action="edit">✏️ 修改腳本</button><button class="minor" data-action="director-storyboard">生成分鏡圖</button><button class="box-cta" data-action="director-to-video">下一階段：開始生成影片 →</button>'}</div><label for="directorChatInput" class="sr">給導演的訊息</label><textarea id="directorChatInput" class="field" rows="4" placeholder="告訴導演你的想法，或提出修改要求。">${safe(state.directorChatInput)}</textarea><div class="row"><button class="minor" data-upload="images" data-accept="image/png,image/jpeg,image/webp">附加圖片</button><button class="minor" data-director-conversation-action="materials">素材</button><button class="box-cta" data-director-conversation-action="send" ${directorIsBusy() || !state.directorChatInput.trim() ? "disabled" : ""}>送出</button></div>${directorAssets()}<p class="small-note">自用模式；影片與分鏡圖仍需按下確認才會開始製作。對話可由「儲存對話／生成草稿」保存。</p></section>`;
}
async function directorSendMessage(text, phase = state.directorPhase, regenerate = false) {
  if (directorIsBusy() || !text?.trim()) return;
  const conversationId = state.directorConversationId;
  const conversation = state.directorMessages;
  directorPendingConversations.add(conversationId);
  state.directorStage = "chat";
  const last = state.directorMessages.at(-1);
  if (last?.role !== "user" || last.text !== text.trim()) state.directorMessages.push({ role: "user", text: text.trim(), phase });
  state.directorChatInput = "";
  render();
  try {
    const reply = await VideoWorkbench.request("/director/chat", { messages: state.directorMessages.slice(-60).map(({ role, text }) => ({ role, text })), phase, duration: state.directorLength, images: state.refs.director.images });
    if (state.directorConversationId !== conversationId || state.directorMessages !== conversation) return false;
    if (!reply?.reply || !Array.isArray(reply.choices)) throw Error("導演回覆格式不正確");
    state.directorMessages.push({ role: "assistant", text: reply.script || reply.reply, choices: reply.choices.filter((x) => typeof x === "string").slice(0, 4) });
    if (reply.script) { state.directorScript = reply.script; state.directorPhase = "script"; }
    else state.directorPhase = reply.stage === "script" && state.directorScript ? "script" : "consultation";
    if ((VideoWorkbench.capabilities?.videoDurations || [4, 8, 12]).includes(reply.duration)) { state.directorLength = reply.duration; if (state.mode === "director") state.duration = reply.duration; }
    return true;
  } catch (error) {
    if (state.directorConversationId !== conversationId || state.directorMessages !== conversation) return false;
    if (!regenerate && !state.directorChatInput) state.directorChatInput = text;
    VideoWorkbench.reportError(error);
    return false;
  } finally {
    directorPendingConversations.delete(conversationId);
    if (state.mode === "director" && state.directorConversationId === conversationId) render();
  }
}
document.addEventListener("input", (event) => {
  if (event.target.id !== "directorChatInput") return;
  state.directorChatInput = event.target.value;
  const send = document.querySelector('[data-director-conversation-action="send"]');
  if (send) send.disabled = directorIsBusy() || !state.directorChatInput.trim();
});
document.addEventListener("keydown", (event) => {
  if (event.target.id === "directorChatInput" && event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); directorSendMessage(state.directorChatInput); }
});
document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-director-conversation-action],[data-director-copy],[data-director-reference],[data-director-choice],[data-director-regenerate]");
  if (!button) return;
  try {
    const action = button.dataset.directorConversationAction;
    if (action === "new") directorNewConversation();
    if (action === "sessions") $("directorNav").click();
    if (action === "materials") await openLibrary("image", "images");
    if (action === "send") await directorSendMessage(state.directorChatInput);
    if (action === "script") await directorSendMessage("請依照已確認的內容產生完整分鏡腳本。", "script");
    if (action === "edit") { state.directorChatInput = "我想修改腳本："; render(); $("directorChatInput")?.focus(); }
    if (button.dataset.directorCopy !== undefined) { await navigator.clipboard.writeText(state.directorMessages[Number(button.dataset.directorCopy)].text); VideoWorkbench.notify("已複製回覆"); }
    if (button.dataset.directorReference !== undefined) {
      const message = state.directorMessages[Number(button.dataset.directorReference)].text;
      const images = structuredClone(state.refs.director.images);
      generatorSwitchMode("reference"); state.refType = "all"; state.data.reference = message; state.refs.reference.images = images; render();
    }
    if (button.dataset.directorChoice) {
      const [index, option] = button.dataset.directorChoice.split(":").map(Number);
      await directorSendMessage(state.directorMessages[index]?.choices?.[option]);
    }
    if (button.dataset.directorRegenerate !== undefined && !directorIsBusy()) {
      const index = Number(button.dataset.directorRegenerate);
      if (index !== state.directorMessages.length - 1 || state.directorMessages[index]?.role !== "assistant") return;
      const conversationId = state.directorConversationId;
      const previous = state.directorMessages.pop();
      const last = state.directorMessages.at(-1);
      if (!last || last.role !== "user") { state.directorMessages.push(previous); return; }
      if (!(await directorSendMessage(last.text, last.phase || state.directorPhase, true)) && state.directorConversationId === conversationId) { state.directorMessages.push(previous); render(); }
    }
  } catch (error) { VideoWorkbench.reportError(error); }
});
