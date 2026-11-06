"use strict";

const $ = (x) => document.getElementById(x);
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (k) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[k],
  );
const STYLE_NAMES = [
  "日系電影感",
  "賽博霓虹",
  "清透紀實",
  "復古膠片",
  "卡通動漫",
  "黑白電影",
  "黃金時刻",
  "夢幻粉彩",
  "自訂",
];
const JAPANESE_PROMPT =
  "暖色調 · 低對比 · Kodak Portra · 35mm · 淺景深 · 細膩顆粒 · 柔和逆光 · 溫馨 · 生活感";
// Our own example pictures (examples/styles.json, public): display only, never sent as a generation reference.
const stylePicture = (i) => "/examples/style-proj-" + (i + 1) + ".webp";
const STORE = "awarewave-projects-screenshot-frontend-v1";
// Shot size chips (buttons, no dropdown) and the phrase each adds to the shot prompt.
const SHOT_SIZES = {
  遠景: "遠景（wide shot）：完整呈現場景環境與人物位置",
  中景: "中景（medium shot）：人物腰部以上與部分環境",
  近景: "近景（close-up）：聚焦人物臉部與表情",
  俯角: "俯角（high angle）：鏡頭由上往下拍",
  仰角: "仰角（low angle）：鏡頭由下往上拍",
};
// One shot's scene, cast and size, picked in its card. Same scene across shots = same reference images first.
function shotControls(p, s, i) {
  const chip = (act, value, label, on) => `<button class="btn small ${on ? "primary" : "outline"}" data-action="${act}" data-index="${i}" data-value="${esc(value)}" aria-pressed="${on}">${esc(label)}</button>`;
  const scenes = p.assets.scene || [], cast = p.assets.character || [];
  return `${scenes.length ? `<div class="row" role="group" aria-label="鏡頭場景"><span class="tiny">場景</span>${scenes.map((a) => chip("shotScene", a.id, a.name, s.sceneId === a.id)).join("")}</div>` : ""}${cast.length ? `<div class="row" role="group" aria-label="鏡頭角色"><span class="tiny">角色</span>${cast.map((a) => chip("shotCharacter", a.id, a.name, (s.characterIds || []).includes(a.id))).join("")}</div>` : ""}<div class="row" role="group" aria-label="鏡頭景別"><span class="tiny">景別</span>${Object.keys(SHOT_SIZES).map((k) => chip("shotSize", k, k, s.shotSize === k)).join("")}</div>`;
}
function makeEpisode(n, title = "") {
  return {
    id: "ep" + n + "_" + Math.floor(Math.random() * 100000),
    name: title || `第 ${n} 集`,
    outline: "",
    shots: [],
  };
}
let state = {
  projects: [],
  current: null,
  episode: 0,
};
// Card PJ.1: what only the top page changes (shared/episode-spine.js invariant) -- the episodes' spine fields and
// the spine-open counter. This page writes everything else on every keystroke, and the top page echoes each write
// back; comparing only these fields between snapshots means an echo never redraws (no lost focus) and a late echo
// never rolls this page back.
const spineSignature = (s) =>
  JSON.stringify([
    s?.open ?? 0,
    (s?.projects || []).flatMap((p) => (p.episodes || []).filter((e) => e.edit || e.steps || e.outputs).map((e) => [p.id, e.id, e.edit ?? null, e.steps ?? null, e.outputs ?? null])),
  ]);
