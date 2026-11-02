const { spawn } = require("node:child_process"),
  path = require("node:path");
// Windows uses the pinned build from scripts/vendor-ffprobe.cjs (same 6.1.1 build as ffmpeg-static);
// other platforms (the P6 container) must point FFPROBE_PATH at the system ffprobe.
function ffprobePath() {
  if (process.platform === "win32")
    return path.join(__dirname, "..", "vendor", "ffprobe", "ffprobe.exe");
  if (process.env.FFPROBE_PATH) return process.env.FFPROBE_PATH;
  throw Error("找不到 ffprobe：請設定 FFPROBE_PATH 指向系統的 ffprobe");
}
function probeJson(file, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      ffprobePath(),
      ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file],
      { windowsHide: true, stdio: ["ignore", "pipe", "ignore"], signal },
    );
    const chunks = [];
    const timer = setTimeout(() => child.kill(), 20000);
    child.stdout.on("data", (data) => chunks.push(data));
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (signal?.aborted) {
        reject(Error("任務已取消"));
        return;
      }
      let data = null;
      try {
        data = code === 0 ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
      } catch {}
      resolve(data);
    });
  });
}
const number = (value) =>
  value === undefined || value === null || value === "N/A" || !Number.isFinite(Number(value))
    ? null
    : Number(value);
