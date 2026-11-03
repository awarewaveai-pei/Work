// Tool views use the same files, values and storage adapter as the workbench.
function wfDefaults(defaults) {
  for (const [key, value] of Object.entries(defaults))
    if (values[key] === undefined) values[key] = structuredClone(value);
}
function wfChoice(key, options, multiple = false) {
  return `<div class="flow-choices" role="group">${options
    .map((option) => {
      const selected = multiple
        ? (values[key] || []).includes(option)
        : values[key] === option;
      return `<button type="button" class="btn small ${selected ? "selected" : ""}" data-flow-choice="${esc(key)}" data-flow-value="${esc(option)}" data-flow-multiple="${multiple}" aria-pressed="${selected}">${esc(option)}</button>`;
    })
    .join("")}</div>`;
}
function wfSelect(key, title, options) {
  return `<label>${esc(title)}<select class="text-input" data-key="${esc(key)}" data-flow-render>${options.map((v) => `<option ${String(values[key]) === String(v) ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></label>`;
}
function wfField(key, title, type = "text", attributes = "") {
  return `<label>${esc(title)}<input class="text-input" type="${type}" data-key="${esc(key)}" aria-label="${esc(title)}" value="${esc(values[key] ?? "")}" ${attributes}></label>`;
}
function wfArea(key, title, max = 2000) {
  return `<label>${esc(title)}<textarea data-key="${esc(key)}" aria-label="${esc(title)}" maxlength="${max}">${esc(values[key] || "")}</textarea></label>`;
}
function wfCheck(key, title) {
  return `<label class="check"><input type="checkbox" data-key="${esc(key)}" data-flow-render ${values[key] ? "checked" : ""}>${esc(title)}</label>`;
}
function wfButton(title, action, disabled = false) {
  return `<button type="button" class="btn" data-flow-action="${esc(action)}" ${disabled ? "disabled" : ""}>${esc(title)}</button>`;
}
function wfWrap(t, content) {
  return `<div class="wrap tool-flow" data-tool-flow="${t.id}">${header(t, t.id.toUpperCase())}${content}</div>`;
}
function wfSource(id = "src", kind = "video") {
  const asset = files[id];
  if (!asset)
    return `<section class="stage flow-source-empty" data-flow-drop="${id}"><h3>${kind === "image" ? "選一張圖片" : kind === "audio" ? "選一段音訊" : "選一支影片"}</h3><p>從素材庫選取或上傳；原始檔案會保留。</p>${chooser(id)}</section>`;
  const type = asset.type || "";
  return `<section class="flow-source">${type.startsWith("image/") ? `<img data-flow-media="${id}" class="upload-preview" src="${esc(asset.url)}" alt="${esc(asset.name)}">` : `<${type.startsWith("audio/") ? "audio" : "video"} data-flow-media="${id}" src="${esc(asset.url)}" controls preload="metadata"></${type.startsWith("audio/") ? "audio" : "video"}>`}<div class="flow-media-meta"><b>${esc(asset.name || "已選素材")}</b><span data-flow-meta></span>${btn("更換素材", "library:" + id)}</div></section>`;
}
function wfStats() {
  return '<p class="note" data-flow-stats></p>';
}
function toolWorkflowScreen(t) {
  if (t.id === "edit")
    return typeof toolEditorScreen === "function" ? toolEditorScreen(t) : null;
  if (t.id === "compose")
    return typeof toolCompositorScreen === "function" ? toolCompositorScreen(t) : null;
  if (t.id === "rig")
    return typeof toolRigScreen === "function" ? toolRigScreen(t) : null;
  if (t.id === "3d")
    return typeof toolThreeDScreen === "function" ? toolThreeDScreen(t) : null;
  if (t.id === "subtitle")
    return typeof toolSubtitleScreen === "function"
      ? toolSubtitleScreen(t)
      : null;
  let content;
  if (t.id === "short") {
    wfDefaults({
      shortMode: "多支短影音",
      shortPick: "AI 自動判斷",
      shortVisual: false,
      shortLength: "自動（20–60 秒）",
      shortCount: "最多 5 段",
      shortHighlightLength: "約 60 秒",
      shortLanguage: "自動偵測",
      shortCaption: false,
    });
    content =
      wfSource() +
      (files.src
        ? `<aside class="side"><h3>分析設定</h3><label>剪成</label>${wfChoice("shortMode", ["多支短影音", "一支精華"])}<label>挑選方式</label>${wfChoice("shortPick", ["AI 自動判斷", "依我的指令"])}${values.shortPick === "依我的指令" ? wfCheck("shortVisual", "依畫面內容找（AI 看畫面，不聽內容）") + wfArea("shortPrompt", "剪輯指令", 500) + `<div class="flow-choices">${(values.shortVisual ? ["產品特寫", "操作示範", "精彩動作", "風景空景"] : ["精華重點", "金句爆點", "教學步驟", "產品亮點", "幽默有梗"]).map((name) => wfButton(name, "short-preset:" + name)).join("")}</div>` : '<p class="note">分析整支影片，尋找能單獨成立的段落。</p>'}${values.shortMode === "多支短影音" ? wfSelect("shortLength", "每段長度", ["自動（20–60 秒）", "短（15–35 秒）", "中（30–60 秒）", "長（60–120 秒）"]) + wfSelect("shortCount", "建議數量", ["最多 3 段", "最多 5 段", "最多 8 段", "最多 10 段"]) : wfSelect("shortHighlightLength", "精華長度", ["約 30 秒", "約 60 秒", "約 90 秒"])}${wfSelect("shortLanguage", "語音辨識語言", wfLanguages())}${btn("匯入 SRT／VTT（免辨識）", "upload:subtitlefile")}${wfCheck("shortCaption", "輸出時加入字幕")}${wfStats()}${wfButton("開始分析", "short-analyze")}</aside>`
        : '<aside class="side"><h3>使用方式</h3><p>選影片 → 分析並比較段落 → 調整起訖與裁切 → 確認輸出。</p></aside>');
  } else if (t.id === "follow") {
    return toolFollowScreen(t);
  } else if (t.id === "enhance") {
    wfDefaults({
      enhanceType: "音訊",
      enhanceOption: "人聲降噪",
      enhanceResolution: "1080P",
    });
    const options =
      values.enhanceType === "音訊"
        ? ["人聲降噪", "只保留人聲", "去除人聲", "音量均衡", "音質美化"]
        : ["畫質增強", "2 倍超解析", "AI 大模型增強", "去字幕"];
    if (!options.includes(values.enhanceOption))
      values.enhanceOption = options[0];
    content =
      wfSource() +
      `<aside class="side"><h3>增強設定</h3>${wfChoice("enhanceType", ["音訊", "畫面"])}${wfChoice("enhanceOption", options)}${values.enhanceOption === "AI 大模型增強" ? wfSelect("enhanceResolution", "輸出解析度", ["720P", "1080P", "2K", "4K"]) : ""}${values.enhanceOption === "去字幕" ? '<p class="note">只移除燒入字幕，其他標題與 Logo 應保留；此功能需要專用修復服務。</p>' : ""}${wfStats()}${btn("開始增強", "submit", "primary")}</aside>`;
  } else if (t.id === "sfx") {
    content =
      wfSource() +
      `<aside class="side"><h3>去配樂・重配音效</h3><p>保留對白、依畫面重新配置音效，影片最長 2 分鐘。</p>${wfArea("sfxPrompt", "想要的音效（選填）", 200)}${wfStats()}${btn("開始處理", "submit", "primary")}</aside>`;
  } else if (t.id === "privacy") {
    wfDefaults({ privacyType: "馬賽克", privacyStrength: "中" });
    content =
      wfSource() +
      `<aside class="side"><h3>保護設定</h3><label>保護方式</label>${wfChoice("privacyType", ["馬賽克", "模糊"])}<label>強度</label>${wfChoice("privacyStrength", ["低", "中", "高"])}${wfStats()}${btn("開始保護", "submit", "primary")}</aside>`;
  } else if (t.id === "depth") {
    wfDefaults({ depthStart: 0, depthPreview: false });
    content =
      wfSource() +
      (files.src
        ? `<aside class="side"><h3>時間軸裁切</h3>${wfField("depthStart", "起始時間（秒）", "number", 'min="0" step="0.1"')}${wfField("depthEnd", "結束時間（秒）", "number", 'min="0" step="0.1"')}${wfCheck("depthPreview", "預覽所選片段")}<p class="note">每次最多 30 秒；可以從較長的來源片選出區間。</p>${wfStats()}${btn("開始提取深度圖", "submit", "primary")}</aside>`
        : '<aside class="side"><p>選取影片後顯示時間軸裁切和輸出資料。</p></aside>');
  } else if (t.id === "separate") {
    content =
      wfSource() +
      `<aside class="side"><h3>${files.src ? "來源影片" : "音軌分離說明"}</h3>${wfStats()}<p>輸出 MP3 · 48 kHz · 192 kbps · 立體聲，完成後加入素材庫。</p>${files.src ? btn("開始分離音軌", "submit", "primary") : ""}</aside>`;
  } else if (t.id === "upscale") {
    wfDefaults({ upscaleQuality: "1080p" });
    content = `<div class="row">${btn("上傳影片", "upload:src")}${btn("從素材庫選取", "library:src")}</div>${wfField("searchAssets", "搜尋影片名稱")}<div class="flow-video-gallery" data-flow-video-gallery></div>${files.src ? wfSource() + `<aside class="side"><h3>目標畫質</h3>${wfChoice("upscaleQuality", ["1080p", "2K", "4K"])}<p class="note">目前使用本機高品質縮放；不代表 AI 重建細節。</p>${wfStats()}${btn("開始處理", "submit", "primary")}</aside>` : '<p class="note">選一支影片開啟詳情，再選擇目標畫質與確認處理。</p>'}`;
  } else if (["cta", "watermark"].includes(t.id)) return toolOverlayScreen(t);
  else if (t.id === "voice") return toolVoiceScreen(t);
  else if (t.id === "music") return toolMusicScreen(t);
  else return null;
  if (t.id === "short" && files.src) content += toolShortResults();
  return wfWrap(t, `<div class="two-col flow-layout">${content}</div>`);
}
function wfLanguages() {
  return [
    "自動偵測",
    "繁體中文",
    "簡體中文",
    "English",
    "日本語",
    "한국어",
    "ภาษาไทย",
  ];
}
function toolWorkflowSourceChanged(id) {
  if (id !== "src") return;
  for (const key of [
    "followEnd",
    "depthEnd",
    "overlaySourceDuration",
    "shortClips",
    "shortCues",
    "followTrack",
    "followAnchors",
    "followFingerprint",
  ])
    delete values[key];
}
function toolWorkflowAfterRender() {
  if (typeof toolFollowAfterRender === "function") toolFollowAfterRender();
  if (typeof toolSubtitleAfterRender === "function" && tool === "subtitle")
    toolSubtitleAfterRender();
  if (typeof toolEditorAfterRender === "function" && tool === "edit")
    toolEditorAfterRender();
  if (typeof toolCompositorAfterRender === "function" && tool === "compose")
    toolCompositorAfterRender();
  if (typeof toolRigAfterRender === "function" && tool === "rig")
    toolRigAfterRender();
  if (typeof toolThreeDAfterRender === "function" && tool === "3d")
    toolThreeDAfterRender().catch(VideoWorkbench.reportError);
  const source = files.src,
    currentTool = tool;
  document.querySelectorAll('[data-flow-media="src"]').forEach((media) => {
    const update = () => {
      if (files.src !== source || tool !== currentTool) return;
      const duration = Number(media.duration);
      if (Number.isFinite(duration) && duration > 0) {
        source.duration = duration;
        source.width = media.videoWidth || source.width;
        source.height = media.videoHeight || source.height;
        if (values.followEnd === undefined && tool === "follow")
          values.followEnd = Math.min(duration, 180);
        if (values.depthEnd === undefined && tool === "depth")
          values.depthEnd = Math.min(duration, 30);
        for (const key of ["followEnd", "depthEnd"]) {
          const input = document.querySelector(`[data-key="${key}"]`);
          if (input && !input.value && document.activeElement !== input)
            input.value = values[key] ?? "";
        }
        document
          .querySelectorAll("[data-flow-meta],[data-flow-stats]")
          .forEach((el) => {
            el.textContent = `${duration.toFixed(1)} 秒${source.width ? ` · ${source.width} × ${source.height}` : ""}`;
          });
        saveDraft();
      }
      if (typeof toolOverlayUpdate === "function") toolOverlayUpdate();
    };
    media.addEventListener("loadedmetadata", update);
    if (media.readyState >= 1) update();
    media.addEventListener("timeupdate", () => {
      if (
        tool === "depth" &&
        values.depthPreview &&
        media.currentTime >= Number(values.depthEnd || media.duration)
      ) {
        media.pause();
        media.currentTime = Number(values.depthStart || 0);
      }
      if (typeof toolOverlayUpdate === "function") toolOverlayUpdate();
    });
  });
  const gallery = document.querySelector("[data-flow-video-gallery]");
  if (gallery)
    VideoWorkbench.assets
      .list()
      .then((rows) => {
        if (!gallery.isConnected) return;
        const query = String(values.searchAssets || "").toLowerCase();
        gallery.innerHTML = VideoWorkbench.sanitize(
          rows
            .filter(
              (a) =>
                VideoWorkbench.mediaKind(a) === "video" &&
                String(a.name || "")
                  .toLowerCase()
                  .includes(query),
            )
            .map(
              (a) =>
                `<button class="btn" data-flow-asset="${esc(a.id)}">${esc(a.name || "影片")} · ${a.duration ? Math.round(a.duration) + " 秒" : "時長載入後顯示"}</button>`,
            )
            .join("") || "<p>沒有符合條件的影片，可上傳或從素材庫選取。</p>",
        );
      })
      .catch(VideoWorkbench.reportError);
  if (typeof toolOverlayAfterRender === "function") toolOverlayAfterRender();
}
document.addEventListener("click", async (event) => {
  const button = event.target.closest(
    "[data-flow-choice],[data-flow-action],[data-flow-asset]",
  );
  if (!button) return;
  try {
    if (button.dataset.flowChoice) {
      const key = button.dataset.flowChoice,
        value = button.dataset.flowValue;
      if (
        ["voiceSourceKind", "subtitleSourceKind"].includes(key) &&
        values[key] !== value
      ) {
        delete files.src;
        toolWorkflowSourceChanged("src");
      }
      values[key] =
        button.dataset.flowMultiple === "true"
          ? (values[key] || []).includes(value)
            ? values[key].filter((v) => v !== value)
            : [...(values[key] || []), value]
          : value;
      saveDraft();
      render();
      return;
    }
    if (button.dataset.flowAsset) {
      const asset = (await VideoWorkbench.assets.list()).find(
        (a) => String(a.id) === button.dataset.flowAsset,
      );
      if (asset) {
        files.src = asset;
        toolWorkflowSourceChanged("src");
        saveDraft();
        render();
      }
      return;
    }
    const action = button.dataset.flowAction;
    if (action?.startsWith("short-preset:")) {
      const name = action.slice(13);
      values.shortPrompt =
        {
          精華重點: "挑出最有看點且能獨立理解的重點段落",
          金句爆點: "挑出能引起共鳴的完整金句",
          教學步驟: "挑出清楚連貫的教學步驟",
          產品亮點: "挑出介紹產品功能、優勢或價格的段落",
          幽默有梗: "挑出有趣且能獨立理解的段落",
          產品特寫: "尋找產品特寫畫面",
          操作示範: "尋找清楚的操作示範畫面",
          精彩動作: "尋找精彩動作畫面",
          風景空景: "尋找風景或空景畫面",
        }[name] || name;
      saveDraft();
      render();
    }
    if (action === "follow-start-now" || action === "follow-end-now") {
      const media = document.querySelector('[data-flow-media="src"]');
      if (media) {
        values[action === "follow-start-now" ? "followStart" : "followEnd"] =
          Number(media.currentTime.toFixed(2));
        saveDraft();
        render();
      }
    }
    if (action === "follow-export") {
      const start = Number(values.followStart),
        end = Number(values.followEnd);
      if (
        !files.src ||
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start < 0 ||
        end - start < 5 ||
        end - start > 180 ||
        end > Number(files.src.duration || 0) + 0.1
      )
        throw Error("片段需介於 5 秒與 3 分鐘，並位於來源範圍內");
      const job = await VideoWorkbench.generations.create({
        type: "video",
        operation: "follow-manual",
        references: { src: files.src },
        settings: { start, end, center: Number(values.followCenter) / 100 },
      });
      VideoWorkbench.showJob(job);
    }
    if (action === "short-analyze") {
      if (typeof toolShortAnalyze === "function") await toolShortAnalyze();
      else VideoWorkbench.notify("分析服務接線準備中；設定已保留。");
    }
    if (typeof toolShortAction === "function") await toolShortAction(action);
    if (typeof toolFollowAction === "function") await toolFollowAction(action);
    if (typeof toolVoiceAction === "function")
      await toolVoiceAction(action, button);
    if (typeof toolOverlayAction === "function")
      await toolOverlayAction(action, button);
    if (typeof toolMusicAction === "function")
      await toolMusicAction(action, button);
  } catch (error) {
    VideoWorkbench.reportError(error);
  }
});
document.addEventListener("change", (event) => {
  if (!event.target.matches("[data-key][data-flow-render]")) return;
  values[event.target.dataset.key] =
    event.target.type === "checkbox"
      ? event.target.checked
      : event.target.value;
  saveDraft();
  render();
});