let spineSeen = "";
function loadState() {
  try {
    const s = JSON.parse(VideoWorkbench.storage.getItem(STORE) || "null");
    spineSeen = spineSignature(s);
    if (s && Array.isArray(s.projects))
      state = {
        ...state,
        ...s,
      };
    // 舊版新專案預設寫入不存在的「VideoWorkbench V3」；實際預設影片模型是 sora-2（index-0.js model.director）。
    for (const p of state.projects) if (p?.settings?.model === "VideoWorkbench V3") p.settings.model = "sora-2";
  } catch {}
}
loadState();
document.addEventListener("vw:changed", () => {
  let s = null;
  try {
    s = JSON.parse(VideoWorkbench.storage.getItem(STORE) || "null");
  } catch {}
  if (spineSignature(s) === spineSeen) return;
  loadState();
  if (!dialog) render();
});
let dialog = null;
let selectedFileTarget = null;
let modalDraft = {};
let snackbarTimeout = null;
function save() {
  try {
    VideoWorkbench.storage.setItem(STORE, JSON.stringify(state));
  } catch (e) {
    notify("瀏覽器儲存空間不足。部分圖片可能只能保留在本次開啟期間。");
  }
}
const project = () => state.projects.find((p) => p.id === state.current);
const ep = () => project()?.episodes[state.episode];
function notify(message) {
  const t = $("toast");
  t.textContent = message;
  t.hidden = false;
  if (snackbarTimeout) clearTimeout(snackbarTimeout);
  snackbarTimeout = setTimeout(() => (t.hidden = true), 3700);
}
function fmtType(v) {
  return v === "series" ? "系列 / 短影集" : "單支影片";
}
function render() {
  if (project()) {
    $("home").hidden = true;
    $("workbench").hidden = false;
    renderWorkbench();
  } else {
    $("workbench").hidden = true;
    $("home").hidden = false;
    renderHome();
  }
}
function renderHome() {
  const count = state.projects.length;
  $("home").innerHTML = VideoWorkbench.sanitize(
    `<div class="eyebrow">專案 · PROJECTS</div><h1>在同一個世界觀裡，一次又一次開拍。</h1><p class="sub">把角色、場景與道具定義成可複用的元件，套用鎖定的視覺風格 —— 讓長片與系列作品的每一個鏡頭都保持一致。</p>${!count ? `<div class="project-empty"><div class="bigicon">⊞</div><h2>還沒有專案</h2><p>建立第一個專案，開始打造你的世界觀。</p><button class="btn primary" data-action="create">＋　建立新專案</button></div>` : `<div class="split"><h2 style="margin:0">我的專案 <span class="quiet">${count} 個</span></h2><button class="btn primary" data-action="create">＋　建立新專案</button></div><div class="project-grid">${state.projects.map((p) => `<button class="project-card" data-action="openProject" data-id="${esc(p.id)}"><div class="project-cover">${p.cover ? `<img src="${esc(p.cover)}" alt="專案封面" style="width:100%;height:100%;object-fit:cover">` : "▦"}</div><div class="desc"><strong>${esc(p.title)}</strong><span class="badge">${esc(fmtType(p.type))}</span> <span class="badge">${esc(p.ratio)}</span><p class="quiet">${p.episodes.length} 集 · ${esc(STYLE_NAMES[p.style])}</p></div></button>`).join("")}</div>`}`,
  );
}
function renderWorkbench() {
  const p = project();
  if (!p) return;
  state.episode = Math.min(state.episode, p.episodes.length - 1);
  const e = ep();
  const total = e.shots.length;
  const menu = `<div class="row"><button class="btn small outline" data-action="preview">◉　預覽整集</button><button class="btn small outline" data-action="export">↓　匯出片段 · 0</button><button class="btn small outline" data-action="cover">▧　更換封面</button><button class="btn small outline" data-action="settings">☷　生成設定</button></div>`;
  $("workbench").innerHTML = VideoWorkbench.sanitize(
    `<div class="work-nav"><button class="btn small outline" data-action="backHome">←　專案列表</button><span class="eyebrow" style="color:var(--text-muted)">AWAREWAVE · 專案</span><span class="quiet">本機專案 · AI 依 API 用量計費</span></div><div class="work-grid"><aside class="bible"><div class="eyebrow">— 製作聖經 · BIBLE</div><h2>${esc(p.title)}</h2><div class="quiet">${esc(p.type === "series" ? "短影集" : "單支影片")} · ${p.episodes.length} 集 · ${esc(p.ratio)}</div><div class="fixed">♙　卡司、場景與風格定義一次，在所有鏡頭間保持一致。</div>${["character", "scene", "prop"].map((k) => entityList(k, p)).join("")}<div class="entity-group"><div class="entity-header">◉　風格錨點</div><div class="style-record"><h3>${esc(STYLE_NAMES[p.style])}</h3><div class="muted">${esc(styleText(p))}</div></div></div><button class="btn" style="width:100%;margin-top:20px" data-action="settings">☷　生成設定　⌃</button><p class="tiny">風格與負面提示詞的專案／本集兩層設定，會合成後用於實際內容。</p></aside><main class="work-content"><div class="work-top"><div><div class="quiet">專案　›　${esc(p.title)}</div><h1>第 ${state.episode + 1} 集 · ${esc(state.episode === 0 ? p.title : e.name)}</h1><div class="tiny">${total} 個鏡頭 · 約 ${e.shots.reduce((v, s) => v + Number(s.seconds || 5), 0)} 秒 · ${esc(p.ratio)} · ${e.shots.filter((s) => s.image).length}/${total} 已生成</div></div><div class="work-actions"><button class="btn primary" data-action="storyboard">✧　AI 分鏡</button><button class="btn" data-action="batch">▤　批次生成</button><button class="btn" data-action="fullVideo">✧　帶入影片生成</button><div style="position:relative"><button class="btn" data-action="toggleMore">⋯　更多</button><div class="panel" id="more-menu" hidden style="position:absolute;right:0;top:43px;z-index:4;width:205px;padding:7px">${menu}</div></div></div></div>${editFileRow(e)}<div class="outline-box"><label>□ 本集大綱</label><textarea data-bind="episode.outline" placeholder="用幾句話寫下這一集的故事：誰、在哪裡、發生什麼、怎麼收尾">${esc(e.outline)}</textarea><div class="tiny">AI 分鏡會從這裡開始。改了大綱之後可以重新分鏡。</div></div><div class="episode-tabs">${p.episodes.map((x, i) => `<button class="${i === state.episode ? "on" : ""}" data-action="episode" data-index="${i}">EP${i + 1}　${esc(x.name)} ${x.shots.length}</button>`).join("")}<button data-action="addEpisode" aria-label="新增一集">＋</button></div>${total ? `<div class="split" style="margin-bottom:16px"><strong>本集鏡頭 <span class="quiet">${total} 個</span></strong><button class="btn small primary" data-action="addShot">＋　新增鏡頭</button></div><div class="shot-grid">${e.shots.map((s, i) => `<div class="shot"><div class="split"><h3>鏡頭 ${String(i + 1).padStart(2, "0")}</h3><button class="btn small danger" data-action="deleteShot" data-index="${i}" title="刪除鏡頭">×</button></div>${s.image ? `<img src="${esc(s.image)}" alt="生成畫面" style="width:100%;max-height:220px;object-fit:contain">` : ""}<label>畫面描述</label><textarea data-bind="shot.${i}.text" placeholder="描述鏡頭內的動作與構圖">${esc(s.text)}</textarea>${shotControls(p, s, i)}<div class="row"><label style="margin:0">時長 <input aria-label="鏡頭時長" style="width:70px;padding:6px" type="number" min="1" max="120" data-bind="shot.${i}.seconds" value="${esc(s.seconds)}"></label><span class="tiny">秒</span><button class="btn small" data-action="shotGenerate" data-index="${i}">生成畫面</button></div></div>`).join("")}</div>` : `<div class="work-empty panel"><h3>這一集還沒有鏡頭，從這裡開始</h3><div class="step"><span class="circle">1</span><div><strong>先建立角色與場景</strong><p>每個角色、場景、道具都可以上傳參考圖。鏡頭鎖定它們之後，長相與環境才會每一鏡都一致。</p><button class="btn small outline" data-action="asset" data-kind="character">♧　建立角色</button></div></div><div class="step"><span class="circle">2</span><div><strong>寫下大綱，讓 AI 分鏡</strong><p>AI 導演會先問幾個問題，再把故事拆成一顆一顆鏡頭，你可以逐鏡修改後再建立。</p><button class="btn small outline" data-action="storyboard">✧　AI 分鏡</button></div></div><div class="step"><span class="circle">3</span><div><strong>或者自己加一顆鏡頭</strong><p>想手動控制每一鏡的細節與鏡頭，就直接開始寫。</p><button class="btn small outline" data-action="addShot">＋　新增鏡頭</button></div></div></div>`}</main></div>`,
  );
}
// Card PJ.1: the episode's edit file (spec §6). The title is read from the edit file itself, never copied here.
function editFileRow(e) {
  if (!e.edit)
    return `<div class="row"><span class="tiny">還沒有剪輯檔。</span><button class="btn small outline" data-action="openEdit">建立剪輯檔</button></div>`;
  let rows = [];
  try {
    rows = JSON.parse(VideoWorkbench.storage.getItem(e.edit.engine === "filmcraft" ? "tools.engine.projects" : "tools.editor.projects") || "[]");
  } catch {}
  const row = (Array.isArray(rows) ? rows : []).find((r) => EpisodeSpine.editId(r) === e.edit.projectId);
  return `<div class="row"><span>${row ? "剪輯檔：" + esc(EpisodeSpine.editTitle(row)) : "找不到這一集的剪輯檔。"}</span><button class="btn small outline" data-action="openEdit">開啟剪輯</button></div>`;
}
function entityList(kind, p) {
  let labels = {
    character: ["♧", "角色", "新增角色"],
    scene: ["♧", "場景", "新增場景"],
    prop: ["⊕", "道具", "新增道具"],
  };
  const [icon, title, empty] = labels[kind];
  let assets = p.assets[kind] || [];
  return `<div class="entity-group"><div class="entity-header">${icon}　${title} <span class="badge">${assets.length}</span><button class="btn small outline" style="padding:2px 7px;margin-left:auto" data-action="asset" data-kind="${kind}">＋</button></div>${assets.length ? assets.map((a, i) => `<button class="entity-card" style="width:100%;text-align:left;background:transparent;color:inherit" data-action="asset" data-kind="${kind}" data-index="${i}">${a.refs?.[0] ? `<img src="${a.refs[0]}" style="float:left;width:36px;height:36px;object-fit:cover;border-radius:5px;margin-right:9px">` : ""}<strong>${esc(a.name)}</strong><div class="tiny truncate">${esc(a.descr || a.role || "已鎖定的製作元件")}</div></button>`).join("") : `<button class="empty-entity" style="display:block;width:100%;background:transparent;text-align:left" data-action="asset" data-kind="${kind}">${empty}</button>`}</div>`;
}
function styleText(p) {
  return (
    p.customStyle?.trim() ||
    (p.style === 0 ? JAPANESE_PROMPT : STYLE_NAMES[p.style])
  );
}
function showDialog(type, more = {}) {
  dialog = {
    type,
    ...more,
  };
  renderDialog();
}
function closeDialog() {
  const wasCreate = dialog?.type === "create";
  dialog = null;
  $("overlay").hidden = true;
  $("overlay").innerHTML = VideoWorkbench.sanitize("");
  if (wasCreate) render();
}
const modal = (title, body, foot = "", size = "") =>
  `<div class="dialog ${size}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="dialog-head"><h2>${esc(title)}</h2><button class="dialog-x" data-action="close" aria-label="關閉">×</button></div><div class="dialog-body">${body}</div><div class="dialog-foot">${foot || '<button class="btn" data-action="close">關閉</button>'}</div></div>`;
