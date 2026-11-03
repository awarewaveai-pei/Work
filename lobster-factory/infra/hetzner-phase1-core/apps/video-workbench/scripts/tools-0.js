"use strict";

const TOOLS = [
  {
    id: "edit",
    cat: "剪輯成片",
    icon: "▣",
    name: "影片剪輯",
    desc: "多軌剪接、加字幕與旁白，匯出完整成片",
    io: "多支素材 → 成片",
    new: 1,
  },
  {
    id: "compose",
    cat: "剪輯成片",
    icon: "◩",
    name: "動畫合成",
    desc: "圖層、遮罩、關鍵影格與表達式做片頭與動態字幕，輸出透明影片回剪輯",
    io: "圖層 → 透明影片／參考圖",
    new: 1,
  },
  {
    id: "rig",
    cat: "剪輯成片",
    icon: "✦",
    name: "角色綁定",
    desc: "分層角色組骨架、IK、Puppet 網格與權重，在動畫合成做揮手等動作；姿勢圖可當生成參考",
    io: "分層角色 → 可動畫角色／姿勢圖",
    new: 1,
  },
  {
    id: "short",
    cat: "剪輯成片",
    icon: "✂",
    name: "智能短影音剪輯",
    desc: "從長影片挑出精華段落，一次剪成多支直式短影音",
    io: "長影片 → 多支 9:16",
    new: 1,
  },
  {
    id: "follow",
    cat: "剪輯成片",
    icon: "♙",
    name: "人物跟拍剪輯",
    desc: "點選畫面中的人，剪出跟著他移動的直式影片",
    io: "影片＋點選人物 → 一支 9:16",
    new: 1,
  },
  {
    id: "subtitle",
    cat: "剪輯成片",
    icon: "▤",
    name: "字幕與逐字稿",
    desc: "辨識語音、校對字幕並下載 SRT / VTT",
    io: "影片／音檔 → 字幕檔",
    new: 1,
  },
  {
    id: "upscale",
    cat: "畫質修復",
    icon: "✳",
    name: "畫質增強",
    desc: "把影片升級到 1080p、2K 或 4K",
    io: "影片 → 高解析影片",
  },
  {
    id: "enhance",
    cat: "畫質修復",
    icon: "✛",
    name: "影音增強與消除字幕",
    desc: "人聲降噪、音量均衡、AI 修復畫面，也能去除原有字幕",
    io: "影片 → 修復後影片",
    new: 1,
  },
  {
    id: "sfx",
    cat: "聲音",
    icon: "◖))",
    name: "去配樂・重配音效",
    desc: "去掉多餘配樂、保留對白，AI 依畫面重配音效",
    io: "影片 → 換好聲音的影片",
    new: 1,
  },
  {
    id: "voice",
    cat: "聲音",
    icon: "♩",
    name: "配音生成",
    desc: "把台詞轉成語音，或讓影片、照片中的人物開口說話",
    io: "台詞／照片 → 語音／影片",
  },
  {
    id: "music",
    cat: "聲音",
    icon: "♫",
    name: "音樂生成",
    desc: "用提示詞或歌詞生成配樂與歌曲",
    io: "提示詞 → 音樂",
  },
  {
    id: "separate",
    cat: "聲音",
    icon: "◖))",
    name: "音軌分離",
    desc: "從影片抽出獨立音訊檔，留著配樂或剪輯用",
    io: "影片 → 音訊檔",
    new: 1,
  },
  {
    id: "watermark",
    cat: "品牌與合規",
    icon: "▣",
    name: "影片浮水印",
    desc: "疊上 PNG 標誌，自訂大小與位置，維持原解析度",
    io: "影片＋PNG → 影片",
  },
  {
    id: "cta",
    cat: "品牌與合規",
    icon: "↗",
    name: "影片 CTA 按鈕",
    desc: "在指定時段疊加行動按鈕，自訂文字、樣式與位置",
    io: "影片 → 影片",
    new: 1,
  },
  {
    id: "privacy",
    cat: "品牌與合規",
    icon: "◉",
    name: "肖像權保護",
    desc: "自動偵測人臉並加上馬賽克或模糊",
    io: "影片 → 保護版影片",
    new: 1,
  },
  {
    id: "region",
    cat: "生成前置",
    icon: "▧",
    name: "圖片局部編輯器",
    desc: "在圖片上圈選多處，各自下指令一次改好",
    io: "圖片 → 圖片",
    new: 1,
  },
  {
    id: "depth",
    cat: "生成前置",
    icon: "▱",
    name: "影片轉深度影片",
    desc: "提取深度圖，用於動作重定向與影片動作控制",
    io: "影片 → 深度影片",
    new: 1,
  },
];
const CATS = [
  ["全部", 15],
  ["剪輯成片", 4],
  ["畫質修復", 2],
  ["聲音", 4],
  ["品牌與合規", 3],
  ["生成前置", 2],
];
const $ = (s) => document.querySelector(s),
  esc = (s) =>
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
let category = "全部",
  search = "",
  tool = null,
  files = {},
  favorites = new Set(
    JSON.parse(SeedStar.storage.getItem("appToolFavs") || "[]"),
  ),
  assets = [],
  selection = {},
  values = {},
  previewMode = "",
  modalCallback = null;
