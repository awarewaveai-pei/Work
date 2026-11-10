// Card ED.0: the export dialog (spec §3 檔案歸屬: ED.8), opened by edAction("export") in tools-editor.js.
// Export (card P2): quality buttons (720p / 1080p / 4K), the loudness target, a 4K upscale warning and the
// platforms the project's ratio fits (main-system RATIO_PREFERENCE via /delivery-ratios).
function edExportDialog(p) {
  const [w, h] = edRatios[p.ratio],
    k4 = [w * 2, h * 2],
    small = p.clips.some(
      (c) =>
        ["video", "image"].includes(c.kind) &&
        !(c.asset?.width >= k4[0] && c.asset?.height >= k4[1]),
    );
  const body = () => {
    const delivery = ed.delivery?.ratios?.[p.ratio];
    return `<h3>匯出影片</h3><p>${esc(p.ratio + " · MP4 · " + Timebase.label(p.timebase) + " · BT.709 TV 範圍 · 響度 " + p.output.loudness + " LUFS")}</p>${edChoices("畫質", "quality", ed.quality, Object.keys(EditorModel.QUALITIES), (q) => q + "（" + Math.round((w * EditorModel.QUALITIES[q]) / 2) * 2 + "×" + Math.round((h * EditorModel.QUALITIES[q]) / 2) * 2 + "）")}${ed.quality === "4K" && small ? '<p class="note" data-ed-upscale>來源低於 4K，會放大</p>' : ""}<p class="note" data-ed-delivery>適合投遞：${
      !ed.delivery
        ? "讀取中…"
        : delivery?.platforms
          ? esc(
              delivery.platforms
                .map((x) => x.platform + (x.preferred ? "（首選）" : ""))
                .join("、"),
            )
          : esc(delivery?.note || "此比例尚不能投遞")
    }</p><button class="btn primary" type="button" data-ed-export>開始匯出</button>`;
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
  function wire() {
    d.querySelectorAll('[data-ed-action^="quality:"]').forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        ed.quality = b.dataset.edAction.slice(8);
        refresh();
      };
    });
    d.querySelector("[data-ed-export]").onclick = async (e) => {
      e.target.disabled = true;
      try {
        p.clips.forEach(edValidate);
        const job = await VideoWorkbench.generations.create({
          type: "video",
          operation: "editor-export",
          settings: {
            quality: ed.quality,
            project: edNative(p),
            projectRevision: p.revision || 0,
          },
        });
        d.close();
        VideoWorkbench.showJob(job);
      } catch (err) {
        VideoWorkbench.reportError(err);
        e.target.disabled = false;
      }
    };
  }
  wire();
}
