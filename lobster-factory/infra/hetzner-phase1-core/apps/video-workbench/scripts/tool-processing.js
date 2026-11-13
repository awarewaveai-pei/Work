async function submitTool() {
  try {
    if (
      !["voice", "music"].includes(tool) &&
      !files[tool === "region" ? "image" : "src"]
    )
      throw Error("請先選擇來源素材");
    if (tool === "watermark" && !files.png) throw Error("請選擇 PNG 浮水印");
    if (tool === "cta" && val("ctaType", "文字按鈕") === "文字按鈕") {
      const text = val("ctaText", "立即購買").trim();
      if (!text) throw Error("請填寫按鈕文字");
      const canvas = document.createElement("canvas");
      canvas.width = 600;
      canvas.height = 140;
      const ctx = canvas.getContext("2d");
      if (val("ctaShadow", true)) {
        ctx.shadowColor = "rgba(0,0,0,.4)";
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 3;
      }
      ctx.fillStyle = val("ctaColor", "#ef4343");
      ctx.beginPath();
      ctx.roundRect(
        10,
        10,
        580,
        120,
        val("ctaShape", "膠囊") === "膠囊"
          ? 60
          : val("ctaShape") === "方形"
            ? 0
            : 20,
      );
      if (val("ctaFill", "實色") !== "透明") ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.font = "bold 56px sans-serif";
      ctx.fillStyle = val("ctaFontColor", "#ffffff");
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 300, 70, 550);
      const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
      files.ctaImage = await VideoWorkbench.uploadAsset(
        new File([blob], "cta.png", { type: "image/png" }),
        { derived: true },
      );
    }
    const selected = files.src?.url;
    if (["watermark", "cta"].includes(tool) && selected) {
      const video = document.querySelector("video");
      values.overlayWidth = Math.max(
        16,
        Math.round(
          ((video?.videoWidth || 1280) *
            Number(val("大小", tool === "cta" ? 40 : 22))) /
            100,
        ),
      );
    }
    const type =
        tool === "voice" || tool === "music"
          ? "audio"
          : tool === "region"
            ? "image"
            : "video";
    let prompt = tool === "voice" ? val("voiceText") : tool === "music" ? val("musicPrompt") : "",
      references = files,
      settings = values,
      mask;
    // The region tool's prompt, source, mask and model settings: scripts/tools-region.js.
    if (tool === "region") ({ prompt, references, settings, mask } = await regionJobInput());
    // paid: video.image (the region tool; the other tools reaching here run locally)
    const job = await VideoWorkbench.generations.create({
      type,
      prompt,
      operation: tool,
      settings,
      references,
      mask,
      selection,
    });
    VideoWorkbench.showJob(job);
  } catch (e) {
    VideoWorkbench.reportError(e);
  }
}