let toolDrafts = {};
try {
  toolDrafts = JSON.parse(
    SeedStar.storage.getItem("awarewave_app_tools_state") || "{}",
  );
} catch {}
function restoreToolDraft() {
  const draft = toolDrafts[tool] || {};
  values = structuredClone(draft.values || {});
  files = structuredClone(draft.files || {});
  selection = structuredClone(draft.selection || {});
}
function val(k, f = "") {
  return values[k] ?? f;
}
function setVal(k, v) {
  values[k] = v;
}
function btn(t, cb, cls = "") {
  return `<button class="btn ${cls}" data-act="${cb}">${t}</button>`;
}
function label(t) {
  return `<label>${t}</label>`;
}
function input(k, placeholder = "", type = "text") {
  return `<input class="text-input" type="${type}" data-key="${k}" value="${esc(val(k))}" placeholder="${esc(placeholder)}">`;
}
function ta(k, ph = "", max = 0) {
  return `<textarea data-key="${k}" ${max ? 'maxlength="' + max + '"' : ""} placeholder="${esc(ph)}">${esc(val(k))}</textarea>`;
}
function chooser(id = "src") {
  return `<div class="btn-row">${btn("▢ 從素材庫選取", "library:" + id, "primary")}${btn("↥ 上傳檔案", "upload:" + id)}</div>`;
}
function stage(i, title, description, id = "src") {
  let f = files[id];
  return `<div class="stage" id="stage"><div class="tool-icon">${i}</div><h3>${title}</h3><p>${description}</p>${f ? `<div class="fileline">已選：${esc(f.name)}</div>${f.type.startsWith("video/") ? `<video class="video-prev" src="${f.previewUrl || f.url}" controls playsinline></video>` : f.type.startsWith("image/") ? `<img class="upload-preview" src="${f.url}" alt="已選圖片">` : f.type.startsWith("audio/") ? `<audio src="${f.previewUrl || f.url}" controls></audio>` : ""}` : ""}${chooser(id)}</div>`;
}
function side(s) {
  return `<aside class="side">${s}</aside>`;
}
function cost() {
  return '<p class="note">本機媒體處理不扣平台點數；AI 服務依 API 實際用量計費。</p><button class="btn primary-wide" data-act="submit">開始處理</button>';
}
function grid9(k) {
  return `<div class="grid9">${Array.from(
    {
      length: 9,
    },
    (_, i) =>
      `<button class="${val(k, "4") == i ? "selected" : ""}" data-act="set:${k}:${i}">${["▔", "▔", "▔", "▔", "●", "▔", "▁", "▁", "▁"][i]}</button>`,
  ).join("")}</div>`;
}
function range(k, d, min, max, step = 1, suf = "%") {
  return `<div class="metric"><span>${k}</span><strong id="v-${k}">${val(k, d)}${suf}</strong></div><input class="range" type="range" min="${min}" max="${max}" step="${step}" value="${val(k, d)}" data-key="${k}" data-suf="${suf}">`;
}
function segmented(k, arr, d) {
  return `<div class="seg">${arr.map((v) => `<button class="${val(k, d) === v ? "selected" : ""}" data-act="set:${k}:${v}">${v}</button>`).join("")}</div>`;
}
function chips(k, arr, d) {
  return `<div class="chips">${arr.map((v) => `<button class="chip ${val(k, d) === v ? "selected" : ""}" data-act="set:${k}:${v}">${v}</button>`).join("")}</div>`;
}
function header(t, prefix, desc) {
  return `<button class="back" data-act="home">←　返回應用工具</button><div class="eyebrow">${prefix} · ${esc(t.name)}</div><div class="hero"><h1>${esc(t.name)}</h1><div class="lead">${desc || esc(t.desc)}</div></div>`;
}
function home() {
  let filtered = TOOLS.filter(
    (t) =>
      (category === "全部" || t.cat === category) &&
      [t.name, t.desc].join(" ").includes(search),
  );
  return `<div class="wrap"><div class="hero"><h1>應用<span class="gradient">工具</span></h1><div class="lead">單一用途的小工具，不用開專案就能用</div></div><div class="controls"><div class="filters">${CATS.map(([c, n]) => `<button class="pill ${c === category ? "active" : ""}" data-act="category:${c}">${c}<small>${n}</small></button>`).join("")}</div><input id="search" class="search" placeholder="⌕  搜尋工具，例如「字幕」「4K」" value="${esc(search)}"></div>${
    filtered.length
      ? CATS.slice(1)
          .filter(([c]) => category === "全部" || category === c)
          .map(([c]) => {
            let a = filtered.filter((t) => t.cat === c);
            return a.length
              ? `<section><div class="section-head"><b>${c}</b><span>${
                  {
                    剪輯成片: "把素材剪成可以直接發布的影片",
                    畫質修復: "讓既有影片更清晰、更乾淨",
                    聲音: "生成或拆出配音、音樂與音軌",
                    品牌與合規: "發布前加上標記，或保護入鏡人物",
                    生成前置: "先處理參考素材，讓 AI 生成更好控制",
                  }[c]
                }</span></div><div class="cards">${a.map((t) => `<div class="tool-card" data-act="open:${t.id}" role="button" tabindex="0"><span class="tool-icon">${t.icon}</span><button aria-label="收藏" class="star ${favorites.has(t.id) ? "on" : ""}" data-act="favorite:${t.id}">${favorites.has(t.id) ? "★" : "☆"}</button><h3>${t.name}${t.new ? '<span class="new">NEW</span>' : ""}</h3><p>${t.desc}</p><footer>${t.io}</footer></div>`).join("")}</div></section>`
              : "";
          })
          .join("")
      : `<p class="muted">找不到符合條件的工具。</p>`
  }</div>`;
}
function screen(t) {
  const workflow = typeof toolWorkflowScreen === "function" ? toolWorkflowScreen(t) : null;
  if (workflow !== null) return workflow;
  if (t.id === "edit")
    return `<div class="wrap">${header(t, "CUT", "選擇影片、設定起迄時間，匯出新的片段。原片不會修改。")}<div class="controls">${btn("＋ 新建剪輯專案", "newproject", "primary")}</div><div class="two-col">${stage("▣", "選擇影片", "可從共用素材庫選取或直接上傳。")}${side(label("起點（秒）") + input("trimStart", "0", "number") + label("終點（秒）") + input("trimEnd", "", "number") + btn("匯出片段", "submit", "primary"))}</div><div id="project-list"></div></div>`;
  let body = "";
  switch (t.id) {
    case "edit":
      body = `<div class="controls" style="margin-top:28px"><span class="eyebrow">WORKSPACE / READY　 ───────　 MULTI-TRACK · AI IMPORT · 4K READY</span>${btn("＋ 新建剪輯專案", "newproject", "primary")}</div><div class="workspace"><div class="ws-left">CUT<br><br><br><br><br><br><br><br><br><br>00</div><div class="ws-center"><span class="eyebrow">THE TIMELINE IS YOURS</span><span class="tool-icon">▣</span><h2>先放一個鏡頭，故事<br>就開始。</h2><p class="lead">建立空白剪輯專案，或從 AI 導演分鏡帶入第一個 sequence。</p>${btn("＋ 新建剪輯專案", "newproject", "primary")}</div><div class="ws-right">${[1, 2, 3, 4, 5].map((i) => `<div class="ws-bar">0${i}　━━━━</div>`).join("")}</div></div><div id="project-list" class="out"></div>`;
      break;
    case "short":
      body = `<div class="two-col">${stage("✂", "選一支長影片", "從素材庫挑選或上傳影片（最長 120 分鐘）。原檔不會被修改。")} ${side(`<h3>使用方式</h3><ul class="instruction"><li>選一支長影片，讓 AI 自行判斷，或輸入指令（例如「挑出講到價格的段落」）找出適合剪成短影音的段落</li><li>點選每一段即可預覽模擬效果：16:9 影片會裁成 9:16，畫面跟著正在講話的人置中；也能選擇加上字幕</li><li>段落預設全選，一次產生多支短影音；可取消不想要的，選擇是否上字幕</li><li>也可以選「一支精華」：AI 從整支影片挑出精彩片刻，接成一支精華影片</li></ul>${label("剪輯指令（選填）")}${ta("shortPrompt", "例如：挑出講到價格的段落")}${label("產出模式")}${segmented("shortMode", ["多支短影音", "一支精華"], "多支短影音")}${label("字幕")}${segmented("shortCaption", ["開", "關"], "開")}${btn("分析影片", "submit", "primary")}`)}</div>`;
      break;
    case "follow":
      body = `<div class="two-col">${stage("♙", "選一支影片", "從素材庫挑選或上傳影片。原檔不會被修改。")} ${side(`<h3>使用方式</h3><ul class="instruction"><li>選一支橫式影片，挑出要剪的一段</li><li>在畫面中點選要跟拍的人，瀏覽器會追蹤他在整段影片裡的位置；跟錯的地方，播放到那一刻再點一次正確的人即可修正</li><li>產生一支 9:16 直式影片，確認後才依片長扣點，成品存進素材庫</li></ul>${label("片段起點（秒）")}${input("followStart", "0", "number")}${label("片段終點（秒）")}${input("followEnd", "", "number")}<p class="note">選入影片後，點擊預覽畫面指定人物追蹤中心。此獨立 HTML 只保留標記，不包含伺服器追蹤模型。</p><div class="out" id="track-points">尚未指定跟拍人物</div>${btn("確認人物並生成", "submit", "primary")}`)}</div>`;
      break;
    case "subtitle":
      body = `<div class="two-col">${stage("▤", "拖曳影片或音檔到這裡", "從素材庫挑選或上傳檔案（最長 20 分鐘）。原檔不會被修改。")} ${side(`<div class="row">辨識 → 校對 → 匯出字幕檔</div><div class="divider"></div><h3>選一支影片或音檔</h3><ul class="instruction"><li>選一支影片或音檔，自動辨識語音產生字幕，或匯入現有的 SRT／VTT 檔</li><li>直接修改字幕文字與時間碼後，再匯出字幕檔</li><li>校對後下載 SRT／VTT；目前未提供字幕燒錄及翻譯</li></ul>${label("載入字幕檔")}${btn("上傳 SRT / VTT", "upload:subtitlefile")}${label("字幕文字（校對）")}${ta("subtitleText", "選入檔案後，顯示辨識結果或貼入字幕內容。")}${btn("匯出 SRT", "export:srt")}${btn("匯出 VTT", "export:vtt")}`)}</div>`;
      break;
    case "upscale":
      body = `<div class="row" style="justify-content:flex-end">${btn("↥ 上傳影片", "upload:src")}</div><div class="lead" style="margin-top:25px">可直接點擊「上傳影片」立即增強，或點選下方影片開啟詳情選擇目標畫質；完成後新檔會出現在素材庫。</div><div class="divider"></div><input class="text-input" style="width:100%" placeholder="⌕ 搜尋影片名稱、提示詞或標籤" data-key="searchAssets"><p class="lead" style="margin-top:18px">還沒有可以升畫質的影片，直接上傳一支或先去生成吧。</p><div class="row">${label("目標畫質")}${chips("upscaleQuality", ["1080p", "2K", "4K"], "1080p")}</div>${files.src ? stage("✳", "已選影片", "以 Lanczos 重新取樣調整尺寸；不會補出原片缺少的細節。") : ""}`;
      break;
    case "enhance":
      body = `<div class="two-col">${stage("✛", "選一支要增強的影片", "從素材庫挑選，或上傳 MP4 / MOV / WebM 影片（最長 5 分鐘）。原片不會被修改。")} ${side(`<h3>增強設定</h3>${segmented("enhanceType", ["音訊", "畫面"], "音訊")}<div class="divider"></div>${val("enhanceType", "音訊") === "音訊" ? `${["人聲降噪", "只保留人聲", "去配樂・重配音效", "去除人聲", "音量均衡", "音質美化"].map((x, i) => `<button class="chip ${val("enhanceOption", "人聲降噪") === x ? "selected" : ""}" style="display:block;width:100%;margin-bottom:7px;text-align:left" data-act="set:enhanceOption:${x}">${x} <span class="muted" style="float:right">${["人聲降噪","音量均衡","音質美化"].includes(x)?"本機處理":"需專用服務"}</span></button>`).join("")}` : `${chips("imageEnhance", ["AI 修復畫面", "畫面增強", "超解析"], "AI 修復畫面")}`}<div class="cost">預估費用<br><b>--</b><p>費率：每秒 1 點；最低 10 秒計</p></div><div class="balance">目前餘額 <b>90 點</b></div><button data-act="submit" class="btn primary-wide">開始處理</button><p class="note">若處理失敗會全額退回點數。實際執行需串接後端。</p>`)}</div>`;
      break;
    case "sfx":
      body = `<div class="two-col">${stage("✛", "選一支要增強的影片", "從素材庫挑選，或上傳 MP4 / MOV / WebM 影片（最長 2 分鐘）。原片不會被修改。")} ${side(`<h3>增強設定</h3><div class="out">去配樂・重配音效<br><span class="note">去掉背景音樂、保留對白，再依畫面配上腳步、開門、環境等音效</span><p class="tooltip">原片裡的音效也會一併換掉，AI 依畫面重配新的版本；畫面不變。最長 2 分鐘。</p></div>${label("想要的音效（選填）")}${ta("soundPrompt", "例如：雨打在窗上、碎石路上的腳步聲")}<p class="note">不填也可以，AI 會依畫面判斷。最多 200 字。</p>${cost(3, "／秒，最低以 10 秒計")}`)}</div>`;
      break;
    case "voice":
      body = `<div class="side" style="margin-top:35px;max-width:1100px">${segmented("voiceMode", ["純聲音", "影片／圖片配音"], "純聲音")}<p class="note">輸入台詞或對話，選好聲音後，AI 直接產出一段聲音。</p>${label("台詞內容")}${chips("voiceScriptMode", ["台詞", "音效"], "台詞")}${ta("voiceText", "輸入想要生成的台詞…", 500)}<div class="metric">口語旁白（建議使用）<span id="voiceCount">${val("voiceText").length}/500</span></div>${label("口語指示（選填）")}<p class="note">也可以在台詞中加入（停頓）、（輕笑）等指示，AI 會把它們當成語氣而不是念出來。</p>${chips("voiceEmotion", ["溫柔關心", "驚訝好奇", "興奮宣布", "生氣質問", "沉靜獨白", "語氣熱情"], "溫柔關心")}${label("我的聲音")}${btn("聲音設定（選填）", "toggle:voiceExtra")}<div id="voiceExtra" class="hidden">${label("語言")}${chips("voiceLang", ["繁體中文", "English"], "繁體中文")}${label("聲音")}${chips("voicePerson", ["女聲", "男聲"], "女聲")}</div>${label("目標長度")}${chips("voiceDuration", ["3 秒", "5 秒", "10 秒", "15 秒", "30 秒", "60 秒", "120 秒"], "5 秒")}<div class="divider"></div>${btn("語氣・語速 / 音調 / 音量", "toggle:voiceAdvanced")}<div id="voiceAdvanced" class="hidden">${range("語速", 100, 50, 150)}${range("音調", 0, -20, 20)}${range("音量", 100, 0, 150)}</div><div class="row" style="justify-content:flex-end">${btn("✣ 產生聲音 · 約 1 點", "submit", "primary")}</div></div>`;
      break;
    case "music":
      body = `<div class="side" style="margin-top:35px;max-width:900px">${label("從參考音樂開始（選填）")}<p class="note">選一首音樂，AI 會分析它的曲風、速度、調性、配器與段落，填進下方自訂設定。</p>${btn("↥ 從素材庫選取或上傳音訊", "upload:musicref")}<div class="divider"></div>${segmented("musicMode", ["簡易模式", "自訂配置"], "簡易模式")}${label("音樂提示詞／風格描述")}${ta("musicPrompt", "描述音樂風格、樂器、節奏、氛圍（例如：輕快 Lo-Fi 電子音樂，帶有舒緩鋼琴與微雨聲…）", 500)}<p class="note">Lyria 適合創作音樂短片；請使用曲風、樂器或情緒描述，避免直接輸入知名藝人或作品名稱。</p>${label("風格標籤")}${chips("musicStyle", ["輕柔 Lo-Fi", "史詩電影交響", "現代電子舞曲", "溫暖爵士", "電視流行", "木吉他民謠", "美洲嘻哈", "冥想氛圍"], "輕柔 Lo-Fi")}${label("生成模型")}${chips("musicModel", ["Lyria 3.5", "Lyria Clip Preview", "Mureka V9"], "Lyria 3.5")}<div class="balance"><span class="tag">15 點</span><span>剩餘 90 點</span></div><div class="row" style="justify-content:flex-end">${btn("✣ 生成音樂（15 點）", "submit", "primary")}</div></div>`;
      break;
    case "separate":
      body = `<div class="two-col">${stage("◖))", "請選取影片或直接上傳（支援 MP4、MOV、WebM）", "從影片中提取並分離出獨立音訊檔，直接存入素材庫供後續配樂或剪輯使用。")} ${side(`<h3>音軌分離說明</h3><ul class="instruction"><li>支援 MP4 · MOV · WebM 影片檔提取音訊</li><li>輸出 48 kHz / 192 kbps 高品質立體聲 MP3</li><li>音檔自動存入素材庫，可供後續剪輯或配樂使用</li></ul>${cost(2, "／次")}`)}</div>`;
      break;
    case "watermark":
      body = `<div class="two-col">${stage("▣", "請先上傳或選取浮水印圖檔，亦可選取來源影片進行預覽。", "", "src")} ${side(`<h3>浮水印圖檔</h3>${btn("↥ 上傳 PNG", "upload:png")}${btn("▣ 從素材庫選取", "library:png")}<p class="note">建議使用去背 PNG，輸出會保留原解析度，並依影片長度合成。</p><div class="divider"></div><h3>位置與大小</h3>${grid9("watermarkPos")}${range("大小", 22, 1, 100)}${range("不透明度", 90, 0, 100)}<div class="divider"></div><h3>已存浮水印</h3>${btn("儲存", "savewatermark")}<p class="note">還沒有已存的浮水印。調整好之後按「儲存」，下次可將新影片套用。</p>${btn("↓ 匯出", "submit", "primary")}`)}</div>`;
      break;
    case "cta":
      body = `<div class="two-col">${stage("▣", "先選一支影片，或直接上傳，就能即時預覽按鈕效果。", "")} ${side(`<h3>按鈕內容</h3>${segmented("ctaType", ["文字按鈕", "上傳圖片"], "文字按鈕")}${val("ctaType", "文字按鈕") === "文字按鈕" ? `${label("按鈕文字")}${input("ctaText", "立即購買")}${label("快速樣式")}${chips("ctaStyle", ["紅", "橘", "白", "黃", "深", "灰", "青"], "紅")}${label("形狀")}${chips("ctaShape", ["膠囊", "圓角", "方形"], "膠囊")}${label("填色")}${chips("ctaFill", ["實色", "透明"], "實色")}${label("按鈕背景色")}${input("ctaColor", "#ef4343", "color")}${label("文字顏色")}${input("ctaFontColor", "#ffffff", "color")}` : `${label("按鈕圖片")}${btn("↥ 上傳 PNG", "upload:ctaImage")}`}<label class="check"><input type="checkbox" data-key="ctaShadow" checked> 陰影</label><div class="divider"></div><h3>出現時間</h3>${range("出現", 0, 0, 10, 0.1, "s")}${range("消失", 3, 0, 10, 0.1, "s")}${label("顯示")}${chips("ctaAppear", ["縮頭", "淡入", "彈出"], "縮頭")}${label("淡入淡出")}${chips("ctaFade", ["無", "0.3 秒", "0.5 秒", "1 秒"], "無")}<div class="divider"></div><h3>位置與大小</h3>${grid9("ctaPos")}${range("水平位置", 30, 0, 100)}${range("垂直位置", 76, 0, 100)}${range("大小", 40, 1, 100)}${range("不透明度", 100, 0, 100)}<p class="note">設定九宮格或百分比位置，匯出後檢查合成結果。</p>${btn("↓ 合成並存到素材庫", "submit", "primary")}`)}</div>`;
      break;
    case "privacy":
      body = `<div class="two-col">${stage("◉", "選一支要保護肖像的影片", "從素材庫挑選，或上傳 MP4 / MOV / WebM 影片（最長 5 分鐘）。原片不會被修改。")} ${side(`<h3>保護設定</h3>${label("保護方式")}${segmented("privacyType", ["馬賽克", "模糊"], "馬賽克")}${label("強度")}${segmented("privacyStrength", ["低", "中", "高"], "中")}${cost(2, "／秒，最低以 10 秒計")}<p class="note">若處理失敗會全額退回點數。側臉、遮擋或太小的臉可能偵測不到，發布前請先檢查成品。</p>`)}</div>`;
      break;
    case "region":
      body = `<div class="two-col"><div>${stage("▧", "先選一張圖片，接著在畫面上拖曳框出要修改的位置", "", "image")}<div class="out">已標記區域：<span id="regionCount">0</span>／8 <button class="btn small" data-act="resetRegions">清空區域</button></div></div>${side(`<h3>圖片 <span style="color:var(--red)">*</span> <span style="float:right" class="muted">0/1</span></h3>${btn("選擇圖片", "upload:image")}${label("修改區域")}<p class="note">還沒有框選任何區域。在左側圖片上拖曳即可新增；也可以只填寫整體修改指令。</p><div id="regionInstructions"></div>${label("整體修改指令（選填）")}${ta("regionPrompt", "套用到所有選取區域的補充指令")}${label("參數")}<div class="row"><span class="note">${esc(SeedStar.capabilities?.models?.image || "服務端設定模型")}</span>${chips("regionQuality", ["1K", "2K", "4K"], "2K")}</div>${btn("生成區域編輯（API 計費）", "submit", "primary primary-wide")}<p class="note">圖片載入後，可在左側圖片上拖曳框選最多 8 個區域。</p>`)}</div>`;
      break;
    case "depth":
      body = `<div class="two-col">${stage("▱", "請先選取影片或直接上傳（最長支援 30 秒）", "支援 MP4 / MOV 影片。深度提取模型將自動重構空間三維幾何，生成黑白深度對照影片。")} ${side(`<h3>轉檔設定與費用</h3><p class="note" style="text-align:center">請先於左側上傳或選取影片</p>${cost(2, "／秒（最低 20 點、最高 60 點）")}<p class="note">* 雲端 GPU 高精度深度推計算。若轉檔失敗將全額自動退回點數。</p>`)}</div>`;
      break;
  }
  return `<div class="wrap">${header(
    t,
    {
      short: "CLIP",
      follow: "FOLLOW",
      subtitle: "SUB",
      upscale: "UPSCALE",
      enhance: "ENHANCE",
      sfx: "SFX",
      voice: "VOICE",
      music: "SCORE",
      separate: "AUDIO",
      watermark: "MARK",
      cta: "CTA",
      privacy: "PRIVACY",
      region: "REGION",
      depth: "DEPTH",
    }[t.id] || "CUT",
  )}${body}</div>`;
}
function render() {
  if (typeof toolFollowBeforeRender === 'function') toolFollowBeforeRender();
  document.title =
    (tool ? TOOLS.find((t) => t.id === tool).name : "應用工具") +
    " · AwareWave";
  $("#app").innerHTML = SeedStar.sanitize(
    tool ? screen(TOOLS.find((t) => t.id === tool)) : home(),
  );
  if (tool === "edit" && document.getElementById('project-list')) renderProjects();
  if (tool === "upscale" && files.src && typeof toolWorkflowScreen !== "function")
    $("#app").insertAdjacentHTML(
      "beforeend",
      SeedStar.sanitize(btn("開始處理", "submit", "primary")),
    );
  if (tool === "region" && files.image) setupRegionCanvas();
  if (typeof toolWorkflowAfterRender === "function") toolWorkflowAfterRender();
  const unsupported = {
    sfx: "尚未設定配樂分離與畫面音效模型",
    music: "尚未設定音樂生成模型",
    privacy: "尚未設定人臉偵測與追蹤模型",
    depth: "尚未設定深度影片模型",
  };
  if (tool === "enhance" && (val("enhanceType", "音訊") === "畫面" || !["人聲降噪","音量均衡","音質美化"].includes(val("enhanceOption", "人聲降噪")))) unsupported.enhance = "所選增強方式尚未接入專用模型，設定仍會保留";
  if (unsupported[tool]) {
    const note = document.createElement("p");
    note.className = "note";
    note.setAttribute("role", "status");
    note.textContent = unsupported[tool] + "；目前可保存素材與設定。";
    $("#app").prepend(note);
    document.querySelectorAll("[data-act=submit]").forEach((b) => {
      b.disabled = true;
      b.title = unsupported[tool];
    });
  }
  document
    .querySelectorAll(".balance")
    .forEach(
      (el) => (el.textContent = "本機工具不扣平台點數；AI 依供應商用量計費。"),
    );
  if (tool === "subtitle" && typeof toolSubtitleScreen !== "function") {
    const b = document.createElement("button");
    b.className = "btn primary";
    b.textContent = "辨識字幕（API用量計費）";
    b.onclick = async () => {
      try {
        if (!files.src) throw Error("請先選取影片或音檔");
        b.disabled = true;
        b.textContent = "辨識中…";
        const r = await SeedStar.request("/transcriptions", {
          source: files.src,
        });
        setVal("subtitleText", r.srt);
        saveDraft();
        render();
      } catch (e) {
        SeedStar.reportError(e);
        b.disabled = false;
        b.textContent = "辨識字幕";
      }
    };
    document.querySelector(".side")?.append(b);
  }
}
function setToolHash(hash) {
  try {
    history.replaceState({}, "", hash);
  } catch (err) {
    try {
      location.hash = hash;
    } catch (_) {}
  }
}
function saveDraft() {
  if (tool) toolDrafts[tool] = { values, files, selection };
  SeedStar.storage.setItem(
    "awarewave_app_tools_state",
    JSON.stringify(toolDrafts),
  );
}
function upload(id) {
  const el = $("#asset-input");
  el.accept =
    id === "png"
      ? ".png,image/png"
      : id === "ctaImage" ? "image/png,image/jpeg,image/webp"
      : id === "src" && tool === "voice" && values.voiceSourceKind === "圖片" ? "image/*"
      : id === "image"
        ? "image/*"
        : id === "musicref"
          ? "audio/*"
          : id === "subtitlefile"
            ? ".srt,.vtt,text/plain"
            : ".mp4,.mov,.webm,video/*,audio/*";
  el.onchange = async () => {
    let f = el.files?.[0];
    if (!f) return;
    const uploaded =
      id === "subtitlefile" ? null : await SeedStar.uploadAsset(f);
    files[id] = uploaded || { name: f.name, type: f.type, url: "" };
    if (typeof toolWorkflowSourceChanged === "function") toolWorkflowSourceChanged(id);
    if (id === "image") selection.regions = [];
    assets.unshift({
      ...files[id],
      id: Date.now(),
    });
    if (id === "subtitlefile") {
      setVal("subtitleText", await f.text());
    }

    saveDraft();
    render();
  };
  el.value = "";
  el.click();
}
async function openLibrary(id) {
  try {
    const k =
      id === "image" || id === "png" || id === "ctaImage"
        ? "image"
        : id === "musicref"
          ? "audio"
          : id === "src" && tool === "subtitle" ? (values.subtitleSourceKind === "音檔" ? "audio" : "video")
            : id === "src" && tool === "voice" && values.voiceSourceKind === "圖片" ? "image" : "video";
    const rows = await SeedStar.pickAssets({
      kind: k,
    });
    if (rows[0]) {
      files[id] = {
        ...rows[0],
        type: rows[0].type || SeedStar.mediaKind(rows[0]) + "/",
      };
      if (typeof toolWorkflowSourceChanged === "function") toolWorkflowSourceChanged(id);
      saveDraft();
      render();
    }
  } catch (e) {
    SeedStar.reportError(e);
  }
}
function renderProjects() {
  let a = JSON.parse(SeedStar.storage.getItem("appToolProjects") || "[]");
  $("#project-list").innerHTML = SeedStar.sanitize(
    a
      .map(
        (x) =>
          `<div>▣ ${esc(x.title)}　<span class="muted">${esc(x.date)}</span></div>`,
      )
      .join(""),
  );
}
let toolRegionObserver;
function regionInstructionsPrompt() {
  const global = String(values.regionPrompt || "").trim();
  if (!(selection.regions || []).length) {
    if (!global) throw Error("請框選區域並填寫指令，或填寫整體修改指令");
    return global;
  }
  if (!(selection.regions || []).every(area => area.prompt?.trim() || global)) throw Error("請為每個區域填寫修改指令，或補上整體指令");
  return [global, ...(selection.regions || []).map((area, i) => `區域 ${i + 1}（圖片左上角起算，x=${Math.round(area.x * 100)}%、y=${Math.round(area.y * 100)}%、寬=${Math.round(area.w * 100)}%、高=${Math.round(area.h * 100)}%）：${area.prompt || global}`), "只修改選取區域，保留其他內容。"].filter(Boolean).join("\n");
}
function setupRegionCanvas() {
  toolRegionObserver?.disconnect();
  const st = $("#stage"), img = st?.querySelector("img");
  if (!img) return;
  const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
  const paint = () => {
    st.querySelectorAll(".region-selection").forEach(el => el.remove());
    st.style.position = "relative";
    const r = img.getBoundingClientRect(), base = st.getBoundingClientRect();
    (selection.regions || []).forEach((area, i) => {
      const box = document.createElement("div"); box.className = "region-selection"; box.dataset.regionIndex = i;
      box.style.cssText = `left:${r.left - base.left + area.x * r.width}px;top:${r.top - base.top + area.y * r.height}px;width:${area.w * r.width}px;height:${area.h * r.height}px`;
      const number = document.createElement("span"); number.textContent = i + 1; box.append(number);
      for (const direction of ["nw", "n", "ne", "e", "se", "s", "sw", "w"]) {
        const handle = document.createElement("i"); handle.dataset.regionHandle = direction; box.append(handle);
      }
      box.ondblclick = () => document.querySelector(`[data-region-prompt="${i}"]`)?.focus();
      st.append(box);
    });
  };
  const list = () => {
    $("#regionCount").textContent = (selection.regions || []).length;
    const host = $("#regionInstructions");
    if (!host) return;
    host.replaceChildren();
    (selection.regions || []).forEach((area, i) => {
      const label = document.createElement("label"); label.textContent = `區域 ${i + 1} 修改指令`;
      const input = document.createElement("textarea"); input.className = "field"; input.dataset.regionPrompt = i; input.value = area.prompt || "";
      input.oninput = () => { area.prompt = input.value; saveDraft(); };
      const remove = document.createElement("button"); remove.className = "btn small"; remove.textContent = `刪除區域 ${i + 1}`;
      remove.onclick = () => { selection.regions.splice(i, 1); paint(); list(); saveDraft(); };
      label.append(input); host.append(label, remove);
    });
  };
  img.style.cursor = "crosshair"; img.draggable = false; st.style.touchAction = "none";
  if (img.complete) paint(); else img.onload = paint;
  list(); toolRegionObserver = new ResizeObserver(paint); toolRegionObserver.observe(img);
  st.onpointerdown = event => {
    const box = event.target.closest(".region-selection");
    if (!box && event.target !== img) return;
    event.preventDefault();
    const rect = img.getBoundingClientRect();
    const start = { x: clamp((event.clientX - rect.left) / rect.width), y: clamp((event.clientY - rect.top) / rect.height) };
    const index = box ? Number(box.dataset.regionIndex) : -1;
    const original = index >= 0 ? { ...selection.regions[index] } : null;
    const handle = event.target.dataset.regionHandle;
    st.setPointerCapture(event.pointerId);
    let created = -1;
    const update = ev => {
      const x = clamp((ev.clientX - rect.left) / rect.width), y = clamp((ev.clientY - rect.top) / rect.height);
      selection.regions ??= [];
      if (!original) {
        if (Math.abs(x - start.x) < .002 || Math.abs(y - start.y) < .002 || (created < 0 && selection.regions.length >= 8)) return;
        const area = { x: Math.min(start.x, x), y: Math.min(start.y, y), w: Math.abs(x - start.x), h: Math.abs(y - start.y), prompt: "" };
        if (created < 0) { created = selection.regions.length; selection.regions.push(area); } else selection.regions[created] = area;
      } else if (!handle) {
        Object.assign(selection.regions[index], { x: clamp(original.x + x - start.x, 0, 1 - original.w), y: clamp(original.y + y - start.y, 0, 1 - original.h) });
      } else {
        let left = original.x, top = original.y, right = left + original.w, bottom = top + original.h;
        if (handle.includes("w")) left = clamp(original.x + x - start.x, 0, right - .005);
        if (handle.includes("e")) right = clamp(original.x + original.w + x - start.x, left + .005, 1);
        if (handle.includes("n")) top = clamp(original.y + y - start.y, 0, bottom - .005);
        if (handle.includes("s")) bottom = clamp(original.y + original.h + y - start.y, top + .005, 1);
        Object.assign(selection.regions[index], { x: left, y: top, w: right - left, h: bottom - top });
      }
      paint();
    };
    st.onpointermove = update;
    st.onpointerup = ev => { update(ev); st.onpointermove = st.onpointerup = st.onpointercancel = null; list(); saveDraft(); };
    st.onpointercancel = () => { st.onpointermove = st.onpointerup = st.onpointercancel = null; list(); saveDraft(); };
  };
}

