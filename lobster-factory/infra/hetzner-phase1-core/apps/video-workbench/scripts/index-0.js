const $ = (id) => document.getElementById(id);
const safe = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
const tabs = [
  ["director", "✧", "導演智能體", "DIRECTOR"],
  ["reference", "▤", "智能參考體", "REFERENCE"],
  ["reshoot", "▣", "拍片智能體", "RESHOOT"],
  ["cartoon", "☻", "卡通生成體", "CARTOON"],
  ["product", "♧", "網址生成體", "PRODUCT URL"],
  ["spoken", "♙", "口播生成體", "SPOKESPERSON"],
  ["image", "▧", "圖片生成體", "IMAGE"],
];
const placeholders = {
  director: "說說你想拍什麼，送出後進入對話，小海星會一步步引導你生成……",
  reference: "描述動作、運鏡與氛圍，輸入 @ 引用上傳的參考素材……",
  reshoot:
    "照影片 @video1 來產生新影片，左邊的人改成 @image1、背景參考 @image2……",
  cartoon: "描述角色與故事：主角是誰、在哪裡、發生什麼事……",
  spoken: "輸入要朗讀的台詞，輸出 AI 配音音檔……",
  image: "描述你想生成的圖片：主題、風格、構圖與光線……",
};
const model = {
  director: "sora-2",
  reference: "sora-2",
  reshoot: "尚未設定",
  cartoon: "sora-2",
  product: "sora-2",
  spoken: "gpt-4o-mini-tts",
  image: "gpt-image-2.5-flare",
};
const max = {
  director: {
    images: 6,
  },
  reference: {
    images: 9,
    videos: 3,
    audios: 3,
    firstFrame: 1,
    lastFrame: 1,
    motionImage: 1,
    motionVideo: 1,
  },
  reshoot: {
    source: 1,
    images: 28,
  },
  cartoon: {
    images: 9,
  },
  product: {},
  spoken: {},
  image: {
    images: 4,
  },
};
const styles = [
  "卡通動漫",
  "3D 皮克斯感",
  "扁平插畫 · MG",
  "水彩繪本",
  "美式漫畫 · 粗線條",
  "像素風",
];
const styleImages = [
  "assets/image-1.png",
  "assets/image-2.png",
  "assets/image-3.png",
  "assets/image-4.png",
  "assets/image-5.png",
  "assets/image-6.png",
];
const state = {
  mode: "reference",
  outputSettings: {},
  motion: { facing: "video", quality: "1080p", preserveAudio: false, prompt: "" },
  data: {},
  refs: {},
  refType: "all",
  style: -1,
  directorStage: "input",
  directorLength: 8,
  directorCustomLength: "",
  directorTheme: "",
  directorScript: "",
  directorMessages: [],
  directorConversationId: crypto.randomUUID(),
  directorChatInput: "",
  directorPhase: "consultation",
  directorVideoStage: false,
  directorGeneration: "idle",
  directorProgress: 6,
  productStep: 0,
  productUrl: "",
  productDetails: "",
  productStrategy: "",
  productData: null,
  productImages: [],
  productSelectedImages: [0],
  productTexts: [],
  productSelectedTexts: [],
  productDirection: {
    visual: "旁白＋商品示範",
    target: "吸引點擊",
    question: "",
    benefit: "",
    action: "",
    voice: "",
    additional: "",
  },
  productDuration: 8,
  productProposals: [],
  productSelectedProposal: 0,
  productScripts: [],
  productScriptStyle: "",
  cast: "",
  castName: "",
  voice: "",
  spokenPanel: "none",
  spokenVisualDirection: "",
  performance: "",
  castTab: "mine",
  voiceTab: "mine",
  libraryKind: "image",
  libraryTab: "mine",
  libraryTarget: "images",
  reshootFacing: "朝向電影",
  reshootQuality: "1080p",
  reshootPreserve: false,
  ratio: "16:9",
  ratios: ["16:9"],
  quality: "720p",
  duration: 8,
  audio: "有聲",
  watermark: "不套用",
  skill: "不套用技能",
  skills: [],
  subtitleOptions: { languages: ["原文"], style: "白字黑邊", size: "中", position: "下方" },
  subtitle: "關",
  model: {
    ...model,
  },
};
for (const t of tabs) {
  state.data[t[0]] = "";
  state.refs[t[0]] = {};
  for (const key of Object.keys(max[t[0]])) state.refs[t[0]][key] = [];
}
let selectBucket = null;
const lookup = (t) => state.refs[state.mode][t] || [];
function fileBox(bucket, cap, label, wide = false, accept = "image/*") {
  const n = lookup(bucket).length;
  return `<div class="uploads">${lookup(bucket)
    .map(
      (f, i) =>
        `<div class="file-tile">${f.type.startsWith("image/") ? `<img src="${f.url}" alt="${safe(f.name)}">` : f.type.startsWith("video/") ? `<video src="${f.previewUrl || f.url}" controls></video>` : `<span>♬ ${safe(f.name)}</span>`}<button class="remove" data-remove="${bucket}:${i}" aria-label="刪除素材">×</button></div>`,
    )
    .join(
      "",
    )}${n < cap ? `<button class="upload ${wide ? "large" : ""} ${state.mode === "reshoot" && bucket === "images" ? "tall" : ""}" data-upload="${bucket}" data-accept="${accept}"><span class="badge">↥</span><b>${wide ? "▱" : "▧"}</b>${label}<small>${n}/${cap}</small></button>` : ""}</div>`;
}
const tools = () =>
  `<div class="row prompt-tools">${state.mode === "director" ? '<span></span>' : `<div class="row"><button class="minor" data-action="library">▱ ${["image", "cartoon", "spoken"].includes(state.mode) ? "加入參考圖" : "從素材庫引用"}</button><button class="minor" data-action="mention">✧ ${["image", "cartoon", "spoken"].includes(state.mode) ? "用 @ 加入參考圖" : "插入 @ 引用"}</button></div>`}<button class="minor" data-action="clear">⟳ 清除全部</button></div>`;