function renderCreatePage() {
  const d = modalDraft;
  $("overlay").hidden = true;
  $("overlay").innerHTML = VideoWorkbench.sanitize("");
  $("home").hidden = false;
  $("home").innerHTML = VideoWorkbench.sanitize(
    `<div class="create-page"><div class="create-page-head"><div><div class="eyebrow">專案 · PROJECTS</div><h1>建立新專案</h1><p>先定義作品的世界觀與畫面方向，之後可以在同一個專案裡持續製作。</p></div><button class="btn outline" data-action="close">← 返回專案列表</button></div><div class="create-page-grid"><div><section class="create-section"><h2>基本資料</h2><label>專案名稱</label><input id="create-name" maxlength="120" placeholder="例如：夏日的豆花店" value="${esc(d.name || "")}"><label>類型</label><div class="create-choice-grid">${[
      ["series", "系列 / 短影集", "多集共用同一組卡司與世界觀"],
      ["single", "單支影片", "一支多場景的作品"],
    ]
      .map(
        ([v, a, b]) =>
          `<button class="create-choice ${d.type === v ? "on" : ""}" data-action="chooseType" data-value="${v}"><strong>${a}</strong><small>${b}</small></button>`,
      )
      .join("")}</div><label>畫面比例</label><div class="create-ratio-grid">${[
      ["9:16", "直式 · Reels"],
      ["16:9", "橫式 · 影院"],
      ["1:1", "方形"],
    ]
      .map(
        ([v, txt]) =>
          `<button class="create-choice ${d.ratio === v ? "on" : ""}" data-action="chooseRatio" data-value="${v}"><strong>${v}</strong><small>${txt}</small></button>`,
      )
      .join(
        "",
      )}</div></section><section class="create-section"><h2>風格錨點</h2><p class="hint">選一個整個專案都能沿用的視覺方向。之後仍可在製作聖經裡調整。</p><div class="create-styles">${STYLE_NAMES.map((v, i) => `<button class="create-style ${d.style === i ? "on" : ""} ${i === 8 ? "custom" : ""}" data-action="chooseStyle" data-index="${i}">${i < 8 && stylePicture(i) ? `<img src="${stylePicture(i)}" alt="${esc(v)}">` : i < 8 ? "" : "＋"}<span>${esc(v)}</span></button>`).join("")}</div><label>風格提示</label><textarea id="style-hint" rows="3" placeholder="補充色彩、光線、材質或時代感">${esc(d.styleText || "")}</textarea></section></div><aside class="create-summary"><section class="create-section"><h2>專案預覽</h2><div class="summary-icon">✦</div><dl><dt>名稱</dt><dd>${esc(d.name || "尚未命名")}</dd><dt>類型</dt><dd>${d.type === "series" ? "系列 / 短影集" : "單支影片"}</dd><dt>比例</dt><dd>${esc(d.ratio)}</dd><dt>風格</dt><dd>${esc(STYLE_NAMES[d.style] || "自訂")}</dd></dl></section></aside></div><div class="create-actions"><button class="btn outline" data-action="close">取消</button><button class="btn primary" data-action="saveProject">＋　建立專案</button></div></div>`,
  );
}
function renderDialog() {
  if (!dialog) return;
  if (dialog.type === "create") {
    renderCreatePage();
    return;
  }
  let html = "";
  const p = project();
  let btnCancel =
    '<button class="btn outline" data-action="close">取消</button>';
  if (dialog.type === "asset") {
    let d = dialog.draft;
    const names = {
      character: "角色",
      scene: "場景",
      prop: "道具",
    };
    let kind = dialog.kind;
    let label = names[kind];
    let assetLabels = {
      character: [
        "例：阿姨",
        "例：主角、豆花店主",
        "髮型、服裝、神情、標誌性特徵…",
      ],
      scene: ["例：豆花店、黃昏", null, "環境、光線、時間、氛圍…"],
      prop: ["例：復古腳踏車", null, "環境、光線、時間、氛圍…"],
    }[kind];
    html = modal(
      `${dialog.index !== undefined ? "編輯" : "新增"}${label}`,
      `<div class="locked-note">♙　此${label}會在鏡頭間維持一致外觀。</div><label>✧　<strong>AI 輔助</strong>　回答幾個問題，AI 幫你產生描述、背景與參考圖</label><div class="ai-input"><input id="asset-ai" placeholder="一句話描述這個${label}，例如：${kind === "character" ? "冷酷的未來都市女刑警" : kind === "scene" ? "雨夜的霓虹小巷" : "刻有家徽的黃銅懷錶"}"><button class="btn" data-action="aiAssist">開始</button></div><label>參考圖</label><div class="upload-grid">${(d.refs || []).map((src, i) => `<div class="upload-thumb"><img src="${src}"><button data-action="removeAssetRef" data-index="${i}" aria-label="移除圖片">×</button></div>`).join("")}${(d.refs || []).length < 8 ? `<button class="upload-tile" data-action="pickFile" data-target="asset">↑<span>上傳參考</span></button><button class="upload-tile" data-action="library">▧<span>從素材庫選擇</span></button><button class="upload-tile" data-action="noAi">✧<span>AI 生成參考圖 · 5 點</span></button>` : ""}</div><div class="tiny">上傳 1–8 張參考圖，鎖定外觀一致。</div><label>名稱</label><input id="asset-name" value="${esc(d.name || "")}" placeholder="${assetLabels[0]}">${kind === "character" ? `<label>角色定位</label><input id="asset-role" value="${esc(d.role || "")}" placeholder="${assetLabels[1]}">` : ""}${kind === "scene" ? `<label>時間</label><div class="option-row">${["清晨", "上午", "正午", "黃昏", "夜晚", "室內"].map((t) => `<button class="chip ${d.time === t ? "on" : ""}" data-action="sceneTime" data-value="${t}">${t}</button>`).join("")}</div>` : ""}<label>${kind === "character" ? "外觀 / 氣質描述" : kind === "scene" ? "描述" : "描述"}　<span class="tiny">餵給生成模型的 subject 段</span></label><textarea id="asset-descr" rows="4" placeholder="${assetLabels[2]}">${esc(d.descr || "")}</textarea>${kind === "prop" ? `<label><input type="checkbox" id="asset-locked" style="width:auto" ${d.locked ? "checked" : ""}> 維持外觀一致（產品鎖定）</label>` : ""}`,
      `${dialog.index !== undefined ? '<button class="btn danger" data-action="deleteAsset">刪除</button>' : ""}<span style="flex:1"></span>${btnCancel}<button class="btn primary" data-action="saveAsset">✓　儲存</button>`,
      "mid",
    );
  } else if (dialog.type === "storyboard") {
    html = modal(
      "AI 分鏡",
      `<label>本集大綱</label><textarea id="story-outline" rows="6" placeholder="描述這一集的故事：發生什麼、誰出場、在哪裡、如何收尾…">${esc(ep()?.outline || "")}</textarea><div class="row"><span class="quiet">鏡頭數</span>${["自動", "4", "6", "8", "12"].map((a, i) => `<button class="chip ${dialog.count === a ? "on" : ""}" data-action="shotCount" data-value="${a}">${a}</button>`).join("")}</div><p class="quiet">AI 會依大綱與故事聖經（角色／場景／道具）規劃分鏡，建立前可逐一檢視與編輯。AI 分鏡依 API 用量計費。</p><div class="note">可用 AI 產生分鏡後編輯，或免費建立空白鏡頭。</div>`,
      `${btnCancel}<button class="btn" data-action="manualShots">建立空白鏡頭</button><button class="btn primary" data-action="noAi">✧　AI 產生分鏡（API 計費）</button>`,
      "wide",
    );
  } else if (dialog.type === "settings") {
    const s = p.settings || {};
    html = modal(
      "生成設定",
      `<p class="quiet">本集的設定是「加在專案設定後面」，不是取代它。下方每一區最後一行就是生成時真正送出去的內容。</p><div class="settings-section"><h3>◉　風格錨點</h3><div class="settings-two"><span>專案</span><div><div class="note">${esc(styleText(p))}</div><button class="btn small outline" data-action="editStyle">✎　編輯風格</button></div><span>EP${state.episode + 1}</span><div><textarea data-settings="episodeStyle" placeholder="例：冬季雪景、冷色調">${esc(ep().styleOverride || "")}</textarea><p class="tiny">加在專案設定之後，不會取代它。</p></div></div><strong class="quiet">關鍵幀實際送出的內容</strong><div style="margin-top:7px" class="tiny">${esc(styleText(p))}</div></div><div class="settings-section"><h3>▣　影片模型與解析度</h3><div class="settings-two"><span>專案</span><div><div class="row">${VideoWorkbenchVideoModels.list(VideoWorkbench.capabilities).map((v) => `<button class="chip ${VideoWorkbenchVideoModels.get(VideoWorkbench.capabilities, s.model).id === v.id ? "on" : ""}" data-action="projectModel" data-value="${esc(v.id)}" aria-pressed="${VideoWorkbenchVideoModels.get(VideoWorkbench.capabilities, s.model).id === v.id}" ${v.available === false ? 'disabled title="尚未設定服務金鑰"' : ""}>${esc(v.label)} · ${VideoWorkbenchVideoModels.priceText(v, v.defaultDurationSec || v.durations[0])}／${v.defaultDurationSec || v.durations[0]} 秒</button>`).join("")}</div><p class="tiny">所有鏡頭預設使用的模型（按鈕上是預設長度的費用）；解析度預設 720p，每一鏡仍可在鏡頭抽屜另外指定。</p></div><span>鎖定影片模型</span><div><label><input type="checkbox" id="lockModel" style="width:auto" ${s.lockModel ? "checked" : ""}> 鎖定影片模型　${s.lockModel ? "已鎖定" : "未鎖定"}</label><p class="tiny">不同模型對同一畫面的色彩與臉部詮釋差很多；鎖定時鏡頭抽屜只顯示專案預設。</p></div></div></div><div class="settings-section"><h3>☷　影片預設提示</h3><div class="settings-two"><span>專案</span><textarea data-settings="videoPrompt" placeholder="例：影片中不要有文字">${esc(s.videoPrompt || "")}</textarea><span>EP${state.episode + 1}</span><div><textarea data-settings="episodeVideoPrompt" placeholder="例：影片中不要有文字">${esc(ep().videoPrompt || "")}</textarea><p class="tiny">加在專案設定之後，不會取代它。</p></div></div></div>`,
      btnCancel +
        '<button class="btn primary" data-action="saveSettings">儲存</button>',
      "mid",
    );
  } else if (dialog.type === "cover") {
    html = modal(
      "專案封面",
      `<div class="cover-preview">${p.cover ? `<img src="${esc(p.cover)}" alt="自訂封面" style="width:100%;max-height:250px;object-fit:contain">` : "預設封面"}</div><div class="row" style="margin:12px 0 20px"><button class="btn small" data-action="pickFile" data-target="cover">↑　上傳圖片</button><button class="btn small" data-action="useDefaultCover">⟳　使用預設封面</button></div><label>從已生成的鏡頭選擇</label><div class="note" style="text-align:center;padding:19px">還沒有已生成的鏡頭畫面可選，先生鏡頭或影片。</div>`,
      btnCancel +
        '<button class="btn primary" data-action="close">儲存封面</button>',
      "wide",
    );
  } else if (dialog.type === "editStyle") {
    html = modal(
      "編輯風格",
      `<label>風格錨點</label><div class="styles-grid">${STYLE_NAMES.map((name, i) => `<button class="style-tile ${p.style === i ? "on" : ""} ${i === 8 ? "custom" : ""}" data-action="setProjectStyle" data-index="${i}">${i < 8 && stylePicture(i) ? `<img src="${stylePicture(i)}" alt="${esc(name)}">` : i < 8 ? "" : "＋"}<span>${esc(name)}</span></button>`).join("")}</div><label>風格提示</label><textarea id="project-style-input">${esc(p.customStyle || styleText(p))}</textarea>`,
      btnCancel +
        '<button class="btn primary" data-action="saveProjectStyle">儲存</button>',
      "mid",
    );
  } else if (dialog.type === "preview") {
    html = modal(
      "預覽整集",
      `<div class="note">${ep().shots.length ? "目前只有可編輯的鏡頭草稿，還沒有正式生成影片。" : "本集尚無鏡頭，無法預覽。"}</div>`,
      '<button class="btn" data-action="close">關閉</button>',
    );
  } else if (dialog.type === "export") {
    html = modal(
      "匯出片段",
      `<div class="export-box">已生成片段：0 個。請先生成影片，才能匯出實際影片檔。</div><p class="quiet">你可以匯出此專案的 JSON 草稿作備份或交接。</p>`,
      btnCancel +
        '<button class="btn primary" data-action="exportJson">下載專案 JSON</button>',
    );
  } else if (dialog.type === "library") {
    const assets = p.assets.character
      .concat(p.assets.scene, p.assets.prop)
      .flatMap((a) => a.refs || []);
    html = modal(
      "從素材庫選擇",
      assets.length
        ? `<div class="upload-grid">${assets.map((src, i) => `<button class="upload-thumb" data-action="pickLibrary" data-index="${i}"><img src="${src}"></button>`).join("")}</div>`
        : `<div class="note">目前這個專案還沒有已上傳的素材。請先上傳參考圖。</div>`,
      '<button class="btn" data-action="close">關閉</button>',
    );
  } else if (dialog.type === "editEpisode") {
    html = modal(
      "編輯本集",
      `<label>集數名稱</label><input id="episode-name" value="${esc(ep().name)}">`,
      btnCancel +
        '<button class="btn primary" data-action="saveEpisode">儲存</button>',
    );
  }
  if (html) {
    $("overlay").innerHTML = VideoWorkbench.sanitize(html);
    $("overlay").hidden = false;
  }
}
function snapshotCreate() {
  if (dialog?.type !== "create") return;
  const name = $("create-name"),
    hint = $("style-hint");
  if (name) modalDraft.name = name.value;
  if (hint) modalDraft.styleText = hint.value;
}
function snapshotAsset() {
  if (dialog?.type !== "asset") return;
  for (const [prop, id] of [
    ["name", "asset-name"],
    ["role", "asset-role"],
    ["descr", "asset-descr"],
  ]) {
    const el = $(id);
    if (el) dialog.draft[prop] = el.value;
  }
  const lock = $("asset-locked");
  if (lock) dialog.draft.locked = lock.checked;
}
function openAsset(kind, index) {
  const p = project();
  const a = index !== undefined ? p.assets[kind][index] : null;
  showDialog("asset", {
    kind,
    index,
    draft: a
      ? JSON.parse(JSON.stringify(a))
      : {
          id: "a" + Date.now() + "_" + Math.random().toString(36).slice(2, 5),
          name: "",
          descr: "",
          role: "",
          refs: [],
          time: "",
          locked: false,
        },
  });
}
function newProject() {
  modalDraft = {
    name: "",
    type: "series",
    ratio: "16:9",
    style: 0,
    styleText: JAPANESE_PROMPT,
  };
  showDialog("create");
}
function createProject() {
  snapshotCreate();
  const title = (modalDraft.name || "").trim();
  if (!title) {
    notify("請輸入專案名稱");
    $("create-name")?.focus();
    return;
  }
  const p = {
    id: "project_" + Date.now(),
    title,
    type: modalDraft.type,
    ratio: modalDraft.ratio,
    style: modalDraft.style,
    customStyle: modalDraft.styleText,
    createdAt: Date.now(),
    cover: "",
    assets: {
      character: [],
      scene: [],
      prop: [],
    },
    episodes:
      modalDraft.type === "series"
        ? [makeEpisode(1, title), makeEpisode(2)]
        : [makeEpisode(1, title)],
    settings: {
      model: "sora-2",
      lockModel: true,
      videoPrompt: "",
    },
  };
  state.projects.unshift(p);
  state.current = p.id;
  state.episode = 0;
  save();
  closeDialog();
  render();
  notify("已建立專案，資料保存在此瀏覽器");
}
function downloadJson(name, data) {
  const content = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    }),
    url = URL.createObjectURL(content),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
