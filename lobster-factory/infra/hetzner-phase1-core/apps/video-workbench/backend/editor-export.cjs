const fs = require("node:fs"),
  path = require("node:path");
const { inspectMedia, verifyOutput } = require("./media-inspect.cjs"),
  { filterPath, assTime, assColor } = require("./subtitle-burn.cjs"),
  Timebase = require("../shared/timebase.js");
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
    !["720p", "1080p"].includes(quality) ||
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
  const clips = raw.clips.map((c) => {
    if (
      !["V1", "V2", "T", "A1", "A2"].includes(c.track) ||
      !["video", "image", "audio", "text"].includes(c.kind) ||
      (c.track === "T" && c.kind !== "text") ||
      (["A1", "A2"].includes(c.track) && c.kind !== "audio") ||
      (["V1", "V2"].includes(c.track) && !["video", "image"].includes(c.kind))
    )
      throw Error("片段與軌道類型不相符");
    const startFrame = frames(c.startFrame, 0, perHour, "片段起點"),
      durationFrames = frames(c.durationFrames, 1, perHour, "片段長度"),
      sourceStartFrame = frames(c.sourceStartFrame ?? 0, 0, perHour * 24, "來源起點"),
      start = Timebase.toSeconds(startFrame, tb),
      duration = Timebase.toSeconds(durationFrames, tb),
      speed = number(c.speed, 1, 0.25, 4, "播放速度");
    const track = Array.isArray(raw.tracks)
      ? raw.tracks.find((t) => t.id === c.track)
      : raw.tracks?.[c.track];
    const filter = c.filter || track?.filter || raw.filter || "原始";
    if (!Object.hasOwn(filters, filter)) throw Error("濾鏡不存在");
    if (
      c.mask &&
      c.mask !== "無" &&
      !["圓形", "圓角矩形", "三角形"].includes(c.mask)
    )
      throw Error("遮罩不存在");
    if (
      c.transition &&
      !["無", "融接", "淡入淡出", "向左擦除", "向右擦除", "圓形裁切"].includes(
        c.transition,
      )
    )
      throw Error("轉場不存在");
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
      x: number(
        c.x,
        c.track === "V2" ? 80 : c.kind === "text" ? 50 : 0,
        c.track === "V2" || c.kind === "text" ? 0 : -8000,
        c.track === "V2" || c.kind === "text" ? 100 : 8000,
        "水平位置",
      ),
      y: number(
        c.y,
        c.track === "V2" ? 80 : c.kind === "text" ? 80 : 0,
        c.track === "V2" || c.kind === "text" ? 0 : -8000,
        c.track === "V2" || c.kind === "text" ? 100 : 8000,
        "垂直位置",
      ),
      rotation: number(c.rotation, 0, -360, 360, "旋轉"),
      volume: number(c.volume, 1, 0, 4, "片段音量"),
      fadeIn: number(c.fadeIn, 0, 0, Math.min(10, duration / 2), "淡入"),
      fadeOut: number(c.fadeOut, 0, 0, Math.min(10, duration / 2), "淡出"),
      width: number(c.width, 25, 1, 100, "疊加寬度"),
      filter,
      grain: number(c.grain, 0, 0, 1, "顆粒"),
      transitionDuration: number(c.transitionDuration, 0.5, 0.1, 2, "轉場時長"),
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
  const scale = quality === "720p" ? 2 / 3 : 1,
    [baseWidth, baseHeight] = ratios[raw.ratio];
  return {
    ...raw,
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
      clip.kind !== "video" || clip.track !== "V1" || clip.speed !== 1 || clip.opacity !== 1 || clip.scale !== 1 ||
      clip.x !== 0 || clip.y !== 0 || clip.rotation !== 0 || clip.grain !== 0 || clip.filter !== "原始" ||
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
async function exportEditor(
  raw,
  { file, output, signal, run },
  quality = "1080p",
) {
  const project = validateProject(raw, quality),
    { width, height, duration, totalFrames, timebase: tb } = project,
    rate = Timebase.ffRate(tb),
    fps = Timebase.fps(tb),
    total = Timebase.ffTime(totalFrames, tb);
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
    audio = ["[1:a]"];
  const tracks = project.tracks || {},
    getTrack = (id) =>
      Array.isArray(tracks)
        ? tracks.find((t) => t.id === id) || {}
        : tracks[id] || {};
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
    if (clip.kind === "image")
      args.push("-loop", "1", "-framerate", rate, "-t", Timebase.ffTime(clip.durationFrames, tb));
    args.push("-i", source);
    indexed.push({ clip, metadata, index, source });
  }
  let video = "[0:v]",
    layer = 0;
  try {
    const mainClips = project.clips
        .filter((c) => c.track === "V1")
        .sort((a, b) => a.startFrame - b.startFrame),
      incoming = new Map(),
      outgoing = new Map();
    mainClips.forEach((clip, i) => {
      if (!clip.transition || clip.transition === "無") return;
      const previous = mainClips[i - 1];
      if (
        !previous ||
        Math.abs(previous.startFrame + previous.durationFrames - clip.startFrame) > 1
      )
        throw Error("轉場只能套用於相鄰主視訊剪點");
      const transition = {
        type: clip.transition,
        duration: Math.min(
          clip.transitionDuration,
          clip.duration / 2,
          previous.duration / 2,
        ),
        curve: clip.transitionCurve || "線性",
      };
      incoming.set(clip.id, transition);
      outgoing.set(previous.id, transition);
    });
    for (const { clip, metadata, index } of [...indexed]
      .filter((row) => ["V1", "V2"].includes(row.clip.track))
      .sort(
        (a, b) =>
          (a.clip.track === "V1" ? 0 : 1) - (b.clip.track === "V1" ? 0 : 1) ||
          a.clip.start - b.clip.start,
      )) {
      const track = getTrack(clip.track);
      if (track.hidden || clip.hidden) continue;
      const overlay = clip.track === "V2",
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
      const enter = incoming.get(clip.id),
        leave = outgoing.get(clip.id),
        preFrames = enter && enter.type !== "淡入淡出" ? Math.round((enter.duration / 2) * fps) : 0,
        postFrames = leave && leave.type !== "淡入淡出" ? Math.round((leave.duration / 2) * fps) : 0,
        preRoll = Timebase.toSeconds(preFrames, tb);
      // After fps= the stream time base is exactly 1/fps, so the timeline offset below is an integer frame count.
      const prefix = [
        `trim=start=${Timebase.ffTime(clip.sourceStartFrame, tb)}:duration=${clip.speed === 1 ? Timebase.ffTime(clip.durationFrames, tb) : clip.duration * clip.speed}`,
        `setpts=(PTS-STARTPTS)/${clip.speed}`,
        "fps=" + rate,
      ];
      if (preFrames || postFrames)
        prefix.push(
          `tpad=start_mode=clone:stop_mode=clone:start=${preFrames}:stop=${postFrames}`,
        );
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
      if (filters[clip.filter] || clip.grain) {
        // eq converts to YUV without alpha. Preserve the original alpha plane explicitly.
        graph.push(
          `${inputLabel}${steps.join(",")},split=2[color${layer}][alpha${layer}]`,
        );
        graph.push(`[alpha${layer}]alphaextract[plane${layer}]`);
        const effects = [
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
      if (enter && enter.type === "淡入淡出")
        steps.push(`fade=t=in:st=0:d=${enter.duration / 2}:alpha=1`);
      else if (enter) {
        const linear = `min(1,max(0,T/${enter.duration}))`,
          progress =
            enter.curve === "平滑"
              ? `((${linear})*(${linear})*(3-2*(${linear})))`
              : enter.curve === "加速"
                ? `pow(${linear},2)`
                : linear;
        const alpha =
          enter.type === "融接"
            ? `alpha(X,Y)*(${progress})`
            : enter.type === "向左擦除"
              ? `if(gte(X,W*(1-(${progress}))),alpha(X,Y),0)`
              : enter.type === "向右擦除"
                ? `if(lte(X,W*(${progress})),alpha(X,Y),0)`
                : `if(lte(pow(X-W/2,2)+pow(Y-H/2,2),pow(sqrt(W*W+H*H)/2*(${progress}),2)),alpha(X,Y),0)`;
        steps.push(`geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${alpha}'`);
      }
      if (leave?.type === "淡入淡出")
        steps.push(
          `fade=t=out:st=${preRoll + clip.duration - leave.duration / 2}:d=${leave.duration / 2}:alpha=1`,
        );
      steps.push(`setpts=PTS+${clip.startFrame - preFrames}`);
      const sourceLabel = `[clip${layer}]`,
        next = `[video${layer}]`;
      graph.push(`${inputLabel}${steps.join(",")}${sourceLabel}`);
      const x = overlay
          ? `(main_w-overlay_w)*${clip.x / 100}`
          : `(main_w-overlay_w)/2+${(clip.x * width) / project.baseWidth}`,
        y = overlay
          ? `(main_h-overlay_h)*${clip.y / 100}`
          : `(main_h-overlay_h)/2+${(clip.y * height) / project.baseHeight}`;
      graph.push(
        // Half-frame margins: output frames startFrame-pre .. end+post-1 are on, whatever the float rounding of t.
        `${video}${sourceLabel}overlay=x='${x}':y='${y}':enable='between(t,${(clip.startFrame - preFrames - 0.5) / fps},${(clip.startFrame + clip.durationFrames + postFrames - 0.5) / fps})':eof_action=pass${next}`,
      );
      video = next;
      layer++;
    }
    const textClips = project.clips.filter(
      (c) => c.kind === "text" && !c.hidden && !getTrack(c.track).hidden,
    );
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
    let audioIndex = 0;
    for (const { clip, metadata, index } of indexed) {
      const track = getTrack(clip.track),
        gain =
          clip.hidden || track.hidden || clip.muted || track.muted
            ? 0
            : clip.volume * number(track.volume, 1, 0, 4, "軌道音量");
      if (!metadata.audio || !gain || clip.kind === "image") continue;
      const steps = [
        `atrim=start=${Timebase.ffTime(clip.sourceStartFrame, tb)}:duration=${clip.duration * clip.speed}`,
        "asetpts=PTS-STARTPTS",
        tempo(clip.speed),
        "volume=" + gain,
      ];
      if (clip.fadeIn) steps.push(`afade=t=in:st=0:d=${clip.fadeIn}`);
      if (clip.fadeOut)
        steps.push(
          `afade=t=out:st=${clip.duration - clip.fadeOut}:d=${clip.fadeOut}`,
        );
      if (track.normalize) steps.push("loudnorm=I=-16:TP=-1.5:LRA=11");
      steps.push("adelay=" + Math.round(clip.start * 1000) + ":all=1");
      const label = `[audio${audioIndex++}]`;
      graph.push(`[${index}:a]${steps.join(",")}${label}`);
      audio.push(label);
    }
    graph.push(
      `${audio.join("")}amix=inputs=${audio.length}:duration=longest:normalize=0,atrim=duration=${total}[audioout]`,
    );
    const result = output("mp4");
    await run(
      [
        ...args,
        "-filter_complex",
        graph.join(";"),
        "-map",
        video,
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
    // Invariant 8: no silent pass. Audible is expected when any source audio reaches the mix with gain > 0.
    const verification = await verifyOutput(
      result.file,
      {
        duration, fps: tb, width, height, audio: true,
        ...(audio.length > 1 ? { audible: true } : {}),
        frames: frameChecks(project, indexed, width, height),
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
    return { type: "video", url: result.url, width, height, verification: { ok: true, findings: [], frameChecks: frameChecks(project, indexed, width, height).length } };
  } finally {
    for (const temp of temporary) fs.rmSync(temp, { force: true });
  }
}
module.exports = { exportEditor, validateProject, ratios, filters };
