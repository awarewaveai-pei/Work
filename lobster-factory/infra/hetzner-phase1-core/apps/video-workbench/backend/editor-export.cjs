const fs = require("node:fs"),
  path = require("node:path");
const { inspectMedia, verifyOutput } = require("./media-inspect.cjs"),
  { filterPath, assTime, assColor } = require("./subtitle-burn.cjs"),
  Timebase = require("../shared/timebase.js"),
  EditorModel = require("../shared/editor-model.js");
const ratios = {
  "16:9": [1920, 1080],
  "9:16": [1080, 1920],
  "1:1": [1080, 1080],
  "4:5": [1080, 1350],
  "4:3": [1440, 1080],
};
const filters = {
  原始: "",
  鮮豔: "eq=saturation=1.4:contrast=1.08",
  復古: "colorbalance=rs=.1:gs=.02:bs=-.08,eq=saturation=.75",
  黑白: "hue=s=0",
  暖色: "colorbalance=rs=.08:bs=-.06",
  冷色: "colorbalance=rs=-.06:bs=.08",
  電影感: "eq=contrast=1.15:saturation=.8:brightness=-.025",
  底片: "eq=contrast=.92:saturation=.85:brightness=.035",
  黃金時刻: "colorbalance=rs=.14:gs=.06:bs=-.1",
  憂鬱: "eq=saturation=.6:brightness=-.03,colorbalance=bs=.06",
  清新: "eq=saturation=1.1:brightness=.04",
  賽博霓虹: "colorbalance=rs=.12:bs=.16,eq=saturation=1.5:contrast=1.1",
  黑色電影: "hue=s=0,eq=contrast=1.3:brightness=-.04",
  美食: "eq=saturation=1.25:brightness=.035,colorbalance=rs=.04",
  人像: "eq=contrast=1.02:brightness=.025:saturation=.95",
  冷冽: "colorbalance=bs=.13:rs=-.08,eq=contrast=1.12:saturation=.75",
};
function number(value, fallback, min, max, name) {
  const n = Number(value ?? fallback);
  if (!Number.isFinite(n) || n < min || n > max) throw Error(name + "超出範圍");
  return n;
}
function frames(value, min, max, name) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw Error(name + "超出範圍");
  return value;
}
// Card M3 (plan §3 invariant 5): the client sends integer frames + the project timebase; seconds are derived here
// only for FFmpeg arguments. A seconds-only payload (pre-M3 page or an old job retried) is refused, not guessed.
function validateProject(raw, quality = "1080p") {
  if (
    !raw ||
    !Object.hasOwn(ratios, raw.ratio) ||
    !Object.hasOwn(EditorModel.QUALITIES, quality) ||
    !Array.isArray(raw.clips) ||
    !raw.clips.length ||
    raw.clips.length > 2064 ||
    raw.clips.filter((c) => c?.kind !== "text").length > 64 ||
    raw.clips.filter((c) => c?.kind === "text").length > 2000
  )
    throw Error("剪輯專案比例、畫質或片段資料無效");
  if (raw.clips.some((c) => c?.startFrame === undefined || c?.durationFrames === undefined))
    throw Error("剪輯專案是舊格式（以秒記錄時間），請重新開啟剪輯頁後再匯出");
  if (!Timebase.find(raw.timebase)) throw Error("剪輯專案影格率無效");
  const tb = Timebase.check(raw.timebase),
    perHour = Math.ceil(3600 * Timebase.fps(tb));
  // Card P2: an ordered track array (first video track = bottom = full-frame main track); the pre-P2 object of
  // five fixed tracks (or none) reads as V1, V2, T, A1, A2.
  let tracks;
  try {
    tracks = EditorModel.normalizeTracks(raw.tracks, { strict: true });
  } catch (error) {
    throw Error("軌道資料無效：" + error.message);
  }
  const trackOf = new Map(tracks.map((t) => [t.id, t])),
    mainTrack = EditorModel.mainTrack(tracks),
    loudness = number(raw.output?.loudness, EditorModel.LOUDNESS.neutral, EditorModel.LOUDNESS.min, EditorModel.LOUDNESS.max, "響度目標");
  const clips = raw.clips.map((c) => {
    const track = trackOf.get(c?.track);
    if (
      !track ||
      !["video", "image", "audio", "text"].includes(c.kind) ||
      (track.kind === "text") !== (c.kind === "text") ||
      (track.kind === "audio") !== (c.kind === "audio")
    )
      throw Error("片段與軌道類型不相符");
    const overlay = track.kind === "video" && c.track !== mainTrack;
    const startFrame = frames(c.startFrame, 0, perHour, "片段起點"),
      durationFrames = frames(c.durationFrames, 1, perHour, "片段長度"),
      sourceStartFrame = frames(c.sourceStartFrame ?? 0, 0, perHour * 24, "來源起點"),
      start = Timebase.toSeconds(startFrame, tb),
      duration = Timebase.toSeconds(durationFrames, tb),
      speed = number(c.speed, 1, 0.25, 4, "播放速度");
    const filter = c.filter || track.filter || raw.filter || "原始";
    if (!Object.hasOwn(filters, filter)) throw Error("濾鏡不存在");
    if (
      c.mask &&
      c.mask !== "無" &&
      !["圓形", "圓角矩形", "三角形"].includes(c.mask)
    )
      throw Error("遮罩不存在");
    const transition = EditorModel.transitionName(c.transition);
    if (transition === null) throw Error("轉場不存在");
    if (c.transitionFrames !== undefined) {
      const { min, max } = EditorModel.transitionLimits(tb);
      frames(c.transitionFrames, min, max, "轉場長度");
    }
    if (c.lut !== undefined && c.lut !== null && (typeof c.lut?.url !== "string" || !/\.cube$/i.test(c.lut.url)))
      throw Error("LUT 必須是素材庫的 .cube 檔");
    if (
      c.transitionCurve &&
      !["線性", "平滑", "加速"].includes(c.transitionCurve)
    )
      throw Error("轉場曲線不存在");
    const clip = {
      ...c,
      startFrame,
      durationFrames,
      sourceStartFrame,
      start,
      duration,
      speed,
      sourceStart: Timebase.toSeconds(sourceStartFrame, tb),
      opacity: number(c.opacity, 1, 0, 1, "不透明度"),
      scale: number(c.scale, 1, 0.1, 5, "縮放"),
      overlay,
      x: number(
        c.x,
        overlay ? 80 : c.kind === "text" ? 50 : 0,
        overlay || c.kind === "text" ? 0 : -8000,
        overlay || c.kind === "text" ? 100 : 8000,
        "水平位置",
      ),
      y: number(
        c.y,
        overlay ? 80 : c.kind === "text" ? 80 : 0,
        overlay || c.kind === "text" ? 0 : -8000,
        overlay || c.kind === "text" ? 100 : 8000,
        "垂直位置",
      ),
      rotation: number(c.rotation, 0, -360, 360, "旋轉"),
      volume: number(c.volume, 1, 0, 4, "片段音量"),
      fadeIn: number(c.fadeIn, 0, 0, Math.min(10, duration / 2), "淡入"),
      fadeOut: number(c.fadeOut, 0, 0, Math.min(10, duration / 2), "淡出"),
      width: number(c.width, 25, 1, 100, "疊加寬度"),
      filter,
      grain: number(c.grain, 0, 0, 1, "顆粒"),
      transition,
      transitionFrames: EditorModel.transitionFrames(c, tb),
      volumeKeys: EditorModel.volumeKeys(c.volumeKeys, durationFrames),
      ...Object.fromEntries(
        Object.entries(EditorModel.COLOR).map(([key, r]) => [key, number(c[key], r.neutral, r.min, r.max, r.label)]),
      ),
      lut: c.lut ? { url: c.lut.url, name: String(c.lut.name || "LUT") } : null,
    };
    if (c.kind === "text") {
      if (typeof c.text !== "string" || c.text.length > 4000)
        throw Error("文字片段內容無效");
      clip.fontSize = number(c.fontSize, 36, 8, 300, "文字大小");
      clip.color = /^#[\da-f]{6}$/i.test(c.color || "") ? c.color : "#ffffff";
      clip.backgroundColor = /^#[\da-f]{6}$/i.test(c.backgroundColor || "")
        ? c.backgroundColor
        : null;
      if (
        c.animation &&
        !["無", "淡入淡出", "彈出", "逐字顯示"].includes(c.animation)
      )
        throw Error("文字動畫無效");
    } else if (!c.asset || typeof c.asset.url !== "string")
      throw Error("片段缺少來源素材");
    return clip;
  });
  if (
    clips.some(
      (c) => typeof c.id !== "string" || !/^[\w-]{1,100}$/.test(c.id),
    ) ||
    new Set(clips.map((c) => c.id)).size !== clips.length
  )
    throw Error("片段識別碼無效或重複");
  const totalFrames = Math.max(...clips.map((c) => c.startFrame + c.durationFrames)),
    duration = Timebase.toSeconds(totalFrames, tb);
  if (totalFrames > perHour) throw Error("剪輯匯出單次最長一小時");
  const scale = EditorModel.QUALITIES[quality],
    [baseWidth, baseHeight] = ratios[raw.ratio];
  return {
    ...raw,
    tracks,
    mainTrack,
    loudness,
    clips,
    timebase: tb,
    totalFrames,
    duration,
    width: Math.round((baseWidth * scale) / 2) * 2,
    height: Math.round((baseHeight * scale) / 2) * 2,
    baseWidth,
    baseHeight,
  };
}
// Invariant 8 (2): sample frames only where the output must equal the source (scaled): an untouched full-frame V1
// video clip at the source's own frame rate, nothing else on screen within any transition reach. Styled clips are
// skipped, not guessed; real footage after one x264 pass sits well above 28 dB, a wrong frame of moving footage below.
function frameChecks(project, indexed, width, height) {
  const tb = project.timebase,
    margin = Math.ceil(2 * Timebase.fps(tb)) + 1,
    checks = [];
  for (const { clip, metadata, source } of indexed) {
    if (checks.length >= 3) break;
    const rate = metadata.probe?.frameRate;
    if (
      clip.kind !== "video" || clip.track !== project.mainTrack || clip.speed !== 1 || clip.opacity !== 1 || clip.scale !== 1 ||
      clip.x !== 0 || clip.y !== 0 || clip.rotation !== 0 || clip.grain !== 0 || clip.filter !== "原始" || EditorModel.graded(clip) ||
      (clip.mask && clip.mask !== "無") || clip.fadeIn || clip.fadeOut || clip.durationFrames < 2 * margin + 1 ||
      !rate || rate.num * tb.den !== tb.num * rate.den ||
      !metadata.displayWidth || metadata.displayWidth * height !== metadata.displayHeight * width
    )
      continue;
    const mid = clip.startFrame + Math.floor(clip.durationFrames / 2);
    if (
      project.clips.some(
        (o) => o !== clip && o.kind !== "audio" && mid >= o.startFrame - margin && mid < o.startFrame + o.durationFrames + margin,
      )
    )
      continue;
    checks.push({ outFrame: mid, source, sourceFrame: clip.sourceStartFrame + (mid - clip.startFrame), minPsnr: 28 });
  }
  return checks;
}
function tempo(speed) {
  const parts = [];
  let remaining = speed;
  while (remaining > 2) {
    parts.push("atempo=2");
    remaining /= 2;
  }
  while (remaining < 0.5) {
    parts.push("atempo=0.5");
    remaining /= 0.5;
  }
  parts.push("atempo=" + remaining);
  return parts.join(",");
}
function fontFile(clip) {
  if (process.platform !== "win32") return null;
  const file =
    {
      Arial: clip.bold ? "arialbd.ttf" : "arial.ttf",
      Georgia: clip.bold ? "georgiab.ttf" : "georgia.ttf",
      等寬字: "consola.ttf",
      思源宋體: "mingliu.ttc",
      思源黑體: clip.bold ? "msjhbd.ttc" : "msjh.ttc",
    }[clip.font] || "msjh.ttc";
  const candidate = path.join(
    process.env.WINDIR || "C:\\Windows",
    "Fonts",
    file,
  );
  return fs.existsSync(candidate) ? candidate : null;
}
// Card P2: a .cube 3D LUT that lut3d can read: text, LUT_3D_SIZE 2..65 and exactly size^3 rows of three numbers.
function checkCube(text) {
  if (typeof text !== "string" || text.length > 8 * 1024 * 1024) throw Error("LUT 檔太大或不是文字");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  let size = 0,
    rows = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^LUT_3D_SIZE\s+(\d+)$/.exec(line);
    if (m) {
      size = Number(m[1]);
      continue;
    }
    if (/^(TITLE|DOMAIN_MIN|DOMAIN_MAX|LUT_3D_INPUT_RANGE)\b/.test(line)) continue;
    if (/^LUT_1D_SIZE\b/.test(line)) throw Error("只支援 3D LUT（LUT_3D_SIZE）");
    const values = line.split(/\s+/);
    if (values.length !== 3 || values.some((v) => !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(v))) throw Error("LUT 檔內容格式錯誤");
    rows++;
  }
  if (size < 2 || size > 65 || rows !== size ** 3) throw Error("LUT 檔需有 LUT_3D_SIZE（2–65）且資料列數相符");
  return size;
}
// Per-clip colour (card P2): exposure (EV, x2^EV on the encoded values), white balance, contrast/saturation, LUT.
function gradeSteps(clip, lutFile) {
  const steps = [];
  if (clip.exposure) steps.push(`exposure=exposure=${clip.exposure}`);
  if (clip.temperature !== 6500) steps.push(`colortemperature=temperature=${clip.temperature}`);
  if (clip.contrast !== 1 || clip.saturation !== 1) steps.push(`eq=contrast=${clip.contrast}:saturation=${clip.saturation}`);
  if (lutFile) steps.push(`lut3d=file='${filterPath(lutFile)}'`);
  return steps;
}
// Volume keyframes -> a volume=eval=frame expression of t (seconds from the clip's start), linear between keys.
function gainExpression(keys, fps, scale) {
  const points = keys.map((k) => [k.frame / fps, k.gain * scale]);
  let expr = String(points.at(-1)[1]);
  for (let i = points.length - 2; i >= 0; i--) {
    const [t0, g0] = points[i],
      [t1, g1] = points[i + 1];
    expr = `if(lt(t,${t1}),${g0}+(${g1 - g0})*(t-${t0})/${t1 - t0},${expr})`;
  }
  return `if(lt(t,${points[0][0]}),${points[0][1]},${expr})`;
}
const TRUE_PEAK_CEILING = -2; // dBTP for loudnorm and the limiter; the export must measure <= -1 dBTP after AAC.
async function exportEditor(
  raw,
  { file, output, signal, run },
  quality = "1080p",
) {
  const project = validateProject(raw, quality),
    { width, height, duration, totalFrames, timebase: tb, tracks, mainTrack, loudness } = project,
    rate = Timebase.ffRate(tb),
    fps = Timebase.fps(tb),
    total = Timebase.ffTime(totalFrames, tb),
    order = new Map(tracks.map((t, i) => [t.id, i])),
    getTrack = (id) => tracks.find((t) => t.id === id) || {},
    visible = (c) => !c.hidden && !getTrack(c.track).hidden;
  // Transitions sit at a cut between two adjacent main-track clips, centred on the cut: the outgoing clip runs
  // `after` frames past its out point, the incoming one starts `before` frames before its in point (xfade).
  const mainClips = project.clips
      .filter((c) => c.track === mainTrack && visible(c))
      .sort((a, b) => a.startFrame - b.startFrame),
    incoming = new Map(),
    outgoing = new Map();
  mainClips.forEach((clip, i) => {
    if (clip.transition === "無") return;
    const previous = mainClips[i - 1];
    if (!previous || previous.startFrame + previous.durationFrames !== clip.startFrame)
      throw Error("轉場只能放在主影片軌上相鄰（無空隙）的兩段之間，可開啟時間軸的「磁性主軌」補齊空隙");
    const before = Math.floor(clip.transitionFrames / 2),
      transition = { type: EditorModel.TRANSITIONS[clip.transition], frames: clip.transitionFrames, before, after: clip.transitionFrames - before, cut: clip.startFrame };
    incoming.set(clip.id, transition);
    outgoing.set(previous.id, transition);
  });
  for (const clip of mainClips)
    if ((incoming.get(clip.id)?.after || 0) + (outgoing.get(clip.id)?.before || 0) > clip.durationFrames)
      throw Error("轉場太長：片段長度需大於兩側轉場各一半");
  const handles = (clip) => (clip.overlay ? { pre: 0, post: 0 } : { pre: incoming.get(clip.id)?.before || 0, post: outgoing.get(clip.id)?.after || 0 });
  const args = [
    "-y",
    "-hide_banner",
    "-filter_complex_threads",
    "1",
    "-f",
    "lavfi",
    "-i",
    `color=c=black:s=${width}x${height}:r=${rate}:d=${total}`,
    "-f",
    "lavfi",
    "-i",
    `anullsrc=r=48000:cl=stereo:d=${total}`,
  ];
  const sources = new Map(),
    indexed = [],
    temporary = [],
    graph = [],
    agraph = [],
    audio = ["[1:a]"];
  for (const clip of project.clips.filter((c) => c.kind !== "text")) {
    const url = clip.asset.url;
    let source;
    if (/^\/assets\/[\w.-]+\.(png|jpe?g|webp|mp4|webm|mp3|wav)$/i.test(url))
      source = path.join(__dirname, "../assets", url.split("/").at(-1));
    else source = file(url);
    if (!sources.has(source))
      sources.set(source, await inspectMedia(source, signal));
    const metadata = sources.get(source);
    if (
      (clip.kind === "video" && !metadata.video) ||
      (clip.kind === "audio" && !metadata.audio)
    )
      throw Error("素材類型與片段不符");
    if (
      clip.kind !== "image" &&
      metadata.duration &&
      clip.sourceStart + clip.duration * clip.speed > metadata.duration + 0.15
    )
      throw Error("片段超出原始素材時長");
    const index = indexed.length + 2;
    if (clip.kind === "image") {
      const { pre, post } = handles(clip);
      args.push("-loop", "1", "-framerate", rate, "-t", Timebase.ffTime(clip.durationFrames + pre + post, tb));
    }
    args.push("-i", source);
    indexed.push({ clip, metadata, index, source });
  }
  const lutFile = (clip) => {
    if (!clip.lut) return null;
    const found = file(clip.lut.url);
    if (!found || !fs.existsSync(found)) throw Error("找不到片段使用的 LUT 檔");
    return found;
  };
  let video = "[0:v]",
    layer = 0,
    chain = [];
  try {
    for (const { clip, metadata, index } of [...indexed]
      .filter((row) => row.clip.kind !== "audio")
      .sort((a, b) => order.get(a.clip.track) - order.get(b.clip.track) || a.clip.startFrame - b.clip.startFrame)) {
      if (!visible(clip)) continue;
      const overlay = clip.overlay,
        boxWidth = overlay
          ? Math.max(2, Math.round((width * clip.width) / 100 / 2) * 2)
          : width,
        boxHeight = overlay
          ? Math.max(
              2,
              Math.round(
                (boxWidth * (metadata.height || 1)) / (metadata.width || 1) / 2,
              ) * 2,
            )
          : height;
      const scaledWidth = Math.max(
          2,
          Math.round((boxWidth * clip.scale) / 2) * 2,
        ),
        scaledHeight = Math.max(
          2,
          Math.round((boxHeight * clip.scale) / 2) * 2,
        );
      // Handle frames for transitions come from the source; what the source lacks repeats its edge frame.
      const { pre, post } = handles(clip),
        frameCount = clip.durationFrames + pre + post;
      let availablePre = pre,
        availablePost = post,
        trimStart,
        trimDuration;
      if (clip.kind === "image") {
        trimStart = "0";
        trimDuration = Timebase.ffTime(frameCount, tb);
      } else {
        availablePre = Math.min(pre, Math.floor(clip.sourceStartFrame / clip.speed));
        const usedEnd = clip.sourceStart + clip.duration * clip.speed,
          left = metadata.duration ? Math.floor(((metadata.duration - usedEnd) * fps) / clip.speed) : 0;
        availablePost = Math.max(0, Math.min(post, left));
        const frames = clip.durationFrames + availablePre + availablePost;
        trimStart = clip.speed === 1 ? Timebase.ffTime(clip.sourceStartFrame - availablePre, tb) : String(Math.max(0, clip.sourceStart - (availablePre * clip.speed) / fps));
        trimDuration = clip.speed === 1 ? Timebase.ffTime(frames, tb) : String((frames / fps) * clip.speed);
      }
      // After fps= the stream time base is exactly 1/fps, so frame counts and the timeline offset are integers.
      const prefix = [
        `trim=start=${trimStart}:duration=${trimDuration}`,
        `setpts=(PTS-STARTPTS)/${clip.speed}`,
        "fps=" + rate,
        `tpad=start_mode=clone:start=${pre - availablePre}:stop_mode=clone:stop=${post - availablePost + 2}`,
        `trim=end_frame=${frameCount}`,
        "setpts=PTS-STARTPTS",
      ];
      const steps = [];
      let inputLabel = `[${index}:v]`;
      if (!overlay && clip.background === "模糊") {
        graph.push(
          `${inputLabel}${prefix.join(",")},split=2[sharp${layer}][back${layer}]`,
        );
        graph.push(
          `[back${layer}]scale=${scaledWidth}:${scaledHeight}:force_original_aspect_ratio=increase,crop=${scaledWidth}:${scaledHeight},boxblur=20:1[blur${layer}]`,
        );
        graph.push(
          `[sharp${layer}]scale=${scaledWidth}:${scaledHeight}:force_original_aspect_ratio=decrease,setsar=1[fit${layer}]`,
        );
        graph.push(
          `[blur${layer}][fit${layer}]overlay=(W-w)/2:(H-h)/2[prepared${layer}]`,
        );
        inputLabel = `[prepared${layer}]`;
      } else if (!overlay && clip.fit === "裁切")
        steps.push(
          ...prefix,
          `scale=${scaledWidth}:${scaledHeight}:force_original_aspect_ratio=increase`,
          `crop=${scaledWidth}:${scaledHeight}`,
        );
      else
        steps.push(
          ...prefix,
          `scale=${scaledWidth}:${scaledHeight}:force_original_aspect_ratio=decrease`,
          `pad=${scaledWidth}:${scaledHeight}:(ow-iw)/2:(oh-ih)/2:color=${overlay ? "black@0" : clip.background === "純色" && /^#[\da-f]{6}$/i.test(clip.backgroundColor || "") ? clip.backgroundColor : "black"}`,
        );
      steps.push("setsar=1", "format=rgba");
      const grade = gradeSteps(clip, lutFile(clip));
      if (filters[clip.filter] || clip.grain || grade.length) {
        // eq / exposure / lut3d drop alpha. Preserve the original alpha plane explicitly.
        graph.push(
          `${inputLabel}${steps.join(",")},split=2[color${layer}][alpha${layer}]`,
        );
        graph.push(`[alpha${layer}]alphaextract[plane${layer}]`);
        const effects = [
          ...grade,
          filters[clip.filter],
          clip.grain
            ? `noise=alls=${Math.round(clip.grain * 30)}:allf=t+u`
            : "",
          "format=rgb24",
        ].filter(Boolean);
        graph.push(`[color${layer}]${effects.join(",")}[tinted${layer}]`);
        graph.push(
          `[tinted${layer}][plane${layer}]alphamerge[filtered${layer}]`,
        );
        inputLabel = `[filtered${layer}]`;
        steps.length = 0;
      }
      if (clip.rotation)
        steps.push(
          `rotate=${clip.rotation}*PI/180:ow=rotw(iw):oh=roth(ih):c=none`,
        );
      const mask = clip.mask;
      if (mask && mask !== "無") {
        const condition =
          mask === "圓形"
            ? "lte(pow((X-W/2)/(W/2),2)+pow((Y-H/2)/(H/2),2),1)"
            : mask === "三角形"
              ? "lte(abs(X-W/2),Y*W/(2*H))"
              : "lte(pow(max(abs(X-W/2)-(W/2-min(W,H)*.12),0),2)+pow(max(abs(Y-H/2)-(H/2-min(W,H)*.12),0),2),pow(min(W,H)*.12,2))";
        steps.push(
          `geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(${condition},alpha(X,Y),0)'`,
        );
      }
      if (clip.opacity < 1) steps.push("colorchannelmixer=aa=" + clip.opacity);
      const x = overlay
          ? `(main_w-overlay_w)*${clip.x / 100}`
          : `(main_w-overlay_w)/2+${(clip.x * width) / project.baseWidth}`,
        y = overlay
          ? `(main_h-overlay_h)*${clip.y / 100}`
          : `(main_h-overlay_h)/2+${(clip.y * height) / project.baseHeight}`;
      const enter = incoming.get(clip.id),
        leave = outgoing.get(clip.id);
      if (!overlay && (enter || leave)) {
        // In a transition chain: flatten onto the black frame (the main track is the bottom layer, so this is
        // what it would show anyway), then xfade the chain and lay it on the timeline once.
        graph.push(`${inputLabel}${steps.length ? steps.join(",") : "null"}[clip${layer}]`);
        graph.push(`color=c=black:s=${width}x${height}:r=${rate}[canvas${layer}]`);
        graph.push(`[canvas${layer}][clip${layer}]overlay=x='${x}':y='${y}':shortest=1,trim=end_frame=${frameCount},setpts=PTS-STARTPTS[flat${layer}]`);
        chain.push({ clip, label: `[flat${layer}]` });
        layer++;
        if (leave) continue;
        const groupStart = chain[0].clip.startFrame,
          groupEnd = clip.startFrame + clip.durationFrames;
        let joined = chain[0].label;
        chain.slice(1).forEach(({ clip: next, label }, i) => {
          const t = incoming.get(next.id),
            out = `[xfade${layer}_${i}]`;
          graph.push(`${joined}${label}xfade=transition=${t.type}:duration=${Timebase.ffTime(t.frames, tb)}:offset=${Timebase.ffTime(t.cut - t.before - groupStart, tb)}${out}`);
          joined = out;
        });
        graph.push(`${joined}setpts=PTS+${groupStart}[group${layer}]`);
        graph.push(`${video}[group${layer}]overlay=enable='between(t,${(groupStart - 0.5) / fps},${(groupEnd - 0.5) / fps})':eof_action=pass[video${layer}]`);
        video = `[video${layer}]`;
        layer++;
        chain = [];
        continue;
      }
      steps.push(`setpts=PTS+${clip.startFrame}`);
      const sourceLabel = `[clip${layer}]`,
        next = `[video${layer}]`;
      graph.push(`${inputLabel}${steps.join(",")}${sourceLabel}`);
      graph.push(
        // Half-frame margins: output frames startFrame .. end-1 are on, whatever the float rounding of t.
        `${video}${sourceLabel}overlay=x='${x}':y='${y}':enable='between(t,${(clip.startFrame - 0.5) / fps},${(clip.startFrame + clip.durationFrames - 0.5) / fps})':eof_action=pass${next}`,
      );
      video = next;
      layer++;
    }
    const textClips = project.clips
      .filter((c) => c.kind === "text" && visible(c))
      .sort((a, b) => order.get(a.track) - order.get(b.track) || a.startFrame - b.startFrame);
    if (textClips.length) {
      const subtitle = output("ass");
      temporary.push(subtitle.file);
      let contents = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n`;
      const events = [];
      textClips.forEach((clip, index) => {
        const font =
          {
            Arial: "Arial",
            Georgia: "Georgia",
            等寬字: "Consolas",
            思源宋體:
              process.platform === "win32" ? "PMingLiU" : "Noto Serif CJK TC",
            思源黑體:
              process.platform === "win32"
                ? "Microsoft JhengHei"
                : "sans-serif",
          }[clip.font] ||
          (process.platform === "win32" ? "Microsoft JhengHei" : "sans-serif");
        const alpha = Math.round((1 - clip.opacity) * 255)
            .toString(16)
            .padStart(2, "0"),
          size = Math.max(
            8,
            Math.round(
              ((clip.fontSize * width) / project.baseWidth) * clip.scale,
            ),
          );
        const color = assColor(clip.color, alpha),
          background = assColor(
            clip.backgroundColor || "#000000",
            clip.backgroundColor ? "55" : "FF",
          );
        const alignment =
          clip.align === "靠左" ? 4 : clip.align === "靠右" ? 6 : 5;
        contents += `Style: S${index},${font},${size},${color},${assColor(clip.color, "FF")},${background},${background},${clip.bold ? -1 : 0},${clip.italic ? -1 : 0},0,0,100,100,0,${-clip.rotation},${clip.backgroundColor ? 3 : 1},${clip.backgroundColor ? 5 : 0},0,${alignment},10,10,0,1\n`;
        let text = clip.text
          .replace(/\\/g, "＼")
          .replace(/{/g, "｛")
          .replace(/}/g, "｝");
        if (clip.animation === "逐字顯示") {
          const interval = Math.max(
            1,
            Math.round(
              (Math.min(
                clip.duration * 0.6,
                Math.max(1, [...text].length * 0.06),
              ) *
                100) /
                Math.max(1, [...text].length),
            ),
          );
          text = [...text]
            .map((char) => (char === "\n" ? "\\N" : `{\\k${interval}}${char}`))
            .join("");
        } else text = text.replace(/\r?\n/g, "\\N");
        const animation =
          clip.animation === "淡入淡出"
            ? "\\fad(200,200)"
            : clip.animation === "彈出"
              ? "\\fscx50\\fscy50\\t(0,180,\\fscx100\\fscy100)"
              : "";
        events.push(
          `Dialogue: ${index},${assTime(clip.start)},${assTime(clip.start + clip.duration)},S${index},,0,0,0,,{\\pos(${Math.round((width * clip.x) / 100)},${Math.round((height * clip.y) / 100)})${animation}}${text}`,
        );
      });
      contents +=
        "\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n" +
        events.join("\n") +
        "\n";
      fs.writeFileSync(subtitle.file, contents, "utf8");
      const next = `[video${layer++}]`;
      graph.push(`${video}ass=filename='${filterPath(subtitle.file)}'${next}`);
      video = next;
    }
    // Overlays composite in BT.601 (FFmpeg's default for untagged RGB<->YUV); convert once to BT.709 TV range,
    // which the encoder flags below declare (plan §3 invariant 8: explicit colour space and range).
    graph.push(`${video}scale=in_color_matrix=bt601:out_color_matrix=bt709:in_range=tv:out_range=tv,format=yuv420p[videoout]`);
    let audioIndex = 0;
    for (const { clip, metadata, index } of indexed) {
      const track = getTrack(clip.track),
        trackGain = !visible(clip) || clip.muted || track.muted ? 0 : track.volume,
        peak = clip.volumeKeys.length ? Math.max(...clip.volumeKeys.map((k) => k.gain)) : clip.volume;
      if (!metadata.audio || !(trackGain * peak) || clip.kind === "image") continue;
      const steps = [
        `atrim=start=${Timebase.ffTime(clip.sourceStartFrame, tb)}:duration=${clip.duration * clip.speed}`,
        "asetpts=PTS-STARTPTS",
        tempo(clip.speed),
        // Keyframes replace the clip volume over time; the track volume multiplies either.
        clip.volumeKeys.length
          ? `volume=volume='${gainExpression(clip.volumeKeys, fps, trackGain)}':eval=frame`
          : "volume=" + clip.volume * trackGain,
      ];
      if (clip.fadeIn) steps.push(`afade=t=in:st=0:d=${clip.fadeIn}`);
      if (clip.fadeOut)
        steps.push(
          `afade=t=out:st=${clip.duration - clip.fadeOut}:d=${clip.fadeOut}`,
        );
      if (track.normalize) steps.push("loudnorm=I=-16:TP=-1.5:LRA=11");
      steps.push("adelay=" + Math.round(clip.start * 1000) + ":all=1");
      const label = `[audio${audioIndex++}]`;
      agraph.push(`[${index}:a]${steps.join(",")}${label}`);
      audio.push(label);
    }
    agraph.push(
      `${audio.join("")}amix=inputs=${audio.length}:duration=longest:normalize=0,atrim=duration=${total}[audioout]`,
    );
    // Master loudness (card P2): render the mix, measure it (loudnorm pass 1), then apply the measured values
    // linearly (pass 2, falling back to loudnorm's own dynamic mode when the peak forbids it) and limit the peak.
    const audible = audio.length > 1;
    let master = null,
      audioGraph = agraph;
    if (audible) {
      const mix = output("wav");
      temporary.push(mix.file);
      await run([...args, "-filter_complex", agraph.join(";"), "-map", "[audioout]", "-c:a", "pcm_f32le", "-ar", "48000", mix.file], signal);
      const log = await run(["-hide_banner", "-nostats", "-i", mix.file, "-af", `loudnorm=I=${loudness}:TP=${TRUE_PEAK_CEILING}:LRA=50:print_format=json`, "-f", "null", "-"], signal);
      const stats = JSON.parse(/\{[^{}]*"input_i"[^{}]*\}/.exec(log)?.[0] || "null"),
        measured = (key, min, max) => Math.max(min, Math.min(max, Number(stats?.[key])));
      args.push("-i", mix.file);
      const mixInput = `[${indexed.length + 2}:a]`;
      if (stats && Number.isFinite(Number(stats.input_i)) && Number(stats.input_i) > -70) {
        master = { target: loudness, measuredInput: Number(stats.input_i) };
        audioGraph = [
          `${mixInput}loudnorm=I=${loudness}:TP=${TRUE_PEAK_CEILING}:LRA=50:measured_I=${measured("input_i", -99, 0)}:measured_TP=${measured("input_tp", -99, 99)}:measured_LRA=${measured("input_lra", 0, 99)}:measured_thresh=${measured("input_thresh", -99, 0)}:offset=${measured("target_offset", -99, 99)}:linear=true,aresample=48000,alimiter=limit=${Math.pow(10, TRUE_PEAK_CEILING / 20).toFixed(4)}:level=false:latency=true,atrim=duration=${total}[audioout]`,
        ];
      } else audioGraph = [`${mixInput}atrim=duration=${total}[audioout]`]; // silent mix: nothing to normalise
    }
    const result = output("mp4");
    await run(
      [
        ...args,
        "-filter_complex",
        [...graph, ...audioGraph].join(";"),
        "-map",
        "[videoout]",
        "-map",
        "[audioout]",
        "-t",
        total,
        "-r",
        rate,
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-pix_fmt",
        "yuv420p",
        "-colorspace",
        "bt709",
        "-color_primaries",
        "bt709",
        "-color_trc",
        "bt709",
        "-color_range",
        "tv",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-movflags",
        "+faststart",
        result.file,
      ],
      signal,
    );
    // Invariant 8: no silent pass. Audible is expected when any source audio reaches the mix with gain > 0;
    // then the measured loudness must sit within 1 LU of the target with a true peak at or below -1 dBTP.
    const checks = frameChecks(project, indexed, width, height),
      verification = await verifyOutput(
        result.file,
        {
          duration, fps: tb, width, height, audio: true, color: "bt709",
          ...(audible ? { audible: true } : {}),
          ...(master ? { loudness: { target: loudness, tolerance: 1, maxTruePeak: -1 } } : {}),
          frames: checks,
        },
        signal,
      );
    if (!verification.ok) {
      temporary.push(result.file);
      throw Object.assign(
        Error("輸出驗證失敗：" + verification.findings.map((f) => `${f.code} ${f.message}`).join("；")),
        { findings: verification.findings },
      );
    }
    return {
      type: "video",
      url: result.url,
      width,
      height,
      verification: {
        ok: true,
        findings: [],
        frameChecks: checks.length,
        color: verification.color,
        ...(verification.loudness ? { loudness: { ...verification.loudness, target: master ? loudness : null } } : {}),
      },
    };
  } finally {
    for (const temp of temporary) fs.rmSync(temp, { force: true });
  }
}
module.exports = { exportEditor, validateProject, ratios, filters, checkCube };
