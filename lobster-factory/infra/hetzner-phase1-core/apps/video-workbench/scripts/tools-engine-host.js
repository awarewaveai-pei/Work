"use strict";
// Cards FC.2/FC.3 and EC.2/EC.3 (docs/engine-route-plan-20261106.md §9): the "專業剪輯" (FilmCraft) and "專業特效" (EffectCraft)
// tools = a Craft engine in a same-origin iframe (?host=parent). One frame for both engines; what differs is ENGINES below.
// The frame does only: GPU warning, asset hand-over, project saves, the unsaved mark, F6 back to the sidebar, renders.
// Bridge contract (same for both, prefix = engine name): ready/open/save/dirty/failed — FilmCraft upstream
// packaging/web/README.md "The parent bridge"; EffectCraft scripts/effectcraft-pro/README.md (web-host-api.patch).
// The frame lives beside #app, not inside it: tools-0.js re-renders #app through the sanitizer, which would drop an
// iframe, and moving an iframe reloads it (unsaved work lost).
// Full page (operator 2026-11-10): the engine runs only in its own tab, tools.html?full#<tool>, filling the window. Inside
// the workbench shell the tool card opens (or refocuses) that tab; the shell never mounts an engine.
const ENGINE_PROJECTS = "tools.engine.projects", // both engines' projects; each row's envelope names its engine
  ENGINE_OPEN_LIMIT = 512 * 1024 * 1024; // the bridge refuses a bigger host file
// Render sizes = the ratios the main system can deliver (D6); the route checks the same table.
const ENGINE_RENDER_SIZES = { "16:9": [1920, 1080], "9:16": [1080, 1920], "4:5": [1080, 1350] };
const ENGINES = {
  "edit-pro": {
    engine: "filmcraft",
    root: "/engines/filmcraft/web/",
    query: "?host=parent",
    ext: "fcproj",
    eyebrow: "PRO CUT",
    lead: "多軌剪接、調色、混音與字幕的專業剪輯。介面是英文；存檔與成片都回到工作台。",
    notes: ["專業剪輯輸出最高 1080p；4K 與長片請用一般剪輯。"],
    fallback: ["edit", "改用一般剪輯"],
    exportNote: "成片會附字幕檔、音量調到 −16 LUFS，存進素材庫並記下用了哪些素材，可直接送審。",
    captions: true, // an SRT sidecar may follow the MP4
  },
  "fx-pro": {
    engine: "effectcraft",
    // nosw: no service worker inside the workbench (its cache-first copy would outlive an engine update).
    root: "/engines/effectcraft/web/",
    query: "?host=parent&nosw",
    ext: "ecproj",
    eyebrow: "PRO FX",
    lead: "圖層、遮罩、關鍵影格與特效的專業合成。介面是英文；存檔與成片都回到工作台。",
    notes: ["輸出用目前開著的合成，尺寸要是 1920×1080、1080×1920 或 1080×1350（可以送審的三種）。「輸出透明片段」帶透明背景（ProRes 4444），回素材庫後可在剪輯器疊在別的影片上。"],
    fallback: ["compose", "改用動畫合成"],
    exportNote: "成片存進素材庫並記下用了哪些素材，可直接送審。",
    captions: false,
  },
};
const engineFor = (id) => ENGINES[id] || null;
// The open tool, for event handlers: tools-0.js declares `tool` but loads after this file (tools-boot.js), so a click or a
// closing page before it has run would throw "tool is not defined".
const engineTool = () => (typeof tool === "undefined" ? null : tool);
const ENGINE_FULL = window.parent === window && new URLSearchParams(location.search).has("full");
// This tab and the workbench tab share one stored state; a save clash must not reload away the engine's open work.
if (ENGINE_FULL) {
  window.VW_KEEP_PAGE_ON_CONFLICT = true;
  document.body.classList.add("engine-full");
}
// One tab per engine: a second click refocuses it (window.open with a URL would reload it and drop unsaved work).
// project = a saved project to open there (an episode's 開啟剪輯): that loads the tab, and the tab's own beforeunload asks
// first when it holds unsaved work or a render.
function engineOpenTab(id, project = null) {
  const w = window.open("", "awarewave-engine-" + id);
  if (!w) return VideoWorkbench.reportError(Error("瀏覽器擋了新分頁：請允許這個網站開新視窗，再按一次。"));
  if (w.location.href === "about:blank" || project)
    w.location.href = new URL("tools.html?full" + (project ? "&project=" + encodeURIComponent(project) : "") + "#" + id, location.href).href;
  w.focus();
}
const ENGINE_START_PROJECT = ENGINE_FULL ? new URLSearchParams(location.search).get("project") : null;
// Episodes as the projects page keeps them (EpisodeSpine reads this shape; scripts/tools-editor.js edSpineProjects).
function engineEpisodes() {
  try {
    return JSON.parse(VideoWorkbench.storage.getItem("awarewave-projects-screenshot-frontend-v1") || "null")?.projects || [];
  } catch (_) {
    return [];
  }
}
// The saved file of the episode this tool was opened for (tools-0.js toolLink), when it is this engine's: the tab button
// opens it even when the episode's 開啟剪輯 could not (engine check still running, new tab blocked).
function engineEpisodeFile(id) {
  const link = typeof VideoWorkbench.spineLink === "function" ? VideoWorkbench.spineLink({}) : null,
    project = link && engineEpisodes().find((p) => p.id === link.projectId),
    edit = project?.episodes?.find((e) => e.id === link.episodeId)?.edit;
  return edit?.engine === engineFor(id)?.engine ? edit.projectId : null;
}
const engineAvailable = {}; // engine -> true / false (HEAD of its page); absent = not known yet
for (const cfg of Object.values(ENGINES))
  fetch(cfg.root + "index.html", { method: "HEAD" })
    .then((r) => r.ok, () => false)
    .then((ok) => {
      engineAvailable[cfg.engine] = ok;
      if (typeof render === "function" && (!engineTool() || engineFor(engineTool())?.engine === cfg.engine)) render();
    });
