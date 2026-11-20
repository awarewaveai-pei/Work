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
const Styles = window.VideoWorkbenchStyles;
const JAPANESE_PROMPT = Styles.prompt("legacy-0");
const stylePicture = (id) => { const i = Styles.get(id)?.legacyIndex; return i >= 0 && i < 8 ? "/examples/style-proj-" + (i + 1) + ".webp" : ""; };
function styleChoices(current, action) {
  return [...new Set(Styles.rows().map(s => s.group))].map(group => `<section><h3>${esc(group)}</h3><div class="styles-grid">${Styles.rows().filter(s => s.group === group).map(s => `<button class="style-tile ${Styles.get(current)?.id === s.id ? "on" : ""}" data-action="${action}" data-value="${esc(s.id)}" aria-pressed="${Styles.get(current)?.id === s.id}">${stylePicture(s.id) ? `<img src="${stylePicture(s.id)}" alt="${esc(s.zh)}">` : ""}<span>${esc(s.zh)}</span></button>`).join("")}</div></section>`).join("");
}
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
// Card U4: the shot's picture -- its moving version when it has one (shared/episode-spine.js land).
const shotMedia = (s) =>
  s.video
    ? `<video src="${esc(s.video)}" controls preload="metadata" style="width:100%;max-height:220px"></video>`
    : s.image
      ? `<img src="${esc(s.image)}" alt="生成畫面" style="width:100%;max-height:220px;object-fit:contain">`
      : "";
// Card U4.5: the video models 讓這鏡動起來 offers -- every one that starts from the picture (its first frame), can run, and
// makes this ratio, in generation-policy.cjs videoModels order. One button each; a click sends that model, no click sends
// nothing (the old tool's 「不要」).
const motionSeconds = (m) => m.defaultDurationSec || m.durations[0];
function motionModels(p) {
  const fits = (m) => m.firstFrame && m.available !== false && (m.ratios || []).includes(p.ratio);
  return VideoWorkbenchVideoModels.list(VideoWorkbench.capabilities).filter(fits);
}
// Card U4: where else a shot's picture can come from. 圖庫素材 searches through the main system (same origin), so it is
// offered only when the workbench is connected to it. Each motion button: label · seconds, and its NT$／秒 by data-paid
// (shared/paid-price.js).
function shotSources(p, s, i) {
  const button = (act, label, extra = "") => `<button class="btn small outline" data-action="${act}" data-index="${i}"${extra}>${label}</button>`,
    models = s.image ? motionModels(p) : [];
  const motion = !s.image
    ? ""
    : `<div class="row" role="group" aria-label="讓這鏡動起來"><span class="tiny">讓這鏡動起來</span>${
        models.length
          ? models.map((m) => button("motionShot", `${esc(m.label)} · ${esc(motionSeconds(m))} 秒`, ` data-value="${esc(m.id)}" data-paid="video.motion" data-paid-model="${esc(m.id)}"`)).join("")
          : '<span class="tiny">這個畫面比例沒有能從圖片開始的影片模型</span>'
      }</div>`;
  return `<div class="row">${button("swapShot", "換圖")}${VideoWorkbench.capabilities?.mainSystem ? button("stockShot", "圖庫素材") : ""}</div>${motion}`;
}
// The reference pictures a shot's own picture uses: the chosen scene's, then the chosen cast's; every project reference
// when nothing is chosen. At most 4 (the workbench image model's limit).
function shotReferences(p, shot) {
  const scene = (p.assets.scene || []).find((a) => a.id === shot.sceneId),
    cast = (p.assets.character || []).filter((a) => (shot.characterIds || []).includes(a.id)),
    chosen = scene || cast.length ? [scene, ...cast].filter(Boolean) : Object.values(p.assets || {}).flat();
  return chosen.flatMap((a) => (a.refs || []).map((url) => ({ url }))).slice(0, 4);
}
// Card U4.4: the main system's scene model a shot is drawn with (capabilities sceneImage, next-admin image-models.js
// VIDEO_SCENE_MODELS), or null = the workbench's own model. A saved model this ratio or this host cannot run is null.
function sceneModel(p, s) {
  const cap = VideoWorkbench.capabilities?.sceneImage;
  if (!s?.imageModel || !cap?.available || !cap.ratios.includes(p.ratio)) return null;
  return cap.groups.flatMap((g) => g.models).find((m) => m.id === s.imageModel) || null;
}
// Card U4.4: 生圖模型 buttons -- 預設 + one per vendor group, then the open group's models with their NT$／張
// (shared/paid-price.js data-paid-model "scene:<id>"). Those models take no reference pictures: said when the shot has some.
function imageModelRow(p, s, i) {
  const cap = VideoWorkbench.capabilities?.sceneImage;
  if (!cap?.available) return "";
  if (!cap.ratios.includes(p.ratio)) return '<p class="tiny">這個畫面比例只能用預設生圖模型</p>';
  const now = sceneModel(p, s), open = now && cap.groups.find((g) => g.models.includes(now)),
    chip = (act, value, label, on, extra = "") => `<button class="btn small ${on ? "primary" : "outline"}" data-action="${act}" data-index="${i}" data-value="${esc(value)}" aria-pressed="${on}"${extra}>${esc(label)}</button>`;
  return `<div class="row" role="group" aria-label="生圖模型"><span class="tiny">生圖模型</span>${chip("shotImageGroup", "", "預設", !open)}${cap.groups.map((g) => chip("shotImageGroup", g.group, g.group, open === g)).join("")}</div>${
    open ? `<div class="row" role="group" aria-label="${esc(open.group)} 模型">${open.models.map((m) => chip("shotImageModel", m.id, m.label, m === now, ` data-paid="video.image" data-paid-model="scene:${esc(m.id)}" title="${esc(m.note)}"`)).join("")}</div>${shotReferences(p, s).length ? '<p class="tiny">這個模型不會參考角色與場景圖</p>' : ""}` : ""
  }`;
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
// the spine-open counter; card PJ.2 adds the shots' pictures (set by settle). This page writes everything else on
// every keystroke, and the top page echoes each write back; comparing only these fields between snapshots means an
// echo never redraws (no lost focus) and a late echo never rolls this page back.
const spineSignature = (s) =>
  JSON.stringify([
    s?.open ?? 0,
    (s?.projects || []).flatMap((p) =>
      (p.episodes || [])
        .map((e) => [p.id, e.id, e.edit ?? null, e.steps ?? null, e.outputs ?? null, (e.shots || []).filter((x) => x?.image || x?.video).map((x) => [x.id, x.image ?? null, x.video ?? null]), e.intro ?? null, e.outro ?? null, e.autoRun ?? null])
        .filter(([, , edit, steps, outputs, pictures, intro, outro, run]) => edit || steps || outputs || pictures.length || intro || outro || run),
    ),
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
    let migrated = false;
    for (const p of state.projects) if (Styles.migrate(p)) migrated = true;
    if (migrated) VideoWorkbench.storage.setItem(STORE, JSON.stringify(state));
  } catch {}
}
loadState();
// An opened project whose saved video model was shut down (Sora 2) moves to the default and says so once.
function replaceRetiredModel() {
  const note = VideoWorkbenchVideoModels.replaceRetired(VideoWorkbench.capabilities, project()?.settings);
  if (!note) return;
  save();
  notify(note);
}
document.addEventListener("vw:changed", () => {
  let s = null;
  try {
    s = JSON.parse(VideoWorkbench.storage.getItem(STORE) || "null");
  } catch {}
  if (spineSignature(s) === spineSeen) return;
  loadState();
  // A top-page write always reaches the screen: drawn now, or when the open dialog closes (closeDialog). The 圖庫素材
  // dialog stays open across its own spine-set-shot, so its picture used to wait for a page reload.
  if (dialog) spineUndrawn = true;
  else render();
  driveAutoRuns();
  consumeNextIntent();
});
let dialog = null;
let spineUndrawn = false;
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
    `<div class="eyebrow">專案 · PROJECTS</div><h1>在同一個世界觀裡，一次又一次開拍。</h1><p class="sub">把角色、場景與道具定義成可複用的元件，套用鎖定的視覺風格 —— 讓長片與系列作品的每一個鏡頭都保持一致。</p>${!count ? `<div class="project-empty"><div class="bigicon">⊞</div><h2>還沒有專案</h2><p>建立第一個專案，開始打造你的世界觀。</p><button class="btn primary" data-action="create">＋　建立新專案</button></div>` : `<div class="split"><h2 style="margin:0">我的專案 <span class="quiet">${count} 個</span></h2><button class="btn primary" data-action="create">＋　建立新專案</button></div><div class="project-grid">${state.projects.map((p) => `<button class="project-card" data-action="openProject" data-id="${esc(p.id)}"><div class="project-cover">${p.cover ? `<img src="${esc(p.cover)}" alt="專案封面" style="width:100%;height:100%;object-fit:cover">` : "▦"}</div><div class="desc"><strong>${esc(p.title)}</strong><span class="badge">${esc(fmtType(p.type))}</span> <span class="badge">${esc(p.ratio)}</span><p class="quiet">${p.episodes.length} 集 · ${esc(Styles.name(p.styleId ?? p.style))}</p></div></button>`).join("")}</div>`}${legacySection()}`,
  );
}
// Plan U6 (§1.6, one project list): the main system's projects the workbench did not make (source other than
// video_workbench: the old pipeline, 腳本工具, 選題 -- a 選題 row carries its topic id in source_ref), listed here read only.
// The main system leaves the workbench's own rows out (excludeSource), so its 100 newest are 100 of these. A card opens its videos in the 審片與發布
// panel; the rows stay where they are.
const LEGACY_SOURCE = { manual: "手動", script_forge: "腳本工具", content_topic: "選題" };
let legacy = { org: "", items: [] };
const legacySection = () =>
  legacy.items.length
    ? `<div class="split" style="margin-top:28px"><h2 style="margin:0">主系統裡的舊專案 <span class="quiet">${legacy.items.length} 個 · 唯讀</span></h2></div><div class="project-grid">${legacy.items.map((p) => `<article class="project-card"><button class="btn" data-action="openLegacy" data-id="${esc(p.id)}">${esc(p.title || "（未命名）")} · 查看與審片</button><div class="desc"><span class="badge">${esc(LEGACY_SOURCE[p.source] || p.source)}</span><p class="quiet">${esc(new Date(p.updated_at).toLocaleDateString())}</p>${p.source === "content_topic" ? `<button class="btn small" data-action="adoptLegacy" data-id="${esc(p.id)}">接手編輯</button>` : ""}</div></article>`).join("")}</div>`
    : "";
