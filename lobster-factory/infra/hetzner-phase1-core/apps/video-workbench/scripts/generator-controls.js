// Generation controls share the same draft and storage adapter as the workbench.
const generatorPresetKey = "generator.presets.v1";
let generatorPresets = [], generatorBusy = false, generatorPromptSelection = null;
const generatorSettingKeys = ["ratio", "ratios", "quality", "duration", "audio", "watermark", "subtitle", "subtitleOptions", "skill", "skills", "style"];
function generatorSubtitleDefaults() {
  return { languages: ["原文"], style: "白字黑邊", size: "中", position: "下方" };
}
const generatorClearFields = ["cast", "castName", "voice", "performance", "spokenVisualDirection", "spokenPanel"];
function generatorContentSnapshot(mode = state.mode) {
  return { mode, prompt: state.data[mode], references: structuredClone(state.refs[mode]), spoken: mode === "spoken" ? Object.fromEntries(generatorClearFields.map((key) => [key, structuredClone(state[key])])) : null };
}
function generatorCaptureClear() { return generatorContentSnapshot(); }
function generatorOfferClearUndo(before) {
  document.querySelector(".generator-clear-notice")?.remove();
  const after = JSON.stringify(generatorContentSnapshot());
  const notice = document.createElement("div");
  notice.className = "generator-clear-notice";
  notice.setAttribute("role", "status");
  const message = document.createElement("span"), undo = document.createElement("button");
  message.textContent = "已清除提示詞與素材"; undo.textContent = "復原";
  undo.onclick = () => {
    // Do not overwrite text or references entered after the clear action.
    if (JSON.stringify(generatorContentSnapshot()) !== after) {
      SeedStar.notify("內容已變更，保留目前內容。"); notice.remove(); return;
    }
    state.data[before.mode] = before.prompt;
    state.refs[before.mode] = structuredClone(before.references);
    if (before.spoken) for (const [key, value] of Object.entries(before.spoken)) state[key] = structuredClone(value);
    notice.remove(); render();
  };
  notice.append(message, undo); document.body.append(notice);
  setTimeout(() => notice.remove(), 8000);
}
function generatorPreviewReference(bucket, index) {
  const asset = state.refs[state.mode]?.[bucket]?.[index];
  if (!asset || !SeedStar.safeUrl(asset.url)) return;
  modal("素材預覽", generatorReferencePreview(asset) + `<p>${safe(asset.name)}</p><a href="${safe(SeedStar.safeUrl(asset.url))}" target="_blank" rel="noopener noreferrer" download="${safe(asset.name)}">下載／開新分頁</a>`);
}
function generatorDefaultSettings(mode) {
  return { ratio: mode === "image" ? "1:1" : "16:9", ratios: [mode === "image" ? "1:1" : "16:9"], quality: mode === "image" ? "1K" : "720p", duration: 8, audio: "有聲", watermark: "不套用", subtitle: "關", subtitleOptions: { languages: ["原文"], style: "白字黑邊", size: "中", position: "下方" }, skill: "不套用技能", skills: [] };
}
function generatorSwitchMode(mode) {
  if (mode === state.mode) return;
  generatorCloseMentions();
  const keys = generatorSettingKeys.filter((key) => key !== "style");
  state.outputSettings ||= {};
  state.outputSettings[state.mode] = Object.fromEntries(keys.map((key) => [key, structuredClone(state[key])]));
  state.mode = mode;
  const defaults = generatorDefaultSettings(mode);
  for (const key of keys) state[key] = structuredClone((state.outputSettings[mode] || defaults)[key] ?? defaults[key]);
}
function generatorReferencePreview(asset) {
  const url = SeedStar.safeUrl(asset.previewUrl || asset.url), row = generatorReferences().find((r) => r.asset === asset);
  const kind = SeedStar.mediaKind(asset) || asset.type?.split("/")[0] || "image";
  return (url ? kind === "video" ? `<video class="reference-preview" src="${safe(url)}" controls preload="metadata"></video>` : kind === "audio" ? `<audio class="reference-preview" src="${safe(url)}" controls preload="metadata"></audio>` : `<img class="reference-preview" src="${safe(url)}" alt="${safe(asset.name)}">` : "") + (row ? `<small class="reference-token">${safe(row.token)}</small>` : "");
}
function generatorMotionWorkspace() {
  const motion = state.motion;
  return `<section class="motion-workspace"><p class="small-note">人物照片與 3–${motion.facing === "image" ? 10 : 30} 秒動作影片各一份；動作由影片提供。</p><details class="reference-guidance"><summary>查看使用須知</summary><p>請使用單一人物、上半身或全身清楚可見的照片與影片；避免多姿勢拼圖或遮住身體。</p></details><div class="reference-grid reference-motion-grid">${referenceAsset("motionImage", 1, "人物照片", "image/*", "motion-image")}${referenceAsset("motionVideo", 1, "動作影片", "video/*", "motion-video")}</div><fieldset class="motion-options"><legend>角色朝向</legend>${[["video", "朝向跟影片"], ["image", "朝向跟照片"]].map(([value, name]) => `<button class="minor" data-gen-motion-facing="${value}" aria-pressed="${motion.facing === value}">${name}</button>`).join("")}<p class="small-note">朝向跟影片適合複雜動作；朝向跟照片可保留照片構圖，並以描述補充運鏡。目前最長 ${motion.facing === "image" ? 10 : 30} 秒。</p></fieldset><fieldset class="motion-options"><legend>畫質</legend>${["720p", "1080p"].map((value) => `<button class="minor" data-gen-motion-quality="${value}" aria-pressed="${motion.quality === value}">${value}</button>`).join("")}</fieldset><label class="motion-audio"><input id="motionPreserveAudio" type="checkbox" ${motion.preserveAudio ? "checked" : ""}>保留影片原聲</label><label for="motionPrompt">補充場景與運鏡（選填）</label><textarea class="field" id="motionPrompt" placeholder="補充場景、背景或鏡頭移動；人物動作以參考影片為準。">${safe(motion.prompt)}</textarea><button class="box-cta" disabled>動作參考服務尚未接入</button><p class="small-note">這些設定會保留在草稿；尚未設定符合供應商政策的動作轉移服務。</p></section>`;
}

