(function () {
  // P6 L3 送審: a finished video registered in the main system goes to next-admin's release gate (/api/video/release,
  // same origin: next-admin owns /api/ on this host). Only 16:9 / 9:16 / 4:5 can be delivered (D6, /delivery-ratios);
  // Invariant: a permission refusal is never shown as success -- 403 = 「沒有送審權限」 and the button stays usable.
  let delivery;
  const caps = async () => (VideoWorkbench.capabilities ||= await VideoWorkbench.request("/capabilities", undefined, "GET"));
  async function sendForReview(v) {
    const org = (await caps())?.mainSystem?.organizationId;
    if (!org || !v.result?.assetId || !v.result?.checksumSha256) throw Error("此成果尚未登記到主系統，無法送審");
    delivery ||= await VideoWorkbench.request("/delivery-ratios", undefined, "GET");
    const ratio = v.input?.settings?.ratio || v.input?.settings?.project?.ratio || "16:9", fit = delivery?.ratios?.[ratio];
    if (!fit?.deliverable) throw Error(fit?.note || "此比例尚不能投遞");
    const res = await fetch("/api/video/release", {
      method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: org, candidateAssetId: v.result.assetId, candidateChecksum: v.result.checksumSha256 }),
    });
    if (res.status === 403) throw Error("沒有送審權限");
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.ok !== true) throw Error("送審未通過：" + String(body.error || body.reason || res.status));
    return "已核准發布，可到主系統建立社群／WordPress 草稿";
  }
  function reviewButton(v, actions) {
    if (!v.result?.assetId) return;   // local mode registers nothing: no button
    const button = document.createElement("button");
    button.textContent = "送審";
    button.dataset.jobReview = v.id;
    button.onclick = async () => {
      button.disabled = true;
      try { VideoWorkbench.notify(await sendForReview(v)); }
      catch (error) { VideoWorkbench.reportError(error); button.disabled = false; }
    };
    actions.append(button);
  }
  VideoWorkbench.sendForReview = sendForReview;
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
      if (v.result?.url) {
        if (v.status === "succeeded") {
          VideoWorkbench.assets.save(VideoWorkbench.jobAsset(v)).catch(VideoWorkbench.reportError);
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
            if (v.input) action("重新生成（先還原設定）", () => VideoWorkbench.generator.import({ intent: "restore-job", job: v }));
            if (v.type === "image") {
              const asset = { id: "job-" + v.id, name: v.input?.prompt?.slice(0, 80) || "圖片成果", kind: "image", type: "image/png", url };
              action("用於生成（首幀）", () => VideoWorkbench.generator.import({ intent: "use-result", action: "first", asset }));
              action("模仿動作", () => VideoWorkbench.generator.import({ intent: "use-result", action: "motion", asset }));
              action("建立口播影片", () => VideoWorkbench.generator.import({ intent: "use-result", action: "spoken", asset }));
              action("編輯圖片", () => VideoWorkbench.generator.import({ intent: "open-tool", tool: "region", asset }));
              action("配音", () => VideoWorkbench.generator.import({ intent: "open-tool", tool: "voice" }));
            }
            if (v.type === "video") reviewButton(v, actions);
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
