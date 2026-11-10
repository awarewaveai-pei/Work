(function () {
  const $ = (id) => document.getElementById(id),
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
  let current = "assets",
    search = "",
    kind = "all",
    editing = null;
  const titles = {
    assets: "素材庫",
    skills: "我的技能",
    workflows: "工作流",
    history: "歷史紀錄",
  };
  const modes = [
    ["director", "導演"],
    ["image", "圖片"],
    ["reference", "參考生成"],
    ["spoken", "口播"],
    ["cartoon", "卡通"],
    ["product", "商品"],
    ["reshoot", "拍片"],
  ];
  function media(a) {
    const k = VideoWorkbench.mediaKind(a),
      url = esc(VideoWorkbench.safeUrl(a.url)),
      preview = esc(VideoWorkbench.safeUrl(a.previewUrl || a.url));
    return k === "image"
      ? `<img class="media-preview" src="${url}" alt="${esc(a.name)}">`
      : k === "video"
        ? `<video class="media-preview" src="${preview}" controls></video>`
        : `<audio class="media-preview" src="${preview}" controls></audio>`;
  }
  async function render() {
    const host = $("workspaceArea");
    if (!host) return;
    const screen = current;
    let content = "";
    if (screen === "assets") {
      const items = (await VideoWorkbench.assets.list()).filter(
        (a) =>
          (kind === "all" || VideoWorkbench.mediaKind(a) === kind) &&
          a.name.toLowerCase().includes(search.toLowerCase()),
      );
      const removeBg = items.some((a) => VideoWorkbench.mediaKind(a) === "image") ? await VideoWorkbench.removeBgLabel() : null;
      content = `<div class="workspace-actions"><label>搜尋素材<input id="workspaceSearch" value="${esc(search)}"></label><label>上傳素材<input id="workspaceUpload" type="file" accept="image/*,video/*,audio/*" multiple></label>${VideoWorkbench.rightsCheckbox()}</div><div class="workspace-actions">${[
        ["all", "全部"],
        ["image", "圖片／角色"],
        ["video", "影片"],
        ["audio", "音訊"],
      ]
        .map(
          ([k, label]) =>
            `<button data-kind="${k}" aria-pressed="${kind === k}">${label}</button>`,
        )
        .join(
          "",
        )}</div><div class="workspace-list">${items.length ? items.map((a) => `<article class="workspace-card">${media(a)}<h2>${esc(a.name)}</h2><div class="workspace-actions"><button data-asset-use="${esc(a.id)}">帶入生成</button><button data-asset-rename="${esc(a.id)}">重新命名</button><button data-asset-download="${esc(a.id)}">下載</button>${removeBg && VideoWorkbench.mediaKind(a) === "image" ? `<button data-asset-remove-bg="${esc(a.id)}">${esc(removeBg)}</button>` : ""}<button data-asset-delete="${esc(a.id)}">移除</button></div></article>`).join("") : "<p>尚無符合條件的素材。上傳後可在角色、專案與生成頁選取。</p>"}</div>`;
    } else if (screen === "history") {
      const jobs = (await VideoWorkbench.generations.list()).slice().reverse();
      content = `<div class="workspace-actions"><button data-refresh>重新整理</button><button data-export-jobs>匯出任務紀錄</button></div><div class="workspace-list">${jobs.length ? jobs.map((j) => `<article class="workspace-card"><h2>${esc(j.input?.operation || j.type)}</h2><p>${esc(j.id)} · ${esc(j.status)} · ${esc(j.createdAt || "")}</p>${j.error ? `<p>${esc(j.error)}</p>` : ""}<div class="workspace-actions"><button data-job-open="${esc(j.id)}">檢視任務</button><button ${["queued", "running", "submitting"].includes(j.status) ? "data-job-check" : "data-job-retry"}="${esc(j.id)}" data-paid="${["queued", "running", "submitting"].includes(j.status) || (j.status === "failed" && j.type === "image" && j.result?.sourceUrl && ["center-crop", "region-preserve"].includes(j.input?.settings?.imageLayout)) ? "" : esc(j.paidFeature || "")}" data-paid-model="${esc(j.input?.settings?.model ?? j.input?.model ?? j.input?.settings?.method ?? "")}">${j.status === "failed" && j.type === "image" && j.result?.sourceUrl && j.input?.settings?.imageLayout === "center-crop" ? "只重試尺寸轉換（不呼叫 AI）" : ["queued", "running", "submitting"].includes(j.status) ? "檢查最新狀態" : j.status === "succeeded" ? "以相同設定再次執行" : "以相同設定重試"}</button><button data-job-draft="${esc(j.id)}">還原成草稿</button></div></article>`).join("") : "<p>尚無生成任務。送出、失敗及完成的任務都會記錄於此。</p>"}</div>`;
    } else {
      const rows = await VideoWorkbench.preferences.get("workspace." + screen, []);
      if (editing) {
        content = `<form id="workspaceEditor"><label>名稱<input id="workspaceName" required maxlength="120" value="${esc(editing.name)}"></label><label>${screen === "skills" ? "技能指令" : "流程步驟（每行一個提示詞，依順序帶入生成）"}<textarea id="workspacePrompt" required>${esc(screen === "skills" ? editing.prompt : (editing.steps || []).join("\n"))}</textarea></label><fieldset><legend>生成方式</legend>${modes.map(([value, label]) => `<label><input type="radio" name="workspaceMode" value="${value}" ${editing.mode === value ? "checked" : ""}>${label}</label>`).join("")}</fieldset><div class="workspace-actions"><button type="submit" class="primary">儲存</button><button type="button" data-editor-cancel>取消</button></div></form>`;
      } else
        content = `<div class="workspace-actions"><button data-workspace-create class="primary">建立${titles[screen]}</button></div><div class="workspace-list">${rows.length ? rows.map((row) => `<article class="workspace-card"><h2>${esc(row.name)}</h2><p>${esc(screen === "skills" ? row.prompt : (row.steps || []).join(" → "))}</p><div class="workspace-actions"><button data-row-use="${row.id}">套用到生成</button><button data-row-edit="${row.id}">編輯</button><button data-row-delete="${row.id}">刪除</button></div></article>`).join("") : "<p>尚未建立。儲存後可重複套用，生成前仍可修改。</p>"}</div>`;
    }
    if (current !== screen) return;
    host.innerHTML = VideoWorkbench.sanitize(
      `<div class="workspace-page"><h1>${titles[screen]}</h1>${content}<hr><div class="workspace-actions"><button data-backup-export>匯出全部資料備份</button><label>匯入備份<input type="file" id="workspaceImport" accept="application/json,.json"></label></div><p class="muted">匯入會加入尚未存在的項目，保留目前已有資料。</p></div>`,
    );
  }
  async function getAsset(id) {
    return (await VideoWorkbench.assets.list()).find((a) => a.id === id);
  }
  async function applyRow(row) {
    if (current === "skills") {
      const d = VideoWorkbench.generator.getDraft();
      d.mode = row.mode;
      d.skill = row.name;
      d.data[row.mode] = (d.data[row.mode] || "") + "\n" + row.prompt;
      VideoWorkbench.generator.setDraft(d);
      VideoWorkbench.router.activate("generator");
    } else {
      // Show the step first; remembering it is a server round trip (PUT /state, card M2).
      applyStep(row, 0);
      await VideoWorkbench.preferences.set("workflow.active", { ...row, step: 0 });
    }
  }
  function applyStep(row, index) {
    const d = VideoWorkbench.generator.getDraft();
    d.mode = row.mode;
    d.data[row.mode] = row.steps[index];
    VideoWorkbench.generator.setDraft(d);
    VideoWorkbench.router.activate("generator");
    $("activeWorkflow")?.remove();
    const bar = document.createElement("div");
    bar.id = "activeWorkflow";
    bar.className = "workspace-card";
    bar.textContent = `${row.name}：步驟 ${index + 1}/${row.steps.length}。檢查結果後可繼續下一步。 `;
    const next = document.createElement("button");
    next.textContent = index + 1 < row.steps.length ? "下一步" : "完成流程";
    next.onclick = async () => {
      if (index + 1 < row.steps.length) {
        applyStep(row, index + 1);
        await VideoWorkbench.preferences.set("workflow.active", {
          ...row,
          step: index + 1,
        });
      } else {
        bar.remove();
        await VideoWorkbench.preferences.set("workflow.active", null);
      }
    };
    bar.append(next);
    $("generatorView").prepend(bar);
  }
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("#workspaceArea button");
    if (!b) return;
    try {
      if (b.dataset.kind) {
        kind = b.dataset.kind;
        await render();
      } else if (b.hasAttribute("data-refresh")) await render();
      else if (b.hasAttribute("data-backup-export"))
        VideoWorkbench.download(
          "awarewave-video-backup.json",
          await VideoWorkbench.backup.export(),
        );
      else if (b.hasAttribute("data-export-jobs"))
        VideoWorkbench.download(
          "awarewave-video-jobs.json",
          await VideoWorkbench.generations.list(),
        );
      else if (b.dataset.assetUse) {
        const a = await getAsset(b.dataset.assetUse),
          d = VideoWorkbench.generator.getDraft(),
          k = VideoWorkbench.mediaKind(a);
        d.mode = k === "image" ? "image" : "reference";
        d.refs[d.mode][
          k === "image" ? "images" : k === "video" ? "videos" : "audios"
        ] = [a];
        VideoWorkbench.generator.setDraft(d);
        VideoWorkbench.router.activate("generator");
      } else if (b.dataset.assetRemoveBg) {
        const a = await getAsset(b.dataset.assetRemoveBg);
        if (a) await VideoWorkbench.removeBackground(a);
      } else if (b.dataset.assetDownload) {
        const a = await getAsset(b.dataset.assetDownload),
          res = await fetch(VideoWorkbench.safeUrl(a.url));
        if (!res.ok) throw Error("素材下載失敗");
        VideoWorkbench.download(a.name, await res.blob());
      } else if (b.dataset.assetRename) {
        const a = await getAsset(b.dataset.assetRename),
          name = prompt("素材名稱", a.name);
        if (name?.trim()) {
          if (a.kind === "character") {
            const c = (await VideoWorkbench.characters.list()).find(
              (c) => c.id === a.id,
            );
            await VideoWorkbench.characters.save({ ...c, name: name.trim() });
          } else await VideoWorkbench.assets.save({ ...a, name: name.trim() });
          await render();
        }
      } else if (b.dataset.assetDelete) {
        if (confirm("從素材庫移除此素材？已加入專案的參考圖仍保留。")) {
          await VideoWorkbench.assets.remove(b.dataset.assetDelete);
          await render();
        }
      } else if (b.dataset.jobOpen) {
        const cached = (await VideoWorkbench.generations.list()).find((j) => j.id === b.dataset.jobOpen);
        const job = cached && await VideoWorkbench.generations.refresh(cached);
        if (job) VideoWorkbench.showJob(job);
      } else if (b.dataset.jobCheck) {
        const cached = (await VideoWorkbench.generations.list()).find((j) => j.id === b.dataset.jobCheck);
        b.disabled = true;
        try { VideoWorkbench.showJob(await VideoWorkbench.generations.refresh(cached)); }
        finally { b.disabled = false; }
      } else if (b.dataset.jobRetry) {
        const j = (await VideoWorkbench.generations.list()).find(
          (j) => j.id === b.dataset.jobRetry,
        );
        b.disabled = true;
        try { VideoWorkbench.showJob(await VideoWorkbench.generations.retry(j)); }
        finally { b.disabled = false; }
      } else if (b.dataset.jobDraft) {
        const j = (await VideoWorkbench.generations.list()).find((j) => j.id === b.dataset.jobDraft);
        await VideoWorkbench.generator.import({ intent: "restore-job", job: j });
      } else if (b.hasAttribute("data-workspace-create")) {
        editing = {
          id: crypto.randomUUID(),
          name: "",
          prompt: "",
          steps: [],
          mode: "image",
        };
        await render();
      } else if (b.hasAttribute("data-editor-cancel")) {
        editing = null;
        await render();
      } else if (b.dataset.rowEdit || b.dataset.rowUse || b.dataset.rowDelete) {
        const rows = await VideoWorkbench.preferences.get("workspace." + current, []),
          id = b.dataset.rowEdit || b.dataset.rowUse || b.dataset.rowDelete,
          row = rows.find((r) => r.id === id);
        if (b.dataset.rowEdit) {
          editing = structuredClone(row);
          await render();
        } else if (b.dataset.rowUse) await applyRow(row);
        else if (confirm("刪除此項目？")) {
          await VideoWorkbench.preferences.set(
            "workspace." + current,
            rows.filter((r) => r.id !== id),
          );
          await render();
        }
      }
    } catch (e) {
      VideoWorkbench.reportError(e);
    }
  });
  document.addEventListener("submit", async (e) => {
    if (e.target.id !== "workspaceEditor") return;
    e.preventDefault();
    try {
      const row = {
          ...editing,
          name: $("workspaceName").value.trim(),
          mode:
            e.target.querySelector("[name=workspaceMode]:checked")?.value ||
            "image",
        },
        value = $("workspacePrompt").value.trim();
      if (!row.name || !value) throw Error("請填寫名稱及內容");
      current === "skills"
        ? (row.prompt = value)
        : (row.steps = value
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean));
      const rows = await VideoWorkbench.preferences.get("workspace." + current, []),
        i = rows.findIndex((r) => r.id === row.id);
      i < 0 ? rows.push(row) : rows.splice(i, 1, row);
      await VideoWorkbench.preferences.set("workspace." + current, rows);
      editing = null;
      await render();
    } catch (e) {
      VideoWorkbench.reportError(e);
    }
  });
  document.addEventListener("change", async (e) => {
    try {
      if (e.target.id === "workspaceUpload") {
        for (const f of e.target.files) await VideoWorkbench.uploadAsset(f);
        await render();
      } else if (e.target.id === "workspaceImport") {
        await VideoWorkbench.backup.import(
          JSON.parse(await e.target.files[0].text()),
        );
        await render();
      }
    } catch (e) {
      VideoWorkbench.reportError(e);
    }
  });
  document.addEventListener("input", (e) => {
    if (e.target.id === "workspaceSearch") {
      search = e.target.value;
      const cursor = e.target.selectionStart;
      render().then(() => {
        $("workspaceSearch").focus();
        $("workspaceSearch").setSelectionRange(cursor, cursor);
      });
    }
  });
  VideoWorkbench.workspaces = {
    open: async (name) => {
      current = name;
      editing = null;
      search = "";
      await render();
    },
  };
})();