async function generateShot(index) {
  const p = project(),
    episode = ep(),
    shot = episode.shots[index];
  if (!shot?.text?.trim()) throw Error("請先填寫鏡頭畫面描述");
  shot.id ||= crypto.randomUUID();
  const projectId = p.id,
    episodeId = episode.id,
    shotId = shot.id;
  // The chosen scene's refs first, then the chosen characters'; all project refs only when nothing is chosen.
  const scene = (p.assets.scene || []).find((a) => a.id === shot.sceneId),
    cast = (p.assets.character || []).filter((a) => (shot.characterIds || []).includes(a.id)),
    chosen = scene || cast.length ? [scene, ...cast].filter(Boolean) : Object.values(p.assets || {}).flat();
  const references = chosen
    .flatMap((a) => (a.refs || []).map((url) => ({ url })))
    .slice(0, 4);
  const job = await VideoWorkbench.generations.create({
    type: "image",
    operation: "project-shot",
    prompt: [
      shot.text,
      scene && "場景：" + [scene.name, scene.descr, scene.time && "時間 " + scene.time].filter(Boolean).join("，"),
      SHOT_SIZES[shot.shotSize] && "鏡頭：" + SHOT_SIZES[shot.shotSize],
      styleText(p),
      episode.styleOverride,
      p.settings?.videoPrompt,
      episode.videoPrompt,
    ]
      .filter(Boolean)
      .join("\n"),
    ratio: p.ratio,
    references: { images: references },
    projectId,
    episodeId,
    shotId,
    ...(scene ? { sceneId: scene.id } : {}),
    ...(cast.length ? { characterIds: cast.map((a) => a.id) } : {}),
    ...(SHOT_SIZES[shot.shotSize] ? { shotSize: shot.shotSize } : {}),
  });
  shot.jobId = job.id;
  save();
  VideoWorkbench.showJob(job, {
    onSuccess: (v) => {
      const owner = state.projects.find((x) => x.id === projectId),
        target = owner?.episodes
          .find((x) => x.id === episodeId)
          ?.shots.find((x) => x.id === shotId);
      if (target) {
        target.image = v.result.url;
        save();
        if (state.current === projectId) renderWorkbench();
      }
    },
  });
}
async function action(a, button) {
  let p = project();
  const kind = button?.dataset.kind;
  const index =
    button?.dataset.index !== undefined
      ? Number(button.dataset.index)
      : undefined;
  switch (a) {
    case "create":
      newProject();
      break;
    case "chooseType":
      snapshotCreate();
      modalDraft.type = button.dataset.value;
      renderDialog();
      break;
    case "chooseRatio":
      snapshotCreate();
      modalDraft.ratio = button.dataset.value;
      renderDialog();
      break;
    case "chooseStyle":
      snapshotCreate();
      modalDraft.style = index;
      modalDraft.styleText =
        index === 0 ? JAPANESE_PROMPT : index === 8 ? "" : STYLE_NAMES[index];
      renderDialog();
      break;
    case "saveProject":
      createProject();
      break;
    case "openProject":
      state.current = button.dataset.id;
      state.episode = 0;
      save();
      render();
      break;
    case "backHome":
      state.current = null;
      save();
      render();
      break;
    case "episode":
      state.episode = index;
      save();
      renderWorkbench();
      break;
    case "addEpisode":
      p.episodes.push(makeEpisode(p.episodes.length + 1));
      state.episode = p.episodes.length - 1;
      save();
      renderWorkbench();
      break;
    case "addShot":
      ep().shots.push({
        text: "",
        seconds: 5,
      });
      save();
      renderWorkbench();
      notify("已新增空白鏡頭，可手動編寫");
      break;
    case "shotScene":
    case "shotSize": {
      const shot = ep().shots[index], field = a === "shotScene" ? "sceneId" : "shotSize";
      if (!shot) break;
      shot[field] = shot[field] === button.dataset.value ? undefined : button.dataset.value;
      save();
      renderWorkbench();
      break;
    }
    case "shotCharacter": {
      const shot = ep().shots[index], id = button.dataset.value;
      if (!shot) break;
      const ids = shot.characterIds || [];
      shot.characterIds = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
      save();
      renderWorkbench();
      break;
    }
    case "deleteShot":
      if (confirm("確定要刪除這顆鏡頭？")) {
        ep().shots.splice(index, 1);
        save();
        renderWorkbench();
      }
      break;
    case "toggleMore":
      $("more-menu").hidden = !$("more-menu").hidden;
      break;
    case "asset":
      openAsset(kind, index);
      break;
    case "sceneTime":
      snapshotAsset();
      dialog.draft.time = button.dataset.value;
      renderDialog();
      break;
    case "saveAsset": {
      snapshotAsset();
      let d = dialog.draft;
      if (!d.name.trim()) {
        notify("請填寫名稱");
        $("asset-name")?.focus();
        return;
      }
      if (dialog.index === undefined) p.assets[dialog.kind].push(d);
      else p.assets[dialog.kind][dialog.index] = d;
      save();
      closeDialog();
      renderWorkbench();
      notify("已儲存到專案製作聖經");
      break;
    }
    case "deleteAsset":
      if (confirm("確定刪除此元件？")) {
        p.assets[dialog.kind].splice(dialog.index, 1);
        save();
        closeDialog();
        renderWorkbench();
      }
      break;
    case "removeAssetRef":
      snapshotAsset();
      dialog.draft.refs.splice(index, 1);
      renderDialog();
      break;
    case "aiAssist": {
      const input = $("asset-ai")?.value?.trim();
      if (!input) {
        notify("請先簡述內容");
        return;
      }
      snapshotAsset();
      VideoWorkbench.request("/assets/describe", {
        kind: dialog.kind,
        prompt: input,
        references: dialog.draft.refs,
      })
        .then((result) => {
          dialog.draft.descr = result.description;
          renderDialog();
        })
        .catch(VideoWorkbench.reportError);
      break;
    }
    case "library": {
      snapshotAsset();
      const target = dialog;
      const rows = await VideoWorkbench.pickAssets({
        kind: "image",
        multiple: true,
        limit: 8 - (target?.draft?.refs?.length || 0),
      });
      if (target?.draft) {
        target.draft.refs.push(...rows.map((a) => a.url));
        dialog = target;
        renderDialog();
      }
      break;
    }
    case "pickLibrary": {
      const all = p.assets.character
        .concat(p.assets.scene, p.assets.prop)
        .flatMap((x) => x.refs || []);
      const ret = modalDraft.libraryReturn;
      if (!ret) return;
      if (ret.draft.refs.length >= 8) {
        notify("參考圖最多 8 張");
        return;
      }
      ret.draft.refs.push(all[index]);
      dialog = ret;
      renderDialog();
      break;
    }
    case "pickFile":
      if (dialog?.type === "asset") snapshotAsset();
      selectedFileTarget = button.dataset.target;
      $("filePick").multiple = selectedFileTarget === "asset";
      $("filePick").value = "";
      $("filePick").click();
      break;
    case "useDefaultCover":
      p.cover = "";
      save();
      renderDialog();
      break;
    case "storyboard":
      showDialog("storyboard", {
        count: "自動",
      });
      break;
    case "shotCount":
      dialog.count = button.dataset.value;
      const active = $("story-outline");
      if (active) ep().outline = active.value;
      save();
      renderDialog();
      break;
    case "manualShots": {
      const text = $("story-outline")?.value?.trim() || "";
      if (text) {
        ep().outline = text;
      }
      const n =
        dialog.count === "自動"
          ? 4
          : Math.min(12, Math.max(1, Number(dialog.count)));
      for (let i = 0; i < n; i++)
        ep().shots.push({
          text: "",
          seconds: 5,
        });
      save();
      closeDialog();
      renderWorkbench();
      notify(`已建立 ${n} 顆可編輯的空白鏡頭（尚未使用 AI）`);
      break;
    }
    case "settings":
      showDialog("settings");
      break;
    case "projectModel":
      p.settings.model = button.dataset.value;
      save();
      showDialog("settings");
      break;
    case "saveSettings": {
      const lock = $("lockModel");
      if (lock) p.settings.lockModel = lock.checked;
      save();
      closeDialog();
      renderWorkbench();
      notify("已儲存生成設定");
      break;
    }
    case "editStyle":
      showDialog("editStyle");
      break;
    case "setProjectStyle":
      p.customStyle = $("project-style-input")?.value || p.customStyle;
      p.style = index;
      save();
      renderDialog();
      break;
    case "saveProjectStyle":
      p.customStyle = $("project-style-input")?.value || "";
      save();
      closeDialog();
      renderWorkbench();
      break;
    case "cover":
      showDialog("cover");
      break;
    case "preview":
      showDialog("preview");
      break;
    case "export":
      showDialog("export");
      break;
    case "exportJson":
      downloadJson(
        `${p.title.replace(/[^\p{L}\p{N}_-]/gu, "_")}_project.json`,
        p,
      );
      closeDialog();
      break;
    case "noAi":
      try {
        const outline = $("story-outline")?.value.trim();
        if (!outline) throw Error("請先填寫大綱");
        const target = ep();
        const result = await VideoWorkbench.request("/director/shots", {
          outline,
          count: dialog.count,
          assets: p.assets,
          style: styleText(p),
        });
        target.outline = outline;
        target.shots.push(...result.shots);
        save();
        closeDialog();
        renderWorkbench();
      } catch (e) {
        VideoWorkbench.reportError(e);
      }
      break;
    case "shotGenerate":
      try {
        await generateShot(index);
      } catch (e) {
        VideoWorkbench.reportError(e);
      }
      break;
    case "batch":
      try {
        const indices = ep()
          .shots.map((s, i) => (s.text?.trim() ? i : -1))
          .filter((i) => i >= 0);
        if (!indices.length) throw Error("請先填寫鏡頭描述");
        if (
          confirm(
            "將產生 " + indices.length + " 張圖片，各張依 API 用量計費。繼續？",
          )
        )
          for (const i of indices) await generateShot(i);
      } catch (e) {
        VideoWorkbench.reportError(e);
      }
      break;
    case "fullVideo":
      try {
        const prompt = [
          ep().outline,
          ...ep().shots.map((s) => s.text),
          styleText(p),
          p.settings?.videoPrompt,
          ep().videoPrompt,
        ]
          .filter(Boolean)
          .join("\n");
        if (!prompt) throw Error("請先填寫本集大綱或鏡頭描述");
        await VideoWorkbench.generator.import({
          target: "reference",
          title: p.title,
          image:
            ep().shots.find((s) => s.image)?.image ||
            Object.values(p.assets)
              .flatMap((x) => x)
              .flatMap((x) => x.refs || [])[0],
          videoPrompt: prompt,
          duration: 8,
          projectModel: p.settings?.model,
        });
        VideoWorkbench.navigate("generator");
      } catch (e) {
        VideoWorkbench.reportError(e);
      }
      break;
    case "openEdit": {
      const e = ep();
      try {
        await VideoWorkbench.generator.import({
          intent: "open-tool",
          tool: e.edit?.engine === "filmcraft" ? "edit-pro" : "edit",
          link: { projectId: p.id, episodeId: e.id },
          edit: e.edit || null,
          title: e.name,
          ratio: p.ratio,
        });
      } catch (err) {
        VideoWorkbench.reportError(err);
      }
      break;
    }
    case "saveEpisode": {
      let v = $("episode-name").value.trim();
      if (v) {
        ep().name = v;
        save();
        closeDialog();
        renderWorkbench();
      }
      break;
    }
    case "close":
      closeDialog();
      break;
    default:
      break;
  }
}

