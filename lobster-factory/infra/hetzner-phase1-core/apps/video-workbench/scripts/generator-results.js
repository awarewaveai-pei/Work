// Result actions restore or route drafts. They never submit a generation.
const generatorResultTools = ["region", "voice", "edit", "short", "follow", "subtitle", "upscale", "enhance", "sfx", "music", "watermark", "cta", "privacy", "depth", "separate"];
function generatorRestoredAsset(asset, bucket = "images") {
  const extension = String(asset.url || "").split(/[?#]/)[0].split(".").at(-1).toLowerCase();
  const mime = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4" }[extension];
  return { ...structuredClone(asset), name: asset.name || "已保存參考素材", type: asset.type || mime || (bucket === "audios" ? "audio/mpeg" : ["videos", "source", "motionVideo"].includes(bucket) ? "video/mp4" : "image/png") };
}
async function generatorResultAction(payload) {
  if (payload.intent === "restore-job") {
    const input = payload.job?.input;
    if (!input) throw Error("這筆任務沒有可還原的設定");
    if (input.operation === 'editor-export') return generatorOpenTool({ tool: 'edit', project: input.settings.project });
    if (input.operation === 'follow-track') return generatorOpenTool({ tool: 'follow', asset: input.references.src, settings: { ...(input.settings.followDraft || {}), followStart: input.settings.start, followEnd: input.settings.end, followMode: '跟拍人物', followTrack: input.settings.followDraft?.followTrack || input.settings.points } });
    if (input.operation === 'follow-manual') return generatorOpenTool({ tool: 'follow', asset: input.references.src, settings: { followStart: input.settings.start, followEnd: input.settings.end, followCenter: input.settings.center * 100 } });
    if (input.operation === 'subtitle-burn') return generatorOpenTool({ tool: 'subtitle', asset: input.references.src, settings: { subtitleCues: input.settings.cues.map(cue => ({ ...cue, id: crypto.randomUUID() })), subtitleStyle: input.settings.style, subtitleColor: input.settings.color, subtitleSize: input.settings.size, subtitlePosition: input.settings.position } });
    if (input.operation === 'voice-overlay') return generatorOpenTool({ tool: 'voice', asset: input.references.src, settings: { voiceMode: '影片／圖片配音', voiceSourceKind: input.settings.image ? '圖片' : '影片', voiceAsMusic: true } });
    if (generatorResultTools.includes(input.operation)) {
      const asset = input.references?.src || input.references?.images?.[0] || input.references?.image;
      return generatorOpenTool({ tool: input.operation, asset, settings: input.settings, selection: input.selection });
    }
    const mode = tabs.some(([key]) => key === input.mode) ? input.mode : payload.job.type === "image" ? "image" : payload.job.type === "audio" ? "spoken" : "reference";
    generatorSwitchMode(mode);
    for (const key of Object.keys(state.refs[mode])) state.refs[mode][key] = [];
    if (input.references && !Array.isArray(input.references)) {
      for (const [key, rows] of Object.entries(input.references)) if (key in state.refs[mode] && Array.isArray(rows)) state.refs[mode][key] = rows.slice(0, max[mode][key]).map(asset => generatorRestoredAsset(asset, key));
    } else if (Array.isArray(input.references) && state.refs[mode].images) state.refs[mode].images = input.references.slice(0, max[mode].images).map(asset => generatorRestoredAsset(asset));
    if (input.references?.src && mode === "image") state.refs.image.images = [generatorRestoredAsset(input.references.src)];
    const settings = input.settings || {};
    const defaults = generatorDefaultSettings(mode);
    for (const key of generatorSettingKeys) if (key !== "style") state[key] = structuredClone(settings[key] ?? defaults[key]);
    // The video model that job ran (card RV); a value the server does not offer becomes its default, like the server.
    if (generatorVideoMode(mode)) state.model[mode] = VideoWorkbenchVideoModels.get(VideoWorkbench.capabilities, settings.model).id;
    if (!settings.ratios) state.ratios = [settings.ratio || state.ratio];
    // draftPrompt = what the user typed; prompt also carries applied skill guidance (generator-controls.js).
    const typed = input.draftPrompt ?? input.prompt ?? "";
    state.data[mode] = typed;
    if (mode === "reference") state.refType = ["all", "first", "motion"].includes(input.referenceMode) ? input.referenceMode : "all";
    if (mode === "cartoon") state.style = styles.indexOf(input.cartoonStyle);
    if (mode === "director") {
      state.directorConversationId = crypto.randomUUID(); state.directorChatInput = ""; state.directorPhase = "script";
      state.directorMessages = [{ role: "user", text: "已保存腳本，接下來請依此協助修改：\n" + typed, phase: "script" }, { role: "assistant", text: typed, choices: [] }];
      state.directorScript = typed; state.directorLength = settings.duration || input.duration || 8; state.directorStage = "video";
    }
    if (mode === "product") {
      state.productStep = 3; state.productData = structuredClone(input.product || { title: "已保存商品", description: "" });
      state.productUrl = input.url || input.productUrl || "";
      state.productImages = (input.references?.images || []).map((asset) => asset.url);
      state.productSelectedImages = state.productImages.map((_, index) => index);
      state.productTexts = state.productData.description ? [state.productData.description] : [];
      state.productSelectedTexts = state.productTexts.map((_, index) => index);
      state.productProposals = input.proposal ? [structuredClone(input.proposal)] : [];
      state.productScriptStyle = input.scriptStyle || "";
      state.productSelectedProposal = 0; state.productScripts = structuredClone(input.scripts || []);
      if (input.direction) state.productDirection = structuredClone(input.direction);
      state.productDuration = settings.duration || input.duration || 8;
    }
    if (mode === "spoken") { state.voice = input.voice || ""; state.cast = input.cast?.id || ""; state.castName = input.cast?.name || ""; state.spokenVisualDirection = input.cast?.direction || ""; state.performance = input.instructions || ""; state.spokenPanel = "none"; }
    generatorNormalizeSettings();
    VideoWorkbench.router.activate("generator"); close(); render();
    return { ok: true, mode };
  }
  if (payload.intent === "open-tool") return generatorOpenTool(payload);
  if (payload.intent !== "use-result" || !["first", "motion", "spoken"].includes(payload.action)) throw Error("未知成果操作");
  const asset = payload.asset;
  if (!asset || !VideoWorkbench.safeUrl(asset.url) || VideoWorkbench.mediaKind(asset) !== "image") throw Error("這個操作需要圖片成果");
  const copy = { ...structuredClone(asset), type: asset.type || "image/png" };
  if (payload.action === "spoken") {
    await VideoWorkbench.assets.save(copy);
    generatorSwitchMode("spoken");
    state.cast = copy.id; state.castName = copy.name; state.spokenPanel = "none";
  } else {
    generatorSwitchMode("reference");
    state.refType = payload.action === "first" ? "first" : "motion";
    state.refs.reference[payload.action === "first" ? "firstFrame" : "motionImage"] = [copy];
  }
  VideoWorkbench.router.activate("generator"); close(); render();
  return { ok: true, mode: state.mode };
}
// Which tools exist is checked once, by the tools page (tools-0.js acceptAsset against TOOLS).
async function generatorOpenTool(payload) {
  if (payload.asset && !VideoWorkbench.safeUrl(payload.asset.url)) throw Error("素材網址無效");
  if (payload.asset) payload = { ...payload, asset: generatorRestoredAsset(payload.asset, payload.tool === "region" ? "images" : "source") };
  VideoWorkbench.router.activate("tools");
  const frame = document.getElementById("toolsFrame"), deadline = Date.now() + 10000;
  while (!frame.contentWindow?.VideoWorkbench?.tools?.acceptAsset) {
    if (Date.now() > deadline) throw Error("工具載入逾時，請重新開啟工具");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return frame.contentWindow.VideoWorkbench.tools.acceptAsset(structuredClone(payload));
}
