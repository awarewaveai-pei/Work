// Card ED.0: the 「文字」 left pane (spec §3 檔案歸屬: ED.5). Registered with edRegisterPane in tools-editor.js.
// Remotion title templates (backend/remotion.cjs via /generations). The catalog comes from /capabilities; ratio
// and fps follow the project, so nothing here is a second source of template ids or sizes.
const edTitleFormats = ["16:9", "9:16", "4:5", "1:1"],
  edTitleFps = [24, 25, 30, 60];
// Card R2: the style picker's choice. "title-card" (the render service's own title card) has no template here; nothing
// chosen = the first template that is not the cover opener (the old default).
function edTitleTemplate() {
  const list = VideoWorkbench.capabilities?.remotionTemplates || [];
  if (ed.title.templateId === "title-card") return null;
  return list.find((t) => t.id === ed.title.templateId) || list.find((t) => !t.cover) || list[0] || null;
}
// Card R2: the cover the 封面開場 starts from = the first (default) cover of this cut's newest finished output in the
// project's ratio (backend/cover.cjs, best first). Outputs are this episode's, this editor project's, or a file on its
// timeline. null = none yet (the card says to make one on the release panel first). url = the titled cover (shown here);
// cover = its job and time, from which the server cuts the same frame without the title (backend/api.cjs coverFrame).
function edCoverOf(p, jobs, hit) {
  const urls = new Set(p.clips.map((c) => c.asset?.url).filter(Boolean));
  return (jobs || [])
    .filter((j) => j.status === "succeeded" && j.result?.covers?.[0]?.url && [j.input?.settings?.ratio, j.input?.settings?.project?.ratio].includes(p.ratio))
    .filter((j) => (hit && j.input?.link?.projectId === hit.project.id && j.input.link.episodeId === hit.episode.id) || j.input?.link?.projectId === p.id || urls.has(j.result.url))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .map((j) => ({ url: j.result.covers[0].url, name: "封面", cover: { jobId: j.id, at: Number(j.result.covers[0].at) || 0 } }))[0] || null;
}
function edTitleBlocked(p) {
  if (ed.title.templateId === "title-card") return "標題字卡在快速輸出、一鍵成片時由影片服務接上，剪輯器不另做片頭檔；要放進時間軸請改選其他樣式";
  if (!VideoWorkbench.capabilities?.remotion) return "片頭模板服務未設定";
  if (edTitleTemplate()?.cover && !ed.title.cover) return "先到發布面板產生封面";
  if (!edTitleFormats.includes(p.ratio))
    return "片頭模板不支援 " + p.ratio + " 比例";
  if (!edTitleFps.includes(Timebase.fps(p.timebase)))
    return "片頭模板只支援 24、25、30、60 fps";
  const missing = (edTitleTemplate()?.fields || []).find((f) => f.required && edTitleMedia(f) && !ed.title.picks[f.key]);
  return missing ? "請先選「" + missing.label + "」" : "";
}
// 「AI 生成」 sits on the template's picture fields, not on a logo or a reviewer's photo.
const edTitleGeneratable = (f) => !/logo|profile/i.test(f.key),
  edTitleMedia = (f) => f.type === "image" || f.type === "audio",
  edTitleSeconds = (t) => ed.title.seconds ?? t.seconds.def;
