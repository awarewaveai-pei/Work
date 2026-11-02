(function () {
  SeedStar.showJob = (job, options = {}) => {
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
          SeedStar.assets
            .save({
              id: "job-" + v.id,
              kind: v.type,
              type:
                v.type === "audio"
                  ? "audio/mpeg"
                  : v.type === "image"
                    ? "image/png"
                    : "video/mp4",
              name: (v.input?.operation || v.type) + "-" + v.id.slice(0, 8),
              url: v.result.url,
            })
            .catch(SeedStar.reportError);
          if (options.onSuccess) {
            options.onSuccess(v);
            options.onSuccess = null;
          }
        }
        const url = SeedStar.safeUrl(v.result.url);
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
          if (v.result.sourceUrl && v.result.sourceUrl !== v.result.url && SeedStar.safeUrl(v.result.sourceUrl)) {
            const original = document.createElement("a");
            original.href = SeedStar.safeUrl(v.result.sourceUrl);
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
                const next = await SeedStar.generations.retry(v);
                closed = true; clearTimeout(timer); panel.remove(); SeedStar.showJob(next);
              } catch (error) { retry.disabled = false; SeedStar.reportError(error); }
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
                SeedStar.reportError(e);
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
                } catch (error) { SeedStar.reportError(error); }
                finally { button.disabled = false; }
              };
              actions.append(button);
            };
            if (v.input?.prompt) action("複製提示詞", async () => { await navigator.clipboard.writeText(v.input.prompt); SeedStar.notify("已複製提示詞"); });
            if (v.input) action("重新生成（先還原設定）", () => SeedStar.generator.import({ intent: "restore-job", job: v }));
            if (v.type === "image") {
              const asset = { id: "job-" + v.id, name: v.input?.prompt?.slice(0, 80) || "圖片成果", kind: "image", type: "image/png", url };
              action("用於生成（首幀）", () => SeedStar.generator.import({ intent: "use-result", action: "first", asset }));
              action("模仿動作", () => SeedStar.generator.import({ intent: "use-result", action: "motion", asset }));
              action("建立口播影片", () => SeedStar.generator.import({ intent: "use-result", action: "spoken", asset }));
              action("編輯圖片", () => SeedStar.generator.import({ intent: "open-tool", tool: "region", asset }));
              action("配音", () => SeedStar.generator.import({ intent: "open-tool", tool: "voice" }));
            }
            result.append(actions);
          }
        }
      }
      if (!closed && ["queued", "running"].includes(v.status))
        timer = setTimeout(async () => {
          try {
            update(await SeedStar.generations.get(v.id));
          } catch (e) {
            SeedStar.reportError(e);
            status.textContent = "狀態查詢失敗，5 秒後重試";
            if (!closed) timer = setTimeout(() => update(v), 5000);
          }
        }, 2000);
    };
    cancel.onclick = async () => {
      try {
        clearTimeout(timer);
        const v = await SeedStar.generations.cancel(job.id);
        update(v);
      } catch (e) {
        SeedStar.reportError(e);
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
