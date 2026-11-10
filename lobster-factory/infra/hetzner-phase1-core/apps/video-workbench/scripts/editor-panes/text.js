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
edRegisterPane("text", {
  title: "文字",
  icon: "T",
  render: (p, c) => `<h3>文字</h3>${["空白文字", "主標題", "副標題", "內文", "重點提示", "金句", "步驟", "章節", "下標", "開場", "結尾", "價格", "標籤", "品牌", "呼籲行動"].map((title, i) => edButton(title, "text:" + i)).join("")}<hr>${edTitlePane(p)}`,
  // A fresh visit re-reads the library images (the 片頭 background list).
  open: () => {
    ed.title.images = null;
  },
  actions: {
    "text:": async (action, p) => {
      edCheckpoint();
      const i = Number(action.slice(5)),
        c = edText(
          [
            "在這裡輸入文字",
            "主標題",
            "副標題",
            "說明文字",
            "重點提示",
            "值得記住的一句話",
            "步驟 1",
            "第一章",
            "內容說明",
            "歡迎觀看",
            "謝謝觀看",
            "限時優惠",
            "精選",
            "品牌名稱",
            "立即了解",
          ][i],
        );
      if (i === 1) {
        c.fontSize = 96;
        c.bold = true;
        c.y = 50;
      }
      p.clips.push(c);
      ed.selected = c.id;
      edRender();
      await edSave();
      return;
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
