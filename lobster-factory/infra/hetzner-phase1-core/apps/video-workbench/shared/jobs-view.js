(function () {
  const sharedBase = typeof document === "object" && document.currentScript?.src ? document.currentScript.src.replace(/[^/]*$/, "") : "/shared/";
  // Invariant: the one reader of a finished job's ratio (result.ratio = the file's own, measured; then what the job asked
  // for; null = unknown, never a default). backend/main-system.cjs records metadata.ratio from this same function, so the
  // 送審與投遞 button is offered exactly when next-admin's release panel can place the video (platform-ratio.ts ratioOfAsset).
  const jobRatio = (job) => job?.result?.ratio || job?.input?.settings?.ratio || job?.input?.settings?.project?.ratio || null;
  // Plan U6: where a finished video stands in 審片 (all four QA kinds passed on every ratio file) and 發布 (some ratio file has
  // an approved Release), read from the main system. get(path) = the JSON of a same-origin GET, null when it failed: then the
  // answer is null (unknown), never "not done". Same rules as next-admin's ReleaseDeliveryPanel: a QA result or a Release
  // counts only for the checksum of the file it was made on.
  const QA_KINDS = ["technical", "caption", "editorial", "rights"];
  async function readReview(get, organizationId, assetId) {
    const org = encodeURIComponent(organizationId),
      assets = await get("/api/video/assets?organizationId=" + org + "&includeWorkbench=1"),
      rows = (assets?.items || []).filter((a) => a.id === assetId || a.metadata?.variantOf === assetId);
    if (!rows.length) return null;
    const reports = await Promise.all(rows.map((r) => get("/api/video/qa/reports?organizationId=" + org + "&candidateAssetId=" + encodeURIComponent(r.id)))),
      releases = await get("/api/video/release?organizationId=" + org + "&candidateAssetIds=" + rows.map((r) => encodeURIComponent(r.id)).join(","));
    if (!releases || reports.includes(null)) return null;
    return {
      reviewed: rows.every((r, i) => QA_KINDS.every((kind) => (reports[i].items || []).find((q) => q.kind === kind && q.candidateChecksum === r.checksum_sha256)?.status === "passed")),
      released: rows.some((r) => (releases.items || []).some((x) => x.candidate_asset_id === r.id && x.candidate_checksum === r.checksum_sha256)),
    };
  }
  // Where a finished video went (plan U6 「發布到哪」): its Releases, their delivery attempts and the newest outcome per
  // platform, from the main system's project row of the workbench project (GET /api/video/projects?id=). null = unknown;
  // [] = never released (also when the project has no row yet: the first open of the panel makes it).
  const METRIC = { views: "觀看", impressions: "曝光", reach: "觸及", likes: "讚", comments: "留言", shares: "分享", saves: "收藏", clicks: "點擊", completion_rate: "完成率 %" },
    MATURITY = { "24h": "24 小時", "7d": "7 天", "30d": "30 天" };
  // N14: a person's words for where a video went. The website article is told by the article as it is now (draft-outcome
  // `state`), never by the delivery row's status (old receipts recorded drafts as "published"), and never by its code
  // (wordpress／default:post-57). A title that cannot be read is left out, not made up.
  const DELIVERY_STATUS = { queued: "排隊中", dispatching: "投遞中", drafted: "草稿", scheduled: "已排程", published: "已發布", failed: "失敗", withdrawn: "已撤回" };
  // A delivery's platform as a person says it: the platform at the end of a variant code (postiz／default:youtube -> youtube),
  // else the destination; never the code itself.
  const platformName = (d) => { const tail = String(d.variant || "").split(":").pop(); return /^[A-Za-z][\w-]*$/.test(tail) && String(d.variant).includes(":") ? tail : d.destination; };
  const articleLine = (a) => {
    const title = a?.title && !a.untitled ? "〈" + a.title + "〉" : "";
    return a?.state === "published" ? "網站文章" + title + "（已發布）" : a?.state === "scheduled" ? "網站文章" + title + "（已排程）" : "網站草稿" + title;
  };
  async function readPublished(get, organizationId, workbenchProjectId, assetId) {
    const org = encodeURIComponent(organizationId),
      list = await get("/api/video/projects?organizationId=" + org + "&sourceRef=" + encodeURIComponent(workbenchProjectId));
    if (!list) return null;
    const row = (list.items || [])[0];
    if (!row) return [];
    const detail = await get("/api/video/projects?id=" + encodeURIComponent(row.id));
    if (!detail) return null;
    const mine = new Set((detail.assets || []).filter((a) => a.id === assetId || a.metadata?.variantOf === assetId).map((a) => a.id)),
      releases = (detail.releases || []).filter((r) => mine.has(r.candidate_asset_id)),
      ids = new Set(releases.map((r) => r.id)),
      seen = new Set(),
      deliveries = (detail.deliveries || []).filter((d) => ids.has(d.release_id)),
      site = deliveries.filter((d) => d.destination === "wordpress"),
      made = releases.length ? await get("/api/video/draft-outcome?" + new URLSearchParams({ organizationId, candidateAssetId: assetId })) : null;
    return [
      ...deliveries.filter((d) => d.destination !== "wordpress").map((d) => platformName(d) + "：" + (DELIVERY_STATUS[d.status] || d.status)),
      // the article's own record when it can be read; else one plain line per delivery (told as a draft: the safe side)
      ...(made ? (made.articles || []).map(articleLine) : site.map(() => articleLine(null))),
      ...(made?.drafts?.length ? ["社群草稿 ×" + made.drafts.length] : []),
      // rows arrive newest first: the first one per platform and maturity is the current one
      ...(detail.outcomes || []).filter((o) => ids.has(o.release_id) && !seen.has(o.platform + o.maturity) && seen.add(o.platform + o.maturity))
        .map((o) => o.platform + " 成效（發布後 " + (MATURITY[o.maturity] || o.maturity) + "）：" + (Object.entries(o.metrics || {}).filter(([, n]) => typeof n === "number").map(([k, n]) => (METRIC[k] || k) + " " + n).join("　") || "尚無數字")),
      ...(releases.length && !deliveries.length ? ["已核准，還沒投遞"] : []),
    ];
  }
  // N14 成片卡: only the newest version is open; an older one is a one-line row (第 N 版・日期・展開) the person opens
  // on purpose (`opened` = the indexes they opened). 完成：… is said by deliveredText, and only for a version whose own
  // read shows drafts or articles made from it; none = nothing is written.
  const expandedOutputs = (count, opened = []) => Array.from({ length: count }, (_, i) => i === count - 1 || opened.includes(i));
  function outputSummary(o, i, open) {
    const d = new Date(o?.at || NaN);
    return ["第 " + (i + 1) + " 版", isNaN(d) ? "" : d.getMonth() + 1 + "/" + d.getDate(), open ? "收合" : "展開"].filter(Boolean).join("・");
  }
  const deliveredText = (review) => (review?.drafted ? "完成：已建 " + [[review.drafts?.length, " 個社群草稿"], [review.articles?.length, " 篇文章"]].filter(([n]) => n).map(([n, u]) => n + u).join("、") : "");
  async function readProgress(get, org, asset) {
    const [review, outcome] = await Promise.all([readReview(get, org, asset), get("/api/video/draft-outcome?" + new URLSearchParams({ organizationId: org, candidateAssetId: asset }))]);
    return review && outcome ? { ...review, drafted: !!(outcome.drafts?.length || outcome.articles?.length), drafts: outcome.drafts || [], articles: outcome.articles || [], socialUrl: outcome.socialUrl } : null;
  }
  // A job as people read it (歷史紀錄 and the job panel): a Chinese name, status and local time, never the raw operation,
  // id or ISO string. Names follow the tools page (TOOLS in scripts/tools-0.js); an unknown operation reads as its type.
  const JOB_STATUS = { submitting: "送出中", queued: "排隊中", running: "處理中", succeeded: "已完成", failed: "失敗", cancelled: "已取消", blocked: "已停止" },
    JOB_OPERATION = {
      "quick-render": "快速輸出", "project-shot": "鏡頭生成", "image-output": "圖片尺寸轉換", "cover-ai": "AI 封面",
      edit: "影片剪輯", "editor-export": "影片剪輯輸出", "editor-transcribe": "字幕與逐字稿", "engine-render": "專業剪輯輸出",
      "remotion-template": "片頭／片尾模板", compose: "動畫合成", region: "圖片局部編輯器", depth: "影片轉深度影片",
      breakout: "破框貼文動畫", "remove-bg": "去背", reshoot: "拍片智能體",
      voice: "配音生成", "voice-overlay": "影片／圖片配音", music: "音樂生成", sfx: "去配樂・重配音效", separate: "音軌分離",
      subtitle: "字幕與逐字稿", "subtitle-burn": "字幕燒錄", "caption-reburn": "字幕重新燒錄",
      watermark: "影片浮水印", cta: "影片 CTA 按鈕", upscale: "畫質增強", enhance: "影音增強與消除字幕", privacy: "肖像權保護",
      short: "智能短影音剪輯", "follow-track": "人物跟拍剪輯", "follow-manual": "人物跟拍剪輯",
      rig: "角色綁定", autorig: "自動綁骨", "blender-autorig": "自動綁骨", retarget: "動作重定向", "blender-retarget": "動作重定向",
      "blender-render": "3D 算圖", "image-to-3d": "圖片轉 3D",
      "character-image": "角色圖片", "character-voice": "角色配音", "character-test": "角色試拍",
    },
    JOB_TYPE = { image: "圖片生成", video: "影片生成", audio: "音訊生成", text: "文字生成", model: "3D 模型", subtitle: "字幕" };
  const jobStatusLabel = (status) => JOB_STATUS[status] || "處理中",
    jobTitle = (job) => JOB_OPERATION[job?.input?.operation] || JOB_TYPE[job?.type] || "生成任務",
    jobTime = (iso, timeZone) => {
      const d = new Date(iso || NaN);
      return isNaN(d) ? "" : d.toLocaleString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone });
    };
  if (typeof module === "object" && module.exports) return void (module.exports = { jobRatio, readReview, readPublished, readProgress, expandedOutputs, outputSummary, deliveredText, jobStatusLabel, jobTitle, jobTime });
  VideoWorkbench.expandedOutputs = expandedOutputs;
  VideoWorkbench.outputSummary = outputSummary;
  VideoWorkbench.deliveredText = deliveredText;
  VideoWorkbench.jobStatusLabel = jobStatusLabel;
  VideoWorkbench.jobTitle = jobTitle;
  VideoWorkbench.jobTime = jobTime;
  VideoWorkbench.bookendAction = async (v, action) => {
    if (!VideoWorkbench.bookends) await VideoWorkbench.loadScripts(["../awarewave/editor-shared/transitions.js", "bookends.js"], sharedBase);
    const api = VideoWorkbench.bookends;
    if (action === "edit") return api.edit(v);
    if (action === "join") return api.join(v);
    const hit = await api.current(v);
    if (!hit?.e.intro) throw Error("請先編輯片頭");
    return api.render(hit.p, hit.e, "intro", jobRatio(v) || hit.p.ratio, true);
  };
  VideoWorkbench.bookendPreview = async (v) => {
    if (!VideoWorkbench.bookends) await VideoWorkbench.loadScripts(["../awarewave/editor-shared/transitions.js", "bookends.js"], sharedBase);
    const hit = await VideoWorkbench.bookends.current(v);
    return hit?.e.intro ? VideoWorkbench.bookends.peek(hit.p, hit.e, "intro", jobRatio(v) || hit.p.ratio) : null;
  };
  // The job panel's buttons share one row (.job-result-actions); what a group says about itself goes to notes above it.
  function bookendButtons(v, actions, notes) {
    const box = document.createElement("div"), about = document.createElement("div"), note = document.createElement("p");
    box.className = "job-bookend-actions"; note.textContent = "片頭：讀取中…"; about.append(note); notes.append(about);
    const refresh = () => VideoWorkbench.loadScripts(["../awarewave/editor-shared/transitions.js", "bookends.js"], sharedBase).then(async () => {
      const hit = await VideoWorkbench.bookends.current(v);
      note.textContent = "本集片頭：" + VideoWorkbench.bookends.label(hit?.e.intro, VideoWorkbench.capabilities?.remotionTemplates || []);
      about.querySelectorAll('[data-bookend-preview]').forEach((el) => el.remove());
      if (hit?.e.intro) {
        const latest = await VideoWorkbench.bookendPreview(v);
        if (latest?.result?.url) {
          const preview = document.createElement(latest.result.thumbUrl ? "img" : "video");
          preview.src = VideoWorkbench.safeUrl(latest.result.thumbUrl || latest.result.url); preview.setAttribute("aria-label", "本集片頭縮圖"); preview.dataset.bookendPreview = ""; preview.width = 128; preview.preload = "metadata"; about.prepend(preview);
        }
      }
    }).catch(VideoWorkbench.reportError);
    refresh();
    for (const [action, title] of [["edit", "編輯片頭"], ["render", "重新生成片頭 · 免費"], ["join", "加入這支影片 · 免費"]]) {
      const b = document.createElement("button"); b.type = "button"; b.textContent = title;
      b.onclick = async () => { b.disabled = true; try { await VideoWorkbench.bookendAction(v, action); } catch (error) { VideoWorkbench.reportError(error); } finally { b.disabled = false; refresh(); } }; box.append(b);
    }
    actions.append(box);
  }
  // Plan U6 審片與發布: a finished video registered in the main system is reviewed and released in next-admin's
  // /review-release page (same origin; it owns QA, release, social and WordPress drafts), framed by the shell like the
  // other pages. Only 16:9 / 9:16 / 4:5 / 1:1 / 4:3 can be delivered (D6, /delivery-ratios).
  let delivery;
  const caps = async () => VideoWorkbench.capabilities || (await VideoWorkbench.loadCapabilities());
  const getJson = async (path) => {
    try {
      const r = await fetch(path, { credentials: "same-origin" });
      return r.ok ? await r.json() : null;
    } catch {
      return null;
    }
  };
  // The page's query for this video, or the reason it cannot be reviewed.
  async function reviewQuery(v) {
    const org = (await caps())?.mainSystem?.organizationId;
    if (!org || !v.result?.assetId) throw Error("此成果尚未登記到主系統，無法送審");
    delivery ||= await VideoWorkbench.request("/delivery-ratios", undefined, "GET");
    const ratio = jobRatio(v);
    if (!ratio) throw Error("此成果沒有記錄長寬比，無法投遞");
    const fit = delivery?.ratios?.[ratio];
    if (!fit?.deliverable) throw Error(fit?.note || "此比例尚不能投遞");
    return { organizationId: org, asset: v.result.assetId };
  }
  // Opens the panel in the shell at `section` ("qa" = 審片, "release" = 發布). A video made inside a workbench project is
  // first linked to that project's row in the main system (one row per project, made on the first ask; plan §1.5), so
  // the panel and the project list see it; a video made on the generator page has no project and stays without one.
  async function openReview(v, section = "qa") {
    const query = await reviewQuery(v),
      projectId = v.input?.link?.projectId,
      project = projectId ? (await VideoWorkbench.projects.list()).find((p) => p.id === projectId) : null;
    if (project) {
      const res = await fetch("/api/video/projects", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: query.organizationId,
          title: String(project.title || "").trim().slice(0, 180) || "未命名專案",
          productionMode: "quick_video",
          source: "video_workbench",
          sourceRef: project.id,
          attachAssetIds: [query.asset],
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw Error("無法把成片掛到專案：" + (body.error || res.status));
    }
    await VideoWorkbench.navigate("review-release", new URLSearchParams({ ...query, section }).toString());
  }
  function reviewButton(v, actions) {
    if (!v.result?.assetId) return;   // local mode registers nothing: no button
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "送審與投遞";
    button.dataset.jobReview = v.id;
    button.setAttribute("aria-disabled", "true");
    let refusal = null;
    button.onclick = () => (refusal ? VideoWorkbench.reportError(refusal) : openReview(v).catch(VideoWorkbench.reportError));
    reviewQuery(v).then(() => button.setAttribute("aria-disabled", "false"), (error) => { refusal = error; button.title = error.message; });
    actions.append(button);
  }
  // Card VD.4: a finished video's covers. The free ones come with every deliverable render (backend/api.cjs addCovers)
  // and are the default; having them is what makes a job a cover target (no operation list here). An AI cover is opt-in,
  // one button per image-edit row with its price on it (data-paid -> shared/paid-price.js, NT$ from /capabilities). The
  // model redraws the best frame without any text; the title is drawn afterwards (card R1: the cover template, else ffmpeg).
  function coverButtons(v, actions, notes) {
    if (!v.result?.covers?.length) return;
    const box = document.createElement("div");
    box.className = "job-cover-actions";
    const label = document.createElement("p");
    label.textContent = "封面：已自動做好 " + v.result.covers.length + " 張（免費，送審頁可換）。";
    notes.append(label);
    caps().then((c) => {
      for (const m of (c?.imageEdit?.models || []).filter((row) => row.available)) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "AI 設計封面 · " + m.label;
        button.dataset.paid = "video.image";
        button.dataset.paidModel = m.id;
        button.onclick = async () => {
          button.disabled = true;
          try {
            const next = await VideoWorkbench.generations.create({ type: "image", operation: "cover-ai", prompt: "封面", settings: { model: m.id, forJob: v.id } });
            VideoWorkbench.showJob(next);
          } catch (error) {
            button.disabled = false;
            VideoWorkbench.reportError(error);
          }
        };
        box.append(button);
      }
    }, VideoWorkbench.reportError);
    actions.append(box);
  }
  // Plan U7: a finished video registered in the main system -- its subtitle files (GET /api/video/subtitles, same origin,
  // the one route for every finished video) and 改字幕 = the 字幕 tool opened on it (source 主系統成片). A subtitle burn made
  // here also hands the tool its own source video, so the new lines are burned on the clean picture, not over the old ones.
  function subtitleButtons(v, actions) {
    if (!v.result?.assetId) return;
    for (const format of ["srt", "vtt"]) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "下載 " + format.toUpperCase();
      button.onclick = async () => {
        try {
          const org = (await caps())?.mainSystem?.organizationId || "";
          const r = await fetch("/api/video/subtitles?" + new URLSearchParams({ organizationId: org, assetId: v.result.assetId, format }), { credentials: "same-origin" });
          if (!r.ok) throw Error(r.status === 404 ? "這支成片沒有字幕檔" : "下載字幕失敗（" + r.status + "）");
          VideoWorkbench.download("subtitles." + format, await r.text(), "text/plain;charset=utf-8");
        } catch (error) {
          VideoWorkbench.reportError(error);
        }
      };
      actions.append(button);
    }
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "改字幕";
    edit.onclick = () => {
      const src = v.input?.operation === "subtitle-burn" ? v.input.references?.src : null;
      VideoWorkbench.generator.import({ intent: "open-tool", tool: "subtitle", settings: { subtitleSourceKind: "主系統成片", subtitleMainPending: v.result.assetId }, ...(src?.url ? { asset: src } : {}) }).catch(VideoWorkbench.reportError);
    };
    actions.append(edit);
  }
  VideoWorkbench.reviewQuery = reviewQuery;
  VideoWorkbench.openReview = openReview;
  VideoWorkbench.readReview = (v) => reviewQuery(v).then((q) => readReview(getJson, q.organizationId, q.asset));
  VideoWorkbench.readProgress = (v) => reviewQuery(v).then((q) => readProgress(getJson, q.organizationId, q.asset));
  VideoWorkbench.readPublished = (v) => reviewQuery(v).then((q) => (v.input?.link?.projectId ? readPublished(getJson, q.organizationId, v.input.link.projectId, q.asset) : []));
  VideoWorkbench.episodeProgress = async (p, e, edits = []) => {
    if (e.edit) {
      try { edits = JSON.parse(VideoWorkbench.storage.getItem(e.edit.engine === "filmcraft" ? "tools.engine.projects" : "tools.editor.projects") || "[]"); } catch { edits = []; }
    }
    let review;
    const last = e.outputs?.at(-1);
    if (last) {
      try {
        const v = (await VideoWorkbench.generations.list()).find((j) => j.id === last.jobId) || await VideoWorkbench.generations.get(last.jobId);
        review = await VideoWorkbench.readProgress(v);
      } catch { review = null; }
    }
    const states = EpisodeSpine.stepStates(e, edits, review);
    return { states, action: EpisodeSpine.nextAction(states), review };
  };
  const nextBoxes = new Set();
  VideoWorkbench.renderJobNext = async (v, box) => {
    const link = v.input?.link, p = (await VideoWorkbench.projects.list()).find((x) => x.id === link?.projectId), e = p?.episodes?.find((x) => x.id === link?.episodeId);
    if (e) VideoWorkbench.renderNext(box, p, e);
  };
  VideoWorkbench.renderNext = (box, p, e, edits = [], local) => {
    box.dataset.vwNextSurface ||= "card";
    let revision = 0;
    const refresh = async () => {
      const asked = ++revision;
      const projects = await VideoWorkbench.projects.list(), latestP = projects.find((x) => x.id === p.id), latestE = latestP?.episodes?.find((x) => x.id === e.id);
      if (!latestE) { if (box.isConnected) box.textContent = "這一集已不存在"; return; }
      const progress = await VideoWorkbench.episodeProgress(latestP, latestE, edits);
      if (asked !== revision || !box.isConnected) return;
      box.replaceChildren();
      const next = progress.action;
      if (!next) { box.textContent = "主系統狀態暫時讀不到，無法確認下一步"; return; }
      const button = document.createElement("button"); button.type = "button"; button.className = "btn primary";
      button.textContent = next.label; button.dataset.nextKey = next.key; box.append(button);
      button.onclick = async () => {
        button.disabled = true;
        try {
          if (next.key === "script") await VideoWorkbench.navigate("script-forge", new URLSearchParams({ project: p.id, episode: e.id }).toString());
          else if (next.key === "video") local ? await local("video") : await VideoWorkbench.spine.open({ projectId: p.id, episodeId: e.id, intent: "video" });
          else if (["review", "release"].includes(next.key)) {
            const last = latestE.outputs.at(-1), v = await VideoWorkbench.generations.get(last.jobId); await openReview(v, next.target);
          }
        } catch (error) { VideoWorkbench.reportError(error); }
        finally { button.disabled = false; }
      };
      if (next.key === "done") {
        button.disabled = true;
        button.textContent = deliveredText(progress.review);
        for (const article of progress.review?.articles || []) {
          const a = document.createElement("a"); a.textContent = "已嵌入〈" + article.title + "〉";
          if (article.editUrl && VideoWorkbench.safeUrl(article.editUrl)) { a.href = VideoWorkbench.safeUrl(article.editUrl); a.target = "_blank"; a.rel = "noopener noreferrer"; } box.append(a);
        }
        if (progress.review?.drafts.length && VideoWorkbench.safeUrl(progress.review.socialUrl)) { const a = document.createElement("a"); a.href = VideoWorkbench.safeUrl(progress.review.socialUrl); a.textContent = "查看社群草稿"; a.target = "_blank"; a.rel = "noopener noreferrer"; box.append(a); }
      }
    };
    for (const item of nextBoxes) if (!item.box.isConnected) nextBoxes.delete(item);
    nextBoxes.add({ box, refresh }); refresh().catch(VideoWorkbench.reportError);
  };
  const refreshNext = () => { for (const item of nextBoxes) item.box.isConnected ? item.refresh().catch(VideoWorkbench.reportError) : nextBoxes.delete(item); };
  document.addEventListener?.("vw:changed", refreshNext);
  document.addEventListener?.("vw:workflow-changed", refreshNext);
  if (typeof window === "object") {
  window.addEventListener("focus", refreshNext);
  window.addEventListener("message", (event) => {
    if (event.origin !== location.origin || event.data?.type !== "vw:workflow-changed") return;
    refreshNext();
    if (!event.data.relay) for (const frame of document.querySelectorAll("iframe")) frame.contentWindow?.postMessage({ type: "vw:workflow-changed", relay: true }, location.origin);
  });
  }
  const notified = new Set();
  VideoWorkbench.notifyNext = async (v) => {
    if (notified.has(v.id) || v.type !== "video" || v.input?.link?.target !== "output") return;
    notified.add(v.id);
    const link = v.input.link, p = (await VideoWorkbench.projects.list()).find((x) => x.id === link.projectId), e = p?.episodes?.find((x) => x.id === link.episodeId);
    if (!e) return;
    const box = document.createElement("div"), title = document.createElement("p"), next = document.createElement("div");
    box.className = "service-error"; box.setAttribute("role", "status"); next.dataset.vwNextSurface = "notification";
    title.textContent = "影片已完成 · " + p.title + "／" + e.name; box.append(title, next); document.body.append(box);
    VideoWorkbench.renderNext(next, p, e); setTimeout(() => box.remove(), 30000);
  };
  document.addEventListener?.("vw:job-completed", (ev) => VideoWorkbench.notifyNext(ev.detail).catch(VideoWorkbench.reportError));
  VideoWorkbench.showJob = (job, options = {}) => {
    let completionNotice = ["queued", "running"].includes(job.status);
    let panel = document.createElement("section");
    panel.className = "job-view";
    panel.setAttribute("role", "status");
    const title = document.createElement("h2"),
      status = document.createElement("p"),
      progress = document.createElement("progress"),
      result = document.createElement("div"),
      cancel = document.createElement("button"),
      close = document.createElement("button");
    title.textContent = jobTitle(job);
    progress.max = 100;
    cancel.textContent = "取消任務";
    close.textContent = "關閉";
    close.dataset.jobClose = "";
    panel.append(title, status, progress, result, cancel, close);
    document.body.append(panel);
    let timer,
      closed = false;
    const update = (v) => {
      status.textContent = jobStatusLabel(v.status);
      progress.value = Number(v.progress) || 0;
      cancel.hidden = !["queued", "running"].includes(v.status);
      result.replaceChildren();
      if (v.error) result.textContent = typeof v.error === "string" ? v.error : String(v.error.message ?? "失敗");
      // A result's own remark (e.g. 破框: finishing stopped, the model's file delivered) is part of what was delivered.
      if (v.result?.note) {
        const note = document.createElement("p");
        note.className = "note";
        note.textContent = v.result.note;
        result.append(note);
      }
      if (v.result?.url) {
        if (v.status === "succeeded") {
          VideoWorkbench.assets.save(VideoWorkbench.jobAsset(v)).catch(VideoWorkbench.reportError);
          // Card PJ.2: back to its episode; a closed panel leaves it to the top page's reconcile (same settle, once).
          VideoWorkbench.spine?.settle(v).then(() => {
            if (completionNotice) { completionNotice = false; VideoWorkbench.notifyNext(v).catch(VideoWorkbench.reportError); }
          }).catch(VideoWorkbench.reportError);
          if (options.onSuccess) {
            options.onSuccess(v);
            options.onSuccess = null;
          }
        }
        const url = VideoWorkbench.safeUrl(v.result.url);
        if (url) {
          const media = document.createElement(
            v.type === "audio" ? "audio" : v.type === "image" ? "img" : "video",
          );
          media.src = url;
          media.controls = true;
          result.append(media);
          const download = document.createElement("a");
          download.href = url;
          download.download = "awarewave-video-" + v.id;
          download.textContent = v.status === "failed" && v.result.sourceUrl ? "下載供應商原圖" : "下載成果";
          result.append(download);
          if (v.result.sourceUrl && v.result.sourceUrl !== v.result.url && VideoWorkbench.safeUrl(v.result.sourceUrl)) {
            const original = document.createElement("a");
            original.href = VideoWorkbench.safeUrl(v.result.sourceUrl);
            original.download = "original-" + v.id;
            original.textContent = "下載供應商原圖";
            result.append(original);
          }
          if (v.status === "failed" && v.type === "image" && v.result.sourceUrl && ["center-crop", "region-preserve"].includes(v.input?.settings?.imageLayout)) {
            const retry = document.createElement("button");
            retry.textContent = "只重試尺寸轉換（不呼叫 AI）";
            retry.onclick = async () => {
              retry.disabled = true;
              try {
                // paid: none (only the size conversion runs again, no AI call)
                const next = await VideoWorkbench.generations.retry(v);
                closed = true; clearTimeout(timer); panel.remove(); VideoWorkbench.showJob(next);
              } catch (error) { retry.disabled = false; VideoWorkbench.reportError(error); }
            };
            result.append(retry);
          }
          if (options.apply) {
            const apply = document.createElement("button");
            apply.textContent = options.applyLabel || "套用成果";
            apply.onclick = async () => {
              try {
                if ((await options.apply(v)) === false) return;
                closed = true;
                clearTimeout(timer);
                panel.remove();
              } catch (e) {
                VideoWorkbench.reportError(e);
              }
            };
            result.append(apply);
          }
          if (v.status === "succeeded") {
            const detail = document.createElement("details"), summary = document.createElement("summary"), prompt = document.createElement("p"), parameters = document.createElement("p"), notes = document.createElement("div"), actions = document.createElement("div");
            summary.textContent = "提示詞與生成參數";
            prompt.textContent = v.input?.prompt || "無提示詞";
            const settings = v.input?.settings || {};
            parameters.textContent = [settings.model, settings.ratio, settings.quality, settings.duration ? settings.duration + " 秒" : "", v.result.width && v.result.height ? v.result.width + " × " + v.result.height : ""].filter(Boolean).join(" · ");
            detail.append(summary, prompt, parameters); result.append(detail);
            notes.className = "job-result-notes";
            actions.className = "job-result-actions";
            const action = (name, callback) => {
              const button = document.createElement("button"); button.textContent = name;
              button.onclick = async () => {
                button.disabled = true;
                try {
                  const output = await callback();
                  if (output?.ok === false) throw Error(output.message || "無法帶入");
                  if (output?.ok) { closed = true; clearTimeout(timer); panel.remove(); }
                } catch (error) { VideoWorkbench.reportError(error); }
                finally { button.disabled = false; }
              };
              actions.append(button);
            };
            if (v.input?.prompt) action("複製提示詞", async () => { await navigator.clipboard.writeText(v.input.prompt); VideoWorkbench.notify("已複製提示詞"); });
            // A professional-editor render (card FC.3) has no generator settings to restore.
            if (v.input && v.input.operation !== "engine-render") action("重新生成（先還原設定）", () => VideoWorkbench.generator.import({ intent: "restore-job", job: v }));
            if (v.type === "image") {
              const asset = { id: "job-" + v.id, name: v.input?.prompt?.slice(0, 80) || "圖片成果", kind: "image", type: "image/png", url };
              action("用於生成（首幀）", () => VideoWorkbench.generator.import({ intent: "use-result", action: "first", asset }));
              action("模仿動作", () => VideoWorkbench.generator.import({ intent: "use-result", action: "motion", asset }));
              action("建立口播影片", () => VideoWorkbench.generator.import({ intent: "use-result", action: "spoken", asset }));
              action("編輯圖片", () => VideoWorkbench.generator.import({ intent: "open-tool", tool: "region", asset }));
              action("配音", () => VideoWorkbench.generator.import({ intent: "open-tool", tool: "voice" }));
            }
            if (v.type === "video") {
              const next = document.createElement("div"); next.dataset.vwNextSurface = "card"; actions.prepend(next); // the next step leads the row
              VideoWorkbench.renderJobNext(v, next).catch(VideoWorkbench.reportError);
              action("複製連結", async () => { await navigator.clipboard.writeText(new URL(url, location.origin).href); VideoWorkbench.notify("已複製影片連結；需登入同一工作台才能開啟"); });
              bookendButtons(v, actions, notes);
              reviewButton(v, actions);
              coverButtons(v, actions, notes);
              subtitleButtons(v, actions);
            }
            result.append(notes, actions);
          }
        }
      }
      if (!closed && ["queued", "running"].includes(v.status))
        timer = setTimeout(async () => {
          try {
            update(await VideoWorkbench.generations.get(v.id));
          } catch (e) {
            VideoWorkbench.reportError(e);
            status.textContent = "狀態查詢失敗，5 秒後重試";
            if (!closed) timer = setTimeout(() => update(v), 5000);
          }
        }, 2000);
    };
    cancel.onclick = async () => {
      try {
        clearTimeout(timer);
        const v = await VideoWorkbench.generations.cancel(job.id);
        update(v);
      } catch (e) {
        VideoWorkbench.reportError(e);
        update(job);
      }
    };
    close.onclick = () => {
      closed = true;
      clearTimeout(timer);
      panel.remove();
    };
    update(job);
  };
})();