// p = the project whose pane is open (its cover is looked up again); left out = the cover stays as it was.
// Redrawn only when something it shows changed: a re-check that finds nothing new must not stop playback or take the
// focus from a field (critic, card R2).
async function edTitleRefresh(p) {
  const seen = () => JSON.stringify([(ed.title.images || []).map((a) => a.id), (ed.title.audios || []).map((a) => a.id), ed.title.done?.id, ed.title.cover?.url]),
    before = seen();
  const rows = await VideoWorkbench.assets.list();
  ed.title.images = rows.filter(
    (a) =>
      VideoWorkbench.mediaKind(a) === "image" &&
      /^\/(generated|media)\/[^?#]+\.(png|jpe?g|webp)$/i.test(a.url || ""),
  );
  ed.title.audios = rows.filter(
    (a) =>
      VideoWorkbench.mediaKind(a) === "audio" &&
      /^\/(generated|media|library)\/[^?#]+\.(mp3|wav|m4a|ogg)$/i.test(a.url || ""),
  );
  ed.title.done = ed.title.jobId
    ? rows.find((a) => a.id === "job-" + ed.title.jobId) || null
    : null;
  if (p && ed.title.projectId === p.id) {
    ed.title.coverAt = Date.now();
    ed.title.cover = edCoverOf(p, await VideoWorkbench.generations.list(), edSpineHit(p));
  }
  if (tool === "edit" && ed.pane === "文字" && seen() !== before) edRender();
}
function edTitlePane(p) {
  // The pane's state belongs to one project: another project's finished title must not be offered here.
  if (ed.title.projectId !== p.id) {
    const intro = edSpineHit(p)?.episode?.intro;
    ed.title = {
      // a saved title card shows as chosen (card R2 old data); a saved template by its id
      templateId: intro?.kind === "title" ? "title-card" : intro?.templateId || null,
      fields: structuredClone(intro?.fields || {}),
      picks: structuredClone(intro?.references || {}),
      seconds: intro?.seconds || null,
      jobId: null,
      images: null,
      audios: null,
      done: null,
      cover: null,
      projectId: p.id,
    };
  }
  const t = edTitleTemplate(),
    list = VideoWorkbench.capabilities?.remotionTemplates || [];
  // The cover opener's picture is the cut's cover, never a library pick: it is set here, so every later step (the
  // blocked check, the job's references, the episode's saved intro) reads it like any picked picture.
  if (t?.cover) {
    const key = t.fields.find((f) => f.type === "image").key;
    if (ed.title.cover) ed.title.picks[key] = ed.title.cover;
    else delete ed.title.picks[key];
  }
  // Card R3: the banner card's picture is a design only -- a cover left from the cover opener (same field) is dropped.
  if (t?.still) {
    const key = t.fields.find((f) => f.type === "image").key;
    if (ed.title.picks[key]?.cover) delete ed.title.picks[key];
  }
  const blocked = edTitleBlocked(p);
  // Card U8.3: an untouched text field starts from this episode (title; the first shot's line for the tagline).
  const hit = edSpineHit(p);
  if (t)
    ed.title.fields = EditorModel.titlePrefill(ed.title.fields, t, {
      title: hit?.episode?.name?.trim() || hit?.project?.title || p.title,
      line: edLines(hit?.episode)[0]?.line,
    });
  // No cover yet: looked up again (at most every 5 s), so one made on the release panel meanwhile enables the opener (Codex daa15da9).
  if (!ed.title.images || (!ed.title.cover && Date.now() - (ed.title.coverAt || 0) > 5000)) {
    ed.title.images ||= [];
    ed.title.audios ||= [];
    ed.title.coverAt = Date.now();
    edTitleRefresh(p).catch(VideoWorkbench.reportError);
  }
  // One control per field of the template's table (backend/remotion.cjs): text, number, colour, or a library picker.
  const control = (f) => {
    const label = esc(f.label) + (f.required ? "" : '<span class="note">（選填）</span>');
    if (t.still && f.type === "image") return edTitleDesigns(p, f);
    if (t.cover && f.type === "image")
      return ed.title.cover
        ? `<p class="note">${label}（本集成片的封面）</p><img class="ed-intro-cover" src="${esc(ed.title.cover.url)}" alt="封面">`
        : `<p class="note" data-ed-cover-missing>${label}：先到發布面板產生封面</p>`;
    if (f.type === "image" || f.type === "audio") {
      const rows = f.type === "image" ? ed.title.images : ed.title.audios,
        picked = ed.title.picks[f.key];
      return `<p class="note">${label}（從素材庫選擇）</p><div class="flow-choices" role="group" aria-label="${esc(f.label)}">${f.required ? "" : `<button type="button" class="btn small ${picked ? "" : "selected"}" data-ed-action="title-pick:${esc(f.key)}:" aria-pressed="${!picked}">不使用</button>`}${f.type === "image" && edTitleGeneratable(f) ? `<button type="button" class="btn small" data-ed-action="title-image:${esc(f.key)}" data-paid="video.image">AI 生成</button>` : ""}${
        rows
          .map((a) => {
            const on = picked?.id === a.id,
              name = esc(a.name || (f.type === "image" ? "圖片" : "音樂"));
            return `<button type="button" class="btn small ${on ? "selected" : ""}" data-ed-action="title-pick:${esc(f.key)}:${esc(a.id)}" aria-pressed="${on}" title="${name}">${f.type === "image" ? `<img src="${esc(a.thumbUrl || a.url)}" alt="${name}" width="64" height="40" style="object-fit:cover">` : name}</button>`;
          })
          .join("") || `<span class="note">素材庫沒有${f.type === "image" ? "圖片" : "音樂"}，請先上傳。</span>`
      }</div>`;
    }
    const attrs = `class="text-input" aria-label="${esc(f.label)}" data-ed-title-field="${esc(f.key)}"`,
      value = esc(ed.title.fields[f.key] ?? ""),
      count = (f.type || "text") === "text" ? ` <span class="note" data-ed-title-count="${esc(f.key)}">${EditorModel.titleCount(ed.title.fields[f.key], f.max)}</span>` : "";
    return `<label>${label}${count}${
      f.multiline
        ? `<textarea ${attrs} maxlength="${f.max}">${value}</textarea>`
        : f.type === "number"
          ? `<input ${attrs} type="number" min="${f.min}" max="${f.max}" step="1" value="${value}">`
          : `<input ${attrs} maxlength="${f.type === "color" ? 7 : f.max}" value="${value}">`
    }</label>`;
  };
  const intro = hit?.episode?.intro,
    chosen = ed.title.templateId === "title-card" ? "title-card" : t?.id;
  // Card R2: one picture card per style (capabilities introStyles = next-admin public/editor-shared/intro-styles.js);
  // single choice. 不加片頭 is not offered: removing an intro is removing its clip from the timeline.
  const styles = (VideoWorkbench.capabilities?.introStyles || []).filter((s) => s.kind === "title" || list.some((x) => x.id === s.id));
  const card = (s) => {
    // the title card is made by the render service at output time: shown chosen when the episode has one saved, never
    // pickable here (nothing in the editor could apply it -- Codex daa15da9)
    const why = s.kind === "cover" && !ed.title.cover ? "先到發布面板產生封面" : s.kind === "title" && intro?.kind !== "title" ? "在快速輸出、一鍵成片設定" : "";
    return `<button type="button" class="ed-intro-card ${s.id === chosen ? "selected" : ""}" data-ed-action="title-template:${esc(s.id)}" aria-pressed="${s.id === chosen}" ${why ? "disabled" : ""}>${s.preview ? `<img src="${esc(s.preview)}" alt="" loading="lazy">` : ""}<span>${esc(s.label)}</span>${why ? `<small>${why}</small>` : ""}</button>`;
  };
  return `<h3>片頭</h3>${intro ? `<p class="note" data-ed-current-intro>本集：${esc(intro.kind === "title" ? "標題卡「" + intro.fields.title + "」" : list.find((x) => x.id === intro.templateId)?.label || "模板")} · ${intro.seconds} 秒 · ${esc(Transitions.label(intro.transition) ?? "")}轉場</p>` : '<p class="note">本集尚未設定片頭。</p>'}<p class="note">比例與影格率跟隨專案（${esc(p.ratio)} · ${esc(Timebase.label(p.timebase))}）。</p><div class="ed-intro-grid" role="group" aria-label="片頭樣式">${styles.map(card).join("")}</div>${
    t
      ? `<label>長度（秒，${t.seconds.min}–${t.seconds.max}）<input class="text-input" type="number" aria-label="片頭長度（秒）" data-ed-title-seconds min="${t.seconds.min}" max="${t.seconds.max}" step="1" value="${edTitleSeconds(t)}"></label>${t.fields.map(control).join("")}<p class="note">片頭轉場（接到第一個片段）</p>${Transitions.buttons({ label: "片頭轉場", value: ed.title.transition ?? intro?.transition ?? Transitions.AUTO.id, esc, attrs: (id) => `data-ed-action="${esc("title-transition:" + id)}"` })}`
      : ""
  }<button type="button" class="btn primary small" data-ed-action="title-generate" ${blocked ? "disabled" : ""}>產生片頭（免費）</button>${blocked ? `<p class="note" data-ed-title-blocked>${esc(blocked)}</p>` : ""}${ed.title.done ? edButton("放到時間軸開頭", "title-insert") : ""}`;
}
// Puts the finished title on V1 at frame 0; every clip on every track moves later by its length, so the
// existing cut keeps its sync.
async function edTitleInsert(p, asset, bookend = ed.title.renderedBookend) {
  const a = await edProbe(asset);
  if (!ed.projects.includes(p)) return;
  const hit = edSpineHit(p),
    end = EpisodeSpine.normalizeBookend(bookend || hit?.episode?.intro || edTitleBookend(p)),
    transition = Transitions.name(end.transition);
  if (p.clips.some((row) => row.bookend === "intro")) throw Error("時間軸已有片頭，請先移除舊片頭再加入，避免重複");
  const first = p.clips.filter((row) => row.track === edMain(p)).sort((a, b) => a.startFrame - b.startFrame)[0];
  if (first && first.startFrame !== 0) throw Error("請先把主影片軌開頭對齊，再加入片頭轉場");
  if (hit) await VideoWorkbench.spine.setBookends({ projectId: hit.project.id, episodeId: hit.episode.id, intro: end });
  edCheckpoint();
  if (!p.assets.some((x) => x.id === a.id)) p.assets.push(a);
  const c = edTime(
    p,
    {
      id: crypto.randomUUID(),
      bookend: "intro",
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
  if (first && transition !== "無") {
    first.transition = transition;
    first.transitionFrames = Timebase.toFrames(end.transitionSeconds, p.timebase);
  }
  p.clips.push(c);
  ed.selected = c.id;
  ed.time = 0;
  await edCommit(p);
}
function edTitleBookend(p) {
  const t = edTitleTemplate(), old = edSpineHit(p)?.episode?.intro;
  // The cover opener's picture is not saved with the episode: a later 一鍵成片 takes the first shot picture (the saved
  // cover would be the titled one) -- card R2.
  return EpisodeSpine.normalizeBookend({ kind: "template", templateId: t.id, fields: structuredClone(ed.title.fields),
    references: Object.fromEntries(Object.entries(ed.title.picks).filter(([, a]) => !a.cover).map(([k, a]) => [k, { url: a.url, ...(a.id ? { id: a.id } : {}) }])),
    seconds: edTitleSeconds(t), transition: ed.title.transition ?? old?.transition ?? Transitions.AUTO.id, transitionSeconds: old?.transitionSeconds ?? 0.5 });
}
// Card R3: the 橫幅字卡 opener's picture -- a card from 我的設計 (backend GET /designs = this organization's only). A design
// of another shape than the project is cut to it (cover, never stretched): its card says 會裁切. 開橫幅工具做一張 opens
// the banner tool in a new tab in the project's ratio with the episode's title and an opener layout; after 存到我的設計
// a 重新整理 here lists it (no live return between the windows).
function edTitleDesigns(p, f) {
  const picked = ed.title.picks[f.key],
    list = ed.title.designs;
  return `<p class="note">${esc(f.label)}（從我的設計挑；字卡上的字就是片頭的字，不另加標題）</p>${picked ? `<img class="ed-intro-cover" src="${esc(picked.url)}" alt="${esc(picked.name || "設計")}">` : ""}<div class="flow-choices" role="group" aria-label="橫幅字卡來源"><button type="button" class="btn small" data-ed-action="title-designs">${list ? "重新整理我的設計" : "從我的設計挑"}</button><button type="button" class="btn small" data-ed-action="title-banner">開橫幅工具做一張</button></div>${
    !list ? "" : list.error ? `<p class="note">${esc(list.error)}</p>` : !list.items.length ? '<p class="note">我的設計還沒有圖片，先用「開橫幅工具做一張」，存到我的設計後回來按「重新整理我的設計」。</p>'
      : `<div class="ed-intro-grid" role="group" aria-label="我的設計">${list.items.map((d) => {
          const on = picked?.id === d.id, crop = edDesignCrops(d, p.ratio);
          return `<button type="button" class="ed-intro-card ${on ? "selected" : ""}" data-ed-action="title-design:${esc(d.id)}" aria-pressed="${on}"><img src="${esc(d.url)}" alt="" loading="lazy"><span>${esc(d.name)}</span>${crop ? "<small>會裁切</small>" : ""}</button>`;
        }).join("")}</div>`
  }`;
}
// The banner tool for this project: its ratio, the episode's title, the centred opener layout (BannerStudio.tsx reads them).
function edBannerUrl(p) {
  const hit = edSpineHit(p), title = hit?.episode?.name?.trim() || hit?.project?.title || p.title || "";
  const org = VideoWorkbench.capabilities?.mainSystem?.organizationId;
  return "/tools/banner?" + new URLSearchParams({ ratio: p.ratio, title, template: "opener-center", ...(org ? { org } : {}) });
}
// A design's shape against the project's ratio ("16:9"); unknown size = not marked.
function edDesignCrops(d, ratio) {
  const [w, h] = String(ratio).split(":").map(Number);
  return d.width > 0 && d.height > 0 && w > 0 && h > 0 && Math.abs(d.width / d.height / (w / h) - 1) > 0.02;
}
// The designs with their picture sizes (read from the pictures themselves; one that does not load keeps no size).
async function edLoadDesigns() {
  try {
    const { designs } = await VideoWorkbench.request("/designs", undefined, "GET");
    const items = await Promise.all((designs || []).map((d) => new Promise((done) => {
      const img = new Image();
      img.onload = () => done({ ...d, width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => done(d);
      img.src = d.url;
    })));
    ed.title.designs = { items };
  } catch (e) {
    ed.title.designs = { items: [], error: e.message || "讀不到我的設計" };
  }
  if (tool === "edit" && ed.pane === "文字") edRender();
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
    `font-family:${edFontCss(t.font)}`,
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
    // card R2: the intro's transition, from the transitions module's list (any of them: the editor's export makes all)
    "title-transition:": async (action) => {
      const name = Transitions.name(action.slice(17));
      if (name === null) throw Error("轉場不存在");
      ed.title.transition = name;
      edRender();
    },
    "title-template:": async (action, p, c) => {
      ed.title.templateId = action.slice(15);
      ed.title.seconds = null;
      edRender();
      return;
    },
    // Card R3: 從我的設計挑 / 重新整理我的設計, and picking one (downloaded here by the backend: POST /designs/use).
    "title-banner": async (action, p) => {
      window.open(edBannerUrl(p), "_blank", "noopener");
    },
    "title-designs": async () => {
      ed.title.designs = null;
      await edLoadDesigns();
    },
    "title-design:": async (action, p) => {
      const id = action.slice(13), t = edTitleTemplate(), field = t?.still && t.fields.find((f) => f.type === "image");
      if (!field || !(ed.title.designs?.items || []).some((d) => d.id === id)) return;
      const got = await VideoWorkbench.request("/designs/use", { id, ratio: p.ratio });
      if (ed.title.projectId !== p.id) return;
      ed.title.picks[field.key] = { id: got.id, url: got.url, name: got.name };
      edRender();
    },
    // title-pick:<field key>:<asset id>; an empty id clears an optional field.
    "title-pick:": async (action, p, c) => {
      const rest = action.slice(11),
        cut = rest.indexOf(":"),
        key = rest.slice(0, cut),
        id = rest.slice(cut + 1),
        field = edTitleTemplate()?.fields.find((f) => f.key === key),
        pick = (field?.type === "audio" ? ed.title.audios : ed.title.images).find((a) => String(a.id) === id);
      if (!field) return;
      if (pick) ed.title.picks[key] = pick;
      else delete ed.title.picks[key];
      edRender();
      return;
    },
    // title-image:<field key>: the workbench's own image job (generations, type image; showJob shows it and its price came
    // from the button's data-paid); when it succeeds the picture is picked into that field.
    "title-image:": async (action, p) => {
      const key = action.slice(12),
        t = edTitleTemplate(),
        field = t?.fields.find((f) => f.key === key && f.type === "image" && edTitleGeneratable(f));
      if (!field) return;
      const hit = edSpineHit(p),
        prompt = EditorModel.titleImagePrompt(ed.title.fields, key, hit?.episode?.name?.trim() || hit?.project?.title || p.title);
      if (!prompt) throw Error("請先填標題，才知道要生成什麼畫面");
      const job = await VideoWorkbench.generations.create({ type: "image", prompt, ratio: p.ratio });
      VideoWorkbench.showJob(job, {
        onSuccess: (v) => {
          if (ed.title.projectId !== p.id) return;
          const asset = VideoWorkbench.jobAsset(v);
          ed.title.picks[key] = asset;
          if (!(ed.title.images || []).some((a) => a.id === asset.id)) ed.title.images = [...(ed.title.images || []), asset];
          setTimeout(() => edTitleRefresh().catch(VideoWorkbench.reportError), 300);
          if (tool === "edit" && ed.pane === "文字") edRender();
        },
      });
    },
    "title-generate": async (action, p, c) => {
      const t = edTitleTemplate(),
        blocked = edTitleBlocked(p);
      if (!t || blocked) throw Error(blocked || "片頭模板服務未設定");
      const end = edTitleBookend(p), input = {
        type: "video",
        operation: "remotion-template",
        prompt: t.label,
        settings: {
          templateId: t.id,
          fields: Object.fromEntries(
            t.fields.filter((f) => !edTitleMedia(f)).map((f) => [f.key, String(ed.title.fields[f.key] || "")]),
          ),
          seconds: edTitleSeconds(t),
          ratio: p.ratio,
          fps: Timebase.fps(p.timebase),
        },
        references: Object.fromEntries(
          t.fields.filter((f) => ed.title.picks[f.key]).map((f) => [f.key, { url: ed.title.picks[f.key].url, id: ed.title.picks[f.key].id, ...(ed.title.picks[f.key].cover ? { cover: ed.title.picks[f.key].cover } : {}) }]),
        ),
      }, key = EpisodeSpine.bookendKey(input),
        previous = (await VideoWorkbench.generations.list()).filter((j) => j.input?.operation === "remotion-template" && EpisodeSpine.bookendKey(j.input) === key).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).at(-1);
      // paid: none (Remotion template rendering is local).
      const job = previous && !["failed", "cancelled", "blocked"].includes(previous.status) ? previous : await VideoWorkbench.generations.create({ ...input, bookendKey: key });
      ed.title.jobId = job.id;
      ed.title.renderedBookend = end;
      ed.title.done = null;
      edRender();
      VideoWorkbench.showJob(job, {
        onSuccess: () =>
          setTimeout(() => edTitleRefresh().catch(VideoWorkbench.reportError), 300),
        apply: async (v) => {
          if (v.status !== "succeeded") return false;
          await edTitleInsert(p, VideoWorkbench.jobAsset(v), end);
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
document.addEventListener("input", (e) => {
  if (e.target.matches?.("[data-ed-title-field]")) {
    const n = document.querySelector(`[data-ed-title-count="${CSS.escape(e.target.dataset.edTitleField)}"]`);
    if (n && e.target.maxLength > 0) n.textContent = EditorModel.titleCount(e.target.value, e.target.maxLength);
  }
  if (e.target.matches?.("[data-ed-title-seconds]")) ed.title.seconds = e.target.value === "" ? null : Number(e.target.value);
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