function generatorRatios() {
  return [...new Set([state.ratio, ...(state.ratios || [])])].filter((v) => ["16:9", "9:16", "1:1", "4:5", "4:3"].includes(v));
}
function generatorNormalizeSettings() {
  if (state.mode === "image") {
    const qualities = SeedStar.capabilities?.imageQualities || ["1K"];
    if (!qualities.includes(state.quality)) state.quality = qualities[0];
    state.ratios = [state.ratio];
    return;
  }
  if (["spoken", "reshoot"].includes(state.mode)) return;
  const allowed = SeedStar.capabilities?.videoRatios || ["16:9", "9:16"];
  state.ratios = generatorRatios().filter((ratio) => allowed.includes(ratio));
  if (!state.ratios.length) state.ratios = [allowed[0] || "16:9"];
  state.ratio = state.ratios[0];
}
function generatorReferences() {
  const groups = state.refs[state.mode] || {};
  const keys = state.mode === "reference"
    ? state.refType === "first" ? ["firstFrame", "lastFrame", "audios"]
      : state.refType === "motion" ? ["motionImage", "motionVideo"] : ["images", "videos", "audios"]
    : Object.keys(groups);
  const counts = { image: 0, video: 0, audio: 0 };
  return keys.flatMap((bucket) => (groups[bucket] || []).map((asset, index) => {
    const mediaKind = SeedStar.mediaKind(asset) || asset.type?.split("/")[0];
    const kind = ["audio", "video"].includes(mediaKind) ? mediaKind : "image";
    return { bucket, index, asset, token: "@" + kind + (++counts[kind]) };
  }));
}
let generatorMentionRows = [], generatorMentionRequest = 0;
function generatorCloseMentions() {
  generatorMentionRequest++;
  $("generatorMentionMenu")?.remove();
  $("prompt")?.setAttribute("aria-expanded", "false");
}
async function generatorMentions(typed = false) {
  // Typing in narration must preserve the textarea, focus, and spoken text.
  if (typed && state.mode === "spoken") return;
  close();
  if (state.mode === "spoken") {
    state.spokenPanel = "cast";
    state.castTab = "library";
    await loadSpokenCatalog();
    render();
    return;
  }
  const p = $("prompt");
  if (!p) return;
  generatorCloseMentions();
  const request = generatorMentionRequest, mode = state.mode;
  const match = typed ? /@([^@\s]*)$/.exec(p.value.slice(0, p.selectionStart)) : null;
  generatorPromptSelection = { start: p.selectionStart - (match ? match[0].length : 0), end: p.selectionEnd };
  generatorMentionRows = generatorReferences();
  const assets = await SeedStar.assets.list();
  if (request !== generatorMentionRequest || mode !== state.mode || p !== $("prompt")) return;
  const availableBuckets = mode === "reference" ? state.refType === "first" ? { image: "firstFrame", audio: "audios" } : { image: "images", video: "videos", audio: "audios" } : mode === "reshoot" ? { image: "images", video: "source" } : { image: "images" };
  for (const asset of assets) {
    const bucket = availableBuckets[SeedStar.mediaKind(asset)];
    if (!bucket || !state.refs[mode][bucket] || state.refs[mode][bucket].length >= max[mode][bucket] || generatorMentionRows.some((r) => r.asset.id === asset.id || r.asset.url === asset.url)) continue;
    generatorMentionRows.push({ bucket, asset, available: true, token: "素材庫" });
  }
  if (match?.[1]) generatorMentionRows = generatorMentionRows.filter((r) => (r.token + " " + r.asset.name).toLowerCase().includes(match[1].toLowerCase()));
  const menu = document.createElement("div");
  menu.id = "generatorMentionMenu";
  menu.className = "generator-mention-menu";
  menu.setAttribute("role", "region"); menu.setAttribute("aria-label", "素材引用建議");
  menu.innerHTML = SeedStar.sanitize(`<div class="mention-list">${generatorMentionRows.map((r, i) => `<button class="option" data-gen-mention="${i}">${safe(r.token)} · ${safe(r.asset.name || "未命名素材")}</button>`).join("") || '<p>尚無可引用素材。</p>'}</div><div class="row"><button class="minor" data-gen-mention-upload>從裝置上傳</button><button class="minor" data-gen-mention-library>從素材庫選取</button><button class="minor" data-gen-mention-close>關閉引用</button></div>`);
  p.after(menu);
  p.setAttribute("aria-expanded", "true"); p.setAttribute("aria-controls", menu.id);
}
function generatorInsertMention(index) {
  let row = generatorMentionRows[index];
  const p = $("prompt");
  if (!row || !p) return;
  if (row.available) {
    const target = state.refs[state.mode][row.bucket];
    if (target.length >= max[state.mode][row.bucket]) throw Error("參考素材已達上限");
    target.push({ ...row.asset, type: row.asset.type || SeedStar.mediaKind(row.asset) + "/" });
    row = generatorReferences().find((r) => r.asset === target.at(-1));
  }
  const text = p.value, start = generatorPromptSelection?.start ?? text.length, end = generatorPromptSelection?.end ?? start;
  const prefix = start > 0 && !/\s$/.test(text.slice(0, start)) ? " " : "";
  const inserted = prefix + row.token + " ";
  state.data[state.mode] = text.slice(0, start) + inserted + text.slice(end);
  generatorCloseMentions();
  render();
  $("prompt")?.focus();
  $("prompt")?.setSelectionRange(start + inserted.length, start + inserted.length);
}
function generatorPresetPanel() {
  const rows = generatorPresets.filter((p) => p.mode === state.mode);
  modal("儲存生成設定", `<p class="small-note">保存模型、比例、時長及技能；提示詞和素材不包含在內。設為預設後，進入此生成方式時自動套用。</p>
    <label for="generatorPresetName">設定名稱</label><input class="field" id="generatorPresetName" maxlength="80" placeholder="例如：直式短片"><button class="minor" data-gen-preset-save>儲存目前設定</button>
    <div class="preset-list">${rows.length ? rows.map((p) => `<article class="workspace-card"><b>${safe(p.name)}</b>${p.default ? ' <span>預設</span>' : ''}<p>${safe((p.settings.ratios || [p.settings.ratio]).join("、"))} · ${safe(p.settings.quality)} · ${p.settings.duration}s</p><div class="row"><button class="minor" data-gen-preset-apply="${safe(p.id)}">套用</button><button class="minor" data-gen-preset-default="${safe(p.id)}">${p.default ? '取消預設' : '設為預設'}</button><button class="minor" data-gen-preset-delete="${safe(p.id)}">刪除設定</button></div></article>`).join("") : '<p>尚無已儲存的設定。</p>'}</div>`);
}
function generatorApplyPreset(preset) {
  if (!Object.hasOwn(preset.settings, "skills")) state.skills = [];
  if (!Object.hasOwn(preset.settings, "subtitleOptions")) state.subtitleOptions = generatorSubtitleDefaults();
  for (const key of generatorSettingKeys) if (Object.hasOwn(preset.settings, key)) state[key] = structuredClone(preset.settings[key]);
  const kind = state.mode === "image" ? "image" : state.mode === "spoken" ? "audio" : "video";
  if (preset.model) state.model[state.mode] = SeedStar.capabilities?.models?.[kind] || preset.model;
  generatorNormalizeSettings();
  if (state.mode === "director") state.directorLength = state.duration;
  if (state.mode === "product") state.productDuration = state.duration;
  render();
}
function generatorApplyDefault() {
  const preset = generatorPresets.find((p) => p.mode === state.mode && p.default);
  if (preset) generatorApplyPreset(preset);
}
async function generatorSavePresets(rows) {
  await SeedStar.preferences.set(generatorPresetKey, rows);
  generatorPresets = rows;
  generatorPresetPanel();
}
function generatorSyncPrompt() {
  const prompt = state.data[state.mode], n = typeof prompt === "string" ? prompt.length : 0;
  const count = $("generatorPromptCount");
  if (count) count.textContent = `${n} 字${state.mode === "spoken" ? ` · 預估口白 ${n ? Math.ceil(n / 4) : 0}s` : state.mode === "cartoon" ? ` · ${state.style < 0 ? "尚未選風格" : styles[state.style]}` : ""}`;
  const clear = document.querySelector('[data-action="clear"]');
  if (clear) clear.disabled = !n && !Object.values(state.refs[state.mode]).some((rows) => rows.length) && !(state.mode === "spoken" && (state.spokenVisualDirection || state.performance || state.cast || state.voice));
  const directorStart = document.querySelector('[data-action="director-start"]');
  if (directorStart) directorStart.disabled = !state.data.director.trim();
  const send = $("send");
  send.disabled = generatorBusy || !n || (state.mode === "cartoon" && state.style < 0) || (state.mode === "reference" && state.refType === "first" && !state.refs.reference.firstFrame.length);
  send.textContent = generatorBusy ? "送出中…" : state.mode === "image" ? "生成圖片" : state.mode === "spoken" ? "生成配音" : `開始生成${generatorRatios().length > 1 ? ` · ${generatorRatios().length} 種比例` : ""}`;
  const c = SeedStar.capabilities, status = $("providerStatus");
  if (c && status) {
    const serviceKind = state.mode === "image" ? "image" : state.mode === "spoken" ? "audio" : "video";
    status.textContent = !c[serviceKind] ? "此生成服務尚未設定；草稿、素材與設定可正常保存。" : state.mode === "spoken"
      ? "目前輸出配音音檔。人物對嘴與聲音複製尚未接入；送出依服務用量計費。"
      : ["reference", "cartoon", "director", "product"].includes(state.mode) && c.maxVideoImages === 1
        ? "目前影片服務：單張參考圖、16:9／9:16、720p、4／8／12 秒；影片、音訊及尾幀控制尚未接入。可先保存完整草稿。"
        : "送出依服務實際用量計費；可從歷史紀錄查看任務與成果。";
  }
}
function generatorValidation(input) {
  const caps = SeedStar.capabilities;
  const type = input.type === "image" ? "image" : input.type === "spoken" ? "audio" : "video";
  if (!input.prompt?.trim()) throw Error("請先輸入生成內容");
  if (caps && !caps[type]) throw Error("此生成服務尚未設定；可以先儲存草稿。");
  const settings = input.settings || {};
  if (type === "video" && caps) {
    if (caps.videoDurations && !caps.videoDurations.includes(settings.duration)) throw Error("目前影片服務不支援這個時長");
    if (caps.videoRatios && !caps.videoRatios.includes(settings.ratio)) throw Error("目前影片服務不支援 " + settings.ratio + "，請調整比例。");
    if (caps.videoQualities && !caps.videoQualities.includes(settings.quality)) throw Error("目前影片服務不支援此畫質");
    if (input.referenceMode === "motion" && !caps.motionReference) throw Error("動作參考服務尚未接入；素材與設定可保存為草稿。");
    if (input.referenceMode === "first" && !input.references?.firstFrame?.length) throw Error("首尾幀參考必須先選擇首幀。");
    if (input.references?.lastFrame?.length && !caps.lastFrameReference) throw Error("目前影片服務尚未支援尾幀控制。");
    if (settings.subtitle === "開" && !caps.subtitles) throw Error("字幕燒錄尚未接入，請先關閉自動字幕。");
    if (settings.audio === "靜音" && !caps.muteOutput) throw Error("此生成服務尚未支援靜音輸出。");
    if (settings.watermark !== "不套用" && !caps.generationWatermark) throw Error("請使用應用工具中的影片浮水印，生成服務尚未支援此選項。");
    const refs = Object.values(input.references || {}).flat();
    if (!caps.multiModalReferences && refs.some((r) => /^(video|audio)\//.test(r.type || "") || ["video", "audio"].includes(r.kind))) throw Error("目前影片服務只接受圖片參考；影片及音訊參考需要其他服務。");
    if (caps.maxVideoImages != null && refs.length > caps.maxVideoImages) throw Error(`目前影片服務最多接受 ${caps.maxVideoImages} 張參考圖。`);
  }
}
async function generatorSubmit(payload) {
  if (generatorBusy) return;
  generatorBusy = true;
  generatorSyncPrompt();
  try {
    const ratios = payload.type === "spoken" ? [state.ratio] : generatorRatios();
    const catalogue = await generatorSkillCatalogue();
    const selectedSkills = payload.settings?.skills?.length ? payload.settings.skills : payload.settings?.skill && payload.settings.skill !== "不套用技能" ? [payload.settings.skill] : [];
    if (selectedSkills.length > 5) throw Error("最多套用五個技能");
    const applied = selectedSkills.map((key) => {
      const skill = catalogue.find((s) => s.key === key || s.name === key);
      if (!skill) throw Error("選取的技能已不存在，請重新選擇");
      return skill.prompt;
    });
    const inputs = ratios.map((ratio) => ({ ...structuredClone(payload), prompt: [payload.prompt, ...applied].join("\n"), draftPrompt: payload.prompt, settings: { ...payload.settings, ratio, subtitleOptions: structuredClone(payload.settings?.subtitleOptions || state.subtitleOptions) } }));
    // Validate the entire batch before any paid submission.
    for (const input of inputs) generatorValidation(input);
    const results = [];
    for (const input of inputs) {
      try { const job = await SeedStar.generations.create(input); results.push({ ratio: input.settings.ratio, job }); }
      catch (error) { results.push({ ratio: input.settings.ratio, error: error.message }); }
    }
    if (results.length === 1) {
      if (results[0].error) throw Error(results[0].error);
      SeedStar.showJob(results[0].job);
    } else {
      modal("多比例生成任務", '<p>每個比例各有獨立任務；可從歷史紀錄查看完成狀態。</p>' + results.map((r) => `<article class="workspace-card"><b>${safe(r.ratio)}</b><p>${safe(r.error || r.job.error || r.job.status)}</p>${r.job ? `<button class="minor" data-gen-job="${safe(r.job.id)}">檢視任務</button>` : ''}</article>`).join(""));
    }
  } catch (e) { SeedStar.reportError(e); }
  finally { generatorBusy = false; generatorSyncPrompt(); }
}
async function generatorExtractAudio() {
  const target = state.refs.reference.audios;
  if (target.length >= max.reference.audios) throw Error("音訊參考已達上限");
  const [source] = await SeedStar.pickAssets({ kind: "video", limit: 1 });
  if (!source) return;
  const job = await SeedStar.generations.create({ type: "video", operation: "separate", references: { src: source }, settings: {} });
  SeedStar.showJob(job, { applyLabel: "加入參考音訊", apply: async (done) => {
    if (target.length >= max.reference.audios) throw Error("音訊參考已達上限");
    target.push({ id: "job-" + done.id, name: source.name + " · 音軌", url: done.result.url, kind: "audio", type: "audio/mpeg" });
    if (state.mode === "reference") render();
  } });
}
async function generatorUpload(files, bucket, mode = state.mode) {
  const current = state.refs[mode][bucket], cap = max[mode][bucket];
  if (!current || !cap) throw Error("請將檔案拖到對應的素材欄位");
  const needed = ["source", "videos", "motionVideo"].includes(bucket) ? "video" : bucket === "audios" ? "audio" : "image";
  let skipped = 0;
  for (const file of files) {
    if (current.length >= cap || !file.type.startsWith(needed + "/")) { skipped++; continue; }
    current.push(await SeedStar.uploadAsset(file));
  }
  if (skipped) SeedStar.notify(`有 ${skipped} 個檔案因格式不符或超過上限而未加入。`);
  render();
}
async function generatorControlsInit() {
  generatorPresets = await SeedStar.preferences.get(generatorPresetKey, []);
  generatorApplyDefault();
  document.addEventListener("click", async (event) => {
    const b = event.target.closest("[data-gen-mention],[data-gen-preset-save],[data-gen-preset-apply],[data-gen-preset-default],[data-gen-preset-delete],[data-gen-job],[data-gen-extract],[data-gen-voice],[data-gen-duration],[data-gen-product-choice],[data-gen-product-duration],[data-gen-motion-facing],[data-gen-motion-quality]");
    if (!b) return;
    try {
      if (b.hasAttribute("data-gen-mention")) generatorInsertMention(Number(b.dataset.genMention));
      if (b.hasAttribute("data-gen-preset-save")) {
        const name = $("generatorPresetName").value.trim();
        if (!name) throw Error("請填寫設定名稱");
        const settings = Object.fromEntries(generatorSettingKeys.map((key) => [key, structuredClone(state[key])]));
        settings.ratios = generatorRatios();
        await generatorSavePresets([...generatorPresets, { id: crypto.randomUUID(), mode: state.mode, name, settings, model: state.model[state.mode], default: false }]);
      }
      if (b.dataset.genPresetApply) {
        generatorApplyPreset(generatorPresets.find((p) => p.id === b.dataset.genPresetApply));
        $("modal").classList.add("hidden");
      }
      if (b.dataset.genPresetDefault) {
        const row = generatorPresets.find((p) => p.id === b.dataset.genPresetDefault);
        await generatorSavePresets(generatorPresets.map((p) => p.mode === state.mode ? { ...p, default: p.id === row.id && !row.default } : p));
      }
      if (b.dataset.genPresetDelete && confirm("刪除此生成設定？")) await generatorSavePresets(generatorPresets.filter((p) => p.id !== b.dataset.genPresetDelete));
      if (b.dataset.genJob) SeedStar.showJob(await SeedStar.generations.get(b.dataset.genJob));
      if (b.hasAttribute("data-gen-extract")) await generatorExtractAudio();
      if (b.dataset.genVoice) { state.voice = b.dataset.genVoice; render(); }
      if (b.dataset.genDuration) {
        state.duration = Number(b.dataset.genDuration);
        if (state.mode === "director") state.directorLength = state.duration;
        if (state.mode === "product") state.productDuration = state.duration;
        generatorRefreshOutputPanel();
      }
      if (b.dataset.genProductChoice) { state.productDirection[b.dataset.genProductChoice] = b.dataset.value; render(); }
      if (b.dataset.genProductDuration) { state.productDuration = Number(b.dataset.genProductDuration); render(); }
      if (b.dataset.genMotionFacing) { state.motion.facing = b.dataset.genMotionFacing; render(); }
      if (b.dataset.genMotionQuality) { state.motion.quality = b.dataset.genMotionQuality; render(); }
    } catch (e) { SeedStar.reportError(e); }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { close(); generatorCloseMentions(); $("modal").classList.add("hidden"); }
    const mention = $("generatorMentionMenu");
    if (mention && ["ArrowDown", "ArrowUp", "Enter"].includes(event.key) && (event.target.id === "prompt" || mention.contains(event.target))) {
      const choices = [...mention.querySelectorAll("[data-gen-mention]")];
      if (!choices.length) return;
      event.preventDefault();
      const current = choices.indexOf(document.activeElement);
      if (event.key === "Enter") (choices[current] || choices[0]).click();
      else choices[(current + (event.key === "ArrowDown" ? 1 : -1) + choices.length) % choices.length].focus();
    }
  });
  document.addEventListener("input", (event) => {
    if (event.target.id === "prompt") {
      generatorSyncPrompt();
      if (/(?:^|\s)@[^@\s]*$/.test(event.target.value.slice(0, event.target.selectionStart))) generatorMentions(true).catch(SeedStar.reportError);
      else generatorCloseMentions();
    }
    if (event.target.id === "motionPrompt") state.motion.prompt = event.target.value;
    if (event.target.id === "motionPreserveAudio") state.motion.preserveAudio = event.target.checked;
  });
  document.addEventListener("change", (event) => {
    if (event.target.dataset.genTag !== undefined) state.refs.reshoot.images[Number(event.target.dataset.genTag)].tag = event.target.value;
  });
  const board = document.querySelector(".board");
  board.addEventListener("dragover", (event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); });
  board.addEventListener("drop", (event) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    const target = event.target.closest("[data-drop-bucket],[data-upload]");
    const bucket = target?.dataset.dropBucket || target?.dataset.upload;
    generatorUpload(event.dataTransfer.files, bucket).catch(SeedStar.reportError);
  });
  generatorSyncPrompt();
  SeedStar.generator.controlsReady = true;
}

