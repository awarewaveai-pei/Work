function directorAssets() {
  let files = lookup("images");
  if (!files.length)
    return '<div class="director-asset-empty">尚未加入參考素材。可以從素材庫引用，或直接上傳圖片。</div>';
  return (
    '<div class="director-asset-list">' +
    files
      .map(
        (f, i) =>
          '<div class="director-asset-row"><div class="director-asset-thumb">' +
          (f.url ? '<img src="' + f.url + '">' : "▧") +
          '</div><div class="director-asset-main"><input class="director-purpose" data-director-purpose="' +
          i +
          '" placeholder="用途，例如：主角、場景、風格參考" value="' +
          safe(f.purpose || "") +
          '"><div class="director-tags">' +
          ["主角／角色", "場景／背景", "風格參考", "產品／物件", "道具"]
            .map(
              (tag) =>
                '<button class="' +
                (f.tag === tag ? "on" : "") +
                '" data-director-tag="' +
                i +
                '" data-value="' +
                tag +
                '">' +
                tag +
                "</button>",
            )
            .join("") +
          '</div></div><button class="remove" data-remove="images:' +
          i +
          '">×</button></div>',
      )
      .join("") +
    "</div>"
  );
}
function directorTopAssets() {
  let files = lookup("images");
  if (!files.length) return "";
  return (
    '<div class="director-top-assets">' +
    files
      .map(
        (f) =>
          "<div>" +
          (f.url ? '<img src="' + f.url + '">' : "") +
          "<small>" +
          safe(f.tag || "參考素材") +
          "</small></div>",
      )
      .join("") +
    "</div>"
  );
}
function directorInput() {
  let h = area(placeholders.director);
  h +=
    '<div class="section-label director-reference-title">▧　參考圖片（選填） <span class="small-note">上傳圖片並標註用途，小海星規劃時會參考</span></div>' +
    directorAssets();
  h += '<div class="uploads" data-drop-bucket="images">' + (lookup("images").length < 6 ? '<button class="upload" data-upload="images" data-accept="image/*"><b>＋</b>新增圖片<small>' + lookup("images").length + '/6</small></button>' : '') + '<button class="minor" data-action="library">從素材庫引用</button></div>';
  h +=
    '<div class="director-input-actions"><span class="small-note">素材可先上傳或從素材庫引用</span><button class="box-cta" data-action="director-start" ' + (!state.data.director.trim() ? 'disabled' : '') + '>開始對話生成　→</button></div>';
  return h;
}
function directorLength() {
  return (
    '<div class="director-chat"><div class="director-chat-card"><h3>這部影片預計製作多長？</h3><p>目前影片服務支援 4、8、12 秒。已選擇 ' +
    state.directorLength +
    ' 秒。</p><div class="director-choice-row"><button data-action="director-length" data-value="4">4 秒</button><button data-action="director-length" data-value="8">8 秒</button><button data-action="director-length" data-value="12">12 秒</button></div>' +
    (state.directorCustomLength
      ? '<div class="director-custom-row"><input class="field" id="directorCustomLength" type="number" min="5" max="180" value="' +
        state.directorCustomLength +
        '"><button class="box-cta" data-action="director-confirm-length">確認秒數</button></div>'
      : "") +
    '</div><button class="box-cta director-next" data-action="director-next-theme">下一階段：開始生成腳本 →</button></div>'
  );
}
function directorTheme() {
  return (
    '<div class="director-chat"><div class="director-chat-card"><h3>請選擇影片方向</h3><p>' +
    safe(state.data.director || "可先返回輸入你的故事想法。") +
    '</p><div class="director-choice-row">' +
    ["劇情故事", "產品介紹", "生活紀錄", "教學說明"]
      .map(
        (x) =>
          '<button data-action="director-theme" data-value="' +
          x +
          '">' +
          x +
          "</button>",
      )
      .join("") +
    '</div></div><button class="box-cta" data-paid="video.script" data-action="director-generate-script">產生分鏡腳本 →</button></div>'
  );
}
function directorScript() {
  const text = state.directorScript || "尚未產生腳本";
  return (
    '<div class="director-script-view"><div class="director-script-card"><h2>分鏡腳本</h2>' +
    text
      .split("\n")
      .map((x) => "<p>" + safe(x) + "</p>")
      .join("") +
    '</div><div class="director-script-actions"><button class="minor" data-action="director-edit-script">修改腳本</button><button class="minor" data-action="director-storyboard">生成分鏡圖</button><button class="box-cta" data-action="director-to-video">開始生成影片 →</button></div></div>'
  );
}
function directorEdit() {
  return (
    '<div class="director-script-edit"><h2>修改腳本</h2><textarea class="field" id="directorScript" rows="18">' +
    safe(state.directorScript) +
    '</textarea><div class="director-script-actions"><button class="minor" data-action="director-save-script">儲存腳本</button><button class="minor" data-action="director-cancel-edit">取消</button></div></div>'
  );
}
function directorVideo() {
  return `<section class="director-video-settings"><h2>生成設定</h2><div class="director-setting-chips"><button data-panel="model">${safe(generatorVideoModel("director").label)}⌄</button><button data-panel="director-ratio">${safe(state.ratio)}⌄</button><button data-panel="director-duration">${state.directorLength} 秒⌄</button><button data-panel="director-quality">${safe(state.quality)}⌄</button><button data-panel="skill">${safe(state.skill)}⌄</button></div><p class="small-note">確認模型與影片長度，就可以開始生成。</p><div class="director-video-actions"><button class="minor" data-action="director-edit-script">✏️ 修改腳本</button><button class="box-cta" data-action="director-generate-video" ${generatorVideoBlock("director") ? "disabled" : ""} title="${safe(generatorVideoBlock("director"))}">生成影片 · ${generatorVideoPrice("director")}</button></div></section>`;
}
function directorWorkspace() {
  if (state.directorStage === "chat") return directorChatWorkspace();
  if (state.directorStage === "video" && state.directorMessages.length) return directorChatWorkspace();
  if (["generating", "result"].includes(state.directorGeneration)) return '<div class="director-video-settings"><h2>生成任務</h2><p>請從歷史紀錄查看任務狀態與成果。</p><button class="minor" data-action="director-history">查看歷史紀錄</button><button class="minor" data-action="director-regenerate">返回生成設定</button></div>';
  if (state.directorStage === "length") return directorLength();
  if (state.directorStage === "theme") return directorTheme();
  if (state.directorStage === "script") return directorScript();
  if (state.directorStage === "edit") return directorEdit();
  if (state.directorStage === "video") return directorVideo();
  return directorInput();
}
function directorGenerationInput() {
  return {
      type: "video",
      mode: "director",
      prompt: state.directorScript,
      quoteId: state.directorQuote?.quoteId,
      duration: state.directorLength,
      model: state.model.director,
      ratio: state.ratio,
      settings: { model: state.model.director, ratio: state.ratio, quality: state.quality, duration: state.directorLength, audio: state.audio, watermark: state.watermark, subtitle: state.subtitle, subtitleOptions: structuredClone(state.subtitleOptions), skill: state.skill, skills: [...state.skills] },
      references: lookup("images"),
  };
}
async function directorStartGeneration() {
  try {
    $("modal").classList.add("hidden");
    await generatorSubmit(directorGenerationInput());
  } catch (e) {
    VideoWorkbench.reportError(e);
  }
}
