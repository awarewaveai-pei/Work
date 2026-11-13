// 圖片局部編輯器 (tool "region"), loaded when the tool opens (tools-0.js TOOLS[].scripts). The image fills the canvas; each
// box carries its number and an × on the box; drawing a box or double-clicking one opens its instruction next to it; the
// side panel lists the boxes as rows, then 整體指令, the source ratio, the model and resolution buttons and the price.
// Models, sizes and prices come only from /capabilities imageEdit (backend/image-edit.cjs). Draft keys kept from before
// 2026-11-13: selection.regions [{x,y,w,h,prompt}] (fractions of the image), values.regionPrompt, values.regionQuality;
// added: values.regionModel.
const REGION_MAX = 8, REGION_PROMPT_MAX = 5000;
// Not saved: which box is selected and whose instruction popover is open (-1 = none).
const regionUi = { selected: -1, open: -1 };
const regionList = () => (selection.regions ||= []);
const regionCaps = () => VideoWorkbench.capabilities?.imageEdit;
// The chosen row: the saved one while it can run here, else the server's default (same rule as VideoWorkbenchProviders).
function regionModel() {
  const c = regionCaps(), rows = c?.models || [];
  return rows.find((m) => m.id === values.regionModel && m.available) || rows.find((m) => m.id === c?.defaultModel) || null;
}
// A size the row cannot make (an old draft's 2K on a 1K-only model) shows and runs as the row's default.
const regionSize = (m = regionModel()) => (m ? (m.sizes.includes(values.regionQuality) ? values.regionQuality : m.defaultSize) : "");
const regionGlobal = () => String(values.regionPrompt || "").trim();
// Boxes without an instruction while there is no 整體指令 to stand in for them.
const regionMissing = () => (regionGlobal() ? 0 : regionList().filter((a) => !String(a.prompt || "").trim()).length);
function regionInstructionsPrompt() {
  const global = regionGlobal(), areas = regionList();
  if (!areas.length) {
    if (!global) throw Error("請框選區域並填寫指令，或填寫整體指令");
    return global;
  }
  if (regionMissing()) throw Error(`還有 ${regionMissing()} 個區域沒有填寫指令，請補上或填寫整體指令`);
  return [global, ...areas.map((area, i) => `區域 ${i + 1}（圖片左上角起算，x=${Math.round(area.x * 100)}%、y=${Math.round(area.y * 100)}%、寬=${Math.round(area.w * 100)}%、高=${Math.round(area.h * 100)}%）：${String(area.prompt || "").trim() || global}`), "只修改選取區域，保留其他內容。"].filter(Boolean).join("\n");
}
function regionScreen() {
  const image = files.image, areas = regionList(), c = regionCaps(), m = regionModel(), size = regionSize(m);
  // Before /capabilities arrives: one load, then draw again (a server without imageEdit shows no model, no loop).
  if (!VideoWorkbench.capabilities) VideoWorkbench.loadCapabilities?.().then(() => tool === "region" && VideoWorkbench.capabilities && render(), () => {});
  const canvas = image
    ? `<div class="stage region-stage" id="stage"><div class="region-board" id="regionBoard"><img class="region-image" src="${esc(image.url)}" alt="已選圖片" draggable="false"></div><p class="note">在圖片上拖曳框出要修改的位置；雙擊框可修改指令。最多 ${REGION_MAX} 個區域。</p></div>`
    : stage("▧", "先選一張圖片，接著在畫面上拖曳框出要修改的位置", "", "image");
  const picture = image
    ? `<div class="region-thumb"><img src="${esc(image.url)}" alt=""><span class="region-thumb-name">${esc(image.name || "已選圖片")}</span>${btn("換一張", "upload:image", "small")}${btn("素材庫", "library:image", "small")}</div>`
    : chooser("image");
  const models = (c?.models || []).map((r) => {
    const price = window.VideoWorkbenchPrices?.text("video.image", VideoWorkbench.capabilities, r.id, r.sizes.includes(size) ? size : r.defaultSize) || "";
    return `<button type="button" class="chip ${r.id === m?.id ? "selected" : ""}" data-act="set:regionModel:${esc(r.id)}" aria-pressed="${r.id === m?.id}"${r.available ? "" : " disabled"}>${esc(r.label)}${price ? " · " + esc(price) : ""}${r.available ? "" : "（未設定）"}</button>`;
  }).join("");
  const sizes = (m?.sizes || []).map((s) => `<button type="button" class="chip ${s === size ? "selected" : ""}" data-act="set:regionQuality:${esc(s)}" aria-pressed="${s === size}">${esc(s)}</button>`).join("");
  return `<div class="two-col region-layout">${canvas}${side(`<h3>圖片 <span class="region-required">*</span> <span class="muted region-of">${image ? 1 : 0}/1</span></h3>${picture}`
    + `<label>修改區域 <span class="muted region-of" id="regionCount">${areas.length}/${REGION_MAX}</span></label><div id="regionRows"></div>`
    + `${label("整體指令（選填）")}${ta("regionPrompt", "套用到每個區域的補充指令；不框選時，描述整張圖要怎麼改", REGION_PROMPT_MAX)}`
    + `<label>參數 <button type="button" class="btn small region-reset" data-region-reset>重設</button></label><div class="chips"><span class="chip" title="來源圖片比例，輸出保持同一比例">比例 <b id="regionRatio">—</b></span></div>`
    + `${label("模型")}${models ? `<div class="chips" role="group" aria-label="模型">${models}</div>${m ? `<p class="note">${esc(m.note)}</p>` : ""}` : '<p class="note" role="status">載入模型中…</p>'}`
    + `${sizes ? `${label("解析度")}<div class="chips" role="group" aria-label="解析度">${sizes}</div>` : ""}`
    + `<div class="divider"></div><button class="btn primary primary-wide" data-act="submit" data-paid="video.image" data-paid-model="${esc(m?.id || "")}" data-paid-size="${esc(size)}"${m ? "" : " disabled"}>生成區域編輯</button>`
    + `<p class="region-missing" id="regionMissing" role="alert"></p>`)}</div>`;
}
// The rows, the counts and the red missing line (no re-render: typing keeps its focus).
function regionSide() {
  const areas = regionList(), rows = $("#regionRows");
  if (rows) {
    rows.replaceChildren();
    if (!areas.length) rows.innerHTML = '<p class="note">還沒有框選任何區域。在圖片上拖曳即可新增；也可以只填寫整體指令。</p>';
    areas.forEach((area, i) => {
      const row = document.createElement("div");
      row.className = "region-row" + (i === regionUi.selected ? " selected" : "");
      row.dataset.regionRow = i;
      const pill = document.createElement("span"); pill.className = "region-pill"; pill.textContent = i + 1;
      const text = String(area.prompt || "").trim(), summary = document.createElement("span");
      summary.className = "region-summary" + (text ? "" : " muted"); summary.textContent = text || "尚未填寫指令";
      const remove = document.createElement("button");
      remove.type = "button"; remove.className = "btn small region-trash"; remove.dataset.regionRemove = i; remove.textContent = "刪除";
      remove.setAttribute("aria-label", `從清單刪除區域 ${i + 1}`);
      row.append(pill, summary, remove); rows.append(row);
    });
  }
  const count = $("#regionCount"); if (count) count.textContent = `${areas.length}/${REGION_MAX}`;
  const missing = $("#regionMissing"), n = areas.length ? regionMissing() : 0;
  if (missing) { missing.textContent = n ? `還有 ${n} 個區域沒有填寫指令，請補上，或填寫整體指令套用到全部。` : ""; missing.hidden = !n; }
}
// Boxes and the open popover, positioned in % of the image so they follow any size.
function regionPaint(focus = false) {
  const board = $("#regionBoard");
  if (!board) return;
  board.querySelectorAll(".region-selection, .region-popover").forEach((el) => el.remove());
  const pct = (v) => (v * 100).toFixed(3) + "%";
  regionList().forEach((area, i) => {
    const box = document.createElement("div");
    box.className = "region-selection" + (i === regionUi.selected ? " selected" : "");
    box.dataset.regionIndex = i;
    Object.assign(box.style, { left: pct(area.x), top: pct(area.y), width: pct(area.w), height: pct(area.h) });
    const badge = document.createElement("span"); badge.className = "region-badge"; badge.textContent = i + 1;
    const close = document.createElement("button");
    close.type = "button"; close.className = "region-close"; close.dataset.regionRemove = i; close.textContent = "×";
    close.setAttribute("aria-label", `刪除區域 ${i + 1}`);
    box.append(badge, close);
    if (i === regionUi.selected)
      for (const direction of ["nw", "n", "ne", "e", "se", "s", "sw", "w"]) {
        const handle = document.createElement("i"); handle.dataset.regionHandle = direction; box.append(handle);
      }
    board.append(box);
  });
  const area = regionList()[regionUi.open];
  if (area) {
    const i = regionUi.open, pop = document.createElement("div");
    pop.className = "region-popover"; pop.setAttribute("role", "dialog"); pop.setAttribute("aria-label", `區域 ${i + 1} 指令`);
    // Beside the box: right of it when there is room, else left of it; never below the image's bottom edge.
    if (area.x + area.w <= 0.6) pop.style.left = `calc(${pct(area.x + area.w)} + 10px)`;
    else pop.style.right = `calc(${pct(1 - area.x)} + 10px)`;
    pop.style.top = pct(Math.min(area.y, 0.55));
    const text = document.createElement("textarea");
    text.dataset.regionPrompt = i; text.maxLength = REGION_PROMPT_MAX; text.value = area.prompt || "";
    text.placeholder = `描述你想在區域 ${i + 1} 中修改的內容`;
    const foot = document.createElement("div"); foot.className = "region-popover-foot";
    const counter = document.createElement("span"); counter.className = "muted"; counter.dataset.regionCounter = "";
    counter.textContent = `${text.value.length}/${REGION_PROMPT_MAX}`;
    const done = document.createElement("button"); done.type = "button"; done.className = "btn small primary"; done.dataset.regionDone = ""; done.textContent = "完成";
    foot.append(counter, done); pop.append(text, foot); board.append(pop);
    if (focus) text.focus();
  }
  regionSide();
}
// Once the image is known: the board as large as the canvas allows at the image's own ratio, and its ratio in 參數.
function regionShowRatio(img) {
  const out = $("#regionRatio"), ratios = regionCaps()?.ratios;
  if (!img.naturalWidth) return;
  const r = img.naturalWidth / img.naturalHeight;
  img.parentElement.style.width = `min(100%, calc(74vh * ${r.toFixed(5)}))`;
  if (!out) return;
  const off = (s) => { const [a, b] = s.split(":").map(Number); return Math.abs(Math.log(a / b / r)); };
  out.textContent = ratios?.length ? ratios.reduce((best, s) => (off(s) < off(best) ? s : best)) : `${img.naturalWidth}×${img.naturalHeight}`;
}
function regionRemove(i) {
  regionList().splice(i, 1);
  for (const k of ["selected", "open"]) regionUi[k] = regionUi[k] === i ? -1 : regionUi[k] > i ? regionUi[k] - 1 : regionUi[k];
  regionPaint(); saveDraft();
}
function setupRegionCanvas() {
  const board = $("#regionBoard"), img = board?.querySelector("img");
  if (!img) return;
  if (regionUi.selected >= regionList().length) regionUi.selected = regionUi.open = -1;
  const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
  if (img.complete) regionShowRatio(img); else img.addEventListener("load", () => regionShowRatio(img), { once: true });
  regionPaint();
  board.style.touchAction = "none";
  board.ondblclick = (event) => {
    const box = event.target.closest(".region-selection");
    if (!box) return;
    regionUi.selected = regionUi.open = Number(box.dataset.regionIndex);
    regionPaint(true);
  };
  board.onpointerdown = (event) => {
    if (event.button !== 0 || event.target.closest(".region-popover, .region-close")) return;
    const box = event.target.closest(".region-selection");
    if (!box && event.target !== img) return;
    event.preventDefault();
    const rect = img.getBoundingClientRect(), areas = regionList();
    const point = (ev) => ({ x: clamp((ev.clientX - rect.left) / rect.width), y: clamp((ev.clientY - rect.top) / rect.height) });
    const start = point(event), index = box ? Number(box.dataset.regionIndex) : -1;
    const original = index >= 0 ? { ...areas[index] } : null, handle = event.target.dataset.regionHandle;
    if (index >= 0 && regionUi.selected !== index) { regionUi.selected = index; regionUi.open = -1; regionPaint(); }
    board.setPointerCapture(event.pointerId);
    let created = -1, moved = false;
    const update = (ev) => {
      const { x, y } = point(ev);
      if (!original) {
        if (Math.abs(x - start.x) < .01 || Math.abs(y - start.y) < .01 || (created < 0 && areas.length >= REGION_MAX)) return;
        const area = { x: Math.min(start.x, x), y: Math.min(start.y, y), w: Math.abs(x - start.x), h: Math.abs(y - start.y), prompt: created < 0 ? "" : areas[created].prompt };
        if (created < 0) { created = areas.length; areas.push(area); regionUi.selected = created; regionUi.open = -1; } else areas[created] = area;
      } else if (!handle) {
        if (Math.abs(x - start.x) < .003 && Math.abs(y - start.y) < .003) return;
        Object.assign(areas[index], { x: clamp(original.x + x - start.x, 0, 1 - original.w), y: clamp(original.y + y - start.y, 0, 1 - original.h) });
      } else {
        let left = original.x, top = original.y, right = left + original.w, bottom = top + original.h;
        if (handle.includes("w")) left = clamp(original.x + x - start.x, 0, right - .01);
        if (handle.includes("e")) right = clamp(original.x + original.w + x - start.x, left + .01, 1);
        if (handle.includes("n")) top = clamp(original.y + y - start.y, 0, bottom - .01);
        if (handle.includes("s")) bottom = clamp(original.y + original.h + y - start.y, top + .01, 1);
        Object.assign(areas[index], { x: left, y: top, w: right - left, h: bottom - top });
      }
      moved = true;
      regionPaint();
    };
    const end = (ev, keep) => {
      board.onpointermove = board.onpointerup = board.onpointercancel = null;
      if (keep) update(ev);
      // A new box opens its instruction at once; a click on the bare image closes the open one.
      if (created >= 0) { regionUi.open = created; regionPaint(true); }
      else if (!box && !moved) { regionUi.selected = regionUi.open = -1; regionPaint(); }
      saveDraft();
    };
    board.onpointermove = update;
    board.onpointerup = (ev) => end(ev, true);
    board.onpointercancel = (ev) => end(ev, false);
  };
}
// The job's input: the source as a PNG, the mask (transparent = the boxes; all transparent = no boxes, the whole image),
// and the settings the server prices and runs (backend/image-edit.cjs request() records model + size).
async function regionJobInput() {
  const prompt = regionInstructionsPrompt(), m = regionModel();
  if (!m) throw Error("圖片編輯模型尚未載入，請稍候再試");
  const image = new Image();
  image.src = files.image.url;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  const png = await new Promise((r) => canvas.toBlob(r, "image/png"));
  const reference = await VideoWorkbench.uploadAsset(new File([png], "region-source.png", { type: "image/png" }), { derived: true });
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!regionList().length) ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const r of regionList()) ctx.clearRect(r.x * canvas.width, r.y * canvas.height, r.w * canvas.width, r.h * canvas.height);
  const mask = (await VideoWorkbench.request("/uploads", { name: "region-mask.png", data: canvas.toDataURL("image/png") })).url;
  return {
    prompt, mask, references: { images: [reference] },
    settings: { ...values, imageLayout: "region-preserve", model: m.id, quality: regionSize(m), regionWidth: image.naturalWidth, regionHeight: image.naturalHeight },
  };
}
document.addEventListener("click", (e) => {
  if (tool !== "region") return;
  const remove = e.target.closest("[data-region-remove]");
  if (remove) { e.preventDefault(); return regionRemove(Number(remove.dataset.regionRemove)); }
  if (e.target.closest("[data-region-done]")) { regionUi.open = -1; return regionPaint(); }
  if (e.target.closest("[data-region-reset]")) { delete values.regionModel; delete values.regionQuality; saveDraft(); return render(); }
  const row = e.target.closest("[data-region-row]");
  if (row) { regionUi.selected = regionUi.open = Number(row.dataset.regionRow); regionPaint(true); }
});
document.addEventListener("input", (e) => {
  if (tool !== "region") return;
  const text = e.target.closest("[data-region-prompt]");
  if (text) {
    const area = regionList()[Number(text.dataset.regionPrompt)];
    if (!area) return;
    area.prompt = text.value;
    const counter = text.closest(".region-popover")?.querySelector("[data-region-counter]");
    if (counter) counter.textContent = `${text.value.length}/${REGION_PROMPT_MAX}`;
  }
  if (text || e.target.dataset.key === "regionPrompt") { regionSide(); saveDraft(); }
});