const area = (txt, secondary = "") =>
  `<label class="sr" for="prompt">生成提示詞</label><textarea id="prompt" class="prompt" placeholder="${safe(txt)}">${safe(state.data[state.mode])}</textarea>${secondary}${tools()}`;
const productTextDefaults = [
  "Unisex t-shirt",
  "$31.00 → $56.00 Price range: $31.00 through $56.00",
  "Size Guide",
  "Earn up to 56 Points.",
  "Unisex t-shirt quantity",
  "SKU: N/A Category: Apparel",
  "Description",
  "Additional information",
  "Reviews (0)",
  "• 100% combed and ring-spun cotton (Heather colors contain polyester)",
  "• Fabric weight: 4.2 oz./yd.² (142 g/m²)",
  "• Pre-shrunk fabric",
];
const spokenCharacters = [
  {
    name: "Accountant",
    desc: "我的角色・授權角色與素材庫",
    image: styleImages[0],
  },
];
const spokenVoices = [
  {
    name: "專業主持",
    desc: "正式、專業的新聞主持聲音，語速穩定、用詞精準",
    tags: "身穩　正式",
  },
  {
    name: "沉穩旁白",
    desc: "沉穩、值得信賴的中性旁白聲音，語速偏慢，咬字清晰",
    tags: "沉穩　男聲",
  },
  {
    name: "活力主播",
    desc: "熱情、帶點鄰播感的活力聲音，語速快、節奏強並明顯",
    tags: "活力　帶勁",
  },
  {
    name: "清亮男聲",
    desc: "清亮有精神的年輕男性聲音，語速均快，充滿活力",
    tags: "清亮　活力",
  },
  {
    name: "溫暖女聲",
    desc: "溫暖親切的年輕女性聲音，輕柔溫和，頻率自然放鬆",
    tags: "溫暖　親切",
  },
  {
    name: "稚嫩童聲",
    desc: "天真穩健的兒童聲音，輕柔慢、細節上等、充滿活力",
    tags: "稚嫩　可愛",
  },
];

const spokenCatalog = { characters: [], assets: [] };
const spokenVoiceIds = ["coral", "onyx", "nova", "alloy", "shimmer", "coral"];
function spokenVoiceCode() {
  const i = spokenVoices.findIndex((v) => v.name === state.voice);
  return i >= 0 ? spokenVoiceIds[i] : state.voice || "coral";
}
function spokenCastName() {
  return (
    [...spokenCatalog.characters, ...spokenCatalog.assets].find(
      (c) => c.id === state.cast,
    )?.name ||
    state.castName ||
    (state.cast ? "已選人物（目錄未載入）" : "")
  );
}
async function loadSpokenCatalog() {
  const [characters, assets] = await Promise.all([
    VideoWorkbench.characters.list(),
    VideoWorkbench.assets.list(),
  ]);
  spokenCatalog.characters = characters;
  spokenCatalog.assets = assets;
  if (state.mode === "spoken" && state.spokenPanel !== "none") render();
}
function spokenTabs(kind) {
  let tabs =
    kind === "cast"
      ? ["我的角色", "授權角色庫", "從素材庫"]
      : ["我的聲音", "搜尋聲音庫", "從素材庫"];
  let current = kind === "cast" ? state.castTab : state.voiceTab;
  return (
    '<div class="spoken-tabs">' +
    tabs
      .map(
        (x, i) =>
          '<button class="' +
          (current === (i === 0 ? "mine" : i === 1 ? "search" : "library")
            ? "on"
            : "") +
          '" data-action="' +
          kind +
          '-tab" data-value="' +
          (i === 0 ? "mine" : i === 1 ? "search" : "library") +
          '">' +
          x +
          "</button>",
      )
      .join("") +
    "</div>"
  );
}
function spokenCastPanel() {
  const tab = state.castTab;
  const rows =
    tab === "library"
      ? spokenCatalog.assets.filter((a) => VideoWorkbench.mediaKind(a) === "image")
      : tab === "search" ? [] : spokenCatalog.characters.filter((c) => !c.id.startsWith("catalog-"));
  return (
    '<div class="spoken-picker"><div class="spoken-picker-head"><button class="minor" data-action="spoken-back">‹ 返回</button><b>選擇人物</b>' +
    spokenTabs("cast") +
    '</div><div class="spoken-card-grid">' +
    rows
      .map(
        (c) =>
          '<button class="spoken-character ' +
          (state.cast === c.id ? "selected" : "") +
          '" data-action="cast-select" data-value="' +
          safe(c.id) +
          '">' +
          (VideoWorkbench.safeUrl(c.image || c.url || "")
            ? '<img src="' +
              safe(VideoWorkbench.safeUrl(c.image || c.url)) +
              '" alt="">'
            : "") +
          "<div><b>" +
          safe(c.name) +
          "</b><small>" +
          safe(c.description || "") +
          "</small></div><i>✓</i></button>",
      )
      .join("") +
    "</div>" +
    (rows.length
      ? ""
      : `<p class="small-note">${tab === "search" ? "授權角色來源尚未接入；外部平台的角色授權不會轉入本機。" : "目前沒有可選人物。可從角色頁建立，或上傳圖片到素材庫。"}</p>`) +
    "</div>"
  );
}
function spokenVoicePanel() {
  const rows =
    state.voiceTab === "library"
      ? spokenCatalog.assets.filter((a) => VideoWorkbench.mediaKind(a) === "audio")
      : spokenVoices;
  return (
    '<div class="spoken-picker"><div class="spoken-picker-head"><button class="minor" data-action="spoken-back">‹ 返回</button><b>選擇聲音</b>' +
    '' +
    '</div><div class="spoken-voice-grid">' +
    rows
      .map(
        (v, i) =>
          '<button class="spoken-voice ' +
          (state.voice === (v.id || v.name) ||
          (state.voiceTab !== "library" &&
            spokenVoiceIds.indexOf(state.voice) === i)
            ? "selected"
            : "") +
          '" data-action="voice-select" data-value="' +
          safe(v.id || v.name) +
          '"><span class="voice-icon">♩</span><span><b>' +
          safe(v.name) +
          "</b><small>" +
          safe(v.desc || "已保存的聲音參考；聲音複製服務尚未接入") +
          "</small></span><i>✓</i></button>",
      )
      .join("") +
    "</div>" +
    (rows.length
      ? ""
      : '<p class="small-note">目前沒有聲音素材，可先上傳音訊至素材庫。</p>') +
    "</div>"
  );
}
function spokenActors() {
  let cast = state.cast
    ? '<div class="actor actor-selected"><button class="actor-choice" data-action="cast"><span class="selected-avatar">♙</span><span><small>CAST　<span class="required">必選</span></small><b>' +
      safe(spokenCastName()) +
      '</b></span></button><button class="minor" data-action="cast-clear" aria-label="清除人物選擇">清除選擇</button></div>'
    : '<button class="actor" data-action="cast">♙　CAST <small style="color:var(--text-muted)">必選</small><br><b>選擇人物</b><br><small>我的角色・授權角色與素材庫</small>　›</button>';
  let voice = state.voice
    ? '<div class="actor actor-selected"><button class="actor-choice" data-action="voice"><span class="selected-avatar">♩</span><span><small>VOICE　<span style="color:var(--text-muted)">選填</span></small><b>' +
      safe(state.voice) +
      '</b></span></button><button class="minor" data-action="voice-clear" aria-label="清除聲音選擇">清除選擇</button></div>'
    : '<button class="actor" data-action="voice">♩　VOICE <small style="color:var(--text-muted)">選填</small><br><b>選擇聲音</b><br><small>從內建聲音庫挑一種聲線</small>　›</button>';
  return '<div class="actors">' + cast + voice + "</div>";
}
function spokenWorkspace() {
  const note =
    '<p class="small-note">人物與表演設定會保存在草稿。這份本機服務目前輸出配音音檔；人物對嘴與聲音複製尚未接入。</p>';
  const fields =
    '<span class="small-note" id="generatorPromptCount">' +
    state.data.spoken.length +
    " 字 · 預估口白 " +
    (state.data.spoken.trim() ? Math.ceil(state.data.spoken.length / 4) : 0) +
    "S</span>" +
    note +
    '<label>畫面／表演指示（選填）</label><textarea id="spokenVisualDirection" class="field" placeholder="例：背景換成咖啡廳、邊說邊拿起產品">' +
    safe(state.spokenVisualDirection || "") +
    '</textarea><label>朗讀指示（選填）</label><textarea id="performance" class="field" placeholder="例如：自然溫暖，語速放慢">' +
    safe(state.performance || "") +
    '</textarea><fieldset class="voice-options"><legend>內建配音聲音</legend>' +
    ["coral", "alloy", "onyx", "nova", "shimmer"]
      .map(
        (v) =>
          '<button type="button" class="minor" data-gen-voice="' +
          v +
          '" aria-pressed="' +
          (spokenVoiceCode() === v) +
          '">' +
          v +
          "</button>",
      )
      .join("") +
    "</fieldset>";
  const picker =
    state.spokenPanel === "cast"
      ? spokenCastPanel()
      : state.spokenPanel === "voice"
        ? spokenVoicePanel()
        : spokenActors();
  return area(placeholders.spoken, picker + fields);
}