// These guides are local prompts; no third-party skill catalogue is imported.
const generatorSystemSkills = [
  ["short-ad", "短片廣告", "先交代觀眾遇到的問題，再以畫面展示一項可驗證的商品利益，最後提出明確行動。避免未提供的價格與效果承諾。"],
  ["review", "使用心得", "以日常使用情境安排鏡頭，描述具體觀察，不捏造使用者證言或評價。"],
  ["brand", "品牌形象", "統一色調、鏡頭節奏與品牌情緒，使用已提供的品牌資訊，留出結尾標誌位置。"],
  ["story", "劇情敘事", "安排開場、衝突、轉折與收束，每個鏡頭推進一個事件，保持人物與場景連貫。"],
  ["product", "商品展示", "以清楚的近景與使用畫面展示商品，依參考資料維持外觀、比例及材質，不添加不存在的功能。"],
  ["tutorial", "步驟教學", "按照實際操作順序拆分步驟，每個畫面只解釋一個動作，展示操作前後的變化。"],
  ["natural", "自然口播", "台詞使用簡短口語句子，語氣自然，保留合理停頓，避免念出畫面或表演指示。"],
  ["composition", "構圖與光線", "明確安排主體位置、前中後景與光線方向，保持構圖乾淨並維持畫面一致性。"],
].map(([id, name, prompt]) => ({ key: "system:" + id, name, prompt, source: "system" }));
let generatorSkillTab = "system";
async function generatorSkillCatalogue() {
  const custom = await SeedStar.preferences.get("workspace.skills", []);
  return [...generatorSystemSkills, ...custom.map((s) => ({ ...s, key: "custom:" + (s.id || s.name), source: "custom" }))];
}
async function generatorSkillPanel() {
  const catalogue = await generatorSkillCatalogue();
  // Migrate a single-skill draft without changing its selected instruction.
  if (!state.skills.length && state.skill !== "不套用技能") {
    const previous = catalogue.find((s) => s.name === state.skill);
    if (previous) state.skills = [previous.key];
  }
  pop(`<h3>套用技能</h3><button class="option" data-gen-skill-clear aria-pressed="${!state.skills.length}">不套用技能</button><div class="chips" role="tablist" aria-label="技能來源">${[["custom", "自訂技能"], ["system", "系統技能"]].map(([key, label]) => `<button role="tab" aria-selected="${key === generatorSkillTab}" data-gen-skill-tab="${key}">${label} ${catalogue.filter((s) => s.source === key).length}</button>`).join("")}</div><div class="generator-skill-list">${catalogue.filter((s) => s.source === generatorSkillTab).map((s) => `<button class="option" role="checkbox" aria-checked="${state.skills.includes(s.key)}" data-gen-skill="${safe(s.key)}"><b>${safe(s.name)}</b><small>${safe(s.prompt)}</small></button>`).join("") || '<p>尚無自訂技能。</p>'}</div><p class="small-note">依選取順序套用，最多五個。保留原提示詞，送出時加入技能指引。</p><button class="minor" data-gen-skill-manage>管理自訂技能</button>`);
}
function generatorSubtitlePanel() {
  const options = state.subtitleOptions;
  const choices = (key, values) => `<div class="chips">${values.map((value) => `<button data-gen-subtitle-option="${key}" data-value="${value}" aria-pressed="${options[key] === value}">${value}</button>`).join("")}</div>`;
  return `<h3>自動產生字幕</h3><p class="small-note">保存原片，另產生字幕版。${SeedStar.capabilities?.subtitles ? "" : "字幕辨識、翻譯與燒錄尚未接入；以下可先保存為草稿，開啟時不會送出生成。"}</p><div class="chips">${["關", "開"].map((value) => `<button data-subtitle="${value}" aria-pressed="${state.subtitle === value}">${value === "開" ? "開啟" : "關閉"}</button>`).join("")}</div>${state.subtitle === "開" ? `<fieldset><legend>字幕語言（最多 2 種）</legend><p class="small-note">第一個語言顯示在上方，第二個顯示在下方。</p><div class="chips">${["原文", "繁體中文", "簡體中文", "English", "日本語", "한국어", "ภาษาไทย"].map((value) => `<button role="checkbox" data-gen-subtitle-language="${value}" aria-checked="${options.languages.includes(value)}">${value}</button>`).join("")}</div></fieldset><fieldset><legend>字幕樣式</legend>${choices("style", ["白字黑邊", "白字灰底", "黑底白字", "白底黑字", "白字陰影", "黃字黑邊"])}</fieldset><fieldset><legend>大小</legend>${choices("size", ["小", "中", "大"])}</fieldset><fieldset><legend>位置</legend>${choices("position", ["下方", "中下", "中間", "上方"])}</fieldset><p class="subtitle-preview" data-subtitle-preview data-style="${options.style}" data-size="${options.size}" data-position="${options.position}"><span>字幕預覽${options.languages.length > 1 ? '<br>Subtitle preview' : ''}</span></p>` : ""}`;
}
function generatorReshootSettings() {
  const size = { "480p": [854,480], "720p": [1280,720], "1080p": [1920,1080] }[state.quality] || [1280,720];
  const output = state.ratio === "1:1" ? [size[1],size[1]] : state.ratio === "9:16" ? [...size].reverse() : state.ratio === "4:5" ? [size[1] * 4 / 5, size[1]] : state.ratio === "4:3" ? [size[1] * 4 / 3, size[1]] : size;
  return `<h3>拍片輸出設定</h3><p class="small-note">重拍服務尚未接入；可保存草稿。時長沿用來源影片。</p><fieldset><legend>長寬比</legend><div class="chips">${["16:9", "9:16", "1:1", "4:5", "4:3"].map((value) => `<button data-ratio="${value}" aria-pressed="${state.ratio === value}">${value}</button>`).join("")}</div></fieldset><fieldset><legend>畫質</legend><div class="chips">${["480p", "720p", "1080p"].map((value) => `<button data-quality="${value}" aria-pressed="${state.quality === value}">${value}</button>`).join("")}</div></fieldset><p id="generatorOutputDimensions">輸出尺寸 · ${output.join(" × ")} px</p>`;
}
document.addEventListener("click", async (event) => {
  const b = event.target.closest("[data-gen-skill],[data-gen-skill-tab],[data-gen-skill-clear],[data-gen-skill-manage],[data-gen-subtitle-language],[data-gen-subtitle-option]");
  if (!b) return;
  try {
    if (b.hasAttribute("data-gen-skill-manage")) { close(); $("skillsNav").click(); return; }
    if (b.dataset.genSkillTab) generatorSkillTab = b.dataset.genSkillTab;
    if (b.hasAttribute("data-gen-skill-clear")) { state.skills = []; state.skill = "不套用技能"; }
    if (b.dataset.genSkill) {
      const key = b.dataset.genSkill;
      if (state.skills.includes(key)) state.skills = state.skills.filter((s) => s !== key);
      else if (state.skills.length < 5) state.skills.push(key);
      else { SeedStar.notify("最多套用五個技能"); return; }
      const catalogue = await generatorSkillCatalogue();
      state.skill = state.skills.map((key) => catalogue.find((s) => s.key === key)?.name || key).join("、") || "不套用技能";
    }
    if (b.dataset.genSubtitleLanguage) {
      const value = b.dataset.genSubtitleLanguage, languages = state.subtitleOptions.languages;
      if (languages.includes(value)) {
        if (languages.length > 1) state.subtitleOptions.languages = languages.filter((s) => s !== value);
      } else if (languages.length < 2) languages.push(value);
      else { SeedStar.notify("字幕最多選擇兩種語言"); return; }
    }
    if (b.dataset.genSubtitleOption) state.subtitleOptions[b.dataset.genSubtitleOption] = b.dataset.value;
    render();
    await panel(b.hasAttribute("data-gen-subtitle-language") || b.hasAttribute("data-gen-subtitle-option") ? "subtitle" : "skill");
  } catch (error) { SeedStar.reportError(error); }
});
// A panel must never remain behind a second overlay or a different mode.
document.addEventListener("click", (event) => {
  if (event.target.closest("[data-popover-close]")) {
    const name = document.getElementById("popover").dataset.activePanel;
    close();
    [...document.querySelectorAll('button[data-panel]')].find(button => button.dataset.panel === name && button.getClientRects().length)?.focus();
  }
  if (!event.composedPath().some((node) => node.id === "popover" || node.matches?.("[data-panel]"))) close();
  if (!event.composedPath().some((node) => node.id === "generatorMentionMenu" || node.id === "prompt" || node.matches?.('[data-action="mention"]'))) generatorCloseMentions();
  if (event.target.closest("[data-gen-mention-close]")) generatorCloseMentions();
  const reference = event.target.closest("[data-gen-reference-replace],[data-gen-reference-preview]");
  if (reference) {
    const value = reference.dataset.genReferenceReplace || reference.dataset.genReferencePreview;
    const [bucket, index] = value.split(":");
    if (reference.hasAttribute("data-gen-reference-replace")) replaceReference(bucket, Number(index));
    else generatorPreviewReference(bucket, Number(index));
  }
  if (event.target.closest("[data-gen-mention-library],[data-gen-mention-upload]")) {
    const upload = !!event.target.closest("[data-gen-mention-upload]");
    generatorCloseMentions();
    if (upload) document.querySelector("#content [data-upload]")?.click();
    else document.querySelector('#content [data-action="library"]')?.click();
  }
});
