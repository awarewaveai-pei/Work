"use strict";
// Card FC.2 (docs/engine-route-plan-20261106.md §9): the "專業剪輯" tool = FilmCraft in a same-origin iframe (?host=parent).
// This file is only the frame around it: GPU warning, asset hand-over, project saves, the unsaved mark, F6 back to the
// sidebar. Bridge contract: upstream packaging/web/README.md "The parent bridge" (ready/open/save/dirty/failed).
// The frame lives beside #app, not inside it: tools-0.js re-renders #app through the sanitizer, which would drop an
// iframe, and moving an iframe reloads it (unsaved work lost).
const ENGINE_ROOT = "/engines/filmcraft/web/",
  ENGINE_PROJECTS = "tools.engine.projects",
  ENGINE_OPEN_LIMIT = 512 * 1024 * 1024; // upstream refuses a bigger host file
const eng = {
  available: null, // HEAD of the engine page: true / false / null = not known yet
  gpu: null, // null | "checking" | "ok" | "warn"
  forced: false,
  host: null,
  frame: null,
  ready: false,
  appVersion: "",
  dirty: false,
  queue: [], // files waiting for filmcraft:ready
  sent: [], // [{ id, url, sentUrl, name }] every asset of the open document (kept even while one is unreadable)
  doc: null, // { id, name } the stored project the engine is editing
  saving: Promise.resolve(),
  writes: 0, // project writes to the workbench store still in flight
  saveFailed: false, // the last write was refused: the engine says "saved", the store does not have it
};
// Invariant: work may be let go only when the workbench store holds what the engine holds.
const engineUnsaved = () => eng.dirty || eng.writes > 0 || eng.saveFailed;
fetch(ENGINE_ROOT + "index.html", { method: "HEAD" })
  .then(
    (r) => r.ok,
    () => false,
  )
  .then((ok) => {
    eng.available = ok;
    if (typeof render === "function" && (!tool || tool === "edit-pro"))
      render();
  });

function engineToolVisible(t) {
  return t.id !== "edit-pro" || eng.available === true;
}

function toolEngineHostScreen(t) {
  return `<div class="wrap" style="padding-bottom:0">${header(t, "PRO CUT", "多軌剪接、調色、混音與字幕的專業剪輯。介面是英文；存檔與成片都回到工作台。")}<p class="note">專業剪輯輸出最高 1080p；4K 與長片請用一般剪輯。</p><p class="note">游標在剪輯畫面裡時，按 F6 回到左側選單。</p></div>`;
}

async function engineGpuCheck() {
  try {
    const adapter = await Promise.race([
      navigator.gpu?.requestAdapter(),
      new Promise((r) => setTimeout(() => r(null), 5000)),
    ]);
    if (!adapter) return "warn";
    const info = adapter.info || (await adapter.requestAdapterInfo?.()) || {};
    return /intel/i.test(String(info.vendor || "")) ? "warn" : "ok";
  } catch (_) {
    return "warn";
  }
}

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
// "改用一般剪輯" goes through tools-0.js's own open:edit action.
function enginePlainEditButton(primary) {
  const b = engineEl(
    "button",
    "btn" + (primary ? " primary" : ""),
    "改用一般剪輯",
  );
  b.type = "button";
  b.dataset.act = "open:edit";
  return b;
}

function toolEngineHostAfterRender() {
  if (tool !== "edit-pro") return engineTeardown();
  if (!eng.host) {
    eng.host = engineEl("div", "wrap");
    eng.host.id = "engine-host";
    eng.host.style.paddingTop = "0";
    document.getElementById("app").after(eng.host);
  }
  engineShow();
}

function engineTeardown() {
  eng.host?.remove();
  Object.assign(eng, {
    host: null,
    frame: null,
    ready: false,
    dirty: false,
    saveFailed: false,
    queue: [],
    sent: [],
    doc: null,
  });
}