function referenceAsset(bucket, cap, label, accept, kind) {
  let current = lookup(bucket);
  let preview = current
    .map(
      (f, i) =>
        '<div class="reference-selected">' + generatorReferencePreview(f) + '<span>' +
        safe(f.name || label) +
        `</span><button class="minor" data-gen-reference-preview="${bucket}:${i}">預覽</button><button class="minor" data-gen-reference-replace="${bucket}:${i}">替換</button><button class="remove" aria-label="移除${safe(label)} ${i + 1}" data-remove="` +
        bucket +
        ":" +
        i +
        '">×</button></div>',
    )
    .join("");
  return (
    '<div class="reference-card" data-drop-bucket="' + bucket + '"><div class="reference-card-title"><b>' +
    label + (bucket === "firstFrame" ? ' <small>必填</small>' : bucket === "lastFrame" ? ' <small>選填</small>' : '') +
    "</b><span>" +
    current.length +
    "/" +
    cap +
    "</span></div>" +
    preview +
    '<div class="reference-card-actions"><button class="minor" data-action="reference-library-' +
    kind +
    '">▧ 選擇' +
    label +
    '</button><button class="minor" data-upload="' +
    bucket +
    '" data-accept="' +
    accept +
    '">↥ 上傳' +
    label +
    '</button>' + (bucket === "audios" ? '<button class="minor" data-gen-extract>從影片取音樂</button>' : '') + '</div></div>'
  );
}
function referenceWorkspace() {
  let h = state.refType === "motion" ? "" : area(placeholders.reference);
  h +=
    '<div class="row reference-switch-row"><div class="ref-switch">' +
    [
      ["all", "全能參考"],
      ["first", "首尾幀參考"],
      ["motion", "動作參考"],
    ]
      .map(
        ([id, s]) =>
          '<button class="' +
          (state.refType === id ? "on" : "") +
          '" data-reftype="' +
          id +
          '">▤ ' +
          s +
          "</button>",
      )
      .join("") +
    '</div><span class="small-note">' +
    (state.refType === "all"
      ? "參考圖／影片／音訊皆可加入，模型會沿用主體與風格"
      : state.refType === "first"
        ? "首幀必填、尾幀選填；模型自動運算中間動態"
        : "指定人物與動作參考，讓模型更準確掌握動作表現") +
    "</span></div>";
  if (state.refType === "all")
    h +=
      '<div class="reference-grid">' +
      referenceAsset("images", 9, "參考圖片", "image/*", "image") +
      referenceAsset("videos", 3, "參考影片", "video/*", "video") +
      referenceAsset("audios", 3, "參考音訊（選填）", "audio/*", "audio") +
      "</div>";
  if (state.refType === "first")
    h +=
      '<div class="reference-grid reference-first-grid">' +
      referenceAsset("firstFrame", 1, "首幀", "image/*", "first") +
      referenceAsset("lastFrame", 1, "尾幀", "image/*", "last") +
      referenceAsset("audios", 3, "參考音訊（選填）", "audio/*", "audio") +
      "</div>";
  if (state.refType === "motion")
    h +=
      generatorMotionWorkspace();
  return h;
}
function reshootWorkspace() {
  let h = area(placeholders.reshoot);
  h += '<section class="reshoot-section" data-drop-bucket="source"><h2>01　來源影片 <small>只能選一支</small></h2><div class="row"><button class="minor" data-action="library">從素材庫選一支</button><button class="minor" data-upload="source" data-accept="video/mp4,video/quicktime,video/webm">上傳一支影片</button></div>' + fileBox("source", 1, "來源影片", true, "video/*") + '</section>';
  h += '<section class="reshoot-section" data-drop-bucket="images"><h2>02　參考素材 <small>選填 · ' + lookup("images").length + ' / 28</small></h2><button class="minor" data-action="reshoot-library-images">從素材庫加入參考圖</button>' + fileBox("images", 28, "加參考圖") + '<div class="reshoot-tags">' + lookup("images").map((f, i) => '<fieldset><legend>' + safe(f.name) + '</legend>' + ["場景", "人物", "未標"].map((tag) => '<label><input type="radio" name="reshoot-tag-' + i + '" data-gen-tag="' + i + '" value="' + tag + '" ' + ((f.tag || "未標") === tag ? 'checked' : '') + '>' + tag + '</label>').join("") + '</fieldset>').join("") + '</div><p class="small-note">場景：參考光線與背景。人物：替換原片人物。未標：參考道具、服裝或風格。</p></section><p class="small-note">重拍專用服務尚未接入，來源、標籤與提示詞可先儲存草稿。</p><button class="box-cta" disabled>尚未接入重拍服務</button>';
  return h;
}
const libraryImages = [
  {
    name: "參考人物 1",
    url: styleImages[0],
  },
  {
    name: "商品參考圖",
    url: styleImages[0],
  },
];
const libraryCharacters = [
  "陳朝榮",
  "陳林秀玉",
  "陳建宏",
  "林佩君",
  "Accountant",
  "活力主播",
  "清亮男聲",
  "溫暖女聲",
];
const libraryMusic = [
  "亮點開箱",
  "城市散步（人聲版）",
  "亮點開箱（人聲版）",
  "限時搶購",
  "限時搶購（人聲版）",
  "質感生活",
];
function render() {
  $("tabs").innerHTML = VideoWorkbench.sanitize(
    tabs
      .map(
        (t) =>
          `<button role="tab" aria-selected="${state.mode === t[0]}" class="tab ${state.mode === t[0] ? "active" : ""}" data-mode="${t[0]}"><i>${t[1]}</i><span class="txt">${t[2]}<small>${t[3]}</small></span></button>`,
      )
      .join(""),
  );
  let m = state.mode,
    h = "";
  if (m === "director") {
    h = directorWorkspace();
  }
  if (m === "reference") {
    h = referenceWorkspace();
  }
  if (m === "reshoot") {
    h = reshootWorkspace();
  }
  if (m === "cartoon") {
    h = area(
      placeholders[m],
      `<div class="small-note" id="generatorPromptCount">${state.data[m].length} 字 · ${state.style < 0 ? "尚未選風格" : styles[state.style]}</div>`,
    );
    h += `<div class="styles">${styles.map((name, i) => `<button class="style ${state.style === i ? "on" : ""}" data-style="${i}"><img src="${styleImages[i]}" alt="${name}">${name}</button>`).join("")}</div><div class="section-label">參考圖（選填） <span class="small-note" style="float:right">已選 ${lookup("images").length}/9</span></div>${fileBox("images", 9, "上傳參考圖")}<p class="small-note">ⓘ 上傳照片或圖片，角色與畫面會以參考圖中的主體為基準，用選定的風格重新繪製。</p>`;
  }
  if (m === "product") {
    h = productSeed();
  }
  if (m === "spoken") {
    h = spokenWorkspace();
  }
  if (m === "image") {
    h = area(placeholders[m]);
    h += fileBox("images", 4, "參考圖");
  }
  $("content").innerHTML = VideoWorkbench.sanitize(h);
  document.querySelector(".dock").hidden = m === "director" || m === "product" || (m === "reference" && state.refType === "motion");
  const s = state;
  $("modelBtn").textContent = "✦ " + s.model[m] + "⌄";
  $("outputBtn").textContent =
    `▱ ${generatorRatios().join("、")} · ${s.quality}${["image", "reshoot"].includes(m) ? "" : ` · ${s.duration}s`}⌄`;
  $("skillBtn").textContent = "✧ " + s.skill + "⌄";
  $("subtitleBtn").style.display =
    m === "image" || m === "reshoot" ? "none" : "";
  $("subtitleBtn").textContent = "▣ 字幕：" + s.subtitle + "⌄";
  $("skillBtn").style.display =
    m === "reshoot" || m === "product" ? "none" : "";
  $("credits").textContent = "API";
  $("send").style.display =
    m === "director" || m === "reshoot" || m === "product" ? "none" : "";
  generatorSyncPrompt();
}
function close() {
  $("popover").classList.add("hidden");
  document.querySelectorAll('button[data-panel]').forEach((b) => b.setAttribute("aria-expanded", "false"));
}
function pop(html) {
  $("popover").innerHTML = VideoWorkbench.sanitize('<div class="popover-toolbar"><button type="button" class="minor" data-popover-close aria-label="完成並關閉設定">完成 ×</button></div>' + html);
  $("popover").classList.remove("hidden");
  document.querySelectorAll('button[data-panel]').forEach((b) => b.setAttribute("aria-expanded", String(b.dataset.panel === $("popover").dataset.activePanel)));
  const box = $("popover"), anchor = [...document.querySelectorAll('button[data-panel]')].find((b) => b.dataset.panel === box.dataset.activePanel && b.getClientRects().length);
  if (anchor) {
    const rect = anchor.getBoundingClientRect(), above = rect.top, below = innerHeight - rect.bottom;
    box.style.bottom = "auto";
    box.style.maxHeight = Math.max(100, Math.min(innerHeight * .65, Math.max(above, below) - 20)) + "px";
    box.style.left = Math.max(8, Math.min(rect.left, innerWidth - box.offsetWidth - 8)) + "px";
    box.style.top = Math.max(8, above >= below ? rect.top - box.offsetHeight - 8 : rect.bottom + 8) + "px";
  }
}
function settings() {
  const c = VideoWorkbench.capabilities || {}, image = state.mode === "image", spoken = state.mode === "spoken";
  const ratios = image ? ["16:9", "9:16", "1:1", "4:5", "4:3"] : c.videoRatios || ["16:9", "9:16"];
  const qualities = image ? c.imageQualities || ["1K"] : c.videoQualities || ["720p"];
  const durations = c.videoDurations || [4, 8, 12];
  const dimensions = image ? c.imageOutputs?.[state.quality]?.[state.ratio] : state.ratio === "9:16" ? [720, 1280] : [1280, 720];
  if (state.mode === "reshoot") return generatorReshootSettings();
  if (spoken) return '<h3>輸出設定</h3><p>目前輸出配音音檔，比例、畫質及影片時長不適用。</p>';
  return `<h3 class="pop-title">輸出設定</h3><p class="small-note">長寬比${image ? "" : " · 可複選，每個比例各產生一個任務"}</p><div class="chips">${["1:1", "16:9", "9:16", "4:5", "4:3"].map((x) => `<button data-ratio="${x}" aria-pressed="${generatorRatios().includes(x)}" class="${generatorRatios().includes(x) ? "on" : ""}" ${!ratios.includes(x) ? 'disabled title="目前服務不支援此比例"' : ''}>${x}</button>`).join("")}</div><p class="small-note">${image ? "解析度" : "畫質"}</p><div class="chips">${(image ? ["1K", "2K", "4K"] : qualities).map((x) => `<button data-quality="${x}" class="${x === state.quality ? "on" : ""}" aria-pressed="${x === state.quality}" ${!qualities.includes(x) ? 'disabled title="目前服務尚未支援此解析度"' : ''}>${x}</button>`).join("")}</div>${image ? '<p class="small-note">依所選比例置中裁切，保留供應商原圖。2K／4K 使用本機縮放，不代表新增 AI 細節。</p>' : `<p class="small-note">影片長度</p><div class="chips">${durations.map((x) => `<button data-gen-duration="${x}" class="${x === state.duration ? "on" : ""}" aria-pressed="${x === state.duration}">${x} 秒</button>`).join("")}</div><p class="small-note">聲音</p><div class="chips">${["有聲", "靜音"].map((x) => `<button data-audio="${x}" class="${x === state.audio ? "on" : ""}" ${x === "靜音" && !c.muteOutput ? 'disabled title="目前服務尚未支援靜音輸出"' : ''}>${x}</button>`).join("")}</div><p class="small-note">影片浮水印</p><div class="chips">${["不套用", "套用浮水印"].map((x) => `<button data-watermark="${x}" class="${x === state.watermark ? "on" : ""}" ${x !== "不套用" && !c.generationWatermark ? 'disabled title="請在應用工具中加入浮水印"' : ''}>${x}</button>`).join("")}</div>`}${dimensions ? `<p class="small-note" id="generatorOutputDimensions">輸出尺寸 · ${dimensions[0]} × ${dimensions[1]} px</p>` : ''}`;
}