function rational(value) {
  const match = /^(\d+)\/(\d+)$/.exec(value || "");
  return match && Number(match[2]) ? { num: Number(match[1]), den: Number(match[2]) } : null;
}
function bitDepth(stream) {
  const raw = number(stream.bits_per_raw_sample);
  if (raw) return raw;
  const match = /p(\d+)(?:le|be)$/.exec(stream.pix_fmt || "");
  return match ? Number(match[1]) : stream.pix_fmt ? 8 : null;
}
function rotationOf(stream) {
  const matrix = (stream.side_data_list || []).find((d) => d.rotation !== undefined);
  return Number(matrix?.rotation ?? stream.tags?.rotate ?? 0) || 0;
}
function inspectMedia(file, signal) {
  return probeJson(file, signal).then((data) => {
    const streams = data?.streams || [],
      video = streams.find((s) => s.codec_type === "video" && !s.disposition?.attached_pic),
      audio = streams.filter((s) => s.codec_type === "audio");
    if (!video && !audio.length) throw Error("無法讀取影片或音訊資料");
    const rotation = video ? rotationOf(video) : 0,
      sideways = Math.abs((Math.abs(rotation) % 180) - 90) < 1,
      width = video ? number(video.width) : null,
      height = video ? number(video.height) : null;
    return {
      duration: number(data.format?.duration),
      width,
      height,
      displayWidth: video ? (sideways ? height : width) : null,
      displayHeight: video ? (sideways ? width : height) : null,
      audio: audio.length > 0,
      video: !!video,
      probe: {
        videoCodec: video?.codec_name || null,
        profile: video?.profile || null,
        pixFmt: video?.pix_fmt || null,
        bitDepth: video ? bitDepth(video) : null,
        frameRate: video ? rational(video.r_frame_rate) : null,
        // avg != r_frame_rate = variable frame rate: the header rate alone would pass a file that is really slower.
        avgFrameRate: video ? rational(video.avg_frame_rate) : null,
        rotation,
        colorPrimaries: video?.color_primaries || null,
        colorTransfer: video?.color_transfer || null,
        colorSpace: video?.color_space || null,
        audioStreams: audio.map((s) => ({
          codec: s.codec_name || null,
          sampleRate: number(s.sample_rate),
          channels: number(s.channels),
        })),
        formatName: data.format?.format_name || null,
        bitRate: number(data.format?.bit_rate),
      },
    };
  });
}
function runFfmpeg(args, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn(require("ffmpeg-static"), ["-hide_banner", "-nostats", ...args], {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
      signal,
    });
    let log = "";
    child.stderr.on("data", (c) => (log = (log + c).slice(-16000)));
    child.once("error", reject);
    child.once("close", (code) => (signal?.aborted ? reject(Error("任務已取消")) : resolve({ code, log })));
  });
}
// Decodes frame N of the output and frame M of the source (select by decoded index: no seeking, so no keyframe
// snapping) and compares them at the output size. Returns PSNR in dB (Infinity = identical) or null = no frame.
async function framePsnr(output, outFrame, source, sourceFrame, width, height, signal) {
  const pick = (n) => `select=eq(n\\,${n}),setpts=PTS-STARTPTS,scale=${width}:${height},setsar=1,format=yuv420p`;
  const { log } = await runFfmpeg(
    ["-i", output, "-i", source, "-filter_complex", `[0:v]${pick(outFrame)}[a];[1:v]${pick(sourceFrame)}[b];[a][b]psnr`, "-frames:v", "1", "-an", "-f", "null", "-"],
    signal,
  );
  const match = [...log.matchAll(/PSNR y:\S+ u:\S+ v:\S+ average:(inf|[\d.]+)/g)].at(-1);
  return match ? (match[1] === "inf" ? Infinity : Number(match[1])) : null;
}
async function integratedLoudness(file, signal) {
  const { log } = await runFfmpeg(["-i", file, "-map", "0:a:0", "-af", "ebur128=framelog=verbose", "-f", "null", "-"], signal);
  const match = /Integrated loudness:\s*I:\s*(-?inf|-?[\d.]+) LUFS/.exec(log);
  return match ? (match[1].endsWith("inf") ? -Infinity : Number(match[1])) : null;
}
// Card M3 (plan §3 invariant 8): checks a rendered file against what the export promised. Findings are coded like
// ../video-service/quality.py ({ code, message, evidence }). expect: { duration (s), fps ({num,den} or number),
// width, height, audio (boolean), audible (true = integrated loudness must be above -70 LUFS),
// frames ([{ outFrame, source, sourceFrame }] = decoded frames must match, PSNR >= 35 dB) }; omitted keys are not
// checked. Duration tolerance = one frame.
async function verifyOutput(file, expect = {}, signal) {
  const findings = [],
    add = (code, message, evidence = {}) => findings.push({ code, message, evidence });
  let info;
  try {
    info = await inspectMedia(file, signal);
  } catch (error) {
    return { ok: false, findings: [{ code: "probe.unreadable", message: "無法讀取輸出檔：" + error.message, evidence: {} }] };
  }
  const actualFps = info.probe.frameRate ? info.probe.frameRate.num / info.probe.frameRate.den : null,
    expectFps =
      expect.fps === undefined
        ? null
        : typeof expect.fps === "object"
          ? expect.fps.num / expect.fps.den
          : Number(expect.fps);
  if (expectFps !== null && (actualFps === null || Math.abs(actualFps - expectFps) > 0.001))
    add("video.fps", `影格率應為 ${expectFps.toFixed(3)}，實際 ${actualFps === null ? "無" : actualFps.toFixed(3)}`, { expected: expectFps, actual: actualFps });
  const avg = info.probe.avgFrameRate ? info.probe.avgFrameRate.num / info.probe.avgFrameRate.den : null;
  if (actualFps && avg && Math.abs(avg - actualFps) / actualFps > 0.01)
    add("video.variable_fps", `影格率不固定：標示 ${actualFps.toFixed(3)}，平均 ${avg.toFixed(3)}`, { declared: actualFps, average: avg });
  if (expect.duration !== undefined) {
    const frame = 1 / (expectFps || actualFps || 30);
    if (info.duration === null || Math.abs(info.duration - expect.duration) > frame + 1e-6)
      add("duration.mismatch", `時長應為 ${expect.duration} 秒（容差一格），實際 ${info.duration ?? "無"} 秒`, { expected: expect.duration, actual: info.duration });
  }
  if (expect.width !== undefined && info.displayWidth !== expect.width)
    add("output.width", `寬應為 ${expect.width}，實際 ${info.displayWidth ?? "無"}`, { expected: expect.width, actual: info.displayWidth });
  if (expect.height !== undefined && info.displayHeight !== expect.height)
    add("output.height", `高應為 ${expect.height}，實際 ${info.displayHeight ?? "無"}`, { expected: expect.height, actual: info.displayHeight });
  if (expect.audio !== undefined && info.audio !== !!expect.audio)
    add("container.audio_stream", expect.audio ? "應有音軌，實際沒有" : "不應有音軌，實際有", { expected: !!expect.audio });
  for (const check of expect.frames || []) {
    const psnr = info.video
      ? await framePsnr(file, check.outFrame, check.source, check.sourceFrame, info.width, info.height, signal)
      : null;
    const floor = check.minPsnr ?? 35;
    if (psnr === null || psnr < floor)
      add(
        "frame.mismatch",
        psnr === null
          ? `輸出第 ${check.outFrame} 格或來源第 ${check.sourceFrame} 格不存在`
          : `輸出第 ${check.outFrame} 格與來源第 ${check.sourceFrame} 格不符（PSNR ${psnr.toFixed(1)} dB < ${floor}）`,
        { outFrame: check.outFrame, sourceFrame: check.sourceFrame, psnr },
      );
  }
  if (expect.audible) {
    const lufs = info.audio ? await integratedLoudness(file, signal) : null;
    if (lufs === null || !(lufs > -70))
      add("audio.silent", lufs === null ? "應有聲音，但量不到響度（無音軌或量測失敗）" : `應有聲音，實際整體響度 ${lufs} LUFS（≤ -70 視為靜音）`, { integratedLufs: lufs });
  }
  return { ok: findings.length === 0, findings, info };
}
module.exports = { inspectMedia, verifyOutput, ffprobePath };