const eng = {
  cfg: null, // ENGINES entry of the open tool
  gpu: null, // null | "checking" | "ok" | "warn"
  forced: false,
  host: null,
  frame: null,
  ready: false,
  appVersion: "",
  dirty: false,
  queue: [], // files waiting for <engine>:ready
  sent: [], // [{ id, url, sentUrl, name }] every asset of the open document (kept even while one is unreadable)
  doc: null, // { id, name } the stored project the engine is editing
  saving: Promise.resolve(),
  writes: 0, // project writes to the workbench store still in flight
  saveFailed: false, // the last write was refused: the engine says "saved", the store does not have it
};
// Invariant: work may be let go only when the workbench store holds what the engine holds.
// A render still on its way back is unsaved work too: leaving would drop it.
const engineUnsaved = () => eng.dirty || eng.writes > 0 || eng.saveFailed || engineRenders.size > 0;

function engineToolVisible(t) {
  const cfg = engineFor(t.id);
  return !cfg || engineAvailable[cfg.engine] === true;
}

function toolEngineHostScreen(t) {
  const cfg = engineFor(t.id);
  if (ENGINE_FULL) return ""; // the full page shows only the engine host (styles/tools.css body.engine-full)
  return `<div class="wrap" style="padding-bottom:0">${header(t, cfg.eyebrow, cfg.lead)}${cfg.notes.map((n) => `<p class="note">${esc(n)}</p>`).join("")}</div>`;
}

// What the browser hands this page, not what the machine has: on a laptop with both chips Chrome / Edge give web pages the
// built-in Intel chip unless Windows is told otherwise (measured 2026-11-06 on an RTX 5060 laptop). So the warning says
// which of the two it is and how to switch, and never claims the computer has no graphics card.
async function engineGpuCheck() {
  try {
    const adapter = await Promise.race([navigator.gpu?.requestAdapter({ powerPreference: "high-performance" }), new Promise((r) => setTimeout(() => r(null), 5000))]);
    if (!adapter) return "none";
    const info = adapter.info || (await adapter.requestAdapterInfo?.()) || {};
    return /intel/i.test(String(info.vendor || "")) ? "integrated" : "ok";
  } catch (_) {
    return "none";
  }
}
const ENGINE_GPU_TEXT = {
  integrated: "瀏覽器現在用的是內建顯示晶片（Intel），不是獨立顯示卡，這個引擎會很卡，瀏覽器也可能變慢。",
  none: "瀏覽器沒有給這個網頁顯示卡加速（WebGPU），這個引擎會很卡，瀏覽器也可能變慢。",
};
const ENGINE_GPU_STEPS = [
  "電腦有獨立顯示卡的話，可以讓瀏覽器改用它：",
  "1. 開 Windows「設定」→「系統」→「顯示器」→「圖形」。",
  "2. 在清單找到你用的瀏覽器（Chrome 或 Edge），選「高效能」。",
  "3. 關掉瀏覽器的所有視窗，再打開這一頁。",
];

function engineEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
function engineButton(text, act, primary = false) {
  const b = engineEl("button", "btn" + (primary ? " primary" : ""), text);
  b.type = "button";
  b.dataset.engineAct = act;
  return b;
}
// The home-made tool to use instead goes through tools-0.js's own open:<tool> action.
function engineFallbackButton(primary) {
  const [id, label] = eng.cfg.fallback;
  const b = engineEl("button", "btn" + (primary ? " primary" : ""), label);
  b.type = "button";
  b.dataset.act = "open:" + id;
  return b;
}

function toolEngineHostAfterRender() {
  const cfg = engineFor(tool);
  if (!cfg) return engineTeardown();
  if (eng.cfg !== cfg) engineTeardown();
  eng.cfg = cfg;
  if (!eng.host) {
    eng.host = engineEl("div", ENGINE_FULL ? "engine-page" : "wrap");
    eng.host.id = "engine-host";
    eng.host.style.paddingTop = "0";
    document.getElementById("app").after(eng.host);
  }
  engineShow();
}

function engineTeardown() {
  eng.host?.remove();
  Object.assign(eng, { cfg: null, host: null, frame: null, ready: false, dirty: false, saveFailed: false, queue: [], sent: [], doc: null });
}

// Everything above the iframe is rebuilt here; the iframe itself is created once per document.
function engineShow() {
  const host = eng.host, cfg = eng.cfg,
    name = TOOLS.find((t) => t.id === tool)?.name || cfg.eyebrow; // the card's name (tools-0.js TOOLS)
  [...host.children].forEach((c) => c !== eng.frame && c.remove());
  const top = engineEl("div");
  host.prepend(top);
  const available = engineAvailable[cfg.engine];
  if (available === false) {
    const row = engineEl("div", "row");
    row.append(engineFallbackButton(true));
    top.append(engineEl("p", "note", "這台主機還沒裝這個引擎。"), row);
    return;
  }
  if (available === undefined) return top.append(engineEl("p", "note", "正在確認引擎…"));
  if (!ENGINE_FULL) {
    const row = engineEl("div", "row");
    row.append(engineButton("開啟" + name, "tab", true));
    top.append(engineEl("p", "note", name + "在自己的分頁開啟，畫面最大。"), row);
    return;
  }
  if (!eng.forced && eng.gpu !== "ok") {
    if (eng.gpu === null) {
      eng.gpu = "checking";
      engineGpuCheck().then((state) => {
        eng.gpu = state;
        if (eng.host && eng.cfg) engineShow();
      });
    }
    if (eng.gpu === "checking") return top.append(engineEl("p", "note", "正在檢查這台電腦的顯示卡…"));
    const warn = engineEl("div", "out engine-warn");
    warn.setAttribute("role", "alert");
    warn.append(engineEl("p", "", ENGINE_GPU_TEXT[eng.gpu] || ENGINE_GPU_TEXT.none));
    for (const line of ENGINE_GPU_STEPS) warn.append(engineEl("p", "note", line));
    warn.append(engineEl("p", "", `不想改設定的話，建議${cfg.fallback[1]}。`), engineEl("div", "row"));
    warn.lastChild.append(engineFallbackButton(true), engineButton("仍然開啟", "force"));
    return top.append(warn);
  }
  // One compact bar above the engine: the engine gets the rest of the window.
  top.className = "engine-bar";
  const bar = engineEl("div", "row");
  bar.append(engineEl("b", "", name), engineButton("加入素材", "assets", true), engineButton("開新專案", "new"));
  // The frame starts every render itself (FC.3 / EC.3), so each one is checked and recorded the same way.
  bar.append(engineEl("span", "note", "輸出成片："));
  if (cfg.engine === "filmcraft")
    for (const ratio of Object.keys(ENGINE_RENDER_SIZES))
      bar.append(engineButton(ratio + "（" + ENGINE_RENDER_SIZES[ratio].join("×") + "）", "export:" + ratio));
  else bar.append(engineButton("輸出目前的合成", "export:comp"), engineButton("輸出透明片段", "export:alpha"));
  const status = engineEl("span", "note");
  status.dataset.engineStatus = "";
  status.setAttribute("role", "status");
  bar.append(status);
  const more = engineEl("details");
  more.append(engineEl("summary", "note", "說明與已存的專案"));
  for (const n of [...cfg.notes, "在引擎畫面用 File › Save 存檔，專案會存進工作台。", cfg.exportNote, "游標在引擎畫面裡時，按 F6 回到上面這一列。"])
    more.append(engineEl("p", "note", n));
  const list = engineEl("div");
  list.dataset.engineProjects = "";
  more.append(list);
  top.append(bar, more);
  engineStatus();
  engineListProjects();
  if (!eng.frame) ENGINE_START_PROJECT ? engineOpenProject(ENGINE_START_PROJECT).catch(VideoWorkbench.reportError) : engineMount();
}