// Everything above the iframe is rebuilt here; the iframe itself is created once per document.
function engineShow() {
  const host = eng.host;
  [...host.children].forEach((c) => c !== eng.frame && c.remove());
  const top = engineEl("div");
  host.prepend(top);
  if (eng.available === false) {
    const row = engineEl("div", "row");
    row.append(enginePlainEditButton(true));
    top.append(engineEl("p", "note", "這台主機還沒裝專業剪輯引擎。"), row);
    return;
  }
  if (eng.available === null)
    return top.append(engineEl("p", "note", "正在確認專業剪輯引擎…"));
  if (!eng.forced && eng.gpu !== "ok") {
    if (eng.gpu === null) {
      eng.gpu = "checking";
      engineGpuCheck().then((state) => {
        eng.gpu = state;
        if (tool === "edit-pro" && eng.host) engineShow();
      });
    }
    if (eng.gpu === "checking")
      return top.append(engineEl("p", "note", "正在檢查這台電腦的顯示卡…"));
    const warn = engineEl("div", "out");
    warn.setAttribute("role", "alert");
    warn.append(
      engineEl(
        "p",
        "",
        "這台電腦沒有可用的獨立顯示卡，專業剪輯會很卡，瀏覽器也可能變慢。建議改用一般剪輯。",
      ),
      engineEl("div", "row"),
    );
    warn.lastChild.append(
      enginePlainEditButton(true),
      engineButton("仍然開啟", "force"),
    );
    return top.append(warn);
  }
  const bar = engineEl("div", "row");
  bar.append(
    engineButton("加入素材", "assets", true),
    engineButton("開新專案", "new"),
  );
  const status = engineEl("span", "note");
  status.dataset.engineStatus = "";
  status.setAttribute("role", "status");
  bar.append(status);
  // Card FC.3: the frame starts every render itself, so each one carries the SRT sidecar and −16 LUFS.
  const out = engineEl("div", "row");
  out.append(engineEl("span", "note", "輸出成片："));
  for (const ratio of Object.keys(ENGINE_RENDER_SIZES))
    out.append(engineButton(ratio + "（" + ENGINE_RENDER_SIZES[ratio].join("×") + "）", "export:" + ratio));
  top.append(
    bar,
    engineEl("p", "note", "在剪輯畫面用 File › Save 存檔，專案會存進工作台。"),
    out,
    engineEl("p", "note", "成片會附字幕檔、音量調到 −16 LUFS，存進素材庫並記下用了哪些素材，可直接送審。"),
  );
  const list = engineEl("div", "out");
  list.dataset.engineProjects = "";
  top.append(list);
  engineStatus();
  engineListProjects();
  if (!eng.frame) engineMount();
}

function engineStatus(text) {
  const el = eng.host?.querySelector("[data-engine-status]");
  if (!el) return;
  el.textContent =
    text ||
    (!eng.ready
      ? "引擎載入中…"
      : eng.writes
        ? "存進工作台中…"
        : eng.saveFailed
          ? "沒有存進工作台，請再存一次"
          : eng.dirty
            ? "尚未存檔"
            : eng.doc
              ? "已存檔：" + eng.doc.name.replace(/\.fcproj$/i, "")
              : "");
}

async function engineListProjects() {
  const el = eng.host?.querySelector("[data-engine-projects]");
  if (!el) return;
  const rows = await VideoWorkbench.preferences.get(ENGINE_PROJECTS, []);
  el.replaceChildren(engineEl("b", "", "已存的專業剪輯專案"));
  if (!rows.length)
    return el.append(engineEl("p", "muted", "還沒有。存檔後會出現在這裡。"));
  for (const row of rows) {
    const line = engineEl("div", "row");
    line.append(
      engineButton("開啟「" + row.title + "」", "open:" + row.id),
      engineEl("span", "muted", new Date(row.savedAt).toLocaleString("zh-TW")),
    );
    el.append(line);
  }
}

function engineMount() {
  eng.frame?.remove();
  Object.assign(eng, {
    ready: false,
    dirty: false,
    saveFailed: false,
    queue: [],
    sent: [],
    doc: null,
  });
  const frame = document.createElement("iframe");
  frame.title = "專業剪輯";
  frame.src = ENGINE_ROOT + "index.html?host=parent";
  frame.allow = "autoplay; clipboard-read; clipboard-write";
  frame.style.cssText = "width:100%;height:78vh;border:0;display:block";
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
  const shell = window.parent !== window ? window.parent : window,
    nav =
      shell.document.querySelector(".sidebar .nav.active") ||
      shell.document.querySelector(".sidebar .nav") ||
      document.querySelector("[data-act=home]");
  eng.frame?.blur();
  shell.focus();
  nav?.focus();
}

