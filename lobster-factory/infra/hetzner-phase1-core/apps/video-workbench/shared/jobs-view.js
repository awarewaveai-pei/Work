(function () {
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
      seen = new Set();
    return [
      ...(detail.deliveries || []).filter((d) => ids.has(d.release_id)).map((d) => d.destination + (d.variant ? "／" + d.variant : "") + "：" + d.status),
      // rows arrive newest first: the first one per platform and maturity is the current one
      ...(detail.outcomes || []).filter((o) => ids.has(o.release_id) && !seen.has(o.platform + o.maturity) && seen.add(o.platform + o.maturity))
        .map((o) => o.platform + " 成效（發布後 " + (MATURITY[o.maturity] || o.maturity) + "）：" + (Object.entries(o.metrics || {}).filter(([, n]) => typeof n === "number").map(([k, n]) => (METRIC[k] || k) + " " + n).join("　") || "尚無數字")),
      ...(releases.length && !(detail.deliveries || []).some((d) => ids.has(d.release_id)) ? ["已核准，還沒投遞"] : []),
    ];
  }
  if (typeof module === "object" && module.exports) return void (module.exports = { jobRatio, readReview, readPublished });
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
  // Card VD.4: a finished video's covers. The free ones come with the export (backend/cover.cjs) and are the default;
  // an AI cover is opt-in, one button per image-edit row with its price on it (data-paid -> shared/paid-price.js, NT$
  // from /capabilities). The model redraws the best frame without any text; the title is drawn by ffmpeg afterwards.
  function coverButtons(v, actions) {
    if (!v.result?.covers?.length || !["editor-export", "engine-render"].includes(v.input?.operation)) return;
    const box = document.createElement("div");
    box.className = "job-cover-actions";
    const label = document.createElement("span");
    label.textContent = "封面：已自動做好 " + v.result.covers.length + " 張（免費，送審頁可換）。要 AI 重新設計：";
    box.append(label);
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
  VideoWorkbench.readPublished = (v) => reviewQuery(v).then((q) => (v.input?.link?.projectId ? readPublished(getJson, q.organizationId, v.input.link.projectId, q.asset) : []));
  VideoWorkbench.showJob = (job, options = {}) => {
    let panel = document.createElement("section");
    panel.className = "job-view";
    panel.setAttribute("role", "status");
    const title = document.createElement("h2"),
      status = document.createElement("p"),
      progress = document.createElement("progress"),
      result = document.createElement("div"),
      cancel = document.createElement("button"),
      close = document.createElement("button");
    title.textContent = "生成任務";
    progress.max = 100;
    cancel.textContent = "取消任務";
    close.textContent = "關閉";
    close.dataset.jobClose = "";
    panel.append(title, status, progress, result, cancel, close);
    document.body.append(panel);
    let timer,
      closed = false;
    const update = (v) => {
      status.textContent = v.id + " · " + v.status;
      progress.value = Number(v.progress) || 0;
      cancel.hidden = !["queued", "running"].includes(v.status);
      result.replaceChildren();
      if (v.error) result.textContent = v.error;
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
          VideoWorkbench.spine?.settle(v).catch(VideoWorkbench.reportError);
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
            const detail = document.createElement("details"), summary = document.createElement("summary"), prompt = document.createElement("p"), parameters = document.createElement("p"), actions = document.createElement("div");
            summary.textContent = "提示詞與生成參數";
            prompt.textContent = v.input?.prompt || "無提示詞";
            const settings = v.input?.settings || {};
            parameters.textContent = [settings.model, settings.ratio, settings.quality, settings.duration ? settings.duration + " 秒" : "", v.result.width && v.result.height ? v.result.width + " × " + v.result.height : ""].filter(Boolean).join(" · ");
            detail.append(summary, prompt, parameters); result.append(detail);
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
              reviewButton(v, actions);
              coverButtons(v, actions);
              subtitleButtons(v, actions);
            }
            result.append(actions);
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