$("filePick").addEventListener("change", async (e) => {
  const files = Array.from(e.target.files || []).filter((x) =>
    x.type.startsWith("image/"),
  );
  if (!files.length) return;
  if (selectedFileTarget === "asset") {
    if (dialog?.type !== "asset") return;
    snapshotAsset();
    const allowed = Math.max(0, 8 - dialog.draft.refs.length);
    for (const f of files.slice(0, allowed)) {
      try {
        dialog.draft.refs.push((await VideoWorkbench.uploadAsset(f)).url);
      } catch {
        notify("無法讀取圖片");
      }
    }
    renderDialog();
  } else if (selectedFileTarget === "cover") {
    try {
      project().cover = (await VideoWorkbench.uploadAsset(files[0])).url;
      save();
      renderDialog();
      notify("已套用自訂封面");
    } catch {
      notify("封面讀取失敗");
    }
  }
});
document.addEventListener("click", (e) => {
  const button = e.target.closest("[data-action]");
  if (button) {
    e.preventDefault();
    action(button.dataset.action, button);
  } else if (e.target === $("overlay")) closeDialog();
});
document.addEventListener("input", (e) => {
  const target = e.target;
  const path = target.dataset.bind;
  if (path) {
    if (path === "episode.outline") ep().outline = target.value;
    else if (path.startsWith("shot.")) {
      const [_, i, key] = path.split(".");
      if (ep().shots[i])
        ep().shots[i][key] =
          key === "seconds"
            ? Math.max(1, Math.min(120, Number(target.value) || 5))
            : target.value;
    }
    save();
  }
  if (target.id === "create-name") modalDraft.name = target.value;
  if (target.id === "style-hint") modalDraft.styleText = target.value;
  if (target.dataset.settings) {
    const key = target.dataset.settings;
    if (key === "model" || key === "videoPrompt")
      project().settings[key] = target.value;
    if (key === "episodeStyle") ep().styleOverride = target.value;
    if (key === "episodeVideoPrompt") ep().videoPrompt = target.value;
    save();
  }
});
document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.id === "lockModel") {
    project().settings.lockModel = t.checked;
    save();
  }
});
render();