async function loadLegacyProjects() {
  try {
    const org = (await VideoWorkbench.loadCapabilities())?.mainSystem?.organizationId,
      res = org && (await fetch("/api/video/projects?excludeSource=video_workbench&organizationId=" + encodeURIComponent(org), { credentials: "same-origin" }));
    if (!res?.ok) return;
    legacy = { org, items: ((await res.json()).items || []) };
    if (!project()) renderHome();
  } catch {
    // no main system or no access: the list is the workbench's own projects only
  }
}
function renderWorkbench() {
  const p = project();
  if (!p) return;
  state.episode = Math.min(state.episode, p.episodes.length - 1);
  const e = ep();
  const total = e.shots.length;
  const menu = `<div class="row"><button class="btn small outline" data-action="preview">◉　預覽整集</button><button class="btn small outline" data-action="export">↓　匯出片段 · 0</button><button class="btn small outline" data-action="cover">▧　更換封面</button><button class="btn small outline" data-action="settings">☷　生成設定</button></div>`;
  $("workbench").innerHTML = VideoWorkbench.sanitize(
    `<div class="work-nav"><button class="btn small outline" data-action="backHome">←　專案列表</button><span class="eyebrow" style="color:var(--text-muted)">AWAREWAVE · 專案</span><span class="quiet">本機專案 · AI 依 API 用量計費</span></div><div class="work-grid"><aside class="bible"><div class="eyebrow">— 製作聖經 · BIBLE</div><h2>${esc(p.title)}</h2><div class="quiet">${esc(p.type === "series" ? "短影集" : "單支影片")} · ${p.episodes.length} 集 · ${esc(p.ratio)}</div><div class="fixed">♙　卡司、場景與風格定義一次，在所有鏡頭間保持一致。</div>${["character", "scene", "prop"].map((k) => entityList(k, p)).join("")}<div class="entity-group"><div class="entity-header">◉　風格錨點</div><div class="style-record"><h3>${esc(Styles.name(p.styleId ?? p.style))}</h3><div class="muted">${esc(styleText(p))}</div></div></div><button class="btn" style="width:100%;margin-top:20px" data-action="settings">☷　生成設定　⌃</button><p class="tiny">風格與負面提示詞的專案／本集兩層設定，會合成後用於實際內容。</p></aside><main class="work-content"><div class="work-top"><div><div class="quiet">專案　›　${esc(p.title)}</div><h1>第 ${state.episode + 1} 集 · ${esc(state.episode === 0 ? p.title : e.name)}</h1><div class="tiny">${total} 個鏡頭 · 約 ${e.shots.reduce((v, s) => v + Number(s.seconds || 5), 0)} 秒 · ${esc(p.ratio)} · ${e.shots.filter((s) => s.image).length}/${total} 已生成</div></div><div class="work-actions"><button class="btn primary" data-action="storyboard">✧　AI 分鏡</button><button class="btn" data-paid="video.image" data-action="batch">▤　批次生成</button><button class="btn" data-action="oneClick">✦　一鍵成片</button><button class="btn" data-action="fullVideo">✧　帶入影片生成</button><div style="position:relative"><button class="btn" data-action="toggleMore">⋯　更多</button><div class="panel" id="more-menu" hidden style="position:absolute;right:0;top:43px;z-index:4;width:205px;padding:7px">${menu}</div></div></div></div>${autoRunBanner(e)}${episodeSteps(e)}<div class="outline-box"><label>□ 本集大綱</label><textarea data-bind="episode.outline" placeholder="用幾句話寫下這一集的故事：誰、在哪裡、發生什麼、怎麼收尾">${esc(e.outline)}</textarea><div class="tiny">AI 分鏡會從這裡開始。改了大綱之後可以重新分鏡。</div></div><div class="episode-tabs">${p.episodes.map((x, i) => `<button class="${i === state.episode ? "on" : ""}" data-action="episode" data-index="${i}">EP${i + 1}　${esc(x.name)} ${x.shots.length}</button>`).join("")}<button data-action="addEpisode" aria-label="新增一集">＋</button></div>${total ? `<div class="split" style="margin-bottom:16px"><strong>本集鏡頭 <span class="quiet">${total} 個</span></strong><button class="btn small primary" data-action="addShot">＋　新增鏡頭</button></div><div class="shot-grid">${e.shots.map((s, i) => `<div class="shot"><div class="split"><h3>鏡頭 ${String(i + 1).padStart(2, "0")}</h3><button class="btn small danger" data-action="deleteShot" data-index="${i}" title="刪除鏡頭">×</button></div>${shotMedia(s)}<label>畫面描述</label><textarea data-bind="shot.${i}.text" placeholder="描述鏡頭內的動作與構圖">${esc(s.text)}</textarea><label>旁白</label><textarea data-bind="shot.${i}.line" placeholder="這一鏡要念的一句話（配音和字幕照它做）">${esc(s.line || "")}</textarea>${shotControls(p, s, i)}${imageModelRow(p, s, i)}<div class="row"><label style="margin:0">時長 <input aria-label="鏡頭時長" style="width:70px;padding:6px" type="number" min="1" max="120" data-bind="shot.${i}.seconds" value="${esc(s.seconds)}"></label><span class="tiny">秒</span><button class="btn small" data-paid="video.image"${sceneModel(p, s) ? ` data-paid-model="scene:${esc(sceneModel(p, s).id)}"` : ""} data-action="shotGenerate" data-index="${i}">生成畫面</button>${s.image ? `<button class="btn small outline" data-action="fixShot" data-index="${i}">修這張</button>` : ""}</div>${shotSources(p, s, i)}</div>`).join("")}</div>` : `<div class="work-empty panel"><h3>這一集還沒有鏡頭，從這裡開始</h3><div class="step"><span class="circle">1</span><div><strong>先建立角色與場景</strong><p>每個角色、場景、道具都可以上傳參考圖。鏡頭鎖定它們之後，長相與環境才會每一鏡都一致。</p><button class="btn small outline" data-action="asset" data-kind="character">♧　建立角色</button></div></div><div class="step"><span class="circle">2</span><div><strong>寫下大綱，讓 AI 分鏡</strong><p>AI 導演會先問幾個問題，再把故事拆成一顆一顆鏡頭，你可以逐鏡修改後再建立。</p><button class="btn small outline" data-action="storyboard">✧　AI 分鏡</button></div></div><div class="step"><span class="circle">3</span><div><strong>或者自己加一顆鏡頭</strong><p>想手動控制每一鏡的細節與鏡頭，就直接開始寫。</p><button class="btn small outline" data-action="addShot">＋　新增鏡頭</button></div></div></div>`}</main></div>`,
  );
  wireReviewLinks();
  ProjectBible.mount(p, e); // card U9: the approved-version block and step 3's check results (scripts/projects-bible.js)
  const next = document.createElement("div"); next.dataset.vwNextSurface = "header"; next.className = "row";
  $("workbench").querySelector(".work-top")?.after(next);
  VideoWorkbench.renderNext(next, p, e, editRows(e), () => openQuickRender(true));
}
// Card PJ.2: the episode's 12 steps and its cuts (spec §6). States come from EpisodeSpine.stepStates; the edit file's
// title is read from the edit file itself, never copied here (card PJ.1).
const STEP_NAMES = ["專案", "腳本與分鏡", "鏡頭畫面", "修圖", "片頭與動畫", "剪輯", "聲音", "字幕", "輸出", "修復與品牌", "審片", "發布"],
  STEP_BADGE = { todo: "還沒做", done: "做好了", optional: "選用", stale: "要重做" },
  FINISH_TOOLS = [["watermark", "加浮水印"], ["cta", "CTA 按鈕"], ["upscale", "畫質增強"], ["enhance", "影音增強"], ["privacy", "肖像權保護"]],
  DERIVE_TOOLS = [["short", "剪成短影音"], ["follow", "人物跟拍"]],
  TOOL_LABEL = Object.fromEntries([...FINISH_TOOLS, ...DERIVE_TOOLS]),
  // Card PJ.4: the tools' names as the tools page shows them (TOOLS in scripts/tools-0.js; that page is another frame).
  TOOL_NAME = { "quick-render": "快速輸出", generator: "鏡頭生成", region: "圖片局部編輯器", depth: "影片轉深度影片", compose: "動畫合成", rig: "角色綁定", "3d": "3D", edit: "影片剪輯", "edit-pro": "專業剪輯", voice: "配音生成", music: "音樂生成", sfx: "去配樂・重配音效", separate: "音軌分離", subtitle: "字幕與逐字稿", watermark: "影片浮水印", cta: "影片 CTA 按鈕", upscale: "畫質增強", enhance: "影音增強與消除字幕", privacy: "肖像權保護", short: "智能短影音剪輯", follow: "人物跟拍剪輯" };
