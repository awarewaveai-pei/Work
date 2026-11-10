// Card ED.4: the 「素材」 left pane (spec §1.3, §3 檔案歸屬). Registered with edRegisterPane in tools-editor.js.
// 我的素材庫／本次上傳／收藏, search, kind filter, 已使用／未使用 groups. A card (or Enter) adds the asset to the end of
// the main track; from a track's ＋ the pane shows a banner and adds to that track (edAssetsPickTrack). Favourites are
// the per-user preference tools.editor.assetFavorites, never asset data.
const edAssets = {
  items: null,
  favs: new Set(),
  session: new Set(),
  tab: "library",
  kind: "all",
  query: "",
  folded: new Set(),
  pickTrack: null,
  loading: false,
  meta: new Map(),
};
const edAssetsTabs = [
    ["library", "我的素材庫"],
    ["session", "本次上傳"],
    ["favs", "收藏"],
  ],
  edAssetsKinds = { all: "全部", video: "影片", image: "圖片", audio: "音訊" };
async function edAssetsLoad() {
  if (edAssets.loading) return;
  edAssets.loading = true;
  try {
    const [rows, favs] = await Promise.all([
      VideoWorkbench.assets.list(),
      VideoWorkbench.preferences.get("tools.editor.assetFavorites", []),
    ]);
    edAssets.items = rows.filter((a) => ["video", "image", "audio"].includes(VideoWorkbench.mediaKind(a)));
    edAssets.favs = new Set(Array.isArray(favs) ? favs : []);
  } catch (e) {
    edAssets.items = edAssets.items || [];
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
function edAssetsCard(p, raw) {
  const a = { ...raw, ...edAssets.meta.get(raw.id) },
    kind = VideoWorkbench.mediaKind(a),
    name = a.name || "素材",
    uses = edAssetsUses(p, a),
    fav = edAssets.favs.has(a.id),
    thumb = kind === "image" ? a.previewUrl || a.url : kind === "video" ? edMediaFile(a, "thumb.jpg") : null,
    length = kind === "image" ? "靜圖" : Number.isFinite(a.duration) ? edAssetsClock(a.duration) : "",
    size = a.width && a.height ? `${a.width}×${a.height}` : { video: "影片", image: "圖片", audio: "音訊" }[kind];
  return `<article class="editor-asset-card" data-ed-asset="${esc(a.id)}"><button type="button" class="editor-asset-main" data-ed-action="assets-add:${esc(a.id)}" aria-label="${esc(name)}，按 Enter 加入主視訊末端"><span class="editor-asset-thumb">${thumb ? `<img src="${esc(VideoWorkbench.safeUrl(thumb))}" alt="" loading="lazy">` : `<span aria-hidden="true">${kind === "audio" ? "♪" : "▣"}</span>`}${uses ? `<i class="editor-asset-used">已用 × ${uses}</i>` : ""}${length ? `<i class="editor-asset-length">${length}</i>` : ""}</span><b class="editor-asset-name">${esc(name)}</b></button><button type="button" class="editor-asset-star${fav ? " selected" : ""}" data-ed-action="assets-fav:${esc(a.id)}" aria-label="${fav ? "取消收藏" : "加入最愛"}" aria-pressed="${fav}">${fav ? "★" : "☆"}</button><span class="editor-asset-meta"><span class="note">${esc(size)}</span>${kind === "video" ? `<button type="button" class="btn small editor-icon-btn" data-ed-action="assets-split:${esc(a.id)}" aria-label="拆出 ${esc(name)} 的音軌" title="拆出音軌">♪</button>` : ""}<button type="button" class="btn small editor-icon-btn" data-ed-action="assets-add:${esc(a.id)}" aria-label="加入 ${esc(name)}" title="加入">+</button></span></article>`;
}
function edAssetsGroup(p, key, title, rows) {
  if (!rows.length) return "";
  const open = !edAssets.folded.has(key);
  return `<section class="editor-asset-group"><button type="button" class="editor-asset-group-head" data-ed-action="assets-fold:${key}" aria-expanded="${open}"><span aria-hidden="true">${open ? "▾" : "▸"}</span> ${title}（${rows.length}）</button>${open ? `<div class="editor-asset-grid">${rows.map((a) => edAssetsCard(p, a)).join("")}</div>` : ""}</section>`;
}
function edAssetsList(p) {
  if (!edAssets.items) return '<p class="note">載入素材中…</p>';
  const rows = edAssetsVisible(p);
  if (!rows.length)
    return `<p class="note">${edAssets.tab === "session" ? "這次還沒有上傳素材。" : edAssets.tab === "favs" ? "還沒有收藏的素材，按卡片上的 ☆ 收藏。" : edAssets.query || edAssets.kind !== "all" ? "沒有符合條件的素材。" : "素材庫是空的，按「上傳素材」開始。"}</p>`;
  const used = rows.filter((a) => edAssetsUses(p, a) > 0);
  return edAssetsGroup(p, "used", "已使用", used) + edAssetsGroup(p, "unused", "未使用", rows.filter((a) => !used.includes(a)));
}
function edAssetsRepaint() {
  const box = document.querySelector("[data-ed-assets-list]"),
    p = edProject();
  if (box && p) box.innerHTML = edAssetsList(p);
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
async function edAssetsUpload(p, files, kind) {
  const target = edAssetsTarget(p);
  edAssets.pickTrack = null;
  for (const file of files) {
    try {
      const a = await VideoWorkbench.uploadAsset(file);
      edAssets.session.add(a.id);
      // Kept from the old pane: an uploaded file also goes to the end of the main track (tests p3-roundtrip,
      // editor-media-picker); the reference's behaviour here is unverified.
      if (edProject() === p) await (target ? edAssetsAdd(a, p, target) : edAdd(a, kind === "image" ? "overlay" : undefined));
    } catch (e) {
      VideoWorkbench.reportError(e);
    }
  }
  edAssets.items = null;
  edAssets.tab = "session";
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
      .join("")}</div><input class="text-input" type="search" data-ed-assets-search aria-label="搜尋素材名稱" placeholder="搜尋素材名稱…" value="${esc(edAssets.query)}">${edChoices("素材類型", "assets-kind", edAssets.kind, Object.keys(edAssetsKinds), (k) => edAssetsKinds[k])}${`<button type="button" class="btn small" data-ed-action="upload"><span aria-hidden="true">↥</span> 上傳素材</button>`}<div data-ed-assets-list>${edAssetsList(p)}</div>`;
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
    // 拆出音軌: the video's sound goes to the narration track at its end, the picture is untouched (same as the
    // inspector's 分離音訊, which reuses the file as the sound source).
    "assets-split:": async (action, p) => {
      const a = (edAssets.items || []).find((x) => x.id === action.slice(13));
      if (!a || VideoWorkbench.mediaKind(a) !== "video") return;
      const track = edTrack(p, EditorModel.NARRATION) ? EditorModel.NARRATION : edTrackFor(p, "audio");
      await edAdd({ ...a, kind: "audio" }, track);
    },
  },
});
// The search box repaints only the list, so typing keeps focus.
document.addEventListener("input", (e) => {
  if (!e.target.matches?.("[data-ed-assets-search]")) return;
  edAssets.query = e.target.value;
  edAssetsRepaint();
});