function engineSend(name, bytes) {
  if (!eng.ready) return eng.queue.push({ name, bytes });
  eng.frame.contentWindow.postMessage(
    { type: "filmcraft:open", name, bytes },
    location.origin,
    [bytes],
  );
}

// One name per asset in the document: the project refers to media by file name, and a reopen sends the same names again.
function engineName(asset, url) {
  const ext = (/\.([a-z0-9]+)(?:[?#]|$)/i.exec(url) || [])[1] || "bin",
    base =
      String(asset.name || "素材")
        .replace(/\.[a-z0-9]+$/i, "")
        .replace(/[\\/:*?"<>|]/g, "_")
        .slice(0, 120) || "素材";
  let name = base + "." + ext.toLowerCase();
  for (
    let i = 2;
    eng.sent.some((s) => s.name === name && s.url !== asset.url);
    i++
  )
    name = `${base} (${i}).${ext.toLowerCase()}`;
  return name;
}

const engineSize = async (url) =>
  Number(
    (await fetch(url, { method: "HEAD" })).headers.get("content-length"),
  ) || Infinity;
// The original when the browser can play it (no proxy made for it, card M1), else the preview copy; whichever it is, it must
// be ≤ 512 MiB (a playable original's preview is the same file, so "too big" never falls back to itself).
async function engineSourceUrl(asset) {
  const playable = !asset.previewUrl || asset.previewUrl === asset.url;
  const url = VideoWorkbench.safeUrl(playable ? asset.url : asset.previewUrl);
  if (url && (await engineSize(url)) <= ENGINE_OPEN_LIMIT) return url;
  throw Error(
    `「${asset.name || "素材"}」超過 512 MB，專業剪輯打不開；請改用一般剪輯。`,
  );
}
// Only files the ledger can name (backend/main-system.cjs LOCAL_URL): a render must record its sources, and the render
// route refuses any other url, so an older-format item is stopped here instead of after the export.
const ENGINE_LEDGER_URL = /^\/(generated\/[a-f0-9-]+\.[a-z0-9]+|media\/[a-f0-9]{64}\/original\.[a-z0-9]+)$/;
async function engineAddAsset(asset) {
  if (!VideoWorkbench.safeUrl(asset.url)) throw Error("素材網址無效");
  if (!ENGINE_LEDGER_URL.test(asset.url))
    throw Error(`「${asset.name || "素材"}」是舊格式的素材，請在素材庫重新上傳一次再加入。`);
  const known = eng.sent.find((s) => s.url === asset.url);
  const url =
    known?.sentUrl && (await engineSize(known.sentUrl)) <= ENGINE_OPEN_LIMIT
      ? known.sentUrl
      : await engineSourceUrl(asset);
  const response = await fetch(url);
  if (!response.ok) throw Error(`讀不到「${asset.name || "素材"}」`);
  const name = known?.name || engineName(asset, url);
  engineSend(name, await response.arrayBuffer());
  // url = the asset itself (its rights record); sentUrl = the bytes the engine got, which a reopen must send again.
  if (!known)
    eng.sent.push({ id: asset.id ?? null, url: asset.url, sentUrl: url, name });
}

async function enginePickAssets() {
  const rows = await VideoWorkbench.pickAssets({
    kind: "all",
    multiple: true,
    limit: 20,
  });
  for (const asset of rows) await engineAddAsset(asset);
}

function engineSaveProject(name, bytes) {
  const text = new TextDecoder().decode(bytes);
  JSON.parse(text); // a .fcproj is JSON text; kept verbatim (re-serialising could round large integers)
  const doc = eng.doc,
    sent = structuredClone(eng.sent);
  eng.writes++;
  engineStatus();
  eng.saving = eng.saving
    .catch(() => {})
    .then(async () => {
      const rows = await VideoWorkbench.preferences.get(ENGINE_PROJECTS, []),
        old = rows.find((r) => r.id === doc.id),
        envelope = ProjectEnvelope.wrap(
          { fcproj: text },
          {
            revision: old ? (old.revision || 0) + 1 : 0,
            engine: "filmcraft",
            engineVersion: eng.appVersion,
          },
        );
      const row = {
        ...envelope,
        assets: sent,
        id: doc.id,
        name,
        title: name.replace(/\.fcproj$/i, ""),
        savedAt: new Date().toISOString(),
      };
      await VideoWorkbench.preferences.set(
        ENGINE_PROJECTS,
        old ? rows.map((r) => (r.id === doc.id ? row : r)) : [...rows, row],
      );
      engineListProjects();
    })
    .then(
      () => (eng.saveFailed = false),
      (error) => {
        eng.saveFailed = true;
        VideoWorkbench.reportError(
          Error("專案沒有存進工作台，請在剪輯畫面再存一次：" + error.message),
        );
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
  if (bytes instanceof ArrayBuffer && engineOnRenderFile(name, bytes)) return;
  if (!(bytes instanceof ArrayBuffer) || !/\.fcproj$/i.test(name)) return;
  // saveAs = this file becomes the document (Save As, first Save); a plain Save of the document keeps its own name.
  // Other saveAs:false files (Save a Copy, the schema backup) are not the document and are not stored.
  if (m.saveAs) {
    if (!eng.doc || eng.doc.name !== name)
      eng.doc = { id: crypto.randomUUID(), name };
  } else if (!eng.doc || eng.doc.name !== name) return;
  return engineSaveProject(name, bytes);
}

// Only the engine frame on this origin is heard; anything else (another window, another origin) is ignored.
window.addEventListener("message", (event) => {
  if (
    event.origin !== location.origin ||
    !eng.frame ||
    event.source !== eng.frame.contentWindow
  )
    return;
  const m = event.data;
  if (!m || typeof m.type !== "string" || !m.type.startsWith("filmcraft:"))
    return;
  if (m.type === "filmcraft:ready") {
    eng.ready = true;
    eng.appVersion = String(m.appVersion || "");
    const queued = eng.queue.splice(0);
    for (const f of queued) engineSend(f.name, f.bytes);
  } else if (m.type === "filmcraft:dirty") eng.dirty = !!m.dirty;
  else if (m.type === "filmcraft:save") engineOnSave(m);
  else if (m.type === "filmcraft:failed") {
    VideoWorkbench.reportError(
      Error("專業剪輯無法啟動：" + String(m.error || "瀏覽器不支援")),
    );
    return engineStatus("無法啟動");
  }
  engineStatus();
});

async function engineOpenProject(id) {
  const row = (await VideoWorkbench.preferences.get(ENGINE_PROJECTS, [])).find(
    (r) => r.id === id,
  );
  if (!row) throw Error("找不到這個專案");
  engineMount();
  eng.doc = { id: row.id, name: row.name };
  // Host mode restores nothing: the project first, then every asset it used (the engine relinks them by name).
  engineSend(row.name, new TextEncoder().encode(row.native.fcproj).buffer);
  // The document's asset list stays whole: one unreadable now is still sent again on the next reopen.
  eng.sent = structuredClone(row.assets || []);
  for (const a of eng.sent) {
    const over =
      (await engineSize(a.sentUrl || a.url).catch(() => 0)) > ENGINE_OPEN_LIMIT;
    const response = over
      ? null
      : await fetch(a.sentUrl || a.url).catch(() => null);
    if (!response?.ok) {
      VideoWorkbench.reportError(
        Error(`素材「${a.name}」讀不到，專案裡會顯示為離線`),
      );
      continue;
    }
    engineSend(a.name, await response.arrayBuffer());
  }
  engineStatus();
}

const engineLeaveOk = () =>
  !engineUnsaved() || confirm("專業剪輯還有沒存進工作台的修改，確定離開？");
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
      if (act === "assets")
        return enginePickAssets().catch(VideoWorkbench.reportError);
      if (act === "new") return engineLeaveOk() && engineMount();
      if (act.startsWith("export:"))
        return engineExport(act.slice(7)).catch(VideoWorkbench.reportError);
      if (act.startsWith("open:"))
        return (
          engineLeaveOk() &&
          engineOpenProject(act.slice(5)).catch(VideoWorkbench.reportError)
        );
      return;
    }
    // Leaving the tool while unsaved asks first (capture phase: before tools-0.js switches the page).
    const leave = tool === "edit-pro" && event.target.closest?.("[data-act]");
    if (
      leave &&
      /^(home|open:)/.test(leave.dataset.act) &&
      leave.dataset.act !== "open:edit-pro" &&
      !engineLeaveOk()
    ) {
      event.preventDefault();
      event.stopPropagation();
    }
  },
  true,
);
window.addEventListener("beforeunload", (event) => {
  if (tool === "edit-pro" && engineUnsaved()) event.preventDefault();
});
// Card FC.3: a render = the frame asks the engine for an MP4 (+ SRT sidecar, −16 LUFS), then sends the file, its sources
// and the caption lines to POST /api/vw/engine/renders, which records it as one finished job (ledger + release text).
const ENGINE_RENDER_SIZES = {
  "16:9": [1920, 1080],
  "9:16": [1080, 1920],
  "4:5": [1080, 1350],
};
const engineRenders = new Map(); // export base name -> { ratio, width, height, title, sources, video, srt, timer }
async function engineExport(ratio) {
  if (!eng.ready) throw Error("引擎還在載入");
  if (!eng.sent.length) throw Error("先加入素材再輸出：成片要記下用了哪些素材");
  const [width, height] = ENGINE_RENDER_SIZES[ratio];
  const title = eng.doc
    ? eng.doc.name.replace(/\.fcproj$/i, "")
    : "專業剪輯成片";
  const base =
    (title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80) || "成片") +
    "-" +
    Date.now();
  engineRenders.set(base, {
    ratio,
    width,
    height,
    title,
    sources: eng.sent.map(({ id, url, name }) => ({ id, url, name })),
    // PJ spec §8 C4: the project/episode this render belongs to, once PJ adds VideoWorkbench.spineLink.
    link: typeof VideoWorkbench.spineLink === "function" ? VideoWorkbench.spineLink({ operation: "engine-render" }) : null,
    video: null,
    srt: null,
    timer: null,
  });
  const r = await eng.frame.contentWindow.filmcraft.execute(
    "file.exportMedia",
    {
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
    },
  );
  if (r?.warnings?.length)
    VideoWorkbench.notify("引擎提醒：" + r.warnings.join("；"));
  engineStatus("輸出中…（在剪輯畫面可看進度）");
}
// The MP4 and its .srt arrive as two saves in either order; a project without captions sends no .srt.
function engineOnRenderFile(name, bytes) {
  const m = /^(.*)\.(mp4|srt)$/i.exec(name);
  const job = m && engineRenders.get(m[1]);
  if (!job) return false;
  if (m[2].toLowerCase() === "srt") job.srt = new TextDecoder().decode(bytes);
  else job.video = bytes;
  clearTimeout(job.timer);
  if (job.video)
    job.timer = setTimeout(
      () => engineSubmitRender(m[1]),
      job.srt !== null ? 0 : 5000,
    );
  return true;
}
async function engineSubmitRender(base) {
  const job = engineRenders.get(base);
  engineRenders.delete(base);
  try {
    const cues = job.srt
      ? SubtitleParse.parse(job.srt).map((c) => ({
          start: c.startMs / 1000,
          end: c.endMs / 1000,
          text: c.text,
        }))
      : [];
    const meta = new TextEncoder().encode(
      JSON.stringify({
        engine: "filmcraft",
        engineVersion: eng.appVersion,
        title: job.title,
        ratio: job.ratio,
        width: job.width,
        height: job.height,
        sources: job.sources,
        link: job.link,
        cues,
      }),
    );
    engineStatus("成片入帳中…");
    const api = String(window.VW_CONFIG?.apiBaseUrl || "/api/vw").replace(/\/$/, "");
    const response = await fetch(api + "/engine/renders", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-VW-Meta-Length": String(meta.byteLength),
      },
      body: new Blob([meta, job.video]),
    });
    const value = await response.json().catch(() => ({}));
    if (!response.ok)
      throw Error(
        value.error?.message || "成片入帳失敗（" + response.status + "）",
      );
    engineStatus("成片已存進素材庫");
    VideoWorkbench.showJob(value);
  } catch (error) {
    engineStatus("成片沒有入帳");
    VideoWorkbench.reportError(error);
  }
}
