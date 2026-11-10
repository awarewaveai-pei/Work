// Card ED.8: the export dialog (spec §1.7, §3 檔案歸屬: ED.8), opened by edAction("export") in tools-editor.js.
// 輸出到 = a platform preset (ratio + 1080P) or 自訂 (project ratio, 720P / 1080P / 4K); 影片浮水印 = the account watermark that
// ED.7 keeps in preference tools.editor.watermark, laid over the whole video in the exported COPY of the project (the project
// itself is never changed). Frame rate and loudness stay in 整片設定 › 輸出 / 音訊. Delivery fit = main-system RATIO_PREFERENCE.
const edExportPlatforms = [
  ["TikTok／Reels", "9:16"],
  ["YouTube Shorts", "9:16"],
  ["YouTube 推薦", "16:9"],
  ["Instagram 貼文", null],
  ["自訂", null],
];
const edExportQualityText = { "720p": "720P HD", "1080p": "1080P Full HD 推薦", "4K": "4K" };
// The exported copy: the target ratio, plus the watermark as an overlay image on its own top track for the whole length.
function edExportProject(p, ratio, mark) {
  const native = edNative(p);
  native.ratio = ratio;
  if (!mark) return native;
  const used = new Set(native.tracks.map((t) => t.id)),
    n = Array.from({ length: 99 }, (_, i) => i + 1).find((i) => !used.has("V" + i));
  if (
    native.tracks.filter((t) => t.kind === "video").length >= 8 ||
    native.tracks.length >= 16 ||
    !n
  )
    throw Error("軌道已滿，無法加入浮水印；請先刪掉一條影片軌");
  if (native.clips.filter((c) => c.kind !== "text").length >= 64)
    throw Error("影音片段已達 64 段上限，無法加入浮水印");
  const track = "V" + n;
  native.tracks.push({ id: track, kind: "video", name: "浮水印" });
  native.clips.push({
    id: "export-watermark",
    kind: "image",
    track,
    asset: { id: mark.id, url: mark.url, name: mark.name, kind: "image" },
    startFrame: 0,
    durationFrames: Math.max(...native.clips.map((c) => c.startFrame + c.durationFrames)),
    sourceStartFrame: 0,
    speed: 1,
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
    opacity: 0.85,
    scale: 1,
    x: 96,
    y: 95,
    rotation: 0,
    width: 18,
  });
  return native;
}
function edExportDialog(p) {
  const st = { platform: "自訂", instagram: "1:1", mark: null, useMark: false, busy: false },
    target = () => {
      const [, ratio] = edExportPlatforms.find(([name]) => name === st.platform);
      return {
        ratio: st.platform === "Instagram 貼文" ? st.instagram : ratio || p.ratio,
        quality: st.platform === "自訂" ? ed.quality : "1080p",
      };
    },
    size = (ratio, quality) => edRatios[ratio].map((v) => Math.round((v * EditorModel.QUALITIES[quality]) / 2) * 2);
  const body = () => {
    const { ratio, quality } = target(),
      [w, h] = size(ratio, quality),
      k4 = size(ratio, "4K"),
      small = p.clips.some(
        (c) =>
          ["video", "image"].includes(c.kind) &&
          !(c.asset?.width >= k4[0] && c.asset?.height >= k4[1]),
      ),
      delivery = ed.delivery?.ratios?.[ratio],
      custom = st.platform === "自訂";
    return `<h3>匯出影片</h3>
<p class="note">輸出到</p>${edChoices("輸出到", "platform", st.platform, edExportPlatforms.map(([name]) => name))}
${st.platform === "Instagram 貼文" ? edChoices("Instagram 比例", "instagram", st.instagram, ["1:1", "4:5"]) : ""}
<p data-ed-export-spec>${esc(`${ratio} · ${w}×${h} · ${quality === "1080p" ? "1080P" : quality === "720p" ? "720P" : "4K"} · ${Timebase.label(p.timebase)} · MP4`)}</p>
${custom ? `<p class="note">畫質</p>${edChoices("畫質", "quality", ed.quality, Object.keys(EditorModel.QUALITIES), (q) => edExportQualityText[q] + "（" + size(ratio, q).join("×") + "）")}` : ""}
${quality === "4K" && small ? '<p class="note" data-ed-upscale>來源低於 4K，會放大</p>' : ""}
<p class="note">影片浮水印</p>${
      st.mark
        ? edChoices("影片浮水印", "watermark", st.useMark ? "套用" : "不套用", ["不套用", "套用"]) + (st.useMark ? `<p class="note" data-ed-watermark-name>${esc(st.mark.name || "浮水印")}，右下角、整段影片</p>` : "")
        : `${edChoices("影片浮水印", "watermark", "不套用", ["不套用"])}<p class="note">尚未設定浮水印。<button type="button" class="btn small" data-ed-watermark-setup>前往設定浮水印 ↗</button></p>`
    }
<p data-ed-export-total>剪輯總時長：<b>${edClockText(edTotal())}</b>　預估費用：<b data-ed-export-cost>免費（本機輸出，不扣點）</b></p>
<p class="note" data-ed-delivery>適合投遞：${
      !ed.delivery
        ? "讀取中…"
        : delivery?.platforms
          ? esc(delivery.platforms.map((x) => x.platform + (x.preferred ? "（首選）" : "")).join("、"))
          : esc(delivery?.note || "此比例尚不能投遞")
    }</p>
<div class="editor-export-actions"><button class="btn" type="button" data-ed-export-cancel>取消</button><button class="btn primary" type="button" data-ed-export${st.busy ? " disabled" : ""}>開始匯出</button></div>`;
  };
  const d = edDialog(`<div data-ed-export-body>${body()}</div>`),
    refresh = () => {
      const box = d.querySelector("[data-ed-export-body]");
      if (box) box.innerHTML = VideoWorkbench.sanitize(body());
      wire();
    };
  if (!ed.delivery)
    VideoWorkbench.request("/delivery-ratios", undefined, "GET")
      .then((value) => {
        ed.delivery = value;
        refresh();
      })
      .catch(VideoWorkbench.reportError);
  // The watermark must still be a library watermark (the same check the 貼圖 pane makes).
  Promise.all([
    VideoWorkbench.preferences.get("tools.editor.watermark", null),
    VideoWorkbench.assets.list(),
  ])
    .then(([mark, rows]) => {
      st.mark = mark?.url && rows.some((a) => a.id === mark.id && a.watermark === true) ? mark : null;
      refresh();
    })
    .catch(VideoWorkbench.reportError);
  const choose = (prefix, apply) =>
    d.querySelectorAll(`[data-ed-action^="${prefix}:"]`).forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        apply(b.dataset.edAction.slice(prefix.length + 1));
        refresh();
      };
    });
  function wire() {
    choose("platform", (v) => (st.platform = v));
    choose("instagram", (v) => (st.instagram = v));
    choose("quality", (v) => (ed.quality = v));
    choose("watermark", (v) => (st.useMark = v === "套用"));
    d.querySelector("[data-ed-watermark-setup]")?.addEventListener("click", () => {
      d.close();
      document.querySelector('[data-ed-pane="貼圖"]')?.click();
    });
    d.querySelector("[data-ed-export-cancel]").onclick = () => d.close();
    d.querySelector("[data-ed-export]").onclick = async (e) => {
      e.target.disabled = st.busy = true; // a late reload of the watermark / delivery rebuilds the body: it must not re-enable the button
      try {
        p.clips.forEach(edValidate);
        const { ratio, quality } = target(),
          job = await VideoWorkbench.generations.create({
            type: "video",
            operation: "editor-export",
            settings: {
              quality,
              project: edExportProject(p, ratio, st.useMark ? st.mark : null),
              projectRevision: p.revision || 0,
            },
          });
        d.close();
        VideoWorkbench.showJob(job);
      } catch (err) {
        VideoWorkbench.reportError(err);
        e.target.disabled = st.busy = false;
      }
    };
  }
  wire();
}
