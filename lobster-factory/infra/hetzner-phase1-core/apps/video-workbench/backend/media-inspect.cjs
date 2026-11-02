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
// Checks a rendered file against what the export promised. expect: { duration (s), fps ({num,den} or number),
// width, height, audio (boolean) }; omitted keys are not checked. Duration tolerance = one frame.
async function verifyOutput(file, expect = {}, signal) {
  const findings = [];
  let info;
  try {
    info = await inspectMedia(file, signal);
  } catch (error) {
    return { ok: false, findings: ["無法讀取輸出檔：" + error.message] };
  }
  const actualFps = info.probe.frameRate ? info.probe.frameRate.num / info.probe.frameRate.den : null,
    expectFps =
      expect.fps === undefined
        ? null
        : typeof expect.fps === "object"
          ? expect.fps.num / expect.fps.den
          : Number(expect.fps);
  if (expectFps !== null && (actualFps === null || Math.abs(actualFps - expectFps) > 0.001))
    findings.push(`影格率應為 ${expectFps.toFixed(3)}，實際 ${actualFps === null ? "無" : actualFps.toFixed(3)}`);
  const avg = info.probe.avgFrameRate ? info.probe.avgFrameRate.num / info.probe.avgFrameRate.den : null;
  if (actualFps && avg && Math.abs(avg - actualFps) / actualFps > 0.01)
    findings.push(`影格率不固定：標示 ${actualFps.toFixed(3)}，平均 ${avg.toFixed(3)}`);
  if (expect.duration !== undefined) {
    const frame = 1 / (expectFps || actualFps || 30);
    if (info.duration === null || Math.abs(info.duration - expect.duration) > frame + 1e-6)
      findings.push(`時長應為 ${expect.duration} 秒（容差一格），實際 ${info.duration ?? "無"} 秒`);
  }
  if (expect.width !== undefined && info.displayWidth !== expect.width)
    findings.push(`寬應為 ${expect.width}，實際 ${info.displayWidth ?? "無"}`);
  if (expect.height !== undefined && info.displayHeight !== expect.height)
    findings.push(`高應為 ${expect.height}，實際 ${info.displayHeight ?? "無"}`);
  if (expect.audio !== undefined && info.audio !== !!expect.audio)
    findings.push(expect.audio ? "應有音軌，實際沒有" : "不應有音軌，實際有");
  return { ok: findings.length === 0, findings, info };
}
module.exports = { inspectMedia, verifyOutput, ffprobePath };
