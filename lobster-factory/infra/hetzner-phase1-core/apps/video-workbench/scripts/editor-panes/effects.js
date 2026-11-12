// Card ED.12 (docs/editor-parity-spec-20261106.md §1.3 特效): the 「特效」 left pane. Registered with edRegisterPane in
// tools-editor.js. Two jobs that put a new picture under the selected video clip, both through existing job kinds:
// - 畫質增強 = the tools' upscale job (backend/media.cjs upscale, local, free) on the clip's whole asset, so every
//   source time still points at the same picture; 裁切、速度、效果、關鍵影格、轉場 stay as they are.
// - 從這裡重新生成 = a video generation with the frame under the playhead as its first frame (referenceMode "first",
//   backend/generation-policy.cjs validate), priced before the click; the clip is split at the playhead and the part
//   after the cut plays the new video.
// Nothing on the timeline changes until a job has succeeded; a failed or refused send leaves the clip as it was.
const edFxUi = { quality: "1080p", model: "", seconds: 0, prompts: new Map(), found: new Map(), busy: false, caps: null, results: null };
const edFxQualities = ["1080p", "2K", "4K"];
const edFxVideo = (c) => (c?.kind === "video" && c.asset?.url ? c : null);
function edFxCaps() {
  const c = VideoWorkbench.capabilities;
  if (c) return c;
  edFxUi.caps ||= VideoWorkbench.request("/capabilities", undefined, "GET")
    .then((x) => {
      VideoWorkbench.capabilities ||= x;
      if (tool === "edit") edRedraw();
    })
    .catch(VideoWorkbench.reportError);
  return null;
}
// The cut: timeline frame of the playhead inside the clip (≥ 1 frame from both ends, as 分割), and the source second
// it shows. null = the playhead is not inside the clip.
function edFxCut(p, c) {
  const offset = edFrame(p) - c.startFrame;
  if (offset < 1 || offset > c.durationFrames - 1) return null;
  const tb = p.timebase;
  return {
    frame: c.startFrame + offset,
    at: c.sourceStart + Timebase.toSeconds(offset, tb) * c.speed,
    // Source seconds the part after the cut plays (speed applies: a 2× clip needs twice the footage).
    need: Timebase.toSeconds(c.durationFrames - offset, tb) * c.speed,
  };
}
// Models that can run here (a row without its key is 未啟用 and never sent), then the chosen one.
function edFxModels(caps) {
  return VideoWorkbenchVideoModels.list(caps).filter((m) => m.available !== false);
}
function edFxModel(caps) {
  const rows = edFxModels(caps);
  return rows.find((m) => m.id === edFxUi.model) || rows[0] || null;
}
// The chosen length, else the shortest the model makes that covers the part after the cut, else its longest.
function edFxSeconds(vm, need) {
  if (vm.durations.includes(edFxUi.seconds)) return edFxUi.seconds;
  return vm.durations.find((d) => d >= need - 0.01) ?? vm.durations.at(-1);
}
// The prompt the clip's picture was made with: the one typed here for this clip, else its asset's record, else the
// job that made it (asset id job-<jobId>, shared/runtime.js jobAsset). "" = none known.
function edFxPrompt(c) {
  if (edFxUi.prompts.has(c.id)) return edFxUi.prompts.get(c.id);
  const own = String(c.asset.origin?.prompt || "").trim();
  if (own) return own;
  const id = c.asset.id;
  if (!edFxUi.found.has(id) && String(id).startsWith("job-")) {
    edFxUi.found.set(id, "");
    VideoWorkbench.generations
      .list()
      .then((jobs) => {
        const j = jobs.find((x) => "job-" + x.id === id),
          text = String(j?.input?.draftPrompt || j?.input?.prompt || "").trim();
        if (!text) return;
        edFxUi.found.set(id, text);
        if (tool === "edit" && edClip()?.asset?.id === id) edRedraw();
      })
      .catch(VideoWorkbench.reportError);
  }
  return edFxUi.found.get(id) || "";
}
const edFxMoney = (usd, caps) => (usd === 0 ? "免費" : (Number.isFinite(usd) && window.VideoWorkbenchMoney(usd, caps)) || "");
// Google rows are billed on the reply's token usage (backend/provider-cost.cjs videoUsd), so their per-second price is
// an estimate; Replicate rows are a fixed rate per second.
function edFxPrice(vm, seconds, caps) {
  const text = edFxMoney(VideoWorkbenchVideoModels.usd(vm, seconds), caps);
  return text && vm.provider === "Google" ? "約 " + text : text;
}
function edFxEnhanceHtml(c) {
  if (!edFxVideo(c)) return '<p class="note">先在時間軸選一段影片片段。</p>';
  return `${edChoices("輸出畫質", "fx-quality", edFxUi.quality, edFxQualities)}<p class="note">本機高品質縮放：提高解析度，不會補出原片沒有的細節。整支素材處理完才替換，裁切、速度、效果、關鍵影格與轉場都不變。</p>${edButton("畫質增強 · 免費（本機處理）", "fx-enhance", edFxUi.busy)}`;
}
function edFxRegenHtml(p, c) {
  if (!edFxVideo(c)) return '<p class="note">先在時間軸選一段影片片段，把播放頭停在最後一格正常的畫面。</p>';
  const caps = edFxCaps(),
    cut = edFxCut(p, c),
    vm = caps && edFxModel(caps),
    prompt = edFxPrompt(c);
  let block = !caps ? "讀取影片服務…" : !vm ? "影片生成服務尚未設定。" : !cut ? "播放頭要停在這個片段裡面（離頭尾至少一格）。" : !vm.ratios.includes(p.ratio) ? `${vm.label} 只支援 ${vm.ratios.join("／")}；這個專案是 ${p.ratio}。` : "";
  const seconds = vm ? edFxSeconds(vm, cut?.need ?? 0) : 0,
    price = vm ? edFxPrice(vm, seconds, caps) : "";
  if (!block && !price) block = "價格還沒載入，請稍候。";
  // Typing does not redraw the pane, so an empty prompt is refused on the click (fx-regen), not by disabling.
  const models = caps ? edFxModels(caps) : [],
    short = cut && seconds < cut.need - 0.01 ? `；${vm.label} 最長 ${seconds} 秒，後段會縮短` : "";
  return `<p class="note">以播放頭這一格當首幀、照原提示詞重生，取代切點之後的部分。生成完成前時間軸不會改。</p><label class="ed-fx-field">提示詞<textarea class="text-input" rows="3" maxlength="2000" aria-label="重新生成提示詞" data-ed-fx="prompt" placeholder="沒有找到原提示詞，請輸入">${esc(prompt)}</textarea></label>${models.length > 1 ? `<h4>影片模型</h4>${edChoices("重新生成影片模型", "fx-model", vm.id, models.map((m) => m.id), (id) => models.find((m) => m.id === id).label)}` : ""}${vm ? `<h4>生成長度</h4>${edChoices("重新生成長度", "fx-seconds", String(seconds), vm.durations.map(String), (d) => d + " 秒")}` : ""}${cut ? `<p class="note" data-ed-fx-plan>首幀：素材第 ${cut.at.toFixed(2)} 秒；取代 ${edClockText(Timebase.toSeconds(cut.frame, p.timebase))} 到 ${edClockText(c.start + c.duration)}${short}。</p>` : ""}${block ? `<p class="note" data-ed-fx-block>${esc(block)}</p>` : ""}${edButton(`從這裡重新生成 · ${price || "價格未載入"}`, "fx-regen", !!block || edFxUi.busy, "video.motion")}`;
}
// The frame under the playhead as a PNG in the library (free; the source's own picture, edits are applied on top
// of the new clip as they were on the old one).
async function edFxFrame(c, at) {
  const v = document.createElement("video");
  v.muted = true;
  v.preload = "auto";
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error("讀取畫面逾時")), 20000);
      v.onloadeddata = () => {
        v.onseeked = () => {
          clearTimeout(timer);
          resolve();
        };
        v.currentTime = Math.min(at, Math.max(0, v.duration - 0.001));
      };
      v.onerror = () => {
        clearTimeout(timer);
        reject(Error("影片畫面無法讀取"));
      };
      v.src = c.asset.url;
    });
    const canvas = Object.assign(document.createElement("canvas"), { width: v.videoWidth, height: v.videoHeight });
    canvas.getContext("2d").drawImage(v, 0, 0);
    const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
    if (!blob) throw Error("影片畫面無法讀取");
    return await VideoWorkbench.uploadAsset(new File([blob], `首幀-${at.toFixed(2)}s.png`, { type: "image/png" }), { derived: true });
  } finally {
    v.removeAttribute("src");
    v.load();
  }
}
// The clip a job was sent for, found again when it settles: same id, same asset and (for a cut) same timing, or the
// result stays in the library only.
function edFxTarget(p, sent) {
  const c = p.clips.find((x) => x.id === sent.clipId);
  if (!c || c.asset?.id !== sent.assetId) return null;
  if (sent.timing && sent.timing !== edFxTiming(c)) return null;
  return c;
}
const edFxTiming = (c) => [c.startFrame, c.durationFrames, c.sourceStartFrame, c.speed].join(":");
const edFxStale = "片段在處理期間改過或刪除了，成果已放在素材庫，可以自己放上時間軸。";
function edFxReplaceAsset(p, c, a) {
  if (!p.assets.some((x) => x.id === a.id)) p.assets.push(a);
  c.previousAssetIds = [...(c.previousAssetIds || []), c.asset.id];
  c.asset = a;
}
// 畫質增強 settled: the clip's asset becomes the upscaled file; time fields are untouched (same length file).
async function edFxEnhanceApply(p, sent, v) {
  if (v.status !== "succeeded") return false;
  if (edProject() !== p) throw Error("請先回到原本的剪輯專案");
  const a = await edProbe(VideoWorkbench.jobAsset(v));
  if (edProject() !== p) throw Error("請先回到原本的剪輯專案");
  if (p.clips.some((x) => x.id === sent.clipId && x.asset?.id === a.id)) return;
  const c = edFxTarget(p, sent);
  if (!c) throw Error(edFxStale);
  if (Math.abs(a.duration - c.asset.duration) > 0.1) throw Error("增強後的影片長度和原片不同，沒有替換；成果在素材庫。");
  edCheckpoint();
  edFxReplaceAsset(p, c, a);
  edValidate(c);
  await edCommit(p);
}
// 從這裡重新生成 settled: 分割 at the cut (tools-editor.js split, one undo step), then the part after it plays the new
// video from its first frame, shortened only when the video is shorter. Split + swap are one step: a refusal or a failed
// save after the split rolls the split back.
async function edFxRegenApply(p, sent, v) {
  if (v.status !== "succeeded") return false;
  if (edProject() !== p) throw Error("請先回到原本的剪輯專案");
  const a = await edProbe(VideoWorkbench.jobAsset(v));
  if (edProject() !== p) throw Error("請先回到原本的剪輯專案");
  if (p.clips.some((x) => x.asset?.id === a.id)) return;
  const c = edFxTarget(p, sent);
  if (!c) throw Error(edFxStale);
  const mark = ed.undo.length;
  try {
    ed.time = Timebase.toSeconds(sent.cutFrame, p.timebase);
    ed.selected = c.id;
    await edAction("split");
    // Found by place, not edClip(): the user may select another clip while the split saves.
    const after = p.clips.find((x) => x.id !== c.id && x.track === c.track && x.startFrame === sent.cutFrame && x.asset?.id === sent.assetId);
    if (!after) throw Error("分割失敗，沒有替換");
    edFxReplaceAsset(p, after, a);
    const fit = Math.floor(Timebase.toFrames(a.duration, p.timebase) / after.speed);
    edTime(p, after, { sourceStartFrame: 0, ...(fit < after.durationFrames ? { durationFrames: Math.max(1, fit) } : {}) });
    if (fit < after.durationFrames) {
      edWindowKeys(after, after, 0, after.durationFrames);
      after.fadeOut = Math.min(after.fadeOut, after.duration / 2);
      after.fadeIn = Math.min(after.fadeIn, after.duration / 2);
    }
    edValidate(after);
    await edCommit(p);
  } catch (e) {
    // Only the split's own snapshot is undone; an edit the user made meanwhile is never rolled back.
    if (edProject() === p && ed.undo.length === mark + 1) await edAction("undo");
    throw e;
  }
}
const edFxApply = { enhance: edFxEnhanceApply, regen: edFxRegenApply };
// Succeeded jobs sent from this project whose picture is not on its timeline: a reload (or a closed job panel) loses the
// automatic swap, so they are listed here with 替換. The target is in the job's own input (editorFx).
async function edFxResults(p) {
  edFxUi.results = {
    projectId: p.id,
    jobs: (await VideoWorkbench.generations.list())
      .filter((j) => j.status === "succeeded" && j.input?.editorFx?.projectId === p.id && !p.clips.some((c) => c.asset?.id === "job-" + j.id))
      .reverse(),
  };
}
function edFxResultsHtml(p) {
  const r = edFxUi.results?.projectId === p.id ? edFxUi.results.jobs : null;
  return `<h3>完成的結果</h3>${edButton("找回已完成的結果", "fx-results")}${
    !r ? "" : r.length ? `<ul class="ed-fx-results">${r.map((j) => `<li><span>${j.input.editorFx.kind === "regen" ? "重新生成" : "畫質增強"} · ${esc(new Date(j.createdAt).toLocaleString())}</span>${edButton("替換", "fx-apply:" + j.id)}</li>`).join("")}</ul>` : '<p class="note">沒有尚未替換的結果。</p>'
  }`;
}
function edFxWatch(job, apply, label) {
  VideoWorkbench.showJob(job, {
    // Placed as soon as it succeeds while the panel is open; 替換 on the panel is the same step by hand.
    onSuccess: (v) => apply(v).catch(VideoWorkbench.reportError),
    apply,
    applyLabel: label,
  });
}
edRegisterPane("effects", {
  title: "特效",
  icon: "✧",
  render: (p, c) =>
    `<div class="ed-fx"><h3>畫面效果</h3><p class="note">濾鏡、遮罩、顆粒、光漏、鏡頭震動與關鍵影格在右側屬性面板調整：選取片段時設定該片段，未選取時是整片設定。</p><h3>畫質增強</h3>${edFxEnhanceHtml(c)}<h3>從這裡重新生成</h3>${edFxRegenHtml(p, c)}${edFxResultsHtml(p)}</div>`,
  actions: {
    "fx-quality:": async (action) => {
      if (edFxQualities.includes(action.slice(11))) edFxUi.quality = action.slice(11);
      edRedraw();
    },
    "fx-model:": async (action) => {
      edFxUi.model = action.slice(9);
      edFxUi.seconds = 0;
      edRedraw();
    },
    "fx-seconds:": async (action) => {
      edFxUi.seconds = Number(action.slice(11));
      edRedraw();
    },
    "fx-results": async (action, p) => {
      await edFxResults(p);
      edRedraw();
    },
    "fx-apply:": async (action, p) => {
      const v = await VideoWorkbench.generations.get(action.slice(9)),
        { kind, ...sent } = v.input?.editorFx || {};
      if (!edFxApply[kind] || sent.projectId !== p.id) throw Error("這個結果不屬於目前的剪輯專案");
      await edFxApply[kind](p, sent, v);
      await edFxResults(edProject());
      edRedraw();
    },
    "fx-enhance": async (action, p, c) => {
      if (!edFxVideo(c)) throw Error("先在時間軸選一段影片片段");
      if (edFxUi.busy) return;
      edFxUi.busy = true;
      try {
        const sent = { projectId: p.id, clipId: c.id, assetId: c.asset.id };
        // paid: none (local upscale, backend/main-system.cjs paidFeature)
        const job = await VideoWorkbench.generations.create({
          type: "video",
          operation: "upscale",
          references: { src: { id: c.asset.id, url: c.asset.url, name: c.asset.name, type: c.asset.type } },
          settings: { upscaleQuality: edFxUi.quality },
          editorFx: { kind: "enhance", ...sent },
        });
        edFxWatch(job, (v) => edFxEnhanceApply(p, sent, v), "替換片段");
      } finally {
        edFxUi.busy = false;
      }
    },
    "fx-regen": async (action, p, c) => {
      if (!edFxVideo(c)) throw Error("先在時間軸選一段影片片段");
      const caps = edFxCaps(),
        vm = caps && edFxModel(caps),
        cut = edFxCut(p, c),
        prompt = edFxPrompt(c).trim();
      if (!vm) throw Error("影片生成服務尚未設定");
      if (!cut) throw Error("播放頭要停在這個片段裡面");
      if (!vm.ratios.includes(p.ratio)) throw Error(`${vm.label} 只支援 ${vm.ratios.join("／")}`);
      if (!prompt) throw Error("請輸入提示詞");
      const seconds = edFxSeconds(vm, cut.need);
      // Sent only with a price on the button (shared/paid-price.js rule); the server prices the same model and length.
      if (!edFxMoney(VideoWorkbenchVideoModels.usd(vm, seconds), caps)) throw Error("價格還沒載入，請稍候再按");
      if (edFxUi.busy) return;
      edFxUi.busy = true;
      edRedraw();
      try {
        const sent = { projectId: p.id, clipId: c.id, assetId: c.asset.id, timing: edFxTiming(c), cutFrame: cut.frame },
          frame = await edFxFrame(c, cut.at);
        // paid: video.motion
        const job = await VideoWorkbench.generations.create({
          type: "video",
          prompt,
          draftPrompt: prompt,
          referenceMode: "first",
          references: { firstFrame: [{ id: frame.id, url: frame.url, name: frame.name, type: "image/png", kind: "image" }] },
          settings: { model: vm.id, ratio: p.ratio, duration: seconds, quality: "720p" },
          duration: seconds,
          editorFx: { kind: "regen", ...sent },
        });
        edFxWatch(job, (v) => edFxRegenApply(p, sent, v), "替換後段");
      } finally {
        edFxUi.busy = false;
        edRedraw();
      }
    },
  },
});
document.addEventListener("input", (e) => {
  if (e.target.dataset?.edFx !== "prompt") return;
  const c = edClip();
  if (c) edFxUi.prompts.set(c.id, e.target.value);
});
