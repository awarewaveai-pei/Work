// Card ED.0: the 「文字」 left pane (spec §3 檔案歸屬: ED.5). Registered with edRegisterPane in tools-editor.js.
// Remotion title templates (backend/remotion.cjs via /generations). The catalog comes from /capabilities; ratio
// and fps follow the project, so nothing here is a second source of template ids or sizes.
const edTitleFormats = ["16:9", "9:16", "4:5", "1:1"],
  edTitleFps = [24, 25, 30, 60];
function edTitleTemplate() {
  const list = VideoWorkbench.capabilities?.remotionTemplates || [];
  return list.find((t) => t.id === ed.title.templateId) || list[0] || null;
}
function edTitleBlocked(p) {
  if (!VideoWorkbench.capabilities?.remotion) return "片頭模板服務未設定";
  if (!edTitleFormats.includes(p.ratio))
    return "片頭模板不支援 " + p.ratio + " 比例";
  if (!edTitleFps.includes(Timebase.fps(p.timebase)))
    return "片頭模板只支援 24、25、30、60 fps";
  if (!ed.title.image) return "請先選一張背景圖";
  return "";
}
async function edTitleRefresh() {
  const rows = await VideoWorkbench.assets.list();
  ed.title.images = rows.filter(
    (a) =>
      VideoWorkbench.mediaKind(a) === "image" &&
      /^\/(generated|media)\/[^?#]+\.(png|jpe?g|webp)$/i.test(a.url || ""),
  );
  ed.title.done = ed.title.jobId
    ? rows.find((a) => a.id === "job-" + ed.title.jobId) || null
    : null;
  if (tool === "edit" && ed.pane === "文字") edRender();
}
function edTitlePane(p) {
  // The pane's state belongs to one project: another project's finished title must not be offered here.
  if (ed.title.projectId !== p.id)
    ed.title = {
      templateId: null,
      fields: {},
      image: null,
      jobId: null,
      images: null,
      done: null,
      projectId: p.id,
    };
  const t = edTitleTemplate(),
    blocked = edTitleBlocked(p),
    list = VideoWorkbench.capabilities?.remotionTemplates || [];
  if (!ed.title.images) {
    ed.title.images = [];
    edTitleRefresh().catch(VideoWorkbench.reportError);
  }
  return `<h3>片頭</h3><p class="note">比例與影格率跟隨專案（${esc(p.ratio)} · ${esc(Timebase.label(p.timebase))}），長度 5 秒。</p><div class="flow-choices">${list
    .map(
      (x) =>
        `<button type="button" class="btn small ${x.id === t?.id ? "selected" : ""}" data-ed-action="title-template:${esc(x.id)}" aria-pressed="${x.id === t?.id}">${esc(x.label)}</button>`,
    )
    .join("")}</div>${(t?.fields || [])
    .map(
      (f) =>
        `<label>${esc(f.label)}<input class="text-input" aria-label="${esc(f.label)}" data-ed-title-field="${esc(f.key)}" maxlength="${f.max}" value="${esc(ed.title.fields[f.key] ?? "")}"></label>`,
    )
    .join("")}${
    t
      ? `<p class="note">${esc(t.image.label)}（從素材庫選擇）</p><div class="flow-choices">${
          ed.title.images
            .map(
              (a) =>
                `<button type="button" class="btn small ${ed.title.image?.id === a.id ? "selected" : ""}" data-ed-action="title-image:${esc(a.id)}" aria-pressed="${ed.title.image?.id === a.id}" title="${esc(a.name || "圖片")}"><img src="${esc(a.thumbUrl || a.url)}" alt="${esc(a.name || "圖片")}" width="64" height="40" style="object-fit:cover"></button>`,
            )
            .join("") || '<span class="note">素材庫沒有圖片，請先上傳。</span>'
        }</div>`
      : ""
  }<button type="button" class="btn primary small" data-ed-action="title-generate" ${blocked ? "disabled" : ""}>產生片頭（免費）</button>${blocked ? `<p class="note" data-ed-title-blocked>${esc(blocked)}</p>` : ""}${ed.title.done ? edButton("放到時間軸開頭", "title-insert") : ""}`;
}
// Puts the finished title on V1 at frame 0; every clip on every track moves later by its length, so the
// existing cut keeps its sync.
async function edTitleInsert(p, asset) {
  const a = await edProbe(asset);
  if (!ed.projects.includes(p)) return;
  edCheckpoint();
  if (!p.assets.some((x) => x.id === a.id)) p.assets.push(a);
  const c = edTime(
    p,
    {
      id: crypto.randomUUID(),
      kind: "video",
      asset: a,
      track: edMain(p),
      speed: 1,
      volume: 1,
      fadeIn: 0,
      fadeOut: 0,
      opacity: 1,
      scale: 1,
      x: 0,
      y: 0,
      rotation: 0,
      width: 25,
    },
    {
      startFrame: 0,
      duration: Math.min(3600, a.duration),
      sourceStartFrame: 0,
    },
  );
  for (const row of p.clips)
    edTime(p, row, { startFrame: row.startFrame + c.durationFrames });
  p.clips.push(c);
  ed.selected = c.id;
  ed.time = 0;
  await edCommit(p);
}
// ---- ED.5: 樣板／純文字／品牌字型 ----
// Template looks are made of theme tokens only: the preview card paints them with var(--token), and a clip gets the
// token's resolved #rrggbb when it is added (clips store hex; the exporter needs it). Categories and purposes follow
// the reference (spec §1.3); wording, colours, type and composition are our own.
const edTextTokens = {
  light: "--btn-primary-text",
  ink: "--text-primary",
  paper: "--card-bg",
  accent: "--accent",
  gold: "--yellow",
  red: "--red",
  green: "--green",
};
const edTextCats = ["全部", "開場", "標價", "CTA", "強調", "片尾"],
  edTextAnims = ["無", "淡入淡出", "彈出", "逐字顯示"],
  // brand font name -> the clip font names the preview and the exporter know
  edTextFontMap = { Arial: "Arial", "Noto Sans TC": "思源黑體", "Noto Serif TC": "思源宋體", "sans-serif": "思源黑體", serif: "思源宋體", Georgia: "Georgia" },
  edTextDate = () => {
    const d = new Date(),
      n = (v) => String(v).padStart(2, "0");
    return `${d.getFullYear()}.${n(d.getMonth() + 1)}.${n(d.getDate())}`;
  };
// fg/bg = token keys; x/y = % of the frame; size = font size on the project's base width.
const edTextTemplates = [
  { id: "headline-2", name: "大標 · 雙行", cat: "開場", text: "好故事\n從這一格開始", size: 64, bold: true, fg: "light", y: 46 },
  { id: "label-light", name: "白底標籤", cat: "標價", text: "限時優惠", size: 44, bold: true, fg: "ink", bg: "paper", y: 50 },
  { id: "chapter", name: "章節標", cat: "開場", text: "CHAPTER 01", size: 36, bold: true, font: "等寬字", fg: "light", bg: "accent", y: 18 },
  { id: "headline-1", name: "單行標題", cat: "開場", text: "一個真實的故事", size: 72, bold: true, font: "思源宋體", fg: "light", y: 50 },
  { id: "date", name: "日期戳", cat: "開場", text: edTextDate, size: 40, font: "等寬字", fg: "gold", bg: "ink", y: 90 },
  { id: "cta", name: "行動呼籲", cat: "CTA", text: "馬上了解更多", size: 48, bold: true, fg: "light", bg: "accent", y: 82, anim: "彈出" },
  { id: "follow", name: "追蹤提醒", cat: "CTA", text: "追蹤，不錯過下一集", size: 42, bold: true, fg: "gold", bg: "ink", y: 84 },
  { id: "link", name: "連結提示", cat: "CTA", text: "連結在下方 ↓", size: 38, fg: "ink", bg: "paper", y: 88 },
  { id: "discount", name: "折扣徽章", cat: "標價", text: "全面 8 折", size: 64, bold: true, fg: "ink", bg: "gold", x: 78, y: 22, anim: "彈出" },
  { id: "new", name: "NEW 標籤", cat: "標價", text: "NEW", size: 40, bold: true, fg: "light", bg: "red", x: 14, y: 12 },
  { id: "quote", name: "金句引言", cat: "強調", text: "「慢一點，反而更近」", size: 56, italic: true, font: "思源宋體", fg: "light", y: 50, anim: "淡入淡出" },
  { id: "number", name: "數字強調", cat: "強調", text: "90%", size: 140, bold: true, fg: "gold", y: 50, anim: "彈出" },
  { id: "end-title", name: "片尾標題", cat: "片尾", text: "感謝你看完", size: 80, bold: true, fg: "light", y: 50, anim: "淡入淡出" },
  { id: "subscribe", name: "訂閱提醒", cat: "片尾", text: "訂閱並開啟通知", size: 44, bold: true, fg: "light", bg: "green", y: 80 },
  { id: "slogan", name: "品牌標語", cat: "片尾", text: "你的品牌標語", size: 48, fg: "light", y: 50, brand: true },
];
const edTextUi = { tab: "樣板", q: "", cat: "全部", anim: "無", kit: undefined };
const edTextLabel = (t) => (typeof t.text === "function" ? t.text() : t.text);
// One probe element turns var(--token) into the theme's current colour; the browser resolves color-mix and friends.
function edTokenHex(token) {
  const probe = document.createElement("span");
  probe.style.cssText = `position:absolute;visibility:hidden;color:var(${token})`;
  document.body.append(probe);
  const m = getComputedStyle(probe).color.match(/[\d.]+/g) || [0, 0, 0];
  probe.remove();
  return "#" + m.slice(0, 3).map((v) => Math.round(Number(v)).toString(16).padStart(2, "0")).join("");
}
// The brand kit is a per-user preference (tools.editor.brandKit, edited in the 貼圖 pane): { colors: ["#rrggbb"],
// font: "Arial" | "Noto Sans TC" | ..., logo? }. This pane only reads it.
async function edTextLoadKit() {
  edTextUi.kit = null;
  const kit = await VideoWorkbench.preferences.get("tools.editor.brandKit", null);
  edTextUi.kit = kit && typeof kit === "object" ? kit : {};
  if (tool === "edit" && ed.pane === "文字") edRender();
}
function edTextKit() {
  const kit = edTextUi.kit || {};
  return {
    colors: (Array.isArray(kit.colors) ? kit.colors : []).filter((c) => /^#[\da-f]{6}$/i.test(c)),
    font: typeof kit.font === "string" ? kit.font : "",
  };
}
function edTextClip(p, t, start, track) {
  const kit = edTextKit(),
    c = edText(edTextLabel(t), start, 3, p, track);
  c.fontSize = t.size;
  c.bold = !!t.bold;
  c.italic = !!t.italic;
  c.font = t.font || c.font;
  c.color = edTokenHex(edTextTokens[t.fg]);
  c.backgroundColor = t.bg ? edTokenHex(edTextTokens[t.bg]) : null;
  c.x = t.x ?? 50;
  c.y = t.y ?? 50;
  c.animation = edTextUi.anim !== "無" ? edTextUi.anim : t.anim || "無";
  if (t.brand) {
    if (kit.colors[0]) c.color = kit.colors[0];
    if (edTextFontMap[kit.font]) c.font = edTextFontMap[kit.font];
  }
  return c;
}
async function edTextAdd(p, t, start = ed.time, track) {
  edCheckpoint();
  const c = t ? edTextClip(p, t, start, track) : edText("新文字", start, 3, p, track);
  p.clips.push(c);
  ed.selected = c.id;
  ed.picks.clear();
  edRender();
  await edSave();
}
function edTextCard(t) {
  const style = [
    `color:var(${edTextTokens[t.fg]})`,
    t.bg ? `background:var(${edTextTokens[t.bg]})` : "",
    `font-weight:${t.bold ? 700 : 400}`,
    t.italic ? "font-style:italic" : "",
    t.font === "思源宋體" ? "font-family:serif" : t.font === "等寬字" ? "font-family:monospace" : "",
    `font-size:${Math.max(11, Math.min(26, t.size / 4))}px`,
  ]
    .filter(Boolean)
    .join(";");
  return `<div class="ed-tpl" draggable="true" data-ed-tpl="${t.id}" title="${esc(t.name)}：雙擊或按＋加入播放頭"><div class="ed-tpl-view"><span class="ed-tpl-text" style="${esc(style)}">${esc(edTextLabel(t))}</span></div><div class="ed-tpl-foot"><span><b>${esc(t.name)}</b><small>${esc(t.cat)}</small></span><button type="button" class="btn small" data-ed-action="tpl:${t.id}" aria-label="加入「${esc(t.name)}」">＋</button></div></div>`;
}
function edTextTemplatesPane() {
  const q = edTextUi.q.trim().toLowerCase(),
    list = edTextTemplates.filter((t) => (edTextUi.cat === "全部" || t.cat === edTextUi.cat) && (!q || (t.name + t.cat + edTextLabel(t)).toLowerCase().includes(q))),
    choice = (label, action, value, options) =>
      `<div class="flow-choices" role="group" aria-label="${label}">${options.map((o) => `<button type="button" class="btn small ${o === value ? "selected" : ""}" data-ed-action="${action}:${o}" aria-pressed="${o === value}">${o}</button>`).join("")}</div>`;
  return `<input class="text-input" type="search" aria-label="搜尋樣板" placeholder="搜尋樣板" data-ed-text-q value="${esc(edTextUi.q)}">${choice("樣板分類", "txt-cat", edTextUi.cat, edTextCats)}${edButton("＋ 加入空白文字", "text:0")}<h4>文字樣板</h4><div class="ed-tpl-grid">${list.map(edTextCard).join("") || '<p class="note">沒有符合的樣板。</p>'}</div><p class="note">雙擊、按 ＋ 加入播放頭，或拖到字幕軌。選取後在屬性面板調整文字樣式。</p><h4>文字動畫</h4>${choice("文字動畫", "txt-anim", edTextUi.anim, edTextAnims)}<p class="note">選了動畫，之後加入的樣板都用它；「無」＝各樣板自己的預設。</p>`;
}
function edTextBrandPane(c) {
  const kit = edTextKit(),
    text = c?.kind === "text";
  return `<h3>品牌套件</h3><p class="note">品牌色彩與字型在「貼圖」分頁編輯並儲存；這裡直接套用到選取的文字。</p><h4>品牌色彩</h4>${
    kit.colors.length
      ? `<div class="flow-choices">${kit.colors.map((x) => `<button type="button" class="btn small ed-swatch" style="background:${x}" data-ed-action="brand-color:${x.slice(1)}" aria-label="套用色彩 ${x}" title="${x}" ${text ? "" : "disabled"}></button>`).join("")}</div>`
      : '<p class="note">還沒有品牌色彩。</p>'
  }<h4>品牌字型</h4>${
    kit.font ? `<p class="note">${esc(kit.font)}</p>${edButton("套用至選取文字", "brand-font", !text || !edTextFontMap[kit.font])}` : '<p class="note">還沒有儲存品牌字型。</p>'
  }${text ? "" : '<p class="note">先在時間軸選一段文字。</p>'}`;
}
edRegisterPane("text", {
  title: "文字",
  icon: "T",
  render: (p, c) => {
    if (edTextUi.kit === undefined) edTextLoadKit().catch(VideoWorkbench.reportError);
    const body =
      edTextUi.tab === "樣板"
        ? edTextTemplatesPane() + "<hr>" + edTitlePane(p)
        : edTextUi.tab === "純文字"
          ? edButton("＋ 加入空白文字", "text:0") + '<p class="note">雙擊、按 ＋ 加入播放頭，或拖到字幕軌。選取後在屬性面板調整文字樣式。</p>'
          : edTextBrandPane(c);
    return `<div class="ed-text-tabs" role="group" aria-label="文字類型">${["樣板", "純文字", "品牌字型"].map((t) => `<button type="button" class="btn small ${t === edTextUi.tab ? "selected" : ""}" data-ed-action="txt-tab:${t}" aria-pressed="${t === edTextUi.tab}">${t}</button>`).join("")}</div>${body}`;
  },
  // A fresh visit re-reads the library images (the 片頭 background list) and the brand kit.
  open: () => {
    ed.title.images = null;
    edTextUi.kit = undefined;
  },
  actions: {
    "text:": async (action, p) => edTextAdd(p, null),
    "tpl:": async (action, p) => edTextAdd(p, edTextTemplates.find((t) => t.id === action.slice(4))),
    "txt-tab:": async (action) => {
      edTextUi.tab = action.slice(8);
      edRender();
    },
    "txt-cat:": async (action) => {
      edTextUi.cat = action.slice(8);
      edRender();
    },
    "txt-anim:": async (action) => {
      edTextUi.anim = action.slice(9);
      edRender();
    },
    "brand-color:": async (action, p, c) => {
      if (c?.kind !== "text") return;
      edCheckpoint();
      c.color = "#" + action.slice(12);
      edRender();
      await edSave();
    },
    "brand-font": async (action, p, c) => {
      const font = edTextFontMap[edTextKit().font];
      if (c?.kind !== "text" || !font) return;
      edCheckpoint();
      c.font = font;
      edRender();
      await edSave();
    },
    "title-template:": async (action, p, c) => {
      ed.title.templateId = action.slice(15);
      edRender();
      return;
    },
    "title-image:": async (action, p, c) => {
      ed.title.image =
        ed.title.images?.find((a) => String(a.id) === action.slice(12)) || null;
      edRender();
      return;
    },
    "title-generate": async (action, p, c) => {
      const t = edTitleTemplate(),
        blocked = edTitleBlocked(p);
      if (!t || blocked) throw Error(blocked || "片頭模板服務未設定");
      const job = await VideoWorkbench.generations.create({
        type: "video",
        operation: "remotion-template",
        prompt: t.label,
        settings: {
          templateId: t.id,
          fields: Object.fromEntries(
            t.fields.map((f) => [f.key, String(ed.title.fields[f.key] || "")]),
          ),
          ratio: p.ratio,
          fps: Timebase.fps(p.timebase),
        },
        references: { image: { url: ed.title.image.url, id: ed.title.image.id } },
      });
      ed.title.jobId = job.id;
      ed.title.done = null;
      edRender();
      VideoWorkbench.showJob(job, {
        onSuccess: () =>
          setTimeout(() => edTitleRefresh().catch(VideoWorkbench.reportError), 300),
        apply: async (v) => {
          if (v.status !== "succeeded") return false;
          await edTitleInsert(p, VideoWorkbench.jobAsset(v));
        },
        applyLabel: "放到時間軸開頭",
      });
      return;
    },
    "title-insert": async (action, p, c) => {
      if (ed.title.done && ed.title.projectId === p.id)
        await edTitleInsert(p, ed.title.done);
      return;
    },
  },
});
// Search box: filter the grid, keep the caret.
document.addEventListener("input", (e) => {
  if (!e.target.matches?.("[data-ed-text-q]")) return;
  edTextUi.q = e.target.value;
  const pos = e.target.selectionStart;
  edRender();
  const box = document.querySelector("[data-ed-text-q]");
  box?.focus();
  box?.setSelectionRange(pos, pos);
});
// Double-click a card = add at the playhead; dragging a card onto a text lane drops it where the pointer is.
document.addEventListener("dblclick", (e) => {
  const card = e.target.closest?.("[data-ed-tpl]"),
    p = edProject();
  // The ＋ button already added on each of its clicks; only the rest of the card counts as a double-click.
  if (card && p && !e.target.closest("button")) edTextAdd(p, edTextTemplates.find((t) => t.id === card.dataset.edTpl)).catch(VideoWorkbench.reportError);
});
document.addEventListener("dragstart", (e) => {
  const card = e.target.closest?.("[data-ed-tpl]");
  if (!card) return;
  e.dataTransfer.setData("text/x-ed-text-template", card.dataset.edTpl);
  e.dataTransfer.effectAllowed = "copy";
});
document.addEventListener("dragover", (e) => {
  if (e.dataTransfer?.types.includes("text/x-ed-text-template") && e.target.closest?.("[data-ed-lane]")) e.preventDefault();
});
document.addEventListener("drop", (e) => {
  const id = e.dataTransfer?.getData("text/x-ed-text-template"),
    lane = e.target.closest?.("[data-ed-lane]"),
    p = edProject();
  if (!id || !lane || !p) return;
  e.preventDefault();
  const track = lane.dataset.edLane;
  if (edTrack(p, track)?.kind !== "text") return VideoWorkbench.reportError(Error("樣板只能放到字幕／文字軌"));
  const start = Math.max(0, (e.clientX - lane.getBoundingClientRect().left) / ed.zoom);
  edTextAdd(p, edTextTemplates.find((t) => t.id === id), start, track).catch(VideoWorkbench.reportError);
});