const skills = ["投流廣告", "種草文案", "品牌影片", "短劇植入", "出海在地化"];
async function panel(p) {
  $("popover").dataset.activePanel = p;
  if (["director-ratio", "director-duration", "director-quality"].includes(p)) return pop(directorOutputPanel(p));
  if (p === "presets") return generatorPresetPanel();
  if (p === "subtitle") return pop(generatorSubtitlePanel());
  if (p === "skill") return generatorSkillPanel();
  if (p === "settings") pop(settings());
  if (p === "model")
    pop(
      "<h3>已接入模型</h3><p class=\"small-note\">可用模型由服務端設定。</p>" +
        [
          state.model[state.mode],
        ]
          .map(
            (x) =>
              '<button class="option" data-model="' +
              x +
              '">' +
              x +
              "</button>",
          )
          .join(""),
    );
}
function modal(title, inner) {
  close();
  $("modalContent").innerHTML = VideoWorkbench.sanitize(`<h2>${title}</h2>${inner}`);
  $("modal").classList.remove("hidden");
}
$("closeModal").onclick = () => $("modal").classList.add("hidden");
$("modal").addEventListener("click", (e) => {
  if (e.target === $("modal")) $("modal").classList.add("hidden");
});
document.addEventListener("click", (e) => {
  let t = e.target.closest(
    "[data-mode],[data-style],[data-reftype],button[data-panel],[data-upload],[data-remove],[data-ratio],[data-quality],[data-model],[data-audio],[data-watermark],[data-subtitle],[data-skill],[data-action],[data-product-image],[data-product-proposal],[data-reftype],[data-reshoot-facing],[data-reshoot-quality],[data-director-tag]",
  );
  if (!t) return;
  if (t.dataset.productImage !== undefined) {
    productSelectImage(+t.dataset.productImage);
    return;
  }
  if (t.dataset.productProposal !== undefined) {
    state.productSelectedProposal = +t.dataset.productProposal;
    render();
    return;
  }
  if (t.dataset.directorTag !== undefined) {
    let f = state.refs.director.images[+t.dataset.directorTag];
    if (f) {
      f.tag = t.dataset.value;
      render();
    }
    return;
  }
  if (t.dataset.mode) {
    generatorSwitchMode(t.dataset.mode);
    close();
    generatorApplyDefault();
    generatorNormalizeSettings();
    render();
  } else if (t.dataset.style !== undefined) {
    state.style = +t.dataset.style;
    render();
  } else if (t.dataset.reftype) {
    state.refType = t.dataset.reftype;
    render();
  } else if (t.dataset.reshootFacing) {
    state.reshootFacing = t.dataset.reshootFacing;
    render();
  } else if (t.dataset.reshootQuality) {
    state.reshootQuality = t.dataset.reshootQuality;
    render();
  } else if (t.dataset.panel) {
    let isOpen = !$("popover").classList.contains("hidden");
    let text = t.dataset.panel;
    if (isOpen && $("popover").dataset.activePanel === text) close();
    else {
      $("popover").dataset.activePanel = text;
      panel(text);
    }
  } else if (t.dataset.upload) {
    selectBucket = t.dataset.upload;
    $("file").accept = t.dataset.accept || "image/*";
    $("file").click();
  } else if (t.dataset.remove) {
    const [bucket, index] = t.dataset.remove.split(":");
    state.refs[state.mode][bucket].splice(+index, 1);
    render();
  } else if (t.dataset.ratio) {
    const selected = generatorRatios(), value = t.dataset.ratio;
    state.ratios = ["image", "reshoot", "director"].includes(state.mode) ? [value] : selected.includes(value) ? selected.length > 1 ? selected.filter((r) => r !== value) : selected : [...selected, value];
    state.ratio = state.ratios[0];
    generatorRefreshOutputPanel();
  } else if (t.dataset.quality) {
    state.quality = t.dataset.quality;
    generatorRefreshOutputPanel();
  } else if (t.dataset.model) {
    state.model[state.mode] = t.dataset.model;
    close();
    render();
  } else if (t.dataset.audio) {
    state.audio = t.dataset.audio;
    panel("settings");
    render();
  } else if (t.dataset.watermark) {
    state.watermark = t.dataset.watermark;
    panel("settings");
    render();
  } else if (t.dataset.subtitle) {
    state.subtitle = t.dataset.subtitle;
    render();
    panel("subtitle");
  } else if (t.dataset.skill) {
    state.skill = t.dataset.skill;
    close();
    render();
  } else if (t.dataset.action) {
    const a = t.dataset.action;
    if (a === "product-manual") {
      const title = $("manualProductName")?.value.trim(),
        description = $("manualProductDescription")?.value.trim();
      if (!title || !description) {
        VideoWorkbench.reportError(Error("請填寫商品名稱及描述"));
        return;
      }
      state.productData = { title, description, price: "" };
      state.productTexts = [description];
      state.productSelectedTexts = [0];
      state.productImages = [];
      state.productSelectedImages = [];
      state.productStep = 1;
      render();
    }
    if (a === "clear") {
      const undo = generatorCaptureClear();
      state.data[state.mode] = "";
      for (let k of Object.keys(state.refs[state.mode]))
        state.refs[state.mode][k] = [];
      if (state.mode === "spoken") {
        state.cast = state.castName = state.voice = state.performance = state.spokenVisualDirection = "";
        state.spokenPanel = "none";
      }
      render();
      generatorOfferClearUndo(undo);
    }
    if (a === "mention") {
      generatorMentions().catch(VideoWorkbench.reportError);
    }
    if (a === "library") {
      if (state.mode === "spoken") {
        state.spokenPanel = "cast";
        state.castTab = "library";
        loadSpokenCatalog().catch(VideoWorkbench.reportError);
        render();
      } else openLibrary(
        state.mode === "reshoot" ? "video" : "image",
        state.mode === "reshoot" ? "source" : "images",
      );
    }
    if (a === "director-start") {
      if (!state.data.director.trim()) return;
      directorSendMessage(state.data.director, "consultation");
    }
    if (a === "director-length") {
      if (t.dataset.value === "custom") {
        state.directorCustomLength = state.directorLength;
        render();
      } else if (t.dataset.value !== "other") {
        state.directorLength = +t.dataset.value;
        state.duration = state.directorLength;
        state.directorStage = "length";
        render();
      }
    }
    if (a === "director-confirm-length") {
      const length = Number($("directorCustomLength")?.value);
      if (![4, 8, 12].includes(length)) {
        VideoWorkbench.reportError(Error("目前影片支援 4、8、12 秒"));
        return;
      }
      state.directorLength = length;
      state.duration = length;
      state.directorStage = "length";
      render();
    }
    if (a === "director-next-theme") {
      state.directorStage = "theme";
      render();
    }
    if (a === "director-theme") {
      state.directorTheme = t.dataset.value;
      render();
    }
    if (a === "director-generate-script") {
      VideoWorkbench.request("/director/script", {
        prompt: state.data.director,
        duration: state.directorLength,
        references: lookup("images"),
        theme: state.directorTheme,
      })
        .then((result) => {
          state.directorScript = result.script;
          state.directorStage = "script";
          render();
        })
        .catch(VideoWorkbench.reportError);
    }
    if (a === "director-edit-script") {
      state.directorStage = state.directorMessages.length ? "chat" : "edit";
      if (state.directorMessages.length) state.directorChatInput = "我想修改腳本：";
      render();
    }
    if (a === "director-save-script") {
      state.directorScript =
        ($("directorScript") || {}).value || state.directorScript;
      state.directorStage = "script";
      render();
    }
    if (a === "director-cancel-edit") {
      state.directorStage = "script";
      render();
    }
    if (a === "director-storyboard") {
      modal(
        "生成分鏡圖",
        '<p>依照目前腳本生成分鏡圖，確認後會產生圖片 API 用量費用。</p><p>選擇本次使用的參考圖，最多 4 張；其餘仍保留在導演草稿。</p>' + lookup("images").map((f, i) => `<label class="storyboard-reference-choice"><input type="checkbox" data-storyboard-reference="${i}" ${i < 4 ? "checked" : ""}>${safe(f.name || "參考圖 " + (i + 1))}</label>`).join("") + '<button class="box-cta" data-action="director-confirm-storyboard">確認生成分鏡圖</button><button class="minor" data-action="director-cancel">取消</button>',
      );
    }
    if (a === "director-confirm-storyboard") {
      const selected = [...$("modalContent").querySelectorAll("[data-storyboard-reference]:checked")].map((el) => lookup("images")[Number(el.dataset.storyboardReference)]);
      if (selected.length > 4) { VideoWorkbench.reportError(Error("本次分鏡圖最多使用 4 張參考圖，請取消多餘選項。")); return; }
      $("modal").classList.add("hidden");
      VideoWorkbench.generations
        .create({
          type: "image",
          prompt:
            "根據以下腳本繪製連續分鏡圖，依鏡頭順序排列，保持角色與場景一致。\n" +
            state.directorScript,
          references: selected,
        })
        .then(VideoWorkbench.showJob)
        .catch(VideoWorkbench.reportError);
    }
    if (a === "director-history") VideoWorkbench.router.activate("history");
    if (a === "director-to-video") {
      state.directorStage = "video";
      render();
    }
    if (a === "director-generate-video") {
      VideoWorkbench.generations
        .quote(directorGenerationInput())
        .then((quote) => {
          state.directorQuote = quote;
          modal(
            "確認生成",
            "<p>" +
              safe(quote.billing || "依供應商 API 實際用量計費") +
              '</p><button class="box-cta" data-action="director-confirm-generate">確認生成</button><button class="minor" data-action="director-adjust">調整</button><button class="minor" data-action="director-cancel">取消</button>',
          );
        })
        .catch(VideoWorkbench.reportError);
    }
    if (a === "director-confirm-generate") {
      directorStartGeneration();
    }
    if (a === "director-adjust") {
      state.directorStage = "video";
      $("modal").classList.add("hidden");
      render();
    }
    if (a === "director-cancel") {
      $("modal").classList.add("hidden");
    }
    if (a === "director-regenerate") {
      state.directorGeneration = "idle";
      state.directorStage = "video";
      render();
    }
    if (a === "director-preview") {
      modal(
        "影片預覽",
        '<img style="width:100%;border-radius:10px" src="' +
          styleImages[0] +
          '"><p class="small-note">離線預覽畫面；接上影片生成服務後會替換成實際影片。</p>',
      );
    }
    if (a === "reference-library-image") openLibrary("image", "images");
    if (a === "reference-library-video") openLibrary("video", "videos");
    if (a === "reference-library-audio") openLibrary("audio", "audios");
    if (a === "reference-library-first") openLibrary("image", "firstFrame");
    if (a === "reference-library-last") openLibrary("image", "lastFrame");
    if (a === "reference-library-motion-image")
      openLibrary("image", "motionImage");
    if (a === "reference-library-motion-video")
      openLibrary("video", "motionVideo");
    if (a === "reshoot-library-images") openLibrary("image", "images");
    if (a === "cast") {
      state.spokenPanel = "cast";
      loadSpokenCatalog().catch(VideoWorkbench.reportError);
      render();
    }
    if (a === "cast-clear") {
      state.cast = state.castName = "";
      state.spokenPanel = "none";
      render();
    }
    if (a === "voice-clear") {
      state.voice = "";
      state.spokenPanel = "none";
      render();
    }
    if (a === "voice") {
      state.spokenPanel = "voice";
      loadSpokenCatalog().catch(VideoWorkbench.reportError);
      render();
    }
    if (a === "spoken-back") {
      state.spokenPanel = "none";
      render();
    }
    if (a === "cast-select") {
      state.cast = t.dataset.value;
      state.castName =
        [...spokenCatalog.characters, ...spokenCatalog.assets].find(
          (c) => c.id === state.cast,
        )?.name || "";
      state.spokenPanel = "none";
      render();
    }
    if (a === "voice-select") {
      state.voice = t.dataset.value;
      state.spokenPanel = "none";
      render();
    }
    if (a === "cast-tab") {
      state.castTab = t.dataset.value;
      render();
    }
    if (a === "voice-tab") {
      state.voiceTab = t.dataset.value;
      render();
    }
    if (a === "library-close") {
      $("modal").classList.add("hidden");
    }
    if (a === "parse") {
      productParse();
    }
    if (a === "product-upload") {
      selectBucket = "product";
      $("file").accept = "image/*";
      $("file").click();
    }
    if (a === "product-scroll-direction") {
      document.querySelector("[data-product-direction]")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
    if (a === "product-to-direction") {
      state.productStep = 1;
      render();
    }
    if (a === "product-back-assets") {
      productCollect();
      state.productStep = 1;
      render();
    }
    if (a === "product-generate-proposals") {
      productGenerateProposals();
    }
    if (a === "product-back-direction") {
      state.productStep = 1;
      render();
    }
    if (a === "product-to-script") {
      productGenerateScript();
    }
    if (a === "product-back-proposal") {
      state.productStep = 2;
      render();
    }
    if (a === "product-reset") {
      state.productStep = 0;
      state.productData = null;
      state.productImages = [];
      state.productTexts = [];
      state.productSelectedImages = [0];
      state.productSelectedTexts = [];
      render();
    }
    if (a === "product-add-script") {
      productCollect();
      state.productScripts.push({
        time: "新增分鏡",
        text: "補充畫面、動作與旁白。",
      });
      render();
    }
    if (a === "product-remove-script") {
      state.productScripts.splice(+t.dataset.index, 1);
      render();
    }
    if (a === "product-submit") {
      productSubmit();
    }
    if (a === "product-return") {
      state.mode = "director";
      close();
      render();
    }
    if (a === "next") {
      state.productStep = Math.min(3, state.productStep + 1);
      render();
    }
    if (a === "previous") {
      state.productStep = Math.max(0, state.productStep - 1);
      render();
    }
  }
});
$("file").onchange = async (e) => {
  let bucket = selectBucket;
  if (!bucket) return;
  if (bucket === "product") {
    for (let f of e.target.files) {
      if (!f.type.startsWith("image/")) continue;
      state.productImages.push((await VideoWorkbench.uploadAsset(f)).url);
      state.productSelectedImages.push(state.productImages.length - 1);
    }
    e.target.value = "";
    render();
    return;
  }
  try { await generatorUpload(e.target.files, bucket); }
  catch (error) { VideoWorkbench.reportError(error); }
  e.target.value = "";
  render();
};
document.addEventListener("input", (e) => {
  if (e.target.dataset.reshootPreserve !== undefined)
    state.reshootPreserve = e.target.checked;
  if (e.target.id === "prompt") state.data[state.mode] = e.target.value;
  if (e.target.id === "duration") {
    state.duration = +e.target.value;
    panel("settings");
    render();
  }
  if (e.target.id === "performance") state.performance = e.target.value;
  if (e.target.id === "spokenVisualDirection")
    state.spokenVisualDirection = e.target.value;
  if (e.target.id === "productUrl") state.productUrl = e.target.value;
  if (e.target.id === "productDetails") state.productDetails = e.target.value;
  if (e.target.id === "productStrategy") state.productStrategy = e.target.value;
  if (e.target.id === "reshootPrompt") state.data.reshoot = e.target.value;
  if (e.target.dataset.directorPurpose) {
    let f = state.refs.director.images[+e.target.dataset.directorPurpose];
    if (f) f.purpose = e.target.value;
  }
  if (e.target.id === "directorScript") state.directorScript = e.target.value;
  if (state.mode === "product") productHandleInput(e);
});
$("send").onclick = () => {
  if (
    state.mode === "spoken" &&
    !["coral", "alloy", "onyx", "nova", "shimmer"].includes(spokenVoiceCode())
  ) {
    VideoWorkbench.reportError(
      Error("已保存聲音參考；聲音複製服務尚未接入，請選擇內建聲音生成配音。"),
    );
    return;
  }
  let payload = {
    mode: state.mode,
    prompt: state.data[state.mode],
    settings: {
      model: state.model[state.mode],
      ratio: state.ratio,
      quality: state.quality,
      duration: state.duration,
      audio: state.audio,
      watermark: state.watermark,
      subtitle: state.subtitle,
      subtitleOptions: structuredClone(state.subtitleOptions),
      skill: state.skill,
      skills: [...state.skills],
      imageLayout: state.mode === "image" && VideoWorkbench.capabilities?.imageExactOutput ? "center-crop" : undefined,
    },
    references: generatorReferences().reduce((groups, { bucket, asset }) => {
      (groups[bucket] ||= []).push(structuredClone(asset));
      return groups;
    }, {}),
    referenceMode: state.mode === "reference" ? state.refType : undefined,
    cartoonStyle: state.mode === "cartoon" && state.style >= 0 ? styles[state.style] : undefined,
    voice: state.mode === "spoken" ? spokenVoiceCode() : undefined,
    cast:
      state.mode === "spoken"
        ? {
            id: state.cast,
            name: spokenCastName(),
            direction: state.spokenVisualDirection,
          }
        : undefined,
    instructions: state.mode === "spoken" ? state.performance : undefined,
    productUrl: state.productUrl,
  };
  generatorSubmit({
      type: state.mode,
      ...payload,
    });
};
VideoWorkbench.generator = {
  import(payload) {
    if (payload?.intent) return generatorResultAction(payload);
    const target = payload?.target;
    if (!["image", "reference"].includes(target))
      return {
        ok: false,
        message: "未知的帶入目標",
      };
    const prompt =
      target === "image" ? payload.imagePrompt : payload.videoPrompt;
    if (typeof prompt !== "string" || !prompt.trim())
      return {
        ok: false,
        message: "未取得此作品的原文提示詞",
      };
    if (!VideoWorkbench.safeUrl(payload.image || ""))
      return {
        ok: false,
        message: "未取得可帶入的圖片",
      };
    const refs = state.refs[target].images;
    const existing = refs.find((f) => f.url === payload.image);
    if (!existing && refs.length >= max[target].images)
      return {
        ok: false,
        message: "參考圖已滿，請先移除一張後再帶入",
      };
    generatorSwitchMode(target);
    // Reference metadata must not switch the configured service model.
    generatorNormalizeSettings();
    state.ratios = [state.ratio];
    state.data[target] = prompt;
    if (target === "reference") {
      state.refType = "all";
      const duration = parseFloat(payload.duration);
      if (Number.isFinite(duration))
        state.duration = [4, 8, 12].reduce((a, b) =>
          Math.abs(b - duration) < Math.abs(a - duration) ? b : a,
        );
    }
    if (!existing) {
      const type = payload.image.startsWith("data:")
        ? payload.image.slice(5, payload.image.indexOf(";"))
        : "image/webp";
      refs.push({
        name:
          payload.title +
          "." +
          (type === "image/jpeg" ? "jpg" : type.split("/")[1]),
        type,
        url: payload.image,
      });
    }
    document.getElementById("generatorNav").click();
    close();
    render();
    document.getElementById("prompt")?.focus();
    return {
      ok: true,
      target,
    };
  },
};
render();
VideoWorkbench.generator.getDraft = () => structuredClone(state);
VideoWorkbench.generator.newDirectorConversation = directorNewConversation;
VideoWorkbench.generator.setDraft = (value) => {
  if (!value || !tabs.some(([mode]) => mode === value.mode))
    throw Error("草稿生成模式無效");
  for (const key of Object.keys(state))
    if (Object.hasOwn(value, key)) state[key] = structuredClone(value[key]);
  state.directorConversationId = value.directorConversationId || crypto.randomUUID();
  state.directorMessages = Array.isArray(value.directorMessages) ? structuredClone(value.directorMessages) : [];
  state.directorChatInput = value.directorChatInput || "";
  state.directorPhase = value.directorPhase || "consultation";
  state.productScriptStyle = value.productScriptStyle || "";
  state.ratios = Array.isArray(value.ratios) && value.ratios.length ? value.ratios.filter((r) => ["16:9", "9:16", "1:1", "4:5", "4:3"].includes(r)) : [state.ratio];
  state.ratio = state.ratios[0] || "16:9";
  generatorNormalizeSettings();
  render();
};
VideoWorkbench.request("/capabilities", undefined, "GET")
  .then((c) => {
    VideoWorkbench.capabilities = c;
    if (c.models) {
      for (const mode of ["director", "reference", "cartoon", "product"]) state.model[mode] = c.models.video || state.model[mode];
      state.model.image = c.models.image || state.model.image;
      state.model.spoken = c.models.audio || state.model.spoken;
    }
    generatorNormalizeSettings();
    render();
    generatorSyncPrompt();
  })
  .catch((error) => {
    document.getElementById("providerStatus").textContent = "無法讀取生成服務狀態：" + error.message;
  });

document.addEventListener("change", (e) => {
  if (e.target.id === "ttsVoice") state.voice = e.target.value;
});
