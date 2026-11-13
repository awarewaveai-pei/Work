// Card ED.4: the 「素材」 left pane (spec §1.3, §3 檔案歸屬). Registered with edRegisterPane in tools-editor.js.
// Behaviour read from the reference's own code (2026-11-10): a card is added by double-click, Enter or ＋ (a single
// click does nothing); 上傳素材 and 拆出音軌 only add library assets, listed under 本次上傳 for this browser tab
// (sessionStorage); from a track's ＋ the next add lands on that track (edAssetsPickTrack). Favourites are the per-user
// preference tools.editor.assetFavorites, never asset data.
const edAssets = {
  items: null,
  favs: new Set(),
  session: new Set(edAssetsSessionRead()),
  failed: false,
  tab: "library",
  kind: "all",
  query: "",
  folded: new Set(),
  pickTrack: null,
  loading: false,
  again: false,
  meta: new Map(),
};
function edAssetsSessionRead() {
  try {
    const ids = JSON.parse(sessionStorage.getItem("vw.editor.sessionUploads") || "[]");
    return Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [];
  } catch (_) {
    return [];
  }
}
function edAssetsSessionSave(ids) {
  edAssets.session = new Set(ids);
  try {
    sessionStorage.setItem("vw.editor.sessionUploads", JSON.stringify([...edAssets.session]));
  } catch (_) {}
}
const edAssetsSessionAdd = (id) => edAssetsSessionSave([...edAssets.session, id]);
const edAssetsTabs = [
    ["library", "我的素材庫"],
    ["session", "本次上傳"],
    ["favs", "收藏"],
  ],
  edAssetsKinds = { all: "全部", video: "影片", image: "圖片", audio: "音訊" };
async function edAssetsLoad() {
  if (edAssets.loading) return void (edAssets.again = true);
  edAssets.loading = true;
  try {
    do {
      edAssets.again = false;
      const before = new Set(edAssets.session);
      const [rows, favs] = await Promise.all([
        VideoWorkbench.assets.list(),
        VideoWorkbench.preferences.get("tools.editor.assetFavorites", []),
      ]);
      edAssets.items = rows.filter((a) => ["video", "image", "audio"].includes(VideoWorkbench.mediaKind(a)));
      edAssets.favs = new Set(Array.isArray(favs) ? favs : []);
      edAssetsSessionSave([...edAssets.session].filter((id) => !before.has(id) || rows.some((a) => a.id === id)));
      edAssets.failed = false;
    } while (edAssets.again);
  } catch (e) {
    edAssets.items = edAssets.items || [];
    edAssets.failed = true;
    VideoWorkbench.reportError(e);
  } finally {
    edAssets.loading = false;
  }
  if (tool === "edit" && ed.pane === "素材" && edProject()) edRedraw();
  edAssetsProbe().catch(VideoWorkbench.reportError);
}
// Library records carry no length or size: read them once per asset (edProbe), three at a time, repainting the list as
// each arrives. One that cannot be read keeps its card without length.
async function edAssetsProbe() {
  const todo = (edAssets.items || []).filter((a) => !edAssets.meta.has(a.id) && !(Number.isFinite(a.duration) && a.width));
  const next = async () => {
    for (let a = todo.shift(); a; a = todo.shift()) {
      edAssets.meta.set(a.id, {});
      try {
        const { duration, width, height } = await edProbe(a);
        edAssets.meta.set(a.id, { duration, width, height });
      } catch (_) {}
      edAssetsRepaint();
    }
  };
  await Promise.all([next(), next(), next()]);
}
// Entry from a track's ＋: the pane opens with 「選一個素材加入『…』 取消」 and the next pick goes to that track.
function edAssetsPickTrack(trackId) {
  edAssets.pickTrack = { project: edProject()?.id, track: trackId };
  ed.pane = "素材";
  ed.layout = { ...ed.layout, leftOpen: true };
  edLayoutSave();
  edRedraw();
}
const edAssetsUses = (p, a) => p.clips.filter((c) => c.asset?.id === a.id).length;
function edAssetsClock(seconds) {
  const s = Math.round(Math.max(0, seconds)),
    pad = (n) => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}
