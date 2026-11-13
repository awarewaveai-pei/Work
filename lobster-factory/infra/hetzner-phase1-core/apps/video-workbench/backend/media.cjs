const { spawn } = require("node:child_process"),
  fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const binary = require("ffmpeg-static");
const supported = [
  "edit",
  "separate",
  "upscale",
  "watermark",
  "cta",
  "enhance",
  "image-output",
  "follow-manual",
  "follow-track",
  "subtitle-burn",
  "voice-overlay",
  "editor-export",
];
function run(args, signal) {
  return new Promise((resolve, reject) => {
    const process = spawn(binary, args, {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
      signal,
    });
    let log = "";
    process.stderr.on("data", (c) => {
      log = (log + c).slice(-16000);
    });
    process.on("error", reject);
    process.on("close", (code) =>
      code === 0
        ? resolve(log)
        : reject(Error("媒體處理失敗：" + log.slice(-600))),
    );
  });
}
async function media(input, { file, output, signal }) {
  if (input.operation === 'follow-track') return require('./follow.cjs').follow(input, { file, output, signal, run });
  if (input.operation === 'editor-export') return require('./editor-export.cjs').exportEditor(input.settings?.project, { file, output, signal, run }, input.settings?.quality);
  const source = file(input.references?.src?.url);
  if (!source) throw Error("請先選擇來源影片");
  const settings = input.settings || {},
    operation = input.operation;
  let args = ["-y", "-hide_banner", "-i", source],
    ext = "mp4",
    resultType = "video";
  if (operation === "image-output") {
    const dimensions = require("./generation-policy.cjs").imageDimensions(settings);
    if (!Array.isArray(dimensions)) throw Error("圖片輸出設定無效");
    const [width, height] = dimensions, result = output("png");
    await normalizeImage(source, result.file, { width, height, signal });
    return { type: "image", url: result.url, sourceUrl: input.references.src.url, width, height };
  } else if (operation === "voice-overlay") {
    const audio = file(input.references?.audio?.url), duration = Number(settings.duration);
    if (!audio || !Number.isFinite(duration) || duration < 1 || duration > 120) throw Error('配音素材或時長無效');
    const originalAudio = !settings.image && (await require('./media-inspect.cjs').inspectMedia(source, signal)).audio;
    args = ['-y', '-hide_banner', ...(settings.image ? ['-loop', '1', '-framerate', '30'] : []), '-i', source, '-i', audio, ...(originalAudio ? ['-filter_complex', '[0:a:0][1:a:0]amix=inputs=2:duration=first:normalize=0[mixed]', '-map', '0:v:0', '-map', '[mixed]'] : ['-map', '0:v:0', '-map', '1:a:0']), ...(settings.image ? ['-t', String(duration)] : []), '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1', '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', ...(!originalAudio ? ['-af', 'apad'] : []), '-shortest'];
  } else if (operation === "subtitle-burn") {
    const { buildAss, filterPath } = require('./subtitle-burn.cjs');
    const subtitle = output('ass'), result = output('mp4');
    fs.writeFileSync(subtitle.file, buildAss(settings), 'utf8');
    try {
      await run([...args, '-vf', `ass=filename='${filterPath(subtitle.file)}'`, '-map', '0:v:0', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'fast', '-c:a', 'aac', '-movflags', '+faststart', result.file], signal);
      return { type: 'video', url: result.url };
    } finally { fs.rmSync(subtitle.file, { force: true }); }
  } else if (operation === "follow-manual") {
    const start = Number(settings.start), end = Number(settings.end), center = Number(settings.center);
    if (!Number.isFinite(start) || start < 0 || !Number.isFinite(end) || end - start < 5 || end - start > 180 || !Number.isFinite(center) || center < 0 || center > 1) throw Error("手動裁切的時間或位置無效");
    args.push("-ss", String(start), "-t", String(end - start), "-vf", `scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280:(iw-ow)*${center}:0,setsar=1`, "-c:v", "libx264", "-preset", "fast", "-c:a", "aac");
  } else if (operation === "edit") {
    const start = Number(settings.followStart || settings.trimStart || 0),
      end = Number(settings.followEnd || settings.trimEnd || 0);
    if (
      !Number.isFinite(start) ||
      start < 0 ||
      !Number.isFinite(end) ||
      end <= start
    )
      throw Error("請填寫有效片段起點與終點");
    args.push(
      "-ss",
      String(start),
      "-t",
      String(end - start),
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-c:a",
      "aac",
    );
  } else if (operation === "separate") {
    ext = "mp3";
    resultType = "audio";
    args.push("-vn", "-ar", "48000", "-b:a", "192k");
  } else if (operation === "upscale") {
    const height = { "1080p": 1080, "2K": 1440, "4K": 2160 }[
      settings.upscaleQuality || "1080p"
    ];
    if (!height) throw Error("畫質選項無效");
    args.push(
      "-vf",
      `scale=-2:${height}:flags=lanczos`,
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "18",
      "-c:a",
      "copy",
    );
  } else if (operation === "enhance") {
    const filter = {
      人聲降噪: "highpass=f=80,lowpass=f=12000,afftdn",
      音量均衡: "loudnorm=I=-16:TP=-1.5:LRA=11",
      音質美化: "highpass=f=60,acompressor,alimiter",
    }[settings.enhanceOption || "人聲降噪"];
    // 畫面 + AI 大模型增強 never reaches here: api.cjs runs it on backend/video-enhance.cjs (card ED.12.3).
    if (settings.enhanceType === "畫面" || !filter)
      throw Error(
        settings.enhanceType === "畫面"
          ? "這個畫面處理需要專用模型；目前可使用「AI 大模型增強」。"
          : "此處理需要專用 AI 模型；目前可使用人聲降噪、音量均衡與音質美化。",
      );
    args.push("-c:v", "copy", "-af", filter, "-c:a", "aac");
  } else if (operation === "watermark" || operation === "cta") {
    const mark = file(
      input.references?.[operation === "watermark" ? "png" : "ctaImage"]?.url,
    );
    if (!mark) throw Error("請選擇疊加圖片");
    const opacity = Math.max(
      0,
      Math.min(1, Number(settings["不透明度"] ?? 90) / 100),
    );
    const pos = Number(
        settings[operation === "watermark" ? "watermarkPos" : "ctaPos"] ?? 4,
      ),
      width = Math.max(
        16,
        Math.min(1920, Number(settings.overlayWidth) || 220),
      );
    let x = ["20", "(main_w-overlay_w)/2", "main_w-overlay_w-20"][pos % 3],
      y = ["20", "(main_h-overlay_h)/2", "main_h-overlay_h-20"][
        Math.floor(pos / 3)
      ];
    if (!x || !y) throw Error("疊加位置無效");
    if (["cta", "watermark"].includes(operation))
      for (const [k, axis] of [
        ["水平位置", "x"],
        ["垂直位置", "y"],
      ])
        if (settings[k] !== undefined) {
          const value = Number(settings[k]);
          if (!Number.isFinite(value) || value < 0 || value > 100)
            throw Error("位置需介於0與100");
          if (axis === "x") x = `(main_w-overlay_w)*${value / 100}`;
          else y = `(main_h-overlay_h)*${value / 100}`;
        }
    const begin = Number(settings["出現"] ?? 0),
      end = Number(settings["消失"] ?? 3);
    if (
      operation === "cta" &&
      (!Number.isFinite(begin) ||
        begin < 0 ||
        !Number.isFinite(end) ||
        end <= begin)
    )
      throw Error("出現時間需早於消失時間");
    let markFilter = `scale=${width}:-1,format=rgba,colorchannelmixer=aa=${opacity}`;
    if (operation === "cta") {
      const appearance = settings.ctaAppear || "縮頭";
      const fade = { 無: 0, "0.3 秒": 0.3, "0.5 秒": 0.5, "1 秒": 1 }[
        settings.ctaFade || "無"
      ];
      if (
        !["縮頭", "淡入", "彈出"].includes(appearance) ||
        !Number.isFinite(fade)
      )
        throw Error("CTA 動畫選項無效");
      const duration = Math.min(fade, (end - begin) / 2);
      const fadeIn =
        appearance === "淡入"
          ? Math.max(duration, Math.min(0.3, (end - begin) / 2))
          : duration;
      if (fadeIn) markFilter += `,fade=t=in:st=${begin}:d=${fadeIn}:alpha=1`;
      if (duration)
        markFilter += `,fade=t=out:st=${end - duration}:d=${duration}:alpha=1`;
      if (appearance === "彈出")
        markFilter += `,scale=w='${width}*min(1,max(0.1,(t-${begin})/0.25))':h=-1:eval=frame`;
      // Animate a real sequence; a single PNG frame would freeze at its first alpha/scale.
      args.push("-loop", "1", "-framerate", "30");
    }
    args.push(
      "-i",
      mark,
      "-filter_complex",
      `[1:v]${markFilter}[mark];[0:v][mark]overlay=x=${x}:y=${y}${operation === "cta" ? `:enable='between(t,${begin},${end})':shortest=1` : ""}[out]`,
      "-map",
      "[out]",
      "-map",
      "0:a?",
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-c:a",
      "copy",
    );
  } else throw Error("不支援此媒體工具");
  const result = output(ext);
  args.push(...(ext === "mp4" ? ["-movflags", "+faststart"] : []), result.file);
  await run(args, signal);
  return { type: resultType, url: result.url };
}
async function normalizeImage(source, destination, { width, height, signal }) {
  await run(["-y", "-hide_banner", "-i", source, "-vf", `scale=${width}:${height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${width}:${height}`, "-frames:v", "1", "-threads", "1", destination], signal);
}
// Region edit with a model that takes no mask: the edited image's pixels only where the mask is transparent (the boxes),
// the original everywhere else, both at width x height (the edit stretched to the source's exact ratio so boxes line up).
async function compositeRegions({ original, edited, mask, destination, width, height, signal }) {
  const dir = path.dirname(destination), id = crypto.randomUUID(), files = ["o", "e", "m"].map((k) => path.join(dir, `${id}-${k}.png`));
  try {
    [original, edited, mask].forEach((buffer, i) => fs.writeFileSync(files[i], buffer));
    const fit = `scale=${width}:${height}:flags=lanczos,format=rgba`;
    await run(["-y", "-hide_banner", "-i", files[0], "-i", files[1], "-i", files[2], "-filter_complex",
      `[0:v]${fit}[o];[1:v]${fit}[e];[2:v]${fit},alphaextract,negate[a];[e][a]alphamerge[ea];[o][ea]overlay=format=auto[out]`,
      "-map", "[out]", "-frames:v", "1", "-threads", "1", destination], signal);
  } finally { files.forEach((f) => fs.rmSync(f, { force: true })); }
}
async function adjustVoice(source, destination, { pitch, gain, speed = 1, signal }) {
  if (!Number.isFinite(pitch) || Math.abs(pitch) > 12 || !Number.isFinite(gain) || gain < -30 || gain > 12 || !Number.isFinite(speed) || speed < .25 || speed > 4) throw Error('語音語速、音調或音量無效');
  const factor = Math.pow(2, pitch / 12);
  await run(['-y', '-hide_banner', '-i', source, '-af', `aresample=48000,asetrate=${48000 * factor},aresample=48000,atempo=${1 / factor},atempo=${Math.sqrt(speed)},atempo=${Math.sqrt(speed)},volume=${Math.pow(10, gain / 20)}`, '-c:a', 'libmp3lame', destination], signal);
}
module.exports = { media, supported, normalizeImage, compositeRegions, adjustVoice, run };
