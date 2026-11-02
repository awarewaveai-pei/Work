(function () {
  SeedStar.speak = (text) => {
    if (!("speechSynthesis" in window))
      throw Error("此瀏覽器不支援系統語音試聽");
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "zh-TW";
    speechSynthesis.speak(u);
  };
  SeedStar.notify = (message) => {
    const box = document.createElement("div");
    box.className = "service-error";
    box.setAttribute("role", "status");
    box.textContent = message;
    document.body.append(box);
    setTimeout(() => box.remove(), 3000);
  };
  const escape = (s) =>
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
  const kind = (a) =>
    a.kind === "character" ? "image" : a.kind || a.type?.split("/")[0];
  SeedStar.mediaKind = kind;
  // Background removal (backend/bg-remove.cjs): the price comes from /capabilities (generation-policy.cjs toolCosts)
  // and is on the button before the click. The result is saved as a new library asset by showJob (jobs-view.js).
  let toolCosts;
  SeedStar.removeBgLabel = async () => {
    toolCosts ||= SeedStar.capabilities?.toolCosts || (await SeedStar.request("/capabilities", undefined, "GET").catch(() => null))?.toolCosts;
    const cost = toolCosts?.removeBackground;
    return Number.isFinite(cost) ? "去背 · 約 US$" + cost : null;
  };
  SeedStar.removeBackground = async (asset) => {
    const job = await SeedStar.generations.create({ type: "image", operation: "remove-bg", prompt: "去背", references: { src: { id: asset.id, url: asset.url } } });
    SeedStar.showJob(job);
    return job;
  };
  SeedStar.uploadAsset = async (file) => {
    const videoTypes = { mov: 'video/quicktime', mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm' };
    const extension = String(file.name || '').split('.').at(-1).toLowerCase();
    const type = /^(image|video|audio)\//.test(file.type) ? file.type : Object.hasOwn(videoTypes, extension) ? videoTypes[extension] : file.type;
    if (!/^(image|video|audio)\//.test(type))
      throw Error("請選擇圖片、影片或音訊");
    const data = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
    const normalizedData = `data:${type};base64,${String(data).slice(String(data).indexOf(',') + 1)}`;
    const asset = await SeedStar.request("/uploads", { name: file.name, data: normalizedData });
    return SeedStar.assets.save({
      ...asset,
      createdAt: new Date().toISOString(),
    });
  };
  SeedStar.download = (name, data, type = "application/json") => {
    const blob =
        data instanceof Blob
          ? data
          : new Blob(
              [typeof data === "string" ? data : JSON.stringify(data, null, 2)],
              { type },
            ),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  };
  SeedStar.pickAssets = ({
    kind: filter = "image",
    multiple = false,
    limit = 1,
    sources = false,
    immediate = false,
    parityControls = false,
  } = {}) =>
    new Promise((resolve) => {
      const panel = document.createElement("section");
      panel.className = "asset-workspace";
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-label", "選擇素材");
      let items = [],
        selected = new Set(),
        query = "", source = "assets", durationFilter = "all";
      panel.innerHTML = SeedStar.sanitize(
        '<header><h2>選擇素材</h2><button data-picker-close>返回</button></header><div class="asset-controls"><input data-picker-search placeholder="搜尋素材名稱" aria-label="搜尋素材"><label class="asset-upload-btn">上傳素材<input data-picker-upload type="file" multiple></label></div><div data-picker-items class="asset-list"></div><footer><span data-picker-count>已選 0 個</span><button data-picker-confirm>加入選取素材</button></footer>',
      );
      document.body.append(panel);
      if (parityControls) {
        const clear = document.createElement("button");
        clear.dataset.pickerClear = "";
        clear.textContent = "清除選取";
        panel.querySelector("footer").prepend(clear);
      }
      if (immediate) panel.querySelector("footer").hidden = true;
      if (sources && filter === "image") {
        const tabs = document.createElement("div");
        tabs.className = "chips";
        tabs.setAttribute("role", "tablist");
        tabs.setAttribute("aria-label", "素材來源");
        tabs.innerHTML = SeedStar.sanitize([["assets", "我的素材"], ["characters", "我的角色"], ["platform", "平台角色庫"], ["licensed", "授權角色"]].map(([key, label]) => `<button role="tab" aria-selected="${key === source}" data-picker-source="${key}">${label}</button>`).join(""));
        panel.querySelector("header").after(tabs);
      }
      if (filter === "video") {
        const filters = document.createElement("div");
        filters.className = "chips";
        filters.setAttribute("aria-label", "依長度篩選");
        filters.innerHTML = SeedStar.sanitize([["all", "全部長度"], ["10", "10 秒內"], ["15", "15 秒內"], ["30", "30 秒內"], ["long", "30 秒以上"]].map(([key, label]) => `<button data-picker-duration="${key}" aria-pressed="${key === durationFilter}">${label}</button>`).join(""));
        panel.querySelector(".asset-controls").after(filters);
      }
      panel.querySelector("[data-picker-upload]").accept =
        filter === "all" ? ".mov,.mp4,.m4v,.webm,image/*,video/*,audio/*" : filter === 'video' ? '.mov,.mp4,.m4v,.webm,video/*' : filter + "/*";
      const render = () => {
        const shown = items.filter(
          (a) =>
            (filter === "all" || kind(a) === filter) &&
            (!sources || filter !== "image" || (a.pickerSource || "assets") === source) &&
            (durationFilter === "all" || Number.isFinite(a.duration) && (durationFilter === "long" ? a.duration > 30 : a.duration <= Number(durationFilter))) &&
            String(a.name || "").toLowerCase().includes(query),
        );
        panel.querySelector("[data-picker-items]").innerHTML =
          SeedStar.sanitize(
            shown.length
              ? shown
                  .map(
                    (a) =>
                      `<article><button class="asset-choice ${selected.has(a.id) ? "selected" : ""}" data-picker-id="${escape(a.id)}" aria-pressed="${selected.has(a.id)}">${kind(a) === "image" ? `<img src="${escape(SeedStar.safeUrl(a.url))}" alt="">` : kind(a) === "video" ? "▣" : "♫"}<strong>${escape(a.name)}</strong></button><button data-picker-preview="${escape(a.id)}">預覽</button></article>`,
                  )
                  .join("")
              : `<p>${["platform", "licensed"].includes(source) ? "尚未接入此角色來源。外部平台的角色與授權不會轉入本機工作台。" : "目前沒有符合條件的素材，可直接上傳；影片長度未知時只會列在全部長度。"}</p>`,
          );
        panel.querySelector("[data-picker-count]").textContent =
          "已選 " + selected.size + " / " + limit;
        panel.querySelector("[data-picker-confirm]").disabled =
          selected.size === 0;
        const clear = panel.querySelector("[data-picker-clear]");
        if (clear) clear.disabled = selected.size === 0;
        panel.querySelector(".asset-controls").hidden = sources && filter === "image" && source !== "assets";
        panel.querySelectorAll("[data-picker-source]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.pickerSource === source)));
        panel.querySelectorAll("[data-picker-duration]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.pickerDuration === durationFilter)));
      };
      const refresh = async () => {
        items = await SeedStar.assets.list();
        if (sources && filter === "image") {
          const characters = await SeedStar.characters.list();
          items.push(...characters.filter((c) => !c.id.startsWith("catalog-") && SeedStar.safeUrl(c.image || "")).map((c) => ({ id: "character:" + c.id, name: c.name, url: c.image, kind: "image", type: "image/", pickerSource: "characters" })));
        }
        render();
      };
      const done = (value) => {
        document.removeEventListener("keydown", onEscape);
        panel.remove();
        resolve(value);
      };
      const onEscape = (event) => {
        if (event.key !== "Escape" || !panel.isConnected) return;
        const preview = panel.querySelector("[data-picker-preview-panel]");
        if (preview) preview.remove(); else done([]);
      };
      document.addEventListener("keydown", onEscape);
      panel.onclick = async (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        if (b.hasAttribute("data-picker-close")) done([]);
        else if (b.hasAttribute("data-picker-clear")) { selected.clear(); render(); }
        else if (b.dataset.pickerSource) { source = b.dataset.pickerSource; query = ""; panel.querySelector("[data-picker-search]").value = ""; render(); }
        else if (b.dataset.pickerDuration) { durationFilter = b.dataset.pickerDuration; render(); }
        else if (b.hasAttribute("data-picker-preview-close")) panel.querySelector("[data-picker-preview-panel]")?.remove();
        else if (b.dataset.pickerRemoveBg) {
          const asset = items.find((a) => a.id === b.dataset.pickerRemoveBg);
          b.disabled = true;
          if (asset) SeedStar.removeBackground(asset).then(() => refresh(), SeedStar.reportError).finally(() => { b.disabled = false; });
        }
        else if (b.dataset.pickerPreview) {
          const asset = items.find((a) => a.id === b.dataset.pickerPreview);
          if (!asset) return;
          panel.querySelector("[data-picker-preview-panel]")?.remove();
          const preview = document.createElement("section");
          preview.dataset.pickerPreviewPanel = "";
          preview.className = "picker-preview";
          const removeBg = kind(asset) === "image" ? await SeedStar.removeBgLabel() : null;
          if (!panel.isConnected) return;
          const url = escape(SeedStar.safeUrl(asset.url)), previewSrc = escape(SeedStar.safeUrl(asset.previewUrl || asset.url));
          preview.innerHTML = SeedStar.sanitize(`<button data-picker-preview-close>返回素材選擇</button>${parityControls && url ? `<a href="${url}" download="${escape(asset.name)}" target="_blank" rel="noopener noreferrer">下載／開新分頁</a>` : ""}${removeBg ? `<button data-picker-remove-bg="${escape(asset.id)}">${escape(removeBg)}</button>` : ""}<h3>${escape(asset.name)}</h3>${kind(asset) === "image" ? `<img src="${url}" alt="${escape(asset.name)}">` : kind(asset) === "video" ? `<video src="${previewSrc}" controls></video>` : `<audio src="${previewSrc}" controls></audio>`}`);
          panel.append(preview);
        }
        else if (b.hasAttribute("data-picker-confirm"))
          done(items.filter((a) => selected.has(a.id)));
        else if (b.dataset.pickerId) {
          const id = b.dataset.pickerId;
          if (immediate) { done(items.filter((a) => a.id === id)); return; }
          if (selected.has(id)) selected.delete(id);
          else {
            if (!multiple) selected.clear();
            if (selected.size < limit) selected.add(id);
          }
          render();
        }
      };
      panel.querySelector("[data-picker-search]").oninput = (e) => {
        query = e.target.value.toLowerCase();
        render();
      };
      panel.querySelector("[data-picker-upload]").onchange = async (e) => {
        const input = e.target;
        input.disabled = true;
        try {
          for (const file of input.files) {
            const a = await SeedStar.uploadAsset(file);
            if (immediate && (filter === "all" || kind(a) === filter)) { done([a]); return; }
            if (
              (filter === "all" || kind(a) === filter) &&
              selected.size < limit
            ) {
              if (!multiple) selected.clear();
              selected.add(a.id);
            }
          }
          await refresh();
        } catch (e) {
          SeedStar.reportError(e);
        } finally {
          input.disabled = false;
          input.value = "";
        }
      };
      refresh().catch(SeedStar.reportError);
    });
})();