function engineStatus(text) {
  const el = eng.host?.querySelector("[data-engine-status]");
  if (!el) return;
  el.textContent =
    text ||
    (!eng.ready ? "引擎載入中…"
      : eng.writes ? "存進工作台中…"
      : eng.saveFailed ? "沒有存進工作台，請再存一次"
      : eng.dirty ? "尚未存檔"
      : eng.doc ? "已存檔：" + eng.doc.name.replace(/\.[a-z]+$/i, "")
      : "");
}

async function engineListProjects() {
  const el = eng.host?.querySelector("[data-engine-projects]");
  if (!el) return;
  const rows = (await VideoWorkbench.preferences.get(ENGINE_PROJECTS, [])).filter((r) => r.engine === eng.cfg?.engine);
  el.replaceChildren(engineEl("b", "", "已存的專案"));
  if (!rows.length) return el.append(engineEl("p", "muted", "還沒有。存檔後會出現在這裡。"));
  for (const row of rows) {
    const line = engineEl("div", "row");
    line.append(engineButton("開啟「" + row.title + "」", "open:" + row.id), engineEl("span", "muted", new Date(row.savedAt).toLocaleString("zh-TW")));
    el.append(line);
  }
}

function engineMount() {
  eng.frame?.remove();
  Object.assign(eng, { ready: false, dirty: false, saveFailed: false, queue: [], sent: [], doc: null });
  const frame = document.createElement("iframe");
  frame.title = engineFor(tool)?.eyebrow || "engine";
  frame.src = eng.cfg.root + "index.html" + eng.cfg.query;
  frame.allow = "autoplay; clipboard-read; clipboard-write";
  frame.className = "engine-frame"; // fills the rest of the window (styles/tools.css)
  // F6 inside the engine gives focus back to the sidebar (the engine keeps Tab and Escape for itself).
  frame.addEventListener("load", () => {
    try {
      frame.contentWindow.addEventListener("keydown", engineF6, true);
    } catch (_) {}
  });
  eng.frame = frame;
  eng.host.append(frame);
  engineStatus();
}

function engineF6(event) {
  if (event.key !== "F6") return;
  event.preventDefault();
  event.stopPropagation();
  // The full page has no sidebar: focus goes to the bar above the engine.
  eng.frame?.blur();
  window.focus();
  eng.host?.querySelector(".engine-bar button")?.focus();
}

function engineSend(name, bytes) {
  if (!eng.ready) return eng.queue.push({ name, bytes });
  eng.frame.contentWindow.postMessage({ type: eng.cfg.engine + ":open", name, bytes }, location.origin, [bytes]);
}
// The engine's own command API on the same-origin frame (window.filmcraft / window.effectcraft).
const engineExec = async (command, params) => eng.frame.contentWindow[eng.cfg.engine].execute(command, params);