SeedStar.tools = {
  async acceptAsset(payload) {
    if (!TOOLS.some((item) => item.id === payload.tool)) throw Error("工具不存在");
    if (payload.asset && !SeedStar.safeUrl(payload.asset.url)) throw Error("素材網址無效");
    saveDraft();
    tool = payload.tool;
    restoreToolDraft();
    if (payload.settings) values = structuredClone(payload.settings);
    if (payload.selection) selection = structuredClone(payload.selection);
    if (tool === 'edit' && payload.project) {
      if (ed.loading) await ed.loading;
      if (!ed.ready) await edLoadProjects();
      const project = edNormalizeProject(structuredClone(payload.project));
      // Restore a separate copy: saved job settings must not overwrite later edits.
      project.id = crypto.randomUUID(); project.title = (project.title || '剪輯專案') + '（還原）';
      project.assets ||= []; project.markers ||= []; // tracks: edNormalizeProject already made the P2 track array
      ed.projects.push(project); ed.current = project.id; ed.selected = null; ed.undo = []; ed.redo = []; ed.time = 0; await edSave();
    }
    if (payload.asset) {
      const asset = { ...payload.asset, type: payload.asset.type || SeedStar.mediaKind(payload.asset) + "/" };
      files[tool === "region" ? "image" : "src"] = asset;
      if (tool === "region" && !payload.selection) selection.regions = [];
    }
    setToolHash("#" + tool); render(); saveDraft();
    return { ok: true, tool };
  },
};
document.addEventListener("click", (e) => {
  const button = e.target.closest("[data-act]");
  if (!button) return;
  const action = button.dataset.act;
  e.stopPropagation();
  if (action.startsWith("favorite:")) {
    let k = action.slice(9);
    favorites.has(k) ? favorites.delete(k) : favorites.add(k);
    SeedStar.storage.setItem("appToolFavs", JSON.stringify([...favorites]));
    render();
    return;
  }
  if (action.startsWith("category:")) {
    category = action.slice(9);
    render();
    return;
  }
  if (action.startsWith("open:")) {
    tool = action.slice(5);
    restoreToolDraft();
    if (tool === "watermark")
      SeedStar.preferences
        .get("tools.watermark", null)
        .then((v) => {
          if (v && tool === "watermark" && !files.png) {
            values = { ...v.values, ...values };
            files = { ...files, png: v.files.png };
            render();
          }
        })
        .catch(SeedStar.reportError);
    setToolHash(`#${tool}`);
    render();
    scrollTo(0, 0);
    return;
  }
  if (action === "home") {
    tool = null;
    setToolHash("#");
    render();
    scrollTo(0, 0);
    return;
  }
  if (action.startsWith("upload:")) return upload(action.slice(7));
  if (action.startsWith("library:")) return openLibrary(action.slice(8));
  if (action === "close") {
    $("#modal")?.remove();
    return;
  }
  if (action.startsWith("pick:")) {
    let a = assets[Number(action.slice(5))];
    if (a) {
      files[modalCallback] = a;
      $("#modal")?.remove();
      render();
    }
    return;
  }
  if (action.startsWith("set:")) {
    let [, k, ...rest] = action.split(":");
    setVal(k, rest.join(":"));
    if (k === "ctaStyle")
      values.ctaColor = {
        紅: "#ef4343",
        橘: "#ef8e30",
        白: "#ffffff",
        黃: "#f1cf39",
        深: "#222222",
        灰: "#777777",
        青: "#168e90",
      }[rest.join(":")];
    saveDraft();
    render();
    return;
  }
  if (action.startsWith("toggle:")) {
    $("#" + action.slice(7))?.classList.toggle("hidden");
    return;
  }
  if (action === "resetRegions") {
    selection.regions = [];
    values.regionPrompt = "";
    const globalPrompt = document.querySelector('[data-key="regionPrompt"]');
    if (globalPrompt) globalPrompt.value = "";
    $("#regionCount").textContent = "0";
    saveDraft();
    setupRegionCanvas();
    return;
  }
  if (action === "savewatermark") {
    SeedStar.preferences
      .set("tools.watermark", { values, files })
      .then(() => SeedStar.notify("浮水印設定已保存"))
      .catch(SeedStar.reportError);
    saveDraft();
    return;
  }
  if (action === "newproject") {
    let title = prompt("新剪輯專案名稱", "未命名剪輯專案");
    if (title) {
      let arr = JSON.parse(SeedStar.storage.getItem("appToolProjects") || "[]");
      arr.unshift({
        title,
        date: new Date().toLocaleString("zh-TW"),
      });
      SeedStar.storage.setItem("appToolProjects", JSON.stringify(arr));
      renderProjects();

    }
    return;
  }
  if (action.startsWith("export:")) {
    let data = val("subtitleText");
    if (!data.trim()) return alert("目前沒有可匯出的字幕內容。");
    let type = action.slice(7),
      text;
    try {
      text = SeedStar.convertSubtitles(data, type);
    } catch (e) {
      SeedStar.reportError(e);
      return;
    }
    let blob = new Blob([text], {
        type: "text/plain;charset=utf-8",
      }),
      a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "subtitles." + type;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    return;
  }
  if (action === "submit") {
    submitTool();
    return;
  }
});
document.addEventListener("input", (e) => {
  let target = e.target,
    k = target.dataset.key;
  if (target.id === "search") {
    search = target.value;
    const pos = target.selectionStart;
    render();
    let el = $("#search");
    el.focus();
    el.setSelectionRange(pos, pos);
    return;
  }
  if (k) {
    setVal(k, target.type === "checkbox" ? target.checked : target.value);
    if (target.type === "range") {
      let o = $("#v-" + CSS.escape(k));
      if (o) o.textContent = target.value + (target.dataset.suf || "");
    }
    if (k === "voiceText" && $("#voiceCount"))
      $("#voiceCount").textContent = target.value.length + "/500";
    saveDraft();
  }
});
window.addEventListener("popstate", () => {
  let id = location.hash.slice(1);
  tool = TOOLS.some((t) => t.id === id) ? id : null;
  restoreToolDraft();
  render();
});
tool = TOOLS.some((t) => t.id === location.hash.slice(1))
  ? location.hash.slice(1)
  : null;
restoreToolDraft();
render();
