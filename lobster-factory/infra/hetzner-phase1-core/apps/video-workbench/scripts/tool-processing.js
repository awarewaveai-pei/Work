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
            : "video",
      prompt =
        tool === "voice"
          ? val("voiceText")
          : tool === "music"
            ? val("musicPrompt")
            : tool === "region"
              ? regionInstructionsPrompt()
              : "";
    let references = files,
      mask;
    if (tool === "region") {
      if (!selection.regions?.length && !String(val("regionPrompt")).trim())
        throw Error("請先框選區域，或填寫整體修改指令");
      const image = new Image();
      image.src = files.image.url;
      await image.decode();
      Object.assign(values, { imageLayout: 'region-preserve', quality: val('regionQuality', '2K'), regionWidth: image.naturalWidth, regionHeight: image.naturalHeight });
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0);
      const png = await new Promise((r) => canvas.toBlob(r, "image/png"));
      const reference = await VideoWorkbench.uploadAsset(
        new File([png], "region-source.png", { type: "image/png" }),
        { derived: true },
      );
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (!selection.regions?.length) ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const r of selection.regions || [])
        ctx.clearRect(
          r.x * canvas.width,
          r.y * canvas.height,
          r.w * canvas.width,
          r.h * canvas.height,
        );
      mask = (
        await VideoWorkbench.request("/uploads", {
          name: "region-mask.png",
          data: canvas.toDataURL("image/png"),
        })
      ).url;
      references = { images: [reference] };
    }
    const job = await VideoWorkbench.generations.create({
      type,
      prompt,
      operation: tool,
      settings: values,
      references,
      mask,
      selection,
    });
    VideoWorkbench.showJob(job);
  } catch (e) {
    VideoWorkbench.reportError(e);
  }
}