// One name per asset in the document: the project refers to media by file name, and a reopen sends the same names again.
function engineName(asset, url) {
  const ext = (/\.([a-z0-9]+)(?:[?#]|$)/i.exec(url) || [])[1] || "bin",
    base = String(asset.name || "素材").replace(/\.[a-z0-9]+$/i, "").replace(/[\\/:*?"<>|]/g, "_").slice(0, 120) || "素材";
  let name = base + "." + ext.toLowerCase();
  for (let i = 2; eng.sent.some((s) => s.name === name && s.url !== asset.url); i++) name = `${base} (${i}).${ext.toLowerCase()}`;
  return name;
}

const engineSize = async (url) => Number((await fetch(url, { method: "HEAD" })).headers.get("content-length")) || Infinity;
// The original when the browser can play it (no proxy made for it, card M1), else the preview copy; whichever it is, it must
// be ≤ 512 MiB (a playable original's preview is the same file, so "too big" never falls back to itself).
async function engineSourceUrl(asset) {
  const playable = !asset.previewUrl || asset.previewUrl === asset.url;
  const url = VideoWorkbench.safeUrl(playable ? asset.url : asset.previewUrl);
  if (url && (await engineSize(url)) <= ENGINE_OPEN_LIMIT) return url;
  throw Error(`「${asset.name || "素材"}」超過 512 MB，引擎打不開；請${eng.cfg.fallback[1]}。`);
}
// Only files the ledger can name (backend/main-system.cjs LOCAL_URL): a render must record its sources, and the render
// route refuses any other url, so an older-format item is stopped here instead of after the export.
const ENGINE_LEDGER_URL = /^\/(generated\/[a-f0-9-]+\.[a-z0-9]+|media\/[a-f0-9]{64}\/original\.[a-z0-9]+)$/;
async function engineAddAsset(asset) {
  if (!VideoWorkbench.safeUrl(asset.url)) throw Error("素材網址無效");
  if (!ENGINE_LEDGER_URL.test(asset.url)) throw Error(`「${asset.name || "素材"}」是舊格式的素材，請在素材庫重新上傳一次再加入。`);
  const known = eng.sent.find((s) => s.url === asset.url);
  const url = known?.sentUrl && (await engineSize(known.sentUrl)) <= ENGINE_OPEN_LIMIT ? known.sentUrl : await engineSourceUrl(asset);
  const response = await fetch(url);
  if (!response.ok) throw Error(`讀不到「${asset.name || "素材"}」`);
  const name = known?.name || engineName(asset, url);
  engineSend(name, await response.arrayBuffer());
  // url = the asset itself (its rights record); sentUrl = the bytes the engine got, which a reopen must send again.
  if (!known) eng.sent.push({ id: asset.id ?? null, url: asset.url, sentUrl: url, name });
}

async function enginePickAssets() {
  const rows = await VideoWorkbench.pickAssets({ kind: "all", multiple: true, limit: 20 });
  for (const asset of rows) await engineAddAsset(asset);
}

// A project file is kept verbatim: JSON text as text (re-serialising could round large integers), anything else as base64.
function engineProjectNative(ext, bytes) {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  try {
    JSON.parse(text);
    return { [ext]: text };
  } catch (_) {
    let bin = "";
    const view = new Uint8Array(bytes);
    for (let i = 0; i < view.length; i += 0x8000) bin += String.fromCharCode(...view.subarray(i, i + 0x8000));
    return { [ext + "Base64"]: btoa(bin) };
  }
}
function engineProjectBytes(row) {
  const ext = /\.([a-z]+)$/i.exec(row.name)?.[1].toLowerCase(),
    native = row.native || {};
  if (typeof native[ext] === "string") return new TextEncoder().encode(native[ext]).buffer;
  const bin = atob(native[ext + "Base64"] || "");
  return Uint8Array.from(bin, (c) => c.charCodeAt(0)).buffer;
}

function engineSaveProject(name, bytes) {
  const cfg = eng.cfg,
    native = engineProjectNative(cfg.ext, bytes),
    doc = eng.doc,
    sent = structuredClone(eng.sent);
  eng.writes++;
  engineStatus();
  eng.saving = eng.saving
    .catch(() => {})
    .then(async () => {
      const write = async () => {
        const rows = await VideoWorkbench.preferences.get(ENGINE_PROJECTS, []),
          old = rows.find((r) => r.id === doc.id),
          envelope = ProjectEnvelope.wrap(native, { revision: old ? (old.revision || 0) + 1 : 0, engine: cfg.engine, engineVersion: eng.appVersion });
        const row = { ...envelope, assets: sent, id: doc.id, name, title: name.replace(/\.[a-z]+$/i, ""), savedAt: new Date().toISOString() };
        await VideoWorkbench.preferences.set(ENGINE_PROJECTS, old ? rows.map((r) => (r.id === doc.id ? row : r)) : [...rows, row]);
      };
      // Another tab saved first (shared/runtime.js VW_KEEP_PAGE_ON_CONFLICT): the state is now theirs; redo once on it.
      await write().catch((e) => (e.conflict ? write() : Promise.reject(e)));
      engineListProjects();
    })
    .then(
      () => (eng.saveFailed = false),
      (error) => {
        eng.saveFailed = true;
        VideoWorkbench.reportError(Error("專案沒有存進工作台，請在引擎畫面再存一次：" + error.message));
      },
    )
    .finally(() => {
      eng.writes--;
      engineStatus();
    });
  return eng.saving;
}

function engineOnSave(m) {
  const name = String(m.name || ""),
    bytes = m.bytes;
  if (!(bytes instanceof ArrayBuffer)) return;
  if (engineOnRenderFile(name, bytes)) return;
  if (!name.toLowerCase().endsWith("." + eng.cfg.ext)) return;
  // saveAs = this file becomes the document (Save As, first Save); a plain Save of the document keeps its own name.
  // Other saveAs:false files (Save a Copy, a backup) are not the document and are not stored.
  if (m.saveAs) {
    if (!eng.doc || eng.doc.name !== name) eng.doc = { id: crypto.randomUUID(), name };
  } else if (!eng.doc || eng.doc.name !== name) return;
  return engineSaveProject(name, bytes);
}

// Only the engine frame on this origin is heard, and only its own engine's messages; anything else is ignored.
window.addEventListener("message", (event) => {
  if (event.origin !== location.origin || !eng.frame || event.source !== eng.frame.contentWindow) return;
  const m = event.data,
    prefix = eng.cfg.engine + ":";
  if (!m || typeof m.type !== "string" || !m.type.startsWith(prefix)) return;
  const type = m.type.slice(prefix.length);
  if (type === "ready") {
    eng.ready = true;
    eng.appVersion = String(m.appVersion || m.version || "");
    // FilmCraft follows the browser's languages and has only a Simplified Chinese catalog, which a zh-TW browser falls
    // through to (its "zh" entry); the operator wants English, not Simplified (2026-11-10). EffectCraft has Traditional.
    if (eng.cfg.engine === "filmcraft")
      engineExec("app.language.english", {}).catch((e) => VideoWorkbench.reportError(Error("引擎介面沒有切成英文：" + e.message)));
    const queued = eng.queue.splice(0);
    for (const f of queued) engineSend(f.name, f.bytes);
  } else if (type === "dirty") eng.dirty = !!m.dirty;
  else if (type === "save") engineOnSave(m);
  else if (type === "failed") {
    VideoWorkbench.reportError(Error("引擎無法啟動或收不下檔案：" + String(m.error || "瀏覽器不支援")));
    return engineStatus("引擎回報錯誤");
  }
  engineStatus();
});

async function engineOpenProject(id) {
  // The engine runs only in its own tab: inside the workbench (tools-0.js acceptAsset) the project opens there.
  if (!ENGINE_FULL) return engineOpenTab(engineTool(), id);
  const row = (await VideoWorkbench.preferences.get(ENGINE_PROJECTS, [])).find((r) => r.id === id && r.engine === eng.cfg.engine);
  if (!row) throw Error("找不到這個專案");
  engineMount();
  const frame = eng.frame;
  eng.doc = { id: row.id, name: row.name };
  // Host mode restores nothing: the project first, then every asset it used (the engine relinks them by name).
  engineSend(row.name, engineProjectBytes(row));
  // The document's asset list stays whole: one unreadable now is still sent again on the next reopen.
  eng.sent = structuredClone(row.assets || []);
  for (const a of eng.sent) {
    const over = (await engineSize(a.sentUrl || a.url).catch(() => 0)) > ENGINE_OPEN_LIMIT;
    const response = over ? null : await fetch(a.sentUrl || a.url).catch(() => null);
    if (!response?.ok) {
      VideoWorkbench.reportError(Error(`素材「${a.name}」讀不到，專案裡會顯示為離線`));
      continue;
    }
    engineSend(a.name, await response.arrayBuffer());
  }
  engineStatus();
  if (eng.cfg.engine === "effectcraft") engineRelink(frame).catch(VideoWorkbench.reportError);
}

// EffectCraft (scripts/effectcraft-pro/README.md "已知上游問題"): after a reopen every footage item reports missing although
// the files were handed over; one footage.relink brings them all back. Only items whose file this frame sent are relinked.
async function engineRelink(frame) {
  const names = new Set(eng.sent.map((s) => s.name));
  // The project and the files are opened asynchronously after the posts: poll up to 20 s; "nothing missing" only counts
  // once the project had 4 s to load, and a relink that comes too early (file not imported yet) is simply tried again.
  for (let i = 0, t0 = Date.now(); i < 40 && eng.frame === frame; i++) {
    if (eng.ready && !eng.queue.length) {
      const missing = (await engineExec("footage.missing", {}).catch(() => null))?.missing || [];
      const item = missing.find((m) => names.has(m.name));
      if (!item && Date.now() - t0 > 4000) return;
      if (item) await engineExec("footage.relink", { item: item.item, path: item.path || "/" + item.name }).catch(() => null);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

const engineLeaveOk = () => !engineUnsaved() || confirm("引擎裡還有沒存進工作台的修改，確定離開？");
document.addEventListener(
  "click",
  (event) => {
    const button = event.target.closest?.("[data-engine-act]");
    if (button) {
      const act = button.dataset.engineAct;
      if (act === "force") {
        eng.forced = true;
        return engineShow();
      }
      if (act === "tab") return engineOpenTab(engineTool(), engineEpisodeFile(engineTool()));
      if (act === "assets") return enginePickAssets().catch(VideoWorkbench.reportError);
      if (act === "new") return engineLeaveOk() && engineMount();
      if (act.startsWith("export:")) return engineExport(act.slice(7)).catch(VideoWorkbench.reportError);
      if (act.startsWith("open:")) return engineLeaveOk() && engineOpenProject(act.slice(5)).catch(VideoWorkbench.reportError);
      return;
    }
    // Inside the workbench an engine card opens the engine's own tab instead of the tool screen (capture phase: before
    // tools-0.js switches the page). The tool screen stays reachable by #edit-pro links and shows the same open button.
    const card = !ENGINE_FULL && event.target.closest?.("[data-act^='open:']");
    if (card && engineFor(card.dataset.act.slice(5))) {
      event.preventDefault();
      event.stopPropagation();
      return engineOpenTab(card.dataset.act.slice(5));
    }
    // Leaving the tool while unsaved asks first (capture phase: before tools-0.js switches the page).
    const leave = engineFor(engineTool()) && event.target.closest?.("[data-act]");
    if (leave && /^(home|open:)/.test(leave.dataset.act) && leave.dataset.act !== "open:" + engineTool() && !engineLeaveOk()) {
      event.preventDefault();
      event.stopPropagation();
    }
  },
  true,
);
window.addEventListener("beforeunload", (event) => {
  if (engineFor(engineTool()) && engineUnsaved()) event.preventDefault();
});

// Cards FC.3 / EC.3: a render = the frame asks the engine for an MP4, then sends the file, its sources and (FilmCraft) the
// caption lines to POST /api/vw/engine/renders, which records it as one finished job (ledger + release text).
// PJ spec §8 C4: a FilmCraft render is a cut of the episode that owns the open file (as edSpineLink in tools-editor.js),
// read from the file and not from this tab's tool draft, which the workbench tab may have moved to another episode.
// EffectCraft output belongs to the tool's episode (VideoWorkbench.spineLink, tools-0.js).
function engineRenderLink() {
  if (eng.cfg.engine !== "filmcraft") return typeof VideoWorkbench.spineLink === "function" ? VideoWorkbench.spineLink({ operation: "engine-render" }) : null;
  const hit = eng.doc && EpisodeSpine.findByEdit(engineEpisodes(), eng.doc.id);
  return hit ? { projectId: hit.project.id, episodeId: hit.episode.id, tool: "edit-pro", step: "export", target: "output" } : null;
}
const engineRenders = new Map(); // export base name -> { engine, ratio, width, height, title, sources, link, video, srt, timer }
// Card EC.5: footage = every EffectCraft project item that is not made inside the engine (upstream crates/project/src/item.rs
// type_name). A comp with none (a title of text, shapes, solids) has no source file, like a Remotion title.
const ENGINE_OWN_ITEMS = new Set(["Composition", "Folder", "Solid"]);
async function engineFootageCount() {
  const items = (await engineExec("project.summary", {}))?.items;
  if (!Array.isArray(items)) throw Error("讀不到引擎專案裡的素材清單");
  return items.filter((i) => !ENGINE_OWN_ITEMS.has(i.type)).length;
}
async function engineExport(choice) {
  if (!eng.ready) throw Error("引擎還在載入");
  const cfg = eng.cfg;
  if (!eng.sent.length && (cfg.engine !== "effectcraft" || (await engineFootageCount()) !== 0))
    throw Error("先加入素材再輸出：成片要記下用了哪些素材");
  let ratio = choice,
    comp = null;
  const alpha = cfg.engine === "effectcraft" && choice === "alpha"; // card EC.5
  if (cfg.engine === "effectcraft") {
    // The open composition decides the size; only the three deliverable sizes can become a release candidate.
    comp = await engineExec("comp.info", {});
    ratio = Object.keys(ENGINE_RENDER_SIZES).find((k) => ENGINE_RENDER_SIZES[k][0] === comp?.width && ENGINE_RENDER_SIZES[k][1] === comp?.height);
    if (!ratio) throw Error(`目前的合成是 ${comp?.width ?? "?"}×${comp?.height ?? "?"}；請改成 1920×1080、1080×1920 或 1080×1350 再輸出。`);
  }
  const [width, height] = ENGINE_RENDER_SIZES[ratio];
  const title = eng.doc ? eng.doc.name.replace(/\.[a-z]+$/i, "") : cfg.engine === "filmcraft" ? "專業剪輯成片" : "專業特效成片";
  const base = (title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80) || "成片") + "-" + Date.now();
  engineRenders.set(base, {
    engine: cfg.engine,
    ratio,
    width,
    height,
    title,
    sources: eng.sent.map(({ id, url, name }) => ({ id, url, name })),
    alpha,
    // PJ spec §8 C4: the project/episode this render belongs to, once PJ adds VideoWorkbench.spineLink.
    link: engineRenderLink(),
    captions: cfg.captions,
    video: null,
    srt: null,
    timer: null,
  });
  // A render the engine never started must not stay counted (engineUnsaved would ask on every leave).
  try {
    if (cfg.engine === "filmcraft") {
      const r = await engineExec("file.exportMedia", {
        path: "/exports/" + base + ".mp4",
        format: "h264",
        width,
        height,
        fps: 30,
        audio: true,
        // Burned in as well: the release text reports these lines as on-screen captions, so they must be on screen.
        burnCaptions: true,
        captionSidecar: "srt",
        loudnessLufs: -16,
        wait: false,
      });
      if (r?.warnings?.length) VideoWorkbench.notify("引擎提醒：" + r.warnings.join("；"));
    } else {
      // Render Queue: H.264 + AAC, or (card EC.5) RGB + Alpha, which upstream writes as ProRes 4444 in a MOV (a WebM's VP9
      // alpha would be dropped by ffmpeg's own decoder when the editor exports).
      const out = alpha ? { format: "prores", channels: "rgba", output: "/exports/" + base + ".mov" } : { format: "h264", output: "/exports/" + base + ".mp4" };
      await engineExec("renderQueue.add", { comp: comp.comp ?? comp.id ?? comp.name, ...out, audio: "on" });
      await engineExec("renderQueue.render", { wait: false });
    }
  } catch (error) {
    engineRenders.delete(base);
    throw error;
  }
  engineStatus("輸出中…（在引擎畫面可看進度）");
}
// The MP4 (MOV for a transparent clip) and (FilmCraft) its .srt arrive as two saves in either order; a project without captions sends no .srt.
function engineOnRenderFile(name, bytes) {
  const m = /^(.*)\.(mp4|mov|srt)$/i.exec(name);
  const job = m && engineRenders.get(m[1]);
  if (!job) return false;
  if (job.submitting) return true; // already on its way to the server: a late file must not send it twice
  if (m[2].toLowerCase() === "srt") job.srt = new TextDecoder().decode(bytes);
  else job.video = bytes;
  clearTimeout(job.timer);
  if (job.video) job.timer = setTimeout(() => engineSubmitRender(m[1]), job.srt !== null || !job.captions ? 0 : 5000);
  return true;
}
async function engineSubmitRender(base) {
  const job = engineRenders.get(base);
  // Counted (engineUnsaved) until the server has it: closing the tab during the upload asks first.
  job.submitting = true;
  try {
    const cues = job.srt ? SubtitleParse.parse(job.srt).map((c) => ({ start: c.startMs / 1000, end: c.endMs / 1000, text: c.text })) : [];
    const meta = { engine: job.engine, engineVersion: eng.appVersion, title: job.title, ratio: job.ratio, width: job.width, height: job.height, sources: job.sources, link: job.link, cues, alpha: job.alpha, footage: job.sources.length ? undefined : 0 };
    engineStatus("成片入帳中…");
    let value;
    // Card P6.20: a render above one chunk goes up in chunks (shared/assets-ui.js uploadChunked; same checks on the
    // server), so one above the 100 MB request cap still arrives; a smaller one keeps the single request.
    if (job.video.byteLength > VideoWorkbench.chunkedAbove) value = await VideoWorkbench.uploadChunked(new Blob([job.video]), { render: meta });
    else {
      const head = new TextEncoder().encode(JSON.stringify(meta));
      const api = String(window.VW_CONFIG?.apiBaseUrl || "/api/vw").replace(/\/$/, "");
      const response = await fetch(api + "/engine/renders", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/octet-stream", "X-VW-Meta-Length": String(head.byteLength) },
        body: new Blob([head, job.video]),
      });
      value = await response.json().catch(() => ({}));
      if (!response.ok) throw Error(value.error?.message || "成片入帳失敗（" + response.status + "）");
    }
    engineStatus("成片已存進素材庫");
    VideoWorkbench.showJob(value);
  } catch (error) {
    engineStatus("成片沒有入帳");
    VideoWorkbench.reportError(error);
  } finally {
    engineRenders.delete(base);
  }
}
