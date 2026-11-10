// Card ED.0/ED.7: the 「貼圖」 left pane (spec §1.3 貼圖). Registered with edRegisterPane in tools-editor.js.
// Account-level data (never project data):
//  - watermarks = library assets saved with watermark: true; the one the export applies = preference
//    tools.editor.watermark { id, url, name } (read by editor-export-dialog.js);
//  - brand kit = preference tools.editor.brandKit { colors: ["#rrggbb"], font, logo?: { id, url, name } } (also read
//    by the 文字 pane).
const edStFonts = [
    "Arial",
    "Noto Sans TC",
    "Noto Serif TC",
    "sans-serif",
    "serif",
  ],
  edSt = {
    loaded: false,
    loading: false,
    marks: [],
    mark: null,
    saved: null,
    kit: { colors: [], font: "", logo: null },
  };
const edStClean = (kit) => ({
  colors: (Array.isArray(kit?.colors) ? kit.colors : [])
    .filter((c) => /^#[\da-f]{6}$/i.test(c))
    .map((c) => c.toLowerCase()),
  font: edStFonts.includes(kit?.font) ? kit.font : "",
  logo: kit?.logo?.url
    ? { id: kit.logo.id, url: kit.logo.url, name: kit.logo.name || "" }
    : null,
});
const edStDirty = () =>
  JSON.stringify(edStClean(edSt.kit)) !== JSON.stringify(edStClean(edSt.saved));
async function edStLoad() {
  if (edSt.loading) return;
  edSt.loading = true;
  try {
    const [rows, kit, mark] = await Promise.all([
      VideoWorkbench.assets.list(),
      VideoWorkbench.preferences.get("tools.editor.brandKit", null),
      VideoWorkbench.preferences.get("tools.editor.watermark", null),
    ]);
    edSt.marks = rows.filter((a) => a.watermark === true && a.url);
    edSt.mark =
      mark?.url && edSt.marks.some((a) => a.id === mark.id) ? mark : null;
    edSt.saved = edStClean(kit);
    edSt.kit = structuredClone(edSt.saved);
    edSt.loaded = true;
  } catch (error) {
    VideoWorkbench.reportError(error);
  } finally {
    edSt.loading = false;
  }
  if (tool === "edit" && ed.pane === "貼圖") edRender();
}
// SVG -> PNG at its own size (at most 1024 wide): the export and the preview only handle raster images.
async function edStSvgToPng(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(Error("無法讀取這個 SVG"));
      i.src = url;
    });
    const w = img.naturalWidth || 512,
      h = img.naturalHeight || 512,
      k = Math.min(1, 1024 / Math.max(w, h)) || 1,
      canvas = Object.assign(document.createElement("canvas"), {
        width: Math.max(1, Math.round(w * k)),
        height: Math.max(1, Math.round(h * k)),
      });
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) throw Error("SVG 轉 PNG 失敗");
    return new File([blob], file.name.replace(/\.svg$/i, "") + ".png", {
      type: "image/png",
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
const edStThumb = (a) =>
  `<img class="editor-sticker-thumb" src="${esc(a.previewUrl || a.url)}" alt="" aria-hidden="true">`;
function edStAssetRow(a, buttons) {
  return `<div class="editor-sticker-row">${edStThumb(a)}<span class="editor-sticker-name" title="${esc(a.name || "圖片")}">${esc(a.name || "圖片")}</span>${buttons}</div>`;
}
const edStPlus = (a) =>
  `<button type="button" class="btn small" data-ed-action="sticker-add:${esc(a.id)}" aria-label="加入疊加 V2：${esc(a.name || "圖片")}" title="加入疊加 V2">＋</button>`;
function edStPane(p, c) {
  if (!edSt.loaded && !edSt.loading) edStLoad();
  const marks = edSt.marks,
    project = p.assets.filter((a) => a.kind === "image" && !a.watermark),
    kit = edSt.kit,
    text = c?.kind === "text";
  return (
    `<h3>貼圖</h3><section class="editor-sticker-group" aria-label="浮水印"><h4>浮水印</h4>${edButton("新增浮水印（PNG／SVG）", "sticker-watermark")}<p class="note">SVG 會轉成 PNG，存進帳戶素材庫，之後的專案還在。匯出時可選擇是否套用。</p>${
      marks.length
        ? marks
            .map((a) =>
              edStAssetRow(
                a,
                `${edSt.mark?.id === a.id ? edButton("使用中（取消）", "sticker-unmark") : edButton("設為影片浮水印", "sticker-mark:" + a.id)}${edStPlus(a)}`,
              ),
            )
            .join("")
        : `<p class="note">${edSt.loaded ? "還沒有浮水印。" : "讀取中…"}</p>`
    }</section>` +
    `<section class="editor-sticker-group" aria-label="專案貼圖"><h4>專案貼圖 (${project.length})</h4>${edButton("選擇圖片", "library:image")}${edButton("上傳透明 PNG", "upload:image")}${
      project.length
        ? project.map((a) => edStAssetRow(a, edStPlus(a))).join("")
        : '<p class="note">專案裡還沒有圖片。選擇或上傳後，點 ＋ 加入疊加軌。</p>'
    }</section>` +
    `<section class="editor-sticker-group" aria-label="品牌套件"><h4>品牌套件</h4><h5>品牌色彩</h5><div class="editor-brand-colors">${
      kit.colors
        .map(
          (hex) =>
            `<span class="editor-brand-swatch"><i style="background:${esc(hex)}" aria-hidden="true"></i>${esc(hex)}<button type="button" class="btn small" data-ed-action="kit-color-del:${esc(hex)}" aria-label="移除品牌色 ${esc(hex)}">✕</button></span>`,
        )
        .join("") || '<span class="note">還沒有品牌色。</span>'
    }</div><div class="editor-brand-add"><input class="text-input" type="color" aria-label="新增品牌色" data-ed-kit-color value="#ff6b35">${edButton("新增", "kit-color-add")}${typeof window.EyeDropper === "function" ? edButton("取色", "kit-eyedrop") : ""}</div>` +
    `<h5>品牌字型</h5>${edChoices("品牌字型", "kit-font", kit.font, edStFonts)}${edButton("套用至選取文字", "kit-font-apply", !text || !kit.font)}` +
    `<h5>品牌 Logo</h5>${kit.logo ? edStAssetRow(kit.logo, edStPlus(kit.logo) + edButton("移除", "kit-logo-clear")) : ""}${edButton(kit.logo ? "更換 Logo" : "從圖片素材選", "kit-logo")}` +
    `<div class="editor-brand-save">${edButton("儲存品牌套件", "kit-save", !edStDirty())}<span class="note" role="status" data-ed-kit-state>${edStDirty() ? "有尚未儲存的變更" : edSt.loaded ? "已儲存（帳號內跨專案）" : ""}</span></div></section>`
  );
}
async function edStAddOverlay(p, a) {
  if (a?.url && edProject() === p) await edAdd(a, "overlay");
}
edRegisterPane("stickers", {
  title: "貼圖",
  icon: "▣",
  open: () => edStLoad(),
  render: (p, c) => edStPane(p, c),
  actions: {
    "sticker-watermark": async () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/png,image/svg+xml,.png,.svg";
      input.onchange = async () => {
        try {
          let file = input.files?.[0];
          if (!file) return;
          if (
            !/\.(png|svg)$/i.test(file.name) &&
            !/^image\/(png|svg\+xml)$/.test(file.type)
          )
            throw Error("浮水印請選 PNG 或 SVG");
          if (/\.svg$/i.test(file.name) || file.type === "image/svg+xml")
            file = await edStSvgToPng(file);
          const saved = await VideoWorkbench.uploadAsset(file),
            asset = await VideoWorkbench.assets.save({
              ...saved,
              watermark: true,
            });
          edSt.marks = [...edSt.marks.filter((a) => a.id !== asset.id), asset];
          if (!edSt.mark) await edStUse(asset);
          if (tool === "edit" && ed.pane === "貼圖") edRender();
        } catch (error) {
          VideoWorkbench.reportError(error);
        }
      };
      input.click();
    },
    "sticker-mark:": async (action) => {
      const asset = edSt.marks.find((a) => a.id === action.slice(13));
      if (asset) await edStUse(asset);
      edRender();
    },
    "sticker-unmark": async () => {
      await edStUse(null);
      edRender();
    },
    "sticker-add:": async (action, p) => {
      const id = action.slice(12);
      await edStAddOverlay(
        p,
        edSt.marks.find((a) => a.id === id) ||
          p.assets.find((a) => a.id === id) ||
          (edSt.kit.logo?.id === id ? edSt.kit.logo : null),
      );
    },
    "kit-color-add": async () => {
      const hex = String(
        document.querySelector("[data-ed-kit-color]")?.value || "",
      ).toLowerCase();
      if (
        /^#[\da-f]{6}$/.test(hex) &&
        !edSt.kit.colors.includes(hex) &&
        edSt.kit.colors.length < 12
      )
        edSt.kit.colors = [...edSt.kit.colors, hex];
      edRender();
    },
    "kit-color-del:": async (action) => {
      edSt.kit.colors = edSt.kit.colors.filter((c) => c !== action.slice(14));
      edRender();
    },
    "kit-eyedrop": async () => {
      const { sRGBHex } = await new window.EyeDropper().open(),
        input = document.querySelector("[data-ed-kit-color]");
      if (input) input.value = sRGBHex;
    },
    "kit-font:": async (action) => {
      const font = action.slice(9);
      if (edStFonts.includes(font))
        edSt.kit.font = edSt.kit.font === font ? "" : font;
      edRender();
    },
    "kit-font-apply": async (action, p, c) => {
      const font =
        typeof edTextFontMap === "object" ? edTextFontMap[edSt.kit.font] : null;
      if (c?.kind !== "text" || !font) return;
      edCheckpoint();
      c.font = font;
      await edCommit(p);
    },
    "kit-logo": async () => {
      const [asset] = await VideoWorkbench.pickAssets({
        kind: "image",
        limit: 1,
      });
      if (asset?.url)
        edSt.kit.logo = {
          id: asset.id,
          url: asset.url,
          name: asset.name || "",
        };
      edRender();
    },
    "kit-logo-clear": async () => {
      edSt.kit.logo = null;
      edRender();
    },
    "kit-save": async () => {
      const kit = edStClean(edSt.kit);
      await VideoWorkbench.preferences.set("tools.editor.brandKit", kit);
      edSt.saved = kit;
      edSt.kit = structuredClone(kit);
      edRender();
    },
  },
});
// null = no watermark on exports.
async function edStUse(asset) {
  edSt.mark = asset
    ? { id: asset.id, url: asset.url, name: asset.name || "" }
    : null;
  await VideoWorkbench.preferences.set("tools.editor.watermark", edSt.mark);
}
