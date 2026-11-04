// 🪄 去背 SSOT for /tools/canvas (Fabric 7) and /vector-editor.html (Fabric 5), one plain ES module like color-grade.js.
// Shared: the AI 去背 request (URL + role header + body), the messages both editors show, the pixel pick. The colour key itself is
// adj.removeColor in color-grade.js (built into a RemoveColor filter like every other entry); 還原 clears only that key and
// the AI result (img.bgOriginal = the source before the first AI 去背).
// drift guard: lib/studio/__tests__/editor-bg-remove-drift.test.ts

export const REMOVE_BG_URL = "/api/tools/studio/remove-bg";
/** app/api/tools/studio/remove-bg/route.ts answers 403 forbidden_role without a role; = roleHeader("operator") of lib/ops-role.ts (the drift test compares). */
export const OPS_ROLE_HEADER = { "x-ops-simulated-role": "operator" };
/** The route takes png / jpeg / webp base64 data URLs (anything else is a 400). */
export const isRouteImage = (url) => typeof url === "string" && /^data:image\/(png|jpe?g|webp);base64,/.test(url);

export const BG_MSG = {
  intro: "免費「去除此色」即時、適合白底 logo／線稿；複雜照片／人像用 AI 去背（走 AwareWave 雲端，需登入且有權限）。匯出時記得勾「匯出透明底」。",
  needImage: "先選取圖片後才能使用。",
  busy: "AI 去背中…（雲端處理，約 5~20 秒）",
  ok: "✅ AI 去背完成（透明底，記得勾匯出透明底）",
  failed: (why) => `⚠️ AI 去背失敗：${why}（需登入且有權限；或改用「去除此色」）`,
  keyOk: "✅ 已去除指定顏色（透明）",
  reverted: "✅ 已還原去背",
  revertFailed: (why) => `⚠️ 還原失敗：${why}`,
  nothingToRevert: "這張圖沒有可還原的去背。",
  picked: (hex) => `✅ 取到顏色 ${hex}`,
  pickFailed: (why) => `⚠️ 取色失敗：${why}`,
  pickHint: "點畫布任一點取色…",
};

/** POST the image; resolves { ok:true, image } (transparent PNG data URL) or { ok:false, error } — never throws. `fetchImpl` is for tests. */
export async function requestRemoveBg(dataUrl, fetchImpl) {
  try {
    const doFetch = fetchImpl || ((...a) => fetch(...a));
    const res = await doFetch(REMOVE_BG_URL, {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...OPS_ROLE_HEADER },
      body: JSON.stringify({ image: dataUrl }),
    });
    const data = await res.json().catch(() => ({ ok: false, error: "bad_response" }));
    if (!data || !data.ok || typeof data.image !== "string") return { ok: false, error: (data && data.error) || `HTTP ${res.status}` };
    return { ok: true, image: data.image };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

/** "#rrggbb" of the pixel under a client point of a canvas element (display px → canvas px); throws when the canvas is tainted. */
export function hexAtClient(el, clientX, clientY) {
  const rect = el.getBoundingClientRect();
  const x = Math.floor((clientX - rect.left) * (el.width / rect.width)), y = Math.floor((clientY - rect.top) * (el.height / rect.height));
  const p = el.getContext("2d").getImageData(x, y, 1, 1).data;
  return "#" + [p[0], p[1], p[2]].map((n) => n.toString(16).padStart(2, "0")).join("");
}

/** Crop window + display scale of an image keep their meaning when its source is swapped for one of another pixel size (r = new/old natural width). */
export function keepViewAfterSwap(before, oldNaturalW, newNaturalW) {
  const r = oldNaturalW > 0 && newNaturalW > 0 ? newNaturalW / oldNaturalW : 1;
  return {
    cropX: (before.cropX || 0) * r, cropY: (before.cropY || 0) * r, width: before.width * r, height: before.height * r,
    scaleX: before.scaleX / r, scaleY: before.scaleY / r,
  };
}