function edAssetsVisible(p) {
  const q = edAssets.query.trim().toLowerCase();
  return (edAssets.items || []).filter(
    (a) =>
      (edAssets.tab !== "session" || edAssets.session.has(a.id)) &&
      (edAssets.tab !== "favs" || edAssets.favs.has(a.id)) &&
      (edAssets.kind === "all" || VideoWorkbench.mediaKind(a) === edAssets.kind) &&
      String(a.name || "").toLowerCase().includes(q),
  );
}
function edAssetsCard(p, raw, target) {
  const a = { ...raw, ...edAssets.meta.get(raw.id) },
    kind = VideoWorkbench.mediaKind(a),
    name = a.name || "素材",
    uses = edAssetsUses(p, a),
    fav = edAssets.favs.has(a.id),
    add = esc(target ? `加入「${edTrackLabel(p, target)}」` : "加入主視訊末端"),
    thumb = kind === "image" ? a.previewUrl || a.url : kind === "video" ? edMediaFile(a, "thumb.jpg") : null,
    length = kind === "image" ? "靜圖" : Number.isFinite(a.duration) ? edAssetsClock(a.duration) : "",
    size = a.width && a.height ? `${a.width}×${a.height}` : { video: "影片", image: "圖片", audio: "音訊" }[kind];
  return `<article class="editor-asset-card" data-ed-asset="${esc(a.id)}"><div class="editor-asset-main" role="button" tabindex="0" data-ed-asset-add="${esc(a.id)}" aria-label="${esc(name)}，按 Enter ${add}" title="雙擊或按加號${add}"><span class="editor-asset-thumb">${thumb ? `<img src="${esc(VideoWorkbench.safeUrl(thumb))}" alt="" loading="lazy">` : `<span aria-hidden="true">${kind === "audio" ? "♪" : "▣"}</span>`}${uses ? `<i class="editor-asset-used">已用 × ${uses}</i>` : ""}${length ? `<i class="editor-asset-length">${length}</i>` : ""}</span><b class="editor-asset-name">${esc(name)}</b></div><button type="button" class="editor-asset-star${fav ? " selected" : ""}" data-ed-action="assets-fav:${esc(a.id)}" aria-label="${fav ? "移除最愛" : "加入最愛"}" title="${fav ? "移除最愛" : "加入最愛"}" aria-pressed="${fav}">${fav ? "★" : "☆"}</button><span class="editor-asset-meta"><span class="note">${esc(size)}</span>${kind === "video" ? `<button type="button" class="btn small editor-icon-btn" data-ed-action="assets-split:${esc(a.id)}" aria-label="拆出 ${esc(name)} 的音軌" title="拆出音軌：把這支影片的聲音存成獨立音訊素材，之後可搭配其他影片使用">♪</button>` : ""}<button type="button" class="btn small editor-icon-btn" data-ed-action="assets-add:${esc(a.id)}" aria-label="加入 ${esc(name)}" title="${add}">+</button></span></article>`;
}
function edAssetsGroup(p, key, title, rows) {
  if (!rows.length) return "";
  const open = !edAssets.folded.has(key),
    target = edAssetsTarget(p);
  return `<section class="editor-asset-group"><button type="button" class="editor-asset-group-head" data-ed-action="assets-fold:${key}" aria-expanded="${open}"><span aria-hidden="true">${open ? "▾" : "▸"}</span> ${title}（${rows.length}）</button>${open ? `<div class="editor-asset-grid">${rows.map((a) => edAssetsCard(p, a, target)).join("")}</div>` : ""}</section>`;
}
function edAssetsList(p) {
  if (!edAssets.items) return '<p class="note">載入素材中…</p>';
  const rows = edAssetsVisible(p);
  if (!rows.length) return `<p class="note">${edAssets.failed ? "載入素材失敗，請稍後再試" : "無符合條件的素材"}</p>`;
  const used = rows.filter((a) => edAssetsUses(p, a) > 0);
  return edAssetsGroup(p, "used", "已使用", used) + edAssetsGroup(p, "unused", "未使用", rows.filter((a) => !used.includes(a)));
}
function edAssetsRepaint() {
  const box = document.querySelector("[data-ed-assets-list]"),
    p = edProject();
  if (box && p) box.innerHTML = VideoWorkbench.sanitize(edAssetsList(p)); // same gate as the full render (tools-0.js)
}
// The track chosen with a track's ＋, only while it still belongs to the open project.
const edAssetsTarget = (p) => (edAssets.pickTrack?.project === p.id ? edTrack(p, edAssets.pickTrack.track) || null : null);
async function edAssetsAdd(a, p, track = edAssetsTarget(p)) {
  edAssets.pickTrack = null;
  if (track) {
    const kind = VideoWorkbench.mediaKind(a);
    if (track.kind === "text") throw Error("文字軌請用軌道的 ＋ 新增文字");
    if ((track.kind === "audio") !== (kind === "audio")) throw Error(track.kind === "audio" ? "音訊軌只能放音訊素材" : "影片軌只能放影片或圖片");
  }
  await edAdd(a, track?.id);
}
// 上傳素材 only fills the library (本次上傳). A kind-suffixed upload comes from another pane's own button (音訊, 貼圖)
// and keeps that pane's add-to-timeline; an image goes to the first overlay track.
async function edAssetsUpload(p, files, kind) {
  for (const file of files) {
    try {
      const a = await VideoWorkbench.uploadAsset(file);
      edAssetsSessionAdd(a.id);
      if (kind && edProject() === p) await edAdd(a, kind === "image" ? "overlay" : undefined);
    } catch (e) {
      VideoWorkbench.reportError(e);
    }
  }
  if (!kind) edAssets.tab = "session";
  await edAssetsLoad();
}
edRegisterPane("assets", {
  title: "素材",
  icon: "▤",
  // Every visit re-reads the library (assets made elsewhere meanwhile); the old list stays up until it arrives.
  open: () => {
    edAssetsLoad();
  },
  render: (p, c) => {
    if (!edAssets.items) edAssetsLoad();
    const pick = edAssetsTarget(p),
      count = edAssets.session.size;
    return `${pick ? `<p class="editor-asset-pick" role="status">選一個素材加入「${esc(edTrackLabel(p, pick))}」 ${edButton("取消", "assets-pick-cancel")}</p>` : ""}<div class="editor-asset-tabs" role="tablist" aria-label="素材來源">${edAssetsTabs
      .map(
        ([id, label]) =>
          `<button type="button" role="tab" class="editor-asset-tab${edAssets.tab === id ? " selected" : ""}" data-ed-action="assets-tab:${id}" aria-selected="${edAssets.tab === id}">${label}${id === "session" ? ` (${count})` : ""}</button>`,
      )
      .join("")}</div><input class="text-input" type="search" data-ed-assets-search aria-label="搜尋素材名稱" placeholder="搜尋素材名稱…" value="${esc(edAssets.query)}">${edChoices("素材類型", "assets-kind", edAssets.kind, Object.keys(edAssetsKinds), (k) => edAssetsKinds[k])}${`<button type="button" class="btn small" data-ed-action="upload"><span aria-hidden="true">↥</span> 上傳素材</button>`}${VideoWorkbench.rightsCheckbox()}<div data-ed-assets-list>${edAssetsList(p)}</div>`;
  },
  actions: {
    // "library[:kind]" / "upload[:kind]" are also fired by the 音訊 and 貼圖 panes and the empty stage (audio.js,
    // stickers.js, tools-editor.js): the suffix is the media kind, an image goes to the first overlay track.
    "library": async (action, p, c) => {
      const kind = action.split(":")[1],
        rows = await VideoWorkbench.pickAssets({ kind: kind || "all" });
      if (rows[0] && edProject() === p) await edAdd(rows[0], kind === "image" ? "overlay" : undefined);
    },
    "upload": async (action, p, c) => {
      const kind = action.split(":")[1],
        input = document.createElement("input");
      input.type = "file";
      input.multiple = !kind;
      input.accept = kind === "image" ? "image/*" : kind === "audio" ? "audio/*" : ".mov,.mp4,.m4v,.webm,video/*,image/*,audio/*";
      input.onchange = () => {
        if (input.files?.length) edAssetsUpload(p, [...input.files], kind).catch(VideoWorkbench.reportError);
      };
      input.click();
    },
    "assets-tab:": async (action) => {
      if (!edAssetsTabs.some(([id]) => id === action.slice(11))) return;
      edAssets.tab = action.slice(11);
      edRedraw();
    },
    "assets-kind:": async (action) => {
      if (!edAssetsKinds[action.slice(12)]) return;
      edAssets.kind = action.slice(12);
      edRedraw();
    },
    "assets-fold:": async (action) => {
      const key = action.slice(12);
      if (edAssets.folded.has(key)) edAssets.folded.delete(key);
      else edAssets.folded.add(key);
      edRedraw();
    },
    "assets-pick-cancel": async () => {
      edAssets.pickTrack = null;
      edRedraw();
    },
    "assets-add:": async (action, p) => {
      const a = (edAssets.items || []).find((x) => x.id === action.slice(11));
      if (a) await edAssetsAdd(a, p);
    },
    "assets-fav:": async (action) => {
      const id = action.slice(11);
      if (edAssets.favs.has(id)) edAssets.favs.delete(id);
      else edAssets.favs.add(id);
      await VideoWorkbench.preferences.set("tools.editor.assetFavorites", [...edAssets.favs]);
      edRedraw();
    },
    // 拆出音軌: a new audio asset in the library and 本次上傳, nothing on the timeline. Like the inspector's 分離音訊 it
    // reuses the video file as the sound source (no second file) with the source's origin (same rights); the id is
    // derived from the source, so a second press does not make a duplicate.
    "assets-split:": async (action) => {
      const a = (edAssets.items || []).find((x) => x.id === action.slice(13));
      if (!a || VideoWorkbench.mediaKind(a) !== "video") return;
      const blocked = await edAssetsSplitBlocked(a);
      if (blocked) return VideoWorkbench.notify(blocked);
      if (!edAssets.items.some((x) => x.id === a.id + "#audio"))
        await VideoWorkbench.assets.save({
          ...a,
          id: a.id + "#audio",
          kind: "audio",
          name: (a.name || "素材") + "（音軌）",
          createdAt: new Date().toISOString(),
        });
      edAssetsSessionAdd(a.id + "#audio");
      VideoWorkbench.notify("已拆出音軌，可在「本次上傳」找到；按 ＋ 即可加到音訊軌搭配其他影片。");
      await edAssetsLoad();
    },
  },
});
// Invariant: the file the browser plays for this video (previewUrl || url) holds the original's sound, since the extracted
// asset reuses it -- an alpha source's proxy.webm included (backend/media-store.cjs transcode keeps it as Opus; older
// silent ones: scripts/backfill-alpha-proxy-audio.cjs). Sound comes from the ingest probe (probe.json: on the record,
// else beside a /media/<sha256>/ file); a proxy.webm is checked itself, since one made before the backfill has none:
// its track list (first bytes of the WebM) must hold an Opus track. Returns why not, or "".
async function edAssetsSplitBlocked(a) {
  if (/\/proxy\.webm$/.test(a.previewUrl || "")) {
    const head = await fetch(a.previewUrl, { headers: { Range: "bytes=0-65535" } })
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .catch(() => null);
    if (!head || !new TextDecoder("latin1").decode(head).includes("A_OPUS")) return "透明影片的預覽檔還沒補上聲音，補齊後才能拆出音軌";
  }
  let probe = a.probe;
  const dir = /^(\/media\/[a-f0-9]{64}\/)[^/]+$/.exec(a.url || "")?.[1];
  if (!probe && dir)
    try {
      const r = await fetch(dir + "probe.json");
      if (r.ok) probe = await r.json();
    } catch (_) {}
  if (!probe) return "無法確認這支影片有聲音，無法拆出音軌";
  return probe.audio ? "" : "這支影片沒有聲音，無法拆出音軌";
}
// Double-click or Enter on a card adds it (a single click does nothing, as in the reference).
async function edAssetsAddFrom(el) {
  const p = edProject(),
    a = (edAssets.items || []).find((x) => x.id === el.dataset.edAssetAdd);
  if (p && a) await edAssetsAdd(a, p);
}
document.addEventListener("dblclick", (e) => {
  const el = e.target.closest?.("[data-ed-asset-add]");
  if (el) edAssetsAddFrom(el).catch(VideoWorkbench.reportError);
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || !e.target.matches?.("[data-ed-asset-add]")) return;
  e.preventDefault();
  edAssetsAddFrom(e.target).catch(VideoWorkbench.reportError);
});
// The search box repaints only the list, so typing keeps focus.
document.addEventListener("input", (e) => {
  if (!e.target.matches?.("[data-ed-assets-search]")) return;
  edAssets.query = e.target.value;
  edAssetsRepaint();
});