TOOL_LABEL.bookends = "重接片頭／片尾";
TOOL_NAME.bookends = "重接片頭／片尾";
function editRows(e) {
  try {
    const rows = JSON.parse(VideoWorkbench.storage.getItem(e.edit?.engine === "filmcraft" ? "tools.engine.projects" : "tools.editor.projects") || "[]");
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}
function episodeSteps(e) {
  const rows = editRows(e),
    states = EpisodeSpine.stepStates(e, rows),
    outputs = e.outputs || [],
    last = outputs.length - 1,
    button = (act, label, extra = "") => `<button class="btn small outline" data-action="${act}"${extra}>${label}</button>`,
    note = (text) => `<p class="tiny">${text}</p>`,
    row = e.edit && rows.find((r) => EpisodeSpine.editId(r) === e.edit.projectId),
    // Card PJ.5: an edit file deleted in the editor's list leaves e.edit pointing at nothing; the button makes a new one.
    editButton = button("openEdit", row ? "開啟剪輯" : "建立剪輯檔", ' data-intent="arrange"'),
    editFile = `<p class="tiny">${!e.edit ? "還沒有剪輯檔。" : row ? "剪輯檔：" + esc(EpisodeSpine.editTitle(row)) : "剪輯檔已刪除。"}</p>`;
  const body = [
    "",
    // Card U3: 寫腳本 opens 腳本 for this episode; its 「寫回這一集」 replaces the shots. 腳本 needs the main system.
    button("storyboard", "AI 分鏡") + (VideoWorkbench.capabilities?.mainSystem ? button("writeScript", "寫腳本") : ""),
    button("batch", "批次生成", ' data-paid="video.image"') + note("每個鏡頭也可以在下方單獨生成。") + (VideoWorkbench.capabilities?.mainSystem ? button("bibleCheck", "一致性比對") + note("鏡頭畫面對核准版的角色參考圖，按下會先顯示費用。") : ""),
    note("選用。在鏡頭卡上按『修這張』。"),
    button("openTool", "開啟動畫合成", ' data-tool="compose"') + note("選用。做好後在動畫合成按『放到剪輯』，選這一集。"),
    editFile + editButton + note("先排成時間軸，再微調。"),
    // Card PJ.3: 配音 opens the edit file at its priced button (never pressed for you); 配樂 has no time to sync to,
    // so it is the one sound placed by hand.
    button("openEdit", "配音", ' data-intent="voice"') + button("openTool", "配樂", ' data-tool="music"') + note("配音會照每一鏡的旁白逐句產生。配樂做好後，要自己放到音樂軌。"),
    button("openEdit", "產生字幕", ' data-intent="subtitle"') + note("用旁白對時間，不用語音辨識，不收費。"),
    // Plan U5 (D3): 快速輸出 = the main system renders the shots' pictures and lines; 剪輯輸出 = the edit file's timeline.
    button("oneClick", "一鍵成片") + button("quickRender", "快速輸出") + button("openEdit", "剪輯輸出", ' data-intent="export"') + note("一鍵成片先補齊缺的畫面再快速輸出；快速輸出用鏡頭的畫面和旁白直接出片；剪輯輸出照剪輯檔的時間軸出片。"),
    outputs.length ? FINISH_TOOLS.map(([tool, label]) => button("outputTool", label, ` data-tool="${tool}" data-index="${last}"`)).join("") + note("選用。做完會成為新的一版成片，舊的保留。") : "",
    outputs.length ? reviewButton(outputs[last], "qa", "審片") + note("四項檢查，在這裡看結果。") : "",
    outputs.length ? reviewButton(outputs[last], "release", "發布") + note("核准、封面、社群草稿、網站文章。") : "",
  ];
  return `<div class="row" role="list" aria-label="製作步驟" style="align-items:stretch;margin-bottom:16px">${STEP_NAMES.map((name, i) => `<div class="panel step" role="listitem" data-step="${i + 1}" style="flex:1 1 150px;padding:8px 10px"><div class="row"><span class="circle">${i + 1}</span><strong>${name}</strong><span class="badge">${STEP_BADGE[states[i]]}</span></div><div class="row">${body[i]}</div></div>`).join("")}</div>${outputs.length ? outputList(e) : ""}`;
}
// 審片與發布 (plan U6): the shell opens next-admin's panel at `section` (VideoWorkbench.openReview, shared/jobs-view.js).
// Offered once wireReviewLinks has checked the video can be placed.
const reviewButton = (o, section, label) => `<button class="btn small outline" data-review="${esc(o.jobId)}" data-section="${section}" aria-disabled="true">${label}</button>`;
// N14: the next step (and its 完成：…) is the episode's, said once on the newest version; an older version says 完成：… only
// from its own read (data-delivered, wireReviewLinks), and nothing when none was made from it.
function bookendCard(e, o, i, latest) {
  const end = e.intro, templates = VideoWorkbench.capabilities?.remotionTemplates || [],
    name = !end ? "尚未設定" : (end.kind === "title" ? "標題卡" : templates.find((t) => t.id === end.templateId)?.label || "模板") + " · " + end.seconds + " 秒 · " + Transitions.name(end.transition) + "轉場",
    preview = end ? `<span data-intro-preview="${esc(o.jobId)}"></span>` : "";
  return `${latest ? `<div class="row" data-output-next data-vw-next-surface="card"></div>` : `<p class="tiny" data-delivered="${esc(o.jobId)}"></p>`}<div class="panel"><strong>本集片頭：${esc(name)}</strong>${preview}<div class="row">${[["bookendEdit", "編輯片頭"], ["bookendRender", "重新生成片頭 · 免費"], ["bookendJoin", "加入這支影片 · 免費"], ["copyOutput", "複製連結"]].map(([act, label]) => `<button class="btn small outline" data-action="${act}" data-index="${i}">${label}</button>`).join("")}</div></div>`;
}
// The older versions the person opened (by job id), kept across redraws.
const openedOutputs = new Set();
function outputList(e) {
  const outputs = e.outputs,
    rows = editRows(e),
    cut = outputs.findLastIndex((x) => x.derivedFrom == null),
    toolOf = (o) => (e.steps || []).find((s) => s.jobId === o.jobId)?.tool,
    // Card PJ.4 (spec §2 PJ.4): a stale cut is exported again for free; a stale version made from an older cut only
    // opens its tool on the newest cut (paid or needs settings, never sent from here).
    redo = (o) =>
      !EpisodeSpine.outputStale(e, o, rows)
        ? ""
        : o.derivedFrom == null
          ? `<p class="tiny">剪輯改過了，要重新輸出。</p><button class="btn small outline" data-action="openEdit" data-intent="export">重新輸出</button>`
          : toolOf(o) === "bookends"
            ? `<p class="tiny">主片換過了，可以用新版重接。</p><button class="btn small outline" data-action="bookendJoin" data-index="${cut}">用最新主片重接 · 免費</button>`
            : `<p class="tiny">成片換過了，這一版要重做。</p><button class="btn small outline" data-action="outputTool" data-tool="${esc(toolOf(o))}" data-index="${cut}">開啟${esc(TOOL_NAME[toolOf(o)] || toolOf(o))}</button>`;
  const open = VideoWorkbench.expandedOutputs(outputs.length, outputs.map((o, i) => (openedOutputs.has(o.jobId) ? i : -1)).filter((i) => i >= 0));
  return `<section class="panel" style="padding:12px;margin-bottom:16px" aria-label="成片"><strong>成片 ${outputs.length} 支</strong><div class="shot-grid" style="margin-top:10px">${outputs
    .map((o, i) => {
      const parent = o.derivedFrom ? outputs.findIndex((x) => x.url === o.derivedFrom) : -1,
        latest = i === outputs.length - 1,
        body = `<video src="${esc(o.url)}" controls preload="metadata" style="width:100%;max-height:220px"></video><div class="tiny">${parent >= 0 ? `從第 ${parent + 1} 版${esc(TOOL_LABEL[toolOf(o)] || "")}` : `第 ${i + 1} 版`}</div>${redo(o)}${bookendCard(e, o, i, latest)}<div class="row">${reviewButton(o, "qa", "審片與發布")}<button class="btn small outline" data-action="lineage" data-index="${i}">怎麼做的</button>${[...FINISH_TOOLS, ...DERIVE_TOOLS].map(([tool, label]) => `<button class="btn small outline" data-action="outputTool" data-tool="${tool}" data-index="${i}">${label}</button>`).join("")}</div><p class="tiny" data-published="${esc(o.jobId)}"></p>`;
      return latest ? `<div class="shot" data-output="${i}">${body}</div>` : `<details class="shot" data-output="${i}" data-job="${esc(o.jobId)}"${open[i] ? " open" : ""}><summary class="tiny">${esc(VideoWorkbench.outputSummary(o, i, open[i]))}</summary>${body}</details>`;
    })
    .join("")}</div></section>`;
}
// 審片與發布 (plan U6), wired after each draw. The video behind a button is the job record already on this page (a
// finished job does not change), so a redraw asks the server nothing for it; a professional-editor render is recorded
// only on the server (backend/api.cjs POST /engine/renders), so it is asked. What the main system says (QA passed,
// Release approved, where it went) is read again at every draw and whenever this page is shown again after the panel
// (the shell hides this frame, and showing it resizes it); a read answered less than 5 s ago is reused.
const reads = new Map();
const read = (key, load) => {
  const hit = reads.get(key);
  if (hit && Date.now() - hit.at < 5000) return hit.value;
  const value = load();
  reads.set(key, { at: Date.now(), value });
  value.catch(() => reads.delete(key));
  return value;
};
function wireReviewLinks() {
  const root = $("workbench"),
    buttons = [...root.querySelectorAll("[data-review]")],
    shut = (el) => !!el.closest("details[data-output]:not([open])"),   // a collapsed version asks the server nothing until it is opened
    lines = [...root.querySelectorAll("[data-published]")].filter((el) => !shut(el)),
    delivered = [...root.querySelectorAll("[data-delivered]")].filter((el) => !shut(el));
  if (!buttons.length && !lines.length) return;
  const jobs = VideoWorkbench.generations.list(),
    videoOf = (id) => read("job:" + id, () => jobs.then((list) => list.find((j) => j.id === id) || VideoWorkbench.generations.get(id)));
  for (const box of root.querySelectorAll("[data-output-next]")) VideoWorkbench.renderNext(box, project(), ep(), editRows(ep()), () => openQuickRender(true));
  for (const box of root.querySelectorAll("[data-intro-preview]"))
    videoOf(box.dataset.introPreview).then(VideoWorkbench.bookendPreview).then((job) => {
      if (!job?.result?.url || !box.isConnected) return;
      const preview = document.createElement(job.result.thumbUrl ? "img" : "video");
      preview.src = VideoWorkbench.safeUrl(job.result.thumbUrl || job.result.url); preview.width = 128; preview.preload = "metadata"; preview.setAttribute("aria-label", "本集片頭縮圖"); box.replaceChildren(preview);
    }).catch(VideoWorkbench.reportError);
  for (const b of buttons) {
    let refusal = null;
    b.onclick = () => (refusal ? VideoWorkbench.reportError(refusal) : videoOf(b.dataset.review).then((v) => VideoWorkbench.openReview(v, b.dataset.section)).catch(VideoWorkbench.reportError));
    videoOf(b.dataset.review).then(VideoWorkbench.reviewQuery).then(
      () => b.setAttribute("aria-disabled", "false"),
      (error) => {
        refusal = error;
        b.title = error.message;
      },
    );
  }
  for (const line of lines)
    videoOf(line.dataset.published)
      .then((v) => read("published:" + v.id, () => VideoWorkbench.readPublished(v)))
      .then((where) => {
        if (where) line.textContent = "發布到哪：" + (where.join("；") || "還沒發布");
      }, () => {});
  for (const line of delivered)
    videoOf(line.dataset.delivered)
      .then((v) => read("review:" + v.id, () => VideoWorkbench.readProgress(v)))
      .then((review) => { line.textContent = VideoWorkbench.deliveredText(review); }, () => {});
  // The steps follow the newest cut (the one step 11 and 12 open on).
  const last = buttons.find((b) => b.dataset.section === "qa" && b.closest("[data-step]"));
  if (last)
    videoOf(last.dataset.review)
      .then((v) => read("review:" + v.id, () => VideoWorkbench.readProgress(v)))
      .then((review) => {
        const states = EpisodeSpine.stepStates(ep(), editRows(ep()), review);
        for (const n of [11, 12]) {
          const badge = root.querySelector('[data-step="' + n + '"] .badge');
          if (badge) badge.textContent = STEP_BADGE[states[n - 1]] || "狀態未知";
        }
      }, () => {});
}
document.addEventListener("toggle", (event) => {
  const box = event.target;
  if (!box?.matches?.("#workbench details[data-output]")) return;
  box.open ? openedOutputs.add(box.dataset.job) : openedOutputs.delete(box.dataset.job);
  const i = Number(box.dataset.output), summary = box.querySelector(":scope > summary");
  if (summary) summary.textContent = VideoWorkbench.outputSummary(ep()?.outputs?.[i], i, box.open);
  if (box.open) wireReviewLinks();
}, true);
let shown;
window.addEventListener("resize", () => {
  clearTimeout(shown);
  shown = setTimeout(() => !$("workbench").hidden && wireReviewLinks(), 400);
});
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
    Styles.prompt(p.styleId ?? p.style)
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
  const redraw = dialog?.type === "create" || spineUndrawn;
  dialog = null;
  spineUndrawn = false;
  $("overlay").hidden = true;
  $("overlay").innerHTML = VideoWorkbench.sanitize("");
  if (redraw) render();
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
      )}</div></section><section class="create-section"><h2>風格錨點</h2><p class="hint">選一個整個專案都能沿用的視覺方向。之後仍可在製作聖經裡調整。</p><div class="style-catalog">${styleChoices(d.style, "chooseStyle")}</div><label>風格提示</label><textarea id="style-hint" rows="3" placeholder="補充色彩、光線、材質或時代感">${esc(d.styleText || "")}</textarea></section></div><aside class="create-summary"><section class="create-section"><h2>專案預覽</h2><div class="summary-icon">✦</div><dl><dt>名稱</dt><dd>${esc(d.name || "尚未命名")}</dd><dt>類型</dt><dd>${d.type === "series" ? "系列 / 短影集" : "單支影片"}</dd><dt>比例</dt><dd>${esc(d.ratio)}</dd><dt>風格</dt><dd>${esc(Styles.name(d.style) || "自訂")}</dd></dl></section></aside></div><div class="create-actions"><button class="btn outline" data-action="close">取消</button><button class="btn primary" data-action="saveProject">＋　建立專案</button></div></div>`,
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
      `<div class="locked-note">♙　此${label}會在鏡頭間維持一致外觀。</div><label>✧　<strong>AI 輔助</strong>　回答幾個問題，AI 幫你產生描述、背景與參考圖</label><div class="ai-input"><input id="asset-ai" placeholder="一句話描述這個${label}，例如：${kind === "character" ? "冷酷的未來都市女刑警" : kind === "scene" ? "雨夜的霓虹小巷" : "刻有家徽的黃銅懷錶"}"><button class="btn" data-paid="video.script" data-action="aiAssist">開始</button></div><label>參考圖</label><div class="upload-grid">${(d.refs || []).map((src, i) => `<div class="upload-thumb"><img src="${src}"><button data-action="removeAssetRef" data-index="${i}" aria-label="移除圖片">×</button></div>`).join("")}${(d.refs || []).length < 8 ? `<button class="upload-tile" data-action="pickFile" data-target="asset">↑<span>上傳參考</span></button><button class="upload-tile" data-action="library">▧<span>從素材庫選擇</span></button><button class="upload-tile" data-action="noAi">✧<span>AI 生成參考圖 · 5 點</span></button>` : ""}</div><div class="tiny">上傳 1–8 張參考圖，鎖定外觀一致。</div><label>名稱</label><input id="asset-name" value="${esc(d.name || "")}" placeholder="${assetLabels[0]}">${kind === "character" ? `<label>角色定位</label><input id="asset-role" value="${esc(d.role || "")}" placeholder="${assetLabels[1]}">` : ""}${kind === "scene" ? `<label>時間</label><div class="option-row">${["清晨", "上午", "正午", "黃昏", "夜晚", "室內"].map((t) => `<button class="chip ${d.time === t ? "on" : ""}" data-action="sceneTime" data-value="${t}">${t}</button>`).join("")}</div>` : ""}<label>${kind === "character" ? "外觀 / 氣質描述" : kind === "scene" ? "描述" : "描述"}　<span class="tiny">餵給生成模型的 subject 段</span></label><textarea id="asset-descr" rows="4" placeholder="${assetLabels[2]}">${esc(d.descr || "")}</textarea>${kind === "prop" ? `<label><input type="checkbox" id="asset-locked" style="width:auto" ${d.locked ? "checked" : ""}> 維持外觀一致（產品鎖定）</label>` : ""}`,
      `${dialog.index !== undefined ? '<button class="btn danger" data-action="deleteAsset">刪除</button>' : ""}<span style="flex:1"></span>${btnCancel}<button class="btn primary" data-action="saveAsset">✓　儲存</button>`,
      "mid",
    );
  } else if (dialog.type === "storyboard") {
    html = modal(
      "AI 分鏡",
      `<label>本集大綱</label><textarea id="story-outline" rows="6" placeholder="描述這一集的故事：發生什麼、誰出場、在哪裡、如何收尾…">${esc(ep()?.outline || "")}</textarea><div class="row"><span class="quiet">鏡頭數</span>${["自動", "4", "6", "8", "12"].map((a, i) => `<button class="chip ${dialog.count === a ? "on" : ""}" data-action="shotCount" data-value="${a}">${a}</button>`).join("")}</div><p class="quiet">AI 會依大綱與故事聖經（角色／場景／道具）規劃分鏡，建立前可逐一檢視與編輯。AI 分鏡依 API 用量計費。</p><div class="note">可用 AI 產生分鏡後編輯，或免費建立空白鏡頭。</div>`,
      `${btnCancel}<button class="btn" data-action="manualShots">建立空白鏡頭</button><button class="btn primary" data-paid="video.script" data-action="noAi">✧　AI 產生分鏡（API 計費）</button>`,
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
      `<label>風格錨點</label><div class="style-catalog">${styleChoices(p.styleId ?? p.style, "setProjectStyle")}</div><label>風格提示</label><textarea id="project-style-input">${esc(p.customStyle || styleText(p))}</textarea>`,
      btnCancel +
        '<button class="btn primary" data-action="saveProjectStyle">儲存</button>',
      "mid",
    );
  } else if (dialog.type === "preview") {
    const latest = ep().outputs?.at(-1);
    html = modal(
      "預覽整集",
      latest
        ? `<video src="${esc(latest.url)}" controls autoplay style="width:100%;max-height:60vh"></video>`
        : `<div class="note">${ep().shots.length ? "目前只有可編輯的鏡頭草稿，還沒有正式生成影片。" : "本集尚無鏡頭，無法預覽。"}</div>`,
      '<button class="btn" data-action="close">關閉</button>',
    );
  } else if (dialog.type === "lineage") {
    // Card PJ.4: EpisodeSpine.lineage of this cut, one row per step of spec §6 with what that step made.
    const o = ep().outputs?.[dialog.index],
      thumb = (x) =>
        x.kind === "image"
          ? `<img src="${esc(x.url)}" alt="" style="width:64px;height:64px;object-fit:cover">`
          : x.kind === "video"
            ? `<video src="${esc(x.url)}" preload="metadata" muted style="width:96px;height:64px"></video>`
            : `<span class="badge">音訊</span>`,
      rows = o ? EpisodeSpine.lineage(ep(), o.url) : [];
    html = modal(
      "這支成片是怎麼做的",
      rows.length
        ? rows
            .map(
              (r) =>
                `<div class="step" data-lineage-row><div><strong>${r.n ? `第 ${r.n} 步 ${STEP_NAMES[r.n - 1]}` : esc(r.tools.map((t) => TOOL_NAME[t] || t).join("、"))}</strong><p class="tiny">${esc(r.tools.map((t) => TOOL_NAME[t] || t).join("、"))} · ${esc(new Date(r.at).toLocaleString("zh-TW"))}</p><div class="row">${r.outputs.map(thumb).join("")}</div></div></div>`,
            )
            .join("")
        : `<div class="note">這支成片沒有製作紀錄。</div>`,
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
  } else if (dialog.type === "stock") {
    html = modal(
      "圖庫素材",
      `<label>關鍵字</label><input id="stock-keyword" value="${esc(dialog.keyword || "")}" placeholder="例如：city night rain（英文的結果比較多）"><div class="row" role="group" aria-label="素材種類">${[["image", "圖片"], ["video", "影片"]].map(([k, label]) => `<button class="btn small ${dialog.kind === k ? "primary" : "outline"}" data-action="stockKind" data-value="${k}" aria-pressed="${dialog.kind === k}">${label}</button>`).join("")}</div><p class="tiny">從 Pexels 免費圖庫找一個放到鏡頭 ${dialog.index + 1}，不收費。影片若有靜止（畫面不動）的片段會自動換下一支，找不到可用的影片時會改放圖片。</p>${dialog.done ? `<div class="note" role="status">已放到鏡頭 ${dialog.index + 1}。${esc(dialog.done)}</div>` : ""}`,
      dialog.done ? '<button class="btn primary" data-action="close">完成</button>' : btnCancel + '<button class="btn primary" data-action="stockSearch">找一個放上去</button>',
    );
  } else if (dialog.type === "quickRender") {
    // Plan U5 快速輸出 and U5.3 一鍵成片: one dialog; both hand the episode to the runner (driveAutoRuns), which renders a
    // template intro/outro first when one is chosen. Every number comes from the server's quote (§13 C4).
    const d = dialog,
      q = d.quote,
      n = d.ratios.length,
      missing = (ep()?.shots || []).filter((s) => !s.image && !s.video).length,
      money = (usd) => (usd === 0 ? "免費" : window.VideoWorkbenchMoney(usd) || "價格讀取失敗"),
      bad = [...(q?.problems || []), ...bookendProblems(d)],
      ready = q && !bad.length && n && !d.busy && (!d.oneClick || d.budgetTwd >= 0) && (!d.embed || d.siteId);
    html = modal(
      d.oneClick ? "一鍵成片" : "快速輸出",
      (d.oneClick
        ? `<p class="tiny">先把缺畫面的鏡頭補齊，再用每個鏡頭的畫面和旁白直接出片。頁面關掉再開會接著做；已有畫面的鏡頭不會重做。每個鏡頭都要有旁白，鏡頭長度跟著旁白的配音。</p><label>缺的畫面怎麼補（${missing} 個鏡頭）</label><div class="row" role="group" aria-label="缺的畫面怎麼補">${FILL_MODES.map(([k, label]) => chip("quickFill", k, label, d.fill === k)).join("")}</div>`
        : `<p class="tiny">用每個鏡頭的畫面和旁白直接出片：主系統配音、燒字幕、接上片頭片尾，成片回到這一集。每個鏡頭都要有畫面和旁白，鏡頭長度跟著旁白的配音（時長欄不使用）；一集最多 30 個鏡頭，每個素材 200 MB 以內。</p>`) +
        `<label>比例（可複選，每個比例一個任務）</label><div class="row" role="group" aria-label="比例">${EpisodeSpine.QUICK_RATIOS.map((r) => chip("quickRatio", r, r, d.ratios.includes(r))).join("")}${chip("quickRatioAll", "all", "全選", n === EpisodeSpine.QUICK_RATIOS.length)}</div><label>聲線</label><div class="row" role="group" aria-label="聲線">${q ? q.voices.map((v, i) => chip("quickVoice", String(i), v.label, d.tts?.provider === v.provider && d.tts?.voice === v.voice, v.available === false ? "主機沒有設定 OpenAI 金鑰" : "")).join("") : '<span class="tiny">讀取中…</span>'}</div>` +
        bookendControls(d) +
        `<label>做到哪裡停</label><div class="row" role="group" aria-label="做到哪裡停">${[["video", "成片"], ["drafts", "草稿"]].map(([k, label]) => chip("quickUntil", k, label, d.until === k)).join("")}</div><p class="tiny">${d.until === "drafts" ? "成片後由排程自動做品質檢查、核准、建立社群草稿；只到草稿，不會對外發布。" : "做到成片就停，審片與發布由你決定。"}</p>${d.until === "drafts" ? embedControls(d) : ""}` +
        `<div class="settings-section" data-quick-cost><h3>成本明細</h3>${
          d.error
            ? `<p class="tiny">${esc(d.error)}</p>`
            : !q
              ? '<p class="tiny">讀取中…</p>'
              : (q.fill?.pictures ? `<div class="split"><span>補畫面 ${q.fill.pictures} 張</span><span>${money(q.fill.usd)}</span></div>` : "") +
                q.lines.map((l) => `<div class="split"><span>${esc(l.label)}（${esc(l.tool)}）</span><span>${money(l.usd)}</span></div>`).join("") +
                (d.intro.kind !== "none" || d.outro.kind !== "none" ? `<div class="split"><span>片頭／片尾（同樣內容只渲染一次）</span><span>免費</span></div>` : "") +
                (q.draftsUsd ? `<div class="split"><span>社群草稿文案（含一次修正的費用上界）</span><span>${money(q.draftsUsd)}</span></div>` : "") +
                `<div class="split"><strong>輸出每個比例 ${money(q.perRatioUsd)} × ${n} 個比例</strong><strong>合計 ${money(q.totalUsd)}</strong></div>`
        }</div>` +
        (d.oneClick ? `<label>花費上限（NT$）</label><input id="quick-budget" type="number" min="0" step="1" value="${esc(d.budgetTwd ?? "")}"><p class="tiny">實際花費到上限就停在當步，不會自動加碼。</p>` : "") +
        (bad.length ? `<div class="settings-section" data-quick-problems><h3>還不能送出</h3>${bad.map((t) => `<p class="tiny">${esc(t)}</p>`).join("")}</div>` : ""),
      btnCancel + `<button class="btn primary" data-action="quickSend"${ready ? "" : " disabled"}>${d.oneClick ? "開始一鍵成片" : "送出 " + n + " 個任務"}</button>`,
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
    style: "legacy-0",
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
    style: Styles.get(modalDraft.style)?.legacyIndex ?? 8,
    styleId: modalDraft.style,
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
      model: VideoWorkbenchVideoModels.get(VideoWorkbench.capabilities).id,
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
async function generateShot(index, p = project(), episode = ep(), show = true, submission = {}) {
  const shot = episode.shots[index];
  if (!shot?.text?.trim()) throw Error("請先填寫鏡頭畫面描述");
  shot.id ||= crypto.randomUUID();
  const projectId = p.id,
    episodeId = episode.id,
    shotId = shot.id;
  const scene = (p.assets.scene || []).find((a) => a.id === shot.sceneId),
    cast = (p.assets.character || []).filter((a) => (shot.characterIds || []).includes(a.id)),
    // Card U4.4: a main-system scene model draws from the words alone (backend/scene-image.cjs); the card said so.
    model = sceneModel(p, shot),
    references = model ? [] : shotReferences(p, shot);
  const job = await VideoWorkbench.generations.create({
    type: "image",
    operation: "project-shot",
    ...submission,
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
    ...(model ? { settings: { imageModel: model.id, ratio: p.ratio } } : {}),
    projectId,
    episodeId,
    shotId,
    // Card PJ.2: the top page's settle puts the picture on the shot, with the job panel open or closed.
    link: { projectId, episodeId, shotId, tool: "generator", step: "shot", target: "shot:" + shotId },
    ...(scene ? { sceneId: scene.id } : {}),
    ...(cast.length ? { characterIds: cast.map((a) => a.id) } : {}),
    ...(SHOT_SIZES[shot.shotSize] ? { shotSize: shot.shotSize } : {}),
  });
  shot.jobId = job.id;
  save();
  if (show) VideoWorkbench.showJob(job);
  return job;
}
// Card U4: a library or stock picture onto a shot. The top page writes it (spine-set-shot) and records the step; this
// page only asks, like a job's picture (settle).
async function putOnShot(index, asset, tool, p = project(), e = ep()) {
  const shot = e.shots[index];
  if (!shot || !asset?.url) return;
  if (!shot.id) {
    shot.id = crypto.randomUUID();
    save();
    await VideoWorkbench.flush();
  }
  await VideoWorkbench.spine.setShot({ projectId: p.id, episodeId: e.id, shotId: shot.id, url: asset.url, assetId: asset.id ?? null, kind: asset.kind === "video" ? "video" : "image", tool });
}
// Card U4: Pexels through the main system's regenerate-image (plan §4 U4); the file comes in through the stock import
// (backend/url-import.cjs host list). pexels-all / pexels-video never fall back to a paid AI picture.
// Card B25: a clip with a frozen stretch (the review's own freezedetect, backend/stock-freeze.cjs) is never put on the shot:
// the import answers { frozen } without storing it, the next search skips it (excludeUrls), and after StockPick.MAX_CANDIDATES
// frozen clips a picture goes on instead. Returns the sentence for the dialog ("" = nothing was swapped).
async function stockShot(index, kind, keyword, p = project(), e = ep()) {
  if (!keyword) throw Error("請先輸入關鍵字");
  const search = async (model, excludeUrls) => {
    const r = await fetch("/api/video/regenerate-image", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imagePrompt: keyword, brollKeyword: keyword, visual: "broll", imageModel: model, format: { "9:16": "9x16", "4:5": "4x5" }[p.ratio] || "16x9", organizationId: VideoWorkbench.capabilities?.mainSystem?.organizationId, deleteOld: false, ...(excludeUrls.length ? { excludeUrls } : {}) }),
      }),
      found = await r.json().catch(() => ({}));
    if (!r.ok || !found.ok || !found.imageUrl) throw Error("圖庫找不到素材：" + (found.error || found.code || r.status));
    return found.imageUrl;
  };
  const tried = [];
  let imported = null;
  for (let step = StockPick.nextAction({ kind, tried }); !imported; step = StockPick.nextAction({ kind, tried })) {
    const photo = step.do === "photo";
    const url = await search(photo ? "pexels-all" : "pexels-video", step.exclude || []);
    const got = await VideoWorkbench.request("/stock/import", { url, name: "圖庫：" + keyword, ...(photo ? {} : { checkFreeze: true }) });
    if (got.frozen) tried.push(url);
    else imported = got;
  }
  const asset = await VideoWorkbench.assets.save({ ...imported, createdAt: new Date().toISOString() });
  await putOnShot(index, asset, "stock", p, e);
  return StockPick.resultNote({ kind, tried, importedKind: imported.kind });
}
// Card U4: 讓這鏡動起來 -- the shot's picture as the first frame of a video job; settle puts the video on the shot.
async function motionShot(index, modelId) {
  const p = project(),
    e = ep(),
    shot = e.shots[index],
    m = motionModels(p).find((x) => x.id === modelId);
  if (!shot?.image) throw Error("這個鏡頭還沒有畫面");
  if (!shot.text?.trim()) throw Error("請先填寫鏡頭畫面描述");
  if (!m) throw Error("這個影片模型不能從這張圖開始，請換一個");
  const seconds = motionSeconds(m);
  const job = await VideoWorkbench.generations.create({
    type: "video",
    prompt: [shot.text, styleText(p), p.settings?.videoPrompt, e.videoPrompt].filter(Boolean).join("\n"),
    model: m.id,
    duration: seconds,
    ratio: p.ratio,
    settings: { model: m.id, ratio: p.ratio, duration: seconds },
    references: { images: [{ url: shot.image }] },
    link: { projectId: p.id, episodeId: e.id, shotId: shot.id, tool: "generator", step: "shot", target: "shot:" + shot.id, from: [{ slot: "shot:" + shot.id, key: shot.image }] },
  });
  VideoWorkbench.showJob(job);
}
// Plan U5.3: the dialog's button groups (no dropdowns). off = a reason the button cannot be pressed.
const chip = (act, value, label, on, off = "", extra = "") => `<button class="btn small ${on ? "primary" : "outline"}" data-action="${act}" data-value="${esc(value)}" aria-pressed="${on}"${off ? ` disabled title="${esc(off)}"` : ""}${extra}>${esc(label)}</button>`;
const FILL_MODES = [["ai", "AI 生圖"], ["stock-video", "圖庫影片"], ["stock-photo", "圖庫照片"]],
  END_LABEL = { intro: "片頭", outro: "片尾" };
// 片頭／片尾／轉場: the episode's one setting (EpisodeSpine.normalizeBookend), edited here as a draft and written on send.
function bookendControls(d) {
  const caps = VideoWorkbench.capabilities,
    templates = caps?.remotionTemplates || [],
    part = (which) => {
      const b = d[which],
        on = (v) => (v === "none" || v === "title" ? b.kind === v : b.kind === "template" && b.templateId === v);
      return `<label>${END_LABEL[which]}</label><div class="row" role="group" aria-label="${END_LABEL[which]}">${[["none", "不要"], ["title", "標題卡"], ...templates.map((t) => [t.id, t.label])]
        .map(([v, label]) => chip("bookendKind", v, label, on(v), v !== "none" && v !== "title" && !caps?.remotion ? "片頭模板服務未設定" : "", ` data-which="${which}"`))
        .join("")}</div>${
        b.kind === "title"
          ? `<input id="bookend-${which}" maxlength="80" value="${esc(b.fields?.title || "")}" placeholder="標題卡文字"><p class="tiny">標題卡顯示 ${b.seconds} 秒。</p>`
          : b.kind === "template"
            ? `<p class="tiny">模板的文字和圖片用片名、旁白和鏡頭畫面自動帶入，長度 ${b.seconds} 秒；同樣的內容只渲染一次。</p>`
            : ""
      }`;
    };
  // card R2: the transitions module's picker (video-service joins every one of them)
  return part("intro") + part("outro") + `<label>轉場（0.5 秒）</label>` + Transitions.buttons({ label: "轉場", value: d.transition, esc,
    attrs: (id) => `data-action="bookendTransition" data-value="${esc(id)}"`, look: (on) => "btn small " + (on ? "primary" : "outline") });
}
function embedControls(d) {
  const sites = d.quote?.sites || [];
  return `<label><input type="checkbox" id="quick-embed" style="width:auto" ${d.embed ? "checked" : ""}${sites.length ? "" : " disabled"}> 同時建一篇網站草稿文章並嵌入</label>${
    !sites.length ? '<p class="tiny">這個品牌沒有連上的網站。</p>' : d.embed ? `<div class="row" role="group" aria-label="網站">${sites.map((x) => chip("quickSite", x.id, x.name, d.siteId === x.id)).join("")}</div>` : ""
  }`;
}
// A bookend as the episode stores it ({ kind: "none" } removes it).
const savedBookend = (d, which) => (d[which].kind === "none" ? { kind: "none" } : { ...d[which], transition: d.transition, transitionSeconds: 0.5 });
// What stops sending before any render (§9: a template that cannot make a chosen ratio is listed here, not at render time).
// 一鍵成片 will fill the missing pictures first, so they count as there.
function bookendProblems(d) {
  const p = project(),
    e = ep(),
    out = [],
    shots = (e?.shots || []).map((s) => (d.oneClick && !s.image && !s.video ? { ...s, image: "/generated/pending.png" } : s));
  for (const which of ["intro", "outro"]) {
    const b = d[which];
    if (b.kind === "title" && !String(b.fields?.title || "").trim()) out.push(END_LABEL[which] + "標題卡要有文字");
    if (b.kind !== "template") continue;
    for (const ratio of d.ratios) {
      const job = EpisodeSpine.bookendJob(p, { ...e, shots, [which]: savedBookend(d, which) }, which, ratio, VideoWorkbench.capabilities?.remotionTemplates || []);
      if (job?.problem && !out.includes(job.problem)) out.push(job.problem);
    }
  }
  return out;
}
function openQuickRender(oneClick) {
  if (ep()?.autoRun?.status === "running") { notify("這一集正在執行，請先停止這趟，再開始新的"); return; }
  const p = project(),
    e = ep(),
    draft = (b) => (b ? structuredClone(b) : { kind: "none" });
  showDialog("quickRender", {
    oneClick,
    ratios: [EpisodeSpine.QUICK_RATIOS.includes(p.ratio) ? p.ratio : "16:9"],
    tts: e.autoRun?.tts || null,
    fill: "ai",
    until: "video",
    intro: draft(e.intro),
    outro: draft(e.outro),
    transition: Transitions.name((e.intro || e.outro)?.transition ?? Transitions.AUTO.id),
    embed: false,
    siteId: null,
    budgetTwd: null,
  });
  quickQuote();
}
let nextIntentSeen = null;
function consumeNextIntent() {
  if (state.intent !== "video" || !state.open || nextIntentSeen === state.open || !project()) return;
  nextIntentSeen = state.open;
  // Consumed once: the saved selection drops it (runtime write keeps current/episode/open only), so a reload never reopens.
  delete state.intent;
  save();
  openQuickRender(true); // only opens the quoted confirmation; never submits it
}
// Plan U5 快速輸出: what keeps the shots from rendering and what the chosen ratios and voice cost, asked of the server
// again on every change (backend/quick-render.cjs quote); only the newest answer is drawn.
async function quickQuote() {
  const d = dialog,
    asked = (d.asked = (d.asked || 0) + 1);
  d.quote = null;
  d.error = d.ratios.length ? "" : "請至少選一個比例";
  renderDialog();
  if (!d.ratios.length) return;
  try {
    const q = await VideoWorkbench.request("/quick-render/quote", { scenes: EpisodeSpine.quickScenes(ep()), shotModels: (ep()?.shots || []).map((s) => ({ id: s.id, imageModel: s.imageModel })), until: d.until, ratios: d.ratios, ...(d.tts ? { tts: d.tts } : {}), ...(d.oneClick ? { fill: d.fill } : {}) });
    if (dialog !== d || d.asked !== asked) return;
    d.quote = q;
    d.tts ||= { provider: q.voices[0].provider, voice: q.voices[0].voice };
    if (d.oneClick && !d.budgetEdited) d.budgetTwd = Math.ceil(Number(q.totalTwd) || 0);
  } catch (err) {
    if (dialog !== d || d.asked !== asked) return;
    d.error = err.message;
  }
  renderDialog();
}
// Plan U5.3 一鍵成片 (§12: one runner, one stop point). The next move of every running episode comes from
// EpisodeSpine.autoRunNext; this page only does it. Runs whenever this page is open (load, every change, every 5 s while
// a job is awaited): closing the page pauses, opening it again goes on. It never publishes; the furthest it goes is a
// quick render that stops at the cut or at drafts.
let driving = false,
  driveLater = null;
const sharedProjects = () => {
  try {
    return JSON.parse(VideoWorkbench.storage.getItem(STORE) || "null")?.projects || [];
  } catch {
    return [];
  }
};
// A change to a run, made on the newest copy (a step may have changed it since this round read it). patch = fields, or
// fresh run -> fields.
function runPatch(p, e, patch) {
  const fresh = sharedProjects().find((x) => x.id === p.id)?.episodes?.find((x) => x.id === e.id)?.autoRun || e.autoRun;
  return VideoWorkbench.spine.setAutoRun({ projectId: p.id, episodeId: e.id, autoRun: { ...fresh, ...(typeof patch === "function" ? patch(fresh) : patch) } });
}
// Every job the run sends is remembered at once (EpisodeSpine.autoRunNext knows the run's jobs by id).
const remember = (p, e, job) => job?.id && runPatch(p, e, (r) => ({ jobIds: [...(r.jobIds || []), job.id] }));
const runSubmission = (r, step) => ({ runId: r.runId, runAttempt: r.attempt, idempotencyKey: r.runId + ":" + step + ":" + r.attempt });
// 停止／關閉／從這裡繼續 of a run that goes to drafts also reach that run's server half (the schedule that writes the drafts,
// PATCH /api/video/projects autoRun). The row is ensured first (POST, one per project), so a stop made before the first
// render still refuses that render. Answers whether the row now runs this run.
async function serverRun(p, run, action, budgetTwd, rerender) {
  const call = async (method, body) => {
    const r = await fetch("/api/video/projects", { method, credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.ok !== true) throw Error("主系統沒有" + (action === "stop" ? "停下" : "接續") + "這趟草稿執行：" + (data.error || r.status));
    return data;
  };
  const { item } = await call("POST", { organizationId: VideoWorkbench.capabilities?.mainSystem?.organizationId, title: p.title, productionMode: "quick_video", source: "video_workbench", sourceRef: p.id });
  return (await call("PATCH", { id: item.id, autoRun: { runId: run.runId, action, ...(budgetTwd >= 0 ? { budgetTwd } : {}), ...(rerender ? { rerender: true } : {}) } })).armed === true;
}
const FAILED = ["failed", "cancelled", "blocked"];
async function autoRunStep(p, e, next, all) {
  const run = e.autoRun,
    announce = (text) => VideoWorkbench.notify(text + " · " + p.title + "／" + e.name + " · " + location.origin + "/?open=projects&project=" + encodeURIComponent(p.id) + "&episode=" + encodeURIComponent(e.id)),
    stop = async ({ step, reason, jobId, detail }) => { await runPatch(p, e, { status: "stopped", stop: { step, reason, jobId, detail } }); announce("停在" + (STOP_STEP[step] || "這一步") + "：" + reason); };
  if (next.do === "stop") return stop(next);
  if (next.do === "done") { await runPatch(p, e, { status: "done", stop: null }); announce("一鍵成片已完成"); return; }
  try {
    if (next.do === "fill") {
      await runPatch(p, e, { spentTwd: Math.round((run.spentTwd + next.costTwd) * 100) / 100 });
      for (const id of next.shotIds) {
        const i = e.shots.findIndex((s) => s.id === id);
        if (run.fill === "ai") await remember(p, e, await generateShot(i, p, e, false, runSubmission(run, "fill:" + id)));
        else await stockShot(i, run.fill === "stock-video" ? "video" : "image", String(e.shots[i].text || "").trim() || p.title, p, e);
      }
    } else if (next.do === "bookend") {
      // paid: none (the template renders on our own Remotion service, backend/remotion.cjs)
      await remember(p, e, await VideoWorkbench.generations.create({ ...next.input, ...runSubmission(run, next.which + ":" + next.ratio) }));
    } else if (next.do === "render") {
      // A ratio whose earlier job of this run failed after the main system finished (and billed) its render is resent with
      // retryOf = that job: the server reuses the render (backend/api.cjs keptQuick), so it costs nothing again.
      const kept = {};
      for (const ratio of next.ratios) {
        // (a failed job whose render was made from shot pictures swapped since is never reused: B26)
        const prior = all.filter((j) => j.input?.runId === run.runId && j.input.operation === "quick-render" && j.input.settings?.ratio === ratio && FAILED.includes(j.status) && !EpisodeSpine.shotsSwapped(e, j.input.link?.from))
          .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).at(-1);
        if (prior && (await VideoWorkbench.generations.get(prior.id)).quickRenderDone) kept[ratio] = prior.id;
      }
      const costTwd = next.costTwd - run.prices.perRatioTwd * Object.keys(kept).length;
      await runPatch(p, e, { spentTwd: Math.round((run.spentTwd + costTwd) * 100) / 100 });
      for (const input of EpisodeSpine.quickRenderJobs(p, e, { ratios: next.ratios, tts: run.tts, until: run.until, embedSiteId: run.embedSiteId, bookends: next.bookends }))
        // paid: none (the main system prices and bills 快速輸出 itself; the dialog shows its quote; backend/main-system.cjs paidFeature)
        await remember(p, e, await VideoWorkbench.generations.create({ ...input, ...runSubmission(run, "render:" + input.settings.ratio), ...(kept[input.settings.ratio] ? { retryOf: kept[input.settings.ratio] } : {}),
          settings: { ...input.settings, autoBudget: { runId: run.runId, episodeId: e.id, budgetTwd: run.budgetTwd, spentTwd: run.spentTwd + costTwd, renderRatios: run.ratios.map((r) => r.replace(":", "x")) } } }));
    } else if (next.do === "drafts") {
      const org = VideoWorkbench.capabilities?.mainSystem?.organizationId;
      const response = await fetch("/api/video/projects?organizationId=" + encodeURIComponent(org) + "&sourceRef=" + encodeURIComponent(p.id), { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw Error("讀不到草稿執行狀態，已停止自動執行");
      const row = ((await response.json()).items || [])[0];
      if (!row || row.brief_json?.autoBudget?.runId !== run.runId) throw Error("主系統的草稿執行代號不符，請檢查執行紀錄");
      if (row.last_error) return stop(EpisodeSpine.autoRunFailure("drafts", {}, row.last_error));
      if (row.lifecycle_stage !== "measure") return false;
      await runPatch(p, e, { status: "done", stop: null, spentTwd: Number(row.brief_json.autoBudget.spentTwd) });
      announce("社群草稿與選用的網站草稿已完成");
    }
  } catch (err) {
    const step = next.do === "render" ? "render" : next.do === "bookend" ? next.which : next.do === "drafts" ? "drafts" : "fill";
    await stop(EpisodeSpine.autoRunFailure(step, { ratio: next.ratio || (next.ratios?.length === 1 ? next.ratios[0] : "") }, err));
  }
}
async function driveAutoRuns(skipFailed = false) {
  if (driving) return;
  driving = true;
  clearTimeout(driveLater);
  let waiting = false;
  try {
    await VideoWorkbench.ready;
    for (let round = 0; round < 40; round++) {
      const all = await VideoWorkbench.generations.list(),
        // 從這裡繼續: the failed jobs of the stopped step are left out once, so that step is sent again.
        jobs = all.filter((j) => !(skipFailed && round === 0 && FAILED.includes(j.status))),
        templates = VideoWorkbench.capabilities?.remotionTemplates || [];
      let acted = false;
      waiting = false;
      for (const p of sharedProjects())
        for (const e of p.episodes || []) {
          const run = e.autoRun;
          if (run?.status === "running") {
            const rate = Number(VideoWorkbench.capabilities?.twdRate), seen = new Set();
            let spent = run.baseSpentTwd || 0;
            for (const j of jobs.filter((j) => j.input?.runId === run.runId && !seen.has(j.id) && seen.add(j.id))) {
              if (j.input.operation === "project-shot") {
                const actual = j.result?.origin?.costUsd ?? j.finishing?.origin?.costUsd;
                spent += Number.isFinite(actual) && rate > 0 ? actual * rate : run.prices.byShotTwd?.[j.input.shotId] ?? run.prices.perPictureTwd;
              } else if (j.input.operation === "quick-render") spent += j.retryOf ? 0 : run.prices.perRatioTwd; // retryOf = a reused render
            }
            spent = Math.round(spent * 100) / 100;
            if (spent !== run.spentTwd) { await runPatch(p, e, { spentTwd: spent }); e.autoRun.spentTwd = spent; }
          }
          const next = EpisodeSpine.autoRunNext(p, e, jobs, templates);
          if (!next) continue;
          if (next.do === "wait") waiting = true;
          else {
            if (await autoRunStep(p, e, next, all) === false) waiting = true;
            else acted = true;
          }
        }
      if (!acted) break;
    }
  } catch (err) {
    VideoWorkbench.reportError(err);
  } finally {
    driving = false;
  }
  if (waiting) driveLater = setTimeout(() => driveAutoRuns(), 5000);
}
const STOP_STEP = EpisodeSpine.AUTO_RUN_STEP;
function autoRunBanner(e) {
  const r = e.autoRun;
  if (!r || r.status === "done") return "";
  const used = `已用 NT$${r.spentTwd}／上限 NT$${r.budgetTwd}`;
  if (r.status === "running") return `<div class="panel" style="padding:10px;margin-bottom:12px" data-autorun="running"><div class="row"><strong>一鍵成片進行中</strong><span class="tiny">${used} · 頁面關掉再開會接著做</span><button class="btn small outline" data-action="autoRunStop">停止</button></div></div>`;
  const s = EpisodeSpine.readStop(r.stop) || { step: "", reason: "", jobId: null, detail: "" },
    end = s.step === "intro" || s.step === "outro" ? s.step : null,
    // B26: the cut was made from shot pictures that were swapped since; 從這裡繼續 renders again first (EpisodeSpine.autoRunNext).
    // The main system's review stop is written as step "drafts" (its last_error); the only test is the cut, never a step name.
    again = r.until !== "script" && EpisodeSpine.cutOutdated(e);
  return `<div class="panel" style="padding:10px;margin-bottom:12px" data-autorun="stopped"><strong>一鍵成片停在「${STOP_STEP[s.step] || "這一步"}」</strong><p class="tiny">${esc(s.reason)}（${used}）</p>${again ? `<p class="tiny" data-autorun="rerender">鏡頭已換，會先重新出片再審。</p>` : ""}${!s.jobId && s.detail ? `<details class="tiny"><summary>錯誤原文（給客服看）</summary>${esc(s.detail)}</details>` : ""}<div class="row"><label style="margin:0">上限 NT$ <input id="autorun-budget" aria-label="花費上限" type="number" min="0" step="1" style="width:90px;padding:6px" value="${esc(r.budgetTwd)}"></label><button class="btn small primary" data-action="autoRunResume">${end ? "重試" + END_LABEL[end] : "從這裡繼續"}</button>${end ? `<button class="btn small outline" data-action="autoRunSkipEnd" data-which="${end}">不加${END_LABEL[end]}先出片</button>` : ""}${s.jobId ? `<button class="btn small outline" data-action="autoRunJob" data-job="${esc(s.jobId)}">檢視任務</button>` : ""}<button class="btn small outline" data-action="autoRunClear">關閉</button></div></div>`;
}
// Card PJ.2: a tool opened for this episode; what it makes comes back here (shared/episode-spine.js settle).
function openTool(tool, link, asset) {
  return VideoWorkbench.generator.import({ intent: "open-tool", tool, link: { projectId: project().id, episodeId: ep().id, ...link }, ...(asset ? { asset } : {}) });
}
const outputAsset = (o) => ({ id: o.assetId, name: "成片", kind: "video", type: "video/mp4", url: o.url });
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
    case "openLegacy":
      VideoWorkbench.navigate("review-release", new URLSearchParams({ organizationId: legacy.org, project: button.dataset.id, section: "qa" }).toString()).catch(VideoWorkbench.reportError);
      break;
    case "adoptLegacy":
      VideoWorkbench.navigate("schedule", new URLSearchParams({ project: button.dataset.id }).toString()).catch(VideoWorkbench.reportError);
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
      modalDraft.style = button.dataset.value;
      modalDraft.styleText = Styles.prompt(modalDraft.style);
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
      replaceRetiredModel();
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
        id: crypto.randomUUID(),
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
    case "shotImageGroup":
    case "shotImageModel": {
      const shot = ep().shots[index], v = button.dataset.value,
        group = VideoWorkbench.capabilities?.sceneImage?.groups.find((g) => g.group === v);
      if (!shot) break;
      if (a === "shotImageModel") shot.imageModel = v;
      else if (group) shot.imageModel = group.models[0]?.id;
      else delete shot.imageModel;
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
    case "bibleSave":
    case "bibleApply":
    case "bibleCheck":
      ProjectBible.act(a, p, ep(), button.dataset.value, { save, render, notify });
      break;
    case "writeScript":
      VideoWorkbench.navigate("script-forge", new URLSearchParams({ project: p.id, episode: ep().id }).toString()).catch(VideoWorkbench.reportError);
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
          id: crypto.randomUUID(),
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
      Styles.select(p, button.dataset.value);
      p.customStyle = Styles.prompt(p.styleId ?? p.style);
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
    case "lineage":
      showDialog("lineage", { index });
      break;
    case "quickRender":
    case "oneClick":
      openQuickRender(a === "oneClick");
      break;
    case "copyOutput":
      await navigator.clipboard.writeText(new URL(ep().outputs[index].url, location.origin).href);
      notify("已複製影片連結；連結需登入同一個工作台才能開啟");
      break;
    case "bookendEdit":
    case "bookendRender":
    case "bookendJoin": {
      const output = ep().outputs[index], job = await VideoWorkbench.generations.get(output.jobId);
      await VideoWorkbench.bookendAction(job, { bookendEdit: "edit", bookendRender: "render", bookendJoin: "join" }[a]);
      break;
    }
    case "quickRatio":
    case "quickRatioAll": {
      const r = button.dataset.value,
        all = EpisodeSpine.QUICK_RATIOS;
      dialog.ratios = a === "quickRatioAll" ? (dialog.ratios.length === all.length ? [] : [...all]) : dialog.ratios.includes(r) ? dialog.ratios.filter((x) => x !== r) : [...dialog.ratios, r];
      quickQuote();
      break;
    }
    case "quickVoice": {
      const v = dialog.quote?.voices[Number(button.dataset.value)];
      if (v) dialog.tts = { provider: v.provider, voice: v.voice };
      quickQuote();
      break;
    }
    case "quickFill":
      dialog.fill = button.dataset.value;
      quickQuote();
      break;
    case "quickUntil":
      dialog.until = button.dataset.value;
      if (dialog.until !== "drafts") dialog.embed = false;
      quickQuote();
      break;
    case "quickSite":
      dialog.siteId = button.dataset.value;
      renderDialog();
      break;
    case "bookendKind": {
      const which = button.dataset.which,
        v = button.dataset.value,
        was = dialog[which],
        t = (VideoWorkbench.capabilities?.remotionTemplates || []).find((x) => x.id === v);
      dialog[which] =
        v === "none" ? { kind: "none" }
        : v === "title" ? { kind: "title", fields: { title: was.kind === "title" ? was.fields?.title || "" : which === "intro" ? p.title : "謝謝收看" }, seconds: 3 }
        : was.kind === "template" && was.templateId === v ? was
        : { kind: "template", templateId: v, fields: {}, references: {}, seconds: t?.seconds.def ?? 5 };
      renderDialog();
      break;
    }
    case "bookendTransition":
      dialog.transition = button.dataset.value;
      renderDialog();
      break;
    case "quickSend": {
      // The episode's bookends and run are written by the top page (spine-set-bookends, spine-set-auto-run); the runner
      // sends the jobs. 快速輸出 = a run with nothing to fill whose limit is its own quote.
      const d = dialog,
        q = d.quote,
        e = ep();
      d.busy = button.disabled = true;
      try {
        if (e.autoRun?.status === "running") throw Error("這一集正在執行，請先停止這趟，再開始新的");
        await VideoWorkbench.spine.setBookends({ projectId: p.id, episodeId: e.id, intro: savedBookend(d, "intro"), outro: savedBookend(d, "outro") });
        await VideoWorkbench.spine.setAutoRun({
          projectId: p.id,
          episodeId: e.id,
          autoRun: {
            until: d.until, budgetTwd: d.oneClick ? d.budgetTwd : Number(q.totalTwd), fill: d.fill, ratios: d.ratios, tts: d.tts,
            embedSiteId: d.until === "drafts" && d.embed ? d.siteId : null,
            prices: { perPictureTwd: q.fill?.perPictureTwd ?? 0, perRatioTwd: q.perRatioTwd, byShotTwd: q.fill?.byShotTwd || {} },
          },
        });
        closeDialog();
        notify(d.oneClick ? "一鍵成片開始了；頁面關掉再開會接著做。" : `已開始快速輸出，每個比例一個任務。`);
        driveAutoRuns();
      } catch (err) {
        d.busy = false;
        renderDialog();
        VideoWorkbench.reportError(err);
      }
      break;
    }
    case "autoRunStop":
    case "autoRunClear":
      try {
        const e = ep(),
          run = e.autoRun;
        // The runner stops here first; then the server half, so the schedule writes no drafts for this run (a failure
        // shows, and 關閉 sends the stop again). 關閉 removes the run only once the server half is stopped.
        if (a === "autoRunStop") await runPatch(p, e, { status: "stopped", stop: { step: "", reason: "已手動停止" } });
        if (run?.until === "drafts") await serverRun(p, run, "stop");
        if (a === "autoRunClear") await VideoWorkbench.spine.setAutoRun({ projectId: p.id, episodeId: e.id, autoRun: null });
      } catch (err) {
        VideoWorkbench.reportError(err);
      }
      break;
    case "autoRunJob":
      VideoWorkbench.generations.get(button.dataset.job).then(VideoWorkbench.showJob, VideoWorkbench.reportError);
      break;
    case "autoRunResume":
    case "autoRunSkipEnd":
      try {
        const e = ep(),
          run = e.autoRun,
          budget = Number($("autorun-budget")?.value);
        if (a === "autoRunSkipEnd") await VideoWorkbench.spine.setBookends({ projectId: p.id, episodeId: e.id, [button.dataset.which]: { kind: "none" } });
        // The server half of a drafts run goes on with it (same run, the new limit, the old stop reason cleared) before the
        // runner does, so a render it sends is not refused as stopped; if the runner may not go on, the server half stops again.
        const drafts = run?.until === "drafts";
        if (drafts && !(await serverRun(p, run, "resume", budget, EpisodeSpine.cutOutdated(e))) && run.stop?.step === "drafts") throw Error("主系統的草稿執行代號不符，請檢查執行紀錄");
        await runPatch(p, e, (r) => ({ status: "running", stop: null, attempt: (r.attempt || 0) + 1, ...(budget >= 0 ? { budgetTwd: budget } : {}) }))
          .catch(async (err) => { if (drafts) await serverRun(p, run, "stop"); throw err; });
        await driveAutoRuns(true);
      } catch (err) {
        VideoWorkbench.reportError(err);
      }
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
    case "swapShot":
    case "motionShot":
      try {
        if (a === "motionShot") await motionShot(index, button.dataset.value);
        else {
          const [asset] = await VideoWorkbench.pickAssets({ kind: "image", limit: 1 });
          if (asset) await putOnShot(index, asset, "library");
        }
      } catch (e) {
        VideoWorkbench.reportError(e);
      }
      break;
    case "stockShot":
      showDialog("stock", { index, kind: "image", keyword: "" });
      break;
    case "stockKind":
      dialog.kind = button.dataset.value;
      renderDialog();
      break;
    case "stockSearch": {
      const { index: at, kind: wanted } = dialog,
        keyword = $("stock-keyword")?.value.trim();
      button.disabled = true;
      try {
        const said = await stockShot(at, wanted, keyword);
        // B25: a swap the person did not ask for is told in the dialog, which then stays until closed.
        if (said && dialog?.type === "stock") { dialog.keyword = keyword; dialog.done = said; renderDialog(); } else if (!said) closeDialog();
      } catch (e) {
        button.disabled = false;
        VideoWorkbench.reportError(e);
      }
      break;
    }
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
      // Card PJ.5: a deleted file is not opened (it is gone) -- edit: null makes a new one and attaches it in its place
      // (tools-0.js acceptAsset). e.edit is not cleared first: a file restored from its backup links up again.
      const edit = e.edit && editRows(e).some((r) => EpisodeSpine.editId(r) === e.edit.projectId) ? e.edit : null;
      try {
        await VideoWorkbench.generator.import({
          intent: "open-tool",
          tool: edit?.engine === "filmcraft" ? "edit-pro" : "edit",
          link: { projectId: p.id, episodeId: e.id },
          edit,
          title: e.name,
          ratio: p.ratio,
          ...(button?.dataset.intent ? { editIntent: button.dataset.intent } : {}),
        });
      } catch (err) {
        VideoWorkbench.reportError(err);
      }
      break;
    }
    case "openTool":
    case "outputTool":
    case "fixShot":
      try {
        const e = ep();
        if (a === "openTool") await openTool(button.dataset.tool, {});
        else if (a === "outputTool") {
          const o = e.outputs?.[index];
          if (o) await openTool(button.dataset.tool, { target: "output", from: [{ slot: "export", key: o.url }] }, outputAsset(o));
        } else {
          const s = e.shots[index];
          if (s?.image) await openTool("region", { target: "shot:" + s.id, from: [{ slot: "shot:" + s.id, key: s.image }] }, { id: "shot-" + s.id, name: "鏡頭畫面", kind: "image", type: "image/png", url: s.image });
        }
      } catch (err) {
        VideoWorkbench.reportError(err);
      }
      break;
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
  if (target.id === "stock-keyword" && dialog?.type === "stock") dialog.keyword = target.value;
  if (dialog?.type === "quickRender" && (target.id === "bookend-intro" || target.id === "bookend-outro")) {
    dialog[target.id.slice(8)].fields = { title: target.value };
    const send = document.querySelector('[data-action="quickSend"]');
    if (send && !target.value.trim()) send.disabled = true;
  }
  if (target.id === "quick-budget" && dialog?.type === "quickRender") {
    dialog.budgetTwd = target.value === "" ? null : Number(target.value);
    dialog.budgetEdited = true;
  }
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
  if (t.id === "quick-embed" && dialog?.type === "quickRender") {
    dialog.embed = t.checked;
    dialog.siteId = t.checked ? dialog.siteId || dialog.quote?.sites?.[0]?.id || null : null;
    renderDialog();
  }
  if (dialog?.type === "quickRender" && (t.id === "bookend-intro" || t.id === "bookend-outro" || t.id === "quick-budget")) renderDialog(); // problems and the send button follow
});
render();
loadLegacyProjects();
replaceRetiredModel();
driveAutoRuns();
consumeNextIntent();
