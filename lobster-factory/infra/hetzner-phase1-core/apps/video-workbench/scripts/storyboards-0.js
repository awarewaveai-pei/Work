(() => {
  "use strict";

  const BUILT = [];
  const USER_SCREENSHOT_PROMPT_SAMPLE = {
    image:
      "A professional 6-panel cinematic storyboard sheet arranged in a clean 2x3 grid with thin borders and corner cut labels.\nSubject: 30-meter bipedal combat mech with hydraulic stabilizer legs equipped with quad-barrel 120mm rotary cannon and shoulder missile pods.\nEnvironment: Violent radioactive dust storm in a rocky alien canyon.\nNarrative Conflict: establishing a perimeter defense against swarming subterranean bio-drones.\nLighting & Atmosphere: Infrared green night-vision with IR laser beams. Volumetric fog, authentic film texture.\nCamera Direction: Varied perspectives across panels including wide establishing, low-angle tracking, shallow depth of field close-ups, and dramatic hero climax.\nConsistency: Absolute character facial identity, costume styling, and environmental continuity preserved across all 6 panels.\nProfessional film pitch previs sheet, 8k resolution, 35mm cinematic stills.",
    video:
      "[TARGET DURATION: 15s | 24FPS]\nTarget Models: Seedance 2.0 / Kling 3.0 / Runway Gen-3 / Minimax\nVisual Authority: Use the uploaded 6-panel storyboard grid as the sole continuous visual reference.\n\nScene: [截圖中的中文場景名稱未能完整辨識]\nStyle & Atmosphere: Infrared green night-vision with IR laser beams\n\nShot Progression & Pacing (15 Seconds Total):\n• Cut 1 [0:00-0:02 | 2s] (WS): Establishing shot of violent radioactive dust storm in a rocky alien canyon. Atmosphere and setting scale established. (Helmet-mounted bodycam POV wide establishing view)\n\n[後續 Cut 在使用者提供的截圖中未完整顯示，此處保留缺漏。]",
  };
  const $ = (id) => document.getElementById(id);
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
  let loadedState = {};
  try {
    loadedState = JSON.parse(
      document.getElementById("aw-storyboard-state").textContent || "{}",
    );
  } catch {}
  let items = Array.isArray(loadedState.cards) ? loadedState.cards : [...BUILT],
    sel = null,
    filter = "全部分類",
    favOnly = false,
    detailTab = "shots";
  let displayLanguage = "zh";
  let examplePromptVisible = false;
  const PROMPT_EDIT_KEY = "aw_storyboard_prompt_edits_v3";
  let promptEdits = {};
  try {
    promptEdits = JSON.parse(SeedStar.storage.getItem(PROMPT_EDIT_KEY) || "{}");
  } catch {}
  if (!Array.isArray(loadedState.cards))
    items = items.map((r) => ({
      ...r,
      ...(promptEdits[String(r.id || r.title)] || {}),
    }));
  let favorites = [];
  try {
    favorites = JSON.parse(SeedStar.storage.getItem("aw_sb_favorites") || "[]");
  } catch {}
  const idOf = (r) => String(r.id || r.title);
  const isFav = (r) => favorites.includes(idOf(r));
  function toast(s) {
    $("toast").textContent = s;
    $("toast").hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => ($("toast").hidden = true), 2500);
  }
  function categories() {
    let c = ["全部分類", "商業廣告", "人文生活"];
    $("categories").innerHTML = SeedStar.sanitize(
      c
        .map(
          (k) =>
            `<button type="button" class="tag ${filter === k ? "active" : ""}" data-cat="${escape(k)}">${escape(k)}</button>`,
        )
        .join(""),
    );
  }
  function render() {
    categories();
    let q = $("q").value.trim().toLowerCase();
    let g = $("grid").value;
    let arr = items.filter(
      (r) =>
        (filter === "全部分類" || r.category === filter) &&
        (g === "all" ||
          (g === "other"
            ? ![
                "4-Grid",
                "6-Grid",
                "8-Grid",
                "9-Grid",
                "12-Grid",
                "16-Grid",
              ].includes(r.type)
            : r.type === g)) &&
        (!favOnly || isFav(r)) &&
        [
          r.title,
          r.category,
          r.type,
          ...(r.tags || []),
          ...(r.shots || []).map((x) => x.action),
          r.imagePrompt || "",
          r.videoPrompt || "",
          r.translations?.zh?.imagePrompt || "",
          r.translations?.zh?.videoPrompt || "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(q),
    );
    let sort = $("sort").value;
    if (sort === "views") arr.sort((a, b) => (b.views || 0) - (a.views || 0));
    if (sort === "name")
      arr.sort((a, b) => a.title.localeCompare(b.title, "zh-Hant"));
    $("total").textContent =
      `${items.filter((x) => ["商業廣告", "人文生活"].includes(x.category)).length} 張`;
    $("sourceStats").textContent =
      `商業廣告：${items.filter((x) => x.category === "商業廣告").length} 張，人文生活：${items.filter((x) => x.category === "人文生活").length} 張`;
    $("num").textContent = `顯示 ${arr.length} 張`;
    $("empty").hidden = arr.length > 0;
    $("gallery").innerHTML = SeedStar.sanitize(
      arr
        .map(
          (r) =>
            `<button type="button" class="card" data-id="${escape(idOf(r))}"><div class="thumb"><img loading="lazy" src="${escape(r.image)}" alt="${escape(r.title)}"><span class="type">${escape(r.type)}</span></div><div class="body"><strong>${escape(r.title)}</strong><div class="category">${escape(r.category || "未分類")}</div><span class="prompt-coverage">${r.imagePrompt || r.videoPrompt ? "生圖與運鏡 Prompt 已收錄" : "原始提示詞未取得"}</span><div class="meta">${(
              r.tags || []
            )
              .slice(0, 2)
              .map((x) => `<span class="pill">#${escape(x)}</span>`)
              .join(
                "",
              )}<span class="spacer"></span><span class="views">◉ ${escape(r.views ?? "—")}</span><span class="time">${escape(r.duration || "")} · ${escape(r.style || "")}</span></div></div></button>`,
        )
        .join(""),
    );
    $("favoriteBtn").textContent = favOnly ? "★ 我的最愛" : "☆ 我的最愛";
  }
  function spec(label, value) {
    return `<div>${label}<br><strong>${escape(value || "未取得")}</strong></div>`;
  }
  function normalizedPrompt(r, typ) {
    let aliases =
      typ === "image"
        ? [
            "imagePrompt",
            "image_prompt",
            "imageGenerationPrompt",
            "image_generation_prompt",
            "image_generation",
            "prompt_image",
          ]
        : [
            "videoPrompt",
            "video_prompt",
            "motionPrompt",
            "videoMotionPrompt",
            "video_motion_prompt",
            "prompt_video",
          ];
    for (const k of aliases) {
      let v = r[k];
      if (typeof v === "string" && v.trim()) return v;
    }
    if (r.prompts && typeof r.prompts === "object") {
      for (const k of aliases) {
        let v = r.prompts[k];
        if (typeof v === "string" && v.trim()) return v;
      }
    }
    return "";
  }
  function setPromptText(id, text, isSample) {
    let e = $(id);
    e.textContent =
      text ||
      "尚未取得這張作品的官方原始" +
        (id === "imagePromptText" ? "生圖" : "運鏡") +
        "提示詞。";
    e.classList.toggle("missing", !text);
    $(
      id === "imagePromptText"
        ? "imagePromptProvenance"
        : "videoPromptProvenance",
    ).textContent = isSample
      ? "截圖示例（與目前卡片無關；運鏡 Prompt 只包含截圖可見部分）"
      : text
        ? "此文字來自目前卡片中已收錄的資料。"
        : "未提供原始 Prompt；不以自動產生的文字充當 SeedStar 原文。";
  }
  function displayRecord(r) {
    return displayLanguage === "zh" && r.translations?.zh
      ? {
          ...r,
          ...r.translations.zh,
        }
      : r;
  }
  function updatePromptView() {
    if (!sel) return;
    const r = displayRecord(sel);
    let ip = examplePromptVisible
        ? USER_SCREENSHOT_PROMPT_SAMPLE.image
        : normalizedPrompt(r, "image"),
      vp = examplePromptVisible
        ? USER_SCREENSHOT_PROMPT_SAMPLE.video
        : normalizedPrompt(r, "video");
    setPromptText("imagePromptText", ip, examplePromptVisible);
    setPromptText("videoPromptText", vp, examplePromptVisible);
    if (!examplePromptVisible) {
      const provenance =
        displayLanguage === "zh"
          ? sel.translations?.zh?.provenance || "未取得中文翻譯，顯示原文。"
          : "SeedStar 已取得的英文原文。";
      $("imagePromptProvenance").textContent = provenance;
      $("videoPromptProvenance").textContent = provenance;
    }
    $("showPromptSample").textContent = examplePromptVisible
      ? "返回這張分鏡的提示詞"
      : "查看你提供的提示詞截圖範例";
    $("languageZh").setAttribute(
      "aria-pressed",
      String(displayLanguage === "zh"),
    );
    $("languageEn").setAttribute(
      "aria-pressed",
      String(displayLanguage === "en"),
    );
  }
  function changeLanguage(language) {
    displayLanguage = language;
    if (sel) openDetail(sel);
  }
  async function bringToGenerator(target) {
    if (!sel) return;
    try {
      const bridge = SeedStar.generator;
      if (!bridge) {
        toast("請在完整 SeedStar HTML 中使用此功能");
        return;
      }
      const result = await bridge.import({
        target,
        title: sel.title,
        image: sel.largeImage || sel.image,
        imagePrompt: normalizedPrompt(sel, "image"),
        videoPrompt: normalizedPrompt(sel, "video"),
        duration: sel.duration,
      });
      if (result?.ok) close();
      else toast(result?.message || "帶入失敗");
    } catch (e) {
      toast("無法存取生成介面：" + e.message);
    }
  }
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast("已複製文字");
    } catch (e) {
      let ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        toast("已複製文字");
      } catch {
        toast("無法自動複製，請手動選取");
      }
      ta.remove();
    }
  }
  function setDetailTab(tab) {
    detailTab = tab;
    document.querySelectorAll("[data-detail-tab]").forEach((b) => {
      const active = b.dataset.detailTab === tab;
      b.classList.toggle("active", active);
      b.setAttribute("aria-selected", String(active));
    });
    document
      .querySelectorAll("[data-detail-panel]")
      .forEach((p) =>
        p.classList.toggle("active", p.dataset.detailPanel === tab),
      );
  }
  function openDetail(r) {
    sel = r;
    examplePromptVisible = false;
    $("promptEditor").hidden = true;
    $("modalTitle").textContent = r.title;
    $("modalType").textContent = r.type;
    $("largeImage").src = r.largeImage || r.image;
    $("largeImage").alt = r.title;
    $("views").textContent = "◉ " + (r.views ?? "—");
    $("star").textContent = isFav(r) ? "★ 已收藏" : "☆ 收藏";
    $("specs").innerHTML = SeedStar.sanitize(
      [
        spec("格數佈局", r.grid_layout || r.type),
        spec("建議生成片長", r.duration + " · " + (r.style || "")),
        spec("視覺風格", r.category),
        spec("幀率", r.fps),
        spec("瀏覽次數", String(r.views ?? "未取得")),
        spec("標籤", (r.tags || []).map((x) => "#" + x).join(" ")),
      ].join(""),
    );
    $("source").textContent =
      "資料來源：" +
      (r.origin || "未取得") +
      "；來源頁：" +
      (r.sourceUrl || "未取得") +
      "；原始格數標籤：" +
      (r.originalType || r.type);
    let shots = displayRecord(r).shots || [];
    $("shotTable").innerHTML = SeedStar.sanitize(
      shots.length
        ? `<div class="scroll"><table><thead><tr><th>Cut</th><th>類型</th><th>運鏡</th><th>畫面動作與事件</th><th>時間長度</th></tr></thead><tbody>${shots.map((s) => `<tr><td>${escape(s.cut)}</td><td><span class="badge">${escape(s.shot)}</span></td><td>${escape(s.camera)}</td><td>${escape(s.action)}<div class="muted">♪ ${escape(s.sound || "")}</div></td><td>${escape(s.time)}<div class="muted">${escape(s.length || "")}</div></td></tr>`).join("")}</tbody></table></div><p class="warning">上表完整保留此次作品詳情顯示的鏡頭；「-」為來源原值。</p>`
        : '<p class="warning">未取得此作品的鏡頭表。</p>',
    );
    updatePromptView();
    setDetailTab(detailTab);
    $("modal").hidden = false;
    document.body.style.overflow = "hidden";
  }
  function close() {
    sel = null;
    $("modal").hidden = true;
    document.body.style.overflow = "";
  }
  function saveFav() {
    try {
      SeedStar.storage.setItem("aw_sb_favorites", JSON.stringify(favorites));
    } catch {}
  }
  function toggleFav() {
    if (!sel) return;
    let id = idOf(sel);
    favorites = isFav(sel)
      ? favorites.filter((x) => x !== id)
      : [...favorites, id];
    saveFav();
    $("star").textContent = isFav(sel) ? "★ 已收藏" : "☆ 收藏";
    render();
  }
  document
    .querySelectorAll("[data-detail-tab]")
    .forEach((b) => (b.onclick = () => setDetailTab(b.dataset.detailTab)));
  $("bringImage").onclick = () => bringToGenerator("image");
  $("bringReference").onclick = () => bringToGenerator("reference");
  $("languageZh").onclick = () => changeLanguage("zh");
  $("languageEn").onclick = () => changeLanguage("en");
  $("showPromptSample").onclick = () => {
    if (!sel) return;
    examplePromptVisible = !examplePromptVisible;
    updatePromptView();
  };
  $("copyImagePrompt").onclick = () => {
    if (!sel) return;
    let t = examplePromptVisible
      ? USER_SCREENSHOT_PROMPT_SAMPLE.image
      : normalizedPrompt(displayRecord(sel), "image");
    if (t) copyText(t);
    else toast("這張分鏡尚未取得生圖提示詞");
  };
  $("copyVideoPrompt").onclick = () => {
    if (!sel) return;
    let t = examplePromptVisible
      ? USER_SCREENSHOT_PROMPT_SAMPLE.video
      : normalizedPrompt(displayRecord(sel), "video");
    if (t) copyText(t);
    else toast("這張分鏡尚未取得運鏡提示詞");
  };
  $("editPromptBtn").onclick = () => {
    if (!sel) return;
    examplePromptVisible = false;
    updatePromptView();
    $("editImage").value = normalizedPrompt(sel, "image");
    $("editVideo").value = normalizedPrompt(sel, "video");
    $("promptEditor").hidden = !$("promptEditor").hidden;
  };
  $("cancelPromptEdit").onclick = () => {
    $("promptEditor").hidden = true;
  };
  $("savePromptEdit").onclick = () => {
    if (!sel) return;
    sel.imagePrompt = $("editImage").value.trim();
    sel.videoPrompt = $("editVideo").value.trim();
    delete sel.translations;
    displayLanguage = "en";
    promptEdits[idOf(sel)] = {
      imagePrompt: sel.imagePrompt,
      videoPrompt: sel.videoPrompt,
    };
    try {
      SeedStar.storage.setItem(PROMPT_EDIT_KEY, JSON.stringify(promptEdits));
    } catch {}
    $("promptEditor").hidden = true;
    updatePromptView();
    render();
    toast("已更新，請再按「儲存完整離線 HTML」永久保存");
  };
  $("categories").onclick = (e) => {
    let b = e.target.closest("[data-cat]");
    if (b) {
      filter = b.dataset.cat;
      render();
    }
  };
  $("gallery").onclick = (e) => {
    let b = e.target.closest("[data-id]");
    if (b) {
      let r = items.find((x) => idOf(x) === b.dataset.id);
      if (r) openDetail(r);
    }
  };
  $("q").oninput = render;
  $("sort").onchange = render;
  $("grid").onchange = render;
  $("favoriteBtn").onclick = () => {
    favOnly = !favOnly;
    render();
  };
  $("star").onclick = toggleFav;
  $("close").onclick = close;
  $("modal").onclick = (e) => {
    if (e.target === $("modal")) close();
  };
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("modal").hidden) close();
  });
  function download(v, name) {
    const blob = new Blob([v], {
        type: "application/json;charset=utf-8",
      }),
      u = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = u;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 1500);
  }
  $("exportBtn").onclick = () =>
    download(
      JSON.stringify(
        {
          source: "SeedStar Cloud Browser capture, 2026-10-29",
          cards: items,
        },
        null,
        2,
      ),
      "storyboards_embedded.json",
    );
  $("importBtn").onclick = () => $("importFile").click();
  $("importFile").onchange = async (e) => {
    let f = e.target.files[0];
    if (!f) return;
    try {
      let v = JSON.parse(await f.text()),
        rows = Array.isArray(v) ? v : v.cards || v.storyboards || v.items || [];
      if (!Array.isArray(rows)) throw new Error("不是 cards 陣列");
      let n = 0;
      for (let r of rows) {
        if (!r || typeof r !== "object" || !r.title) continue;
        if (!["商業廣告", "人文生活"].includes(r.category)) continue;
        let exists = items.find(
          (o) => idOf(o) === idOf(r) || o.title === r.title,
        );
        if (exists) {
          Object.assign(exists, r);
          n++;
          continue;
        }
        items.push({
          ...r,
          id: r.id || "import-" + Date.now() + "-" + n,
        });
        n++;
      }
      toast("已加入 " + n + " 張分鏡");
      render();
    } catch (err) {
      toast("匯入失敗：" + err.message);
    }
    e.target.value = "";
  };
  function escapeState(s) {
    return JSON.stringify(s)
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e")
      .replace(/&/g, "\\u0026");
  }
  function saveOfflineHtml() {
    download(
      JSON.stringify(
        {
          cards: items,
          favorites,
          promptEdits,
        },
        null,
        2,
      ),
      "seedstar-storyboards.json",
      "application/json",
    );
  }
  $("saveHtmlBtn").onclick = saveOfflineHtml;
  $("pickImageBtn").onclick = () => $("pickImage").click();
  $("pickImage").onchange = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f || !sel) return;
    if (!/^image\/(?:png|jpeg|webp|gif)$/.test(f.type)) {
      toast("請選擇 PNG、JPG、WebP 或 GIF");
      return;
    }
    if (f.size > 12 * 1024 * 1024) {
      toast("圖片超過 12 MB，請先壓縮");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      sel.image = String(reader.result);
      sel.largeImage = String(reader.result);
      $("largeImage").src = sel.image;
      render();
      toast("圖片已內嵌，請儲存完整離線 HTML");
    };
    reader.readAsDataURL(f);
    e.target.value = "";
  };
  render();
})();
