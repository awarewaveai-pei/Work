// 影片轉深度影片 (operation "depth", card D1): Intel MiDaS v2.1 small (MIT; vendor/depth, sha256 pinned by
// scripts/vendor-depth.cjs) through onnxruntime-node on the CPU; frames never leave the machine. Same FFmpeg pipe shape as
// backend/face-privacy.cjs.
// Pass 1: FFmpeg cuts [start,end] at a fixed 30 fps, stretched to the model's 256x256 RGB -> one relative inverse depth
//   map per frame. MiDaS only knows depth up to a per-frame scale and shift, so each frame is fitted onto the previous
//   aligned frame (alignFrame), then smoothed in time; the maps go to a temp file, never all in memory.
// Pass 2: the whole clip's 2nd-98th percentile -> 0..255 (near = white), grey frames on FFmpeg's stdin, scaled back to the
//   source's display size, mp4 without sound. Never per-frame min/max: that is what makes a depth video flicker.
const { spawn } = require("node:child_process"),
  { once } = require("node:events"),
  crypto = require("node:crypto"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const MODEL = path.join(__dirname, "..", "vendor", "depth", "midas_v21_small.onnx");
const FPS = 30,
  SIZE = 256, // the model's fixed input (1x3x256x256), as the official tf/run_onnx.py feeds it (RGB 0..1, stretched)
  MAX_CLIP_SECONDS = 30,
  SMOOTH = 0.7, // weight of the new frame in the first-order time smoothing
  LOW = 0.02,
  HIGH = 0.98,
  SAMPLE_STEP = 61; // every 61st pixel (~1070 a frame) feeds the clip's percentiles
const NOTE = "逐格估算再做去閃；快速運鏡時邊緣可能抖動";
// The job's own server limit. Measured 2026-11-25 (card D1): 10 s of 1080p in node:24.14.0-bookworm-slim with 4 CPUs =
// 29 s end to end (49 ms a frame in the model), so a 30 s clip is about 1.5 min; 10 min leaves room for a busy host.
const TIMEOUT_MS = 10 * 60_000;

// ---- pure functions (tests/depth.cjs) ----
// I2: the clip the job asks for. Settings arrive as numbers or numeric strings (number inputs).
function clipRange(settings, duration) {
  const num = (v) => (v === "" || v === null || v === undefined ? NaN : Number(v));
  const start = num(settings?.depthStart ?? 0),
    end = num(settings?.depthEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end)) throw Error("請填寫起始與結束時間（秒）");
  if (start < 0) throw Error("起始時間不能小於 0");
  if (end <= start) throw Error("結束時間必須大於起始時間");
  if (end > duration + 0.05) throw Error(`結束時間超過影片長度（${duration.toFixed(1)} 秒）`);
  if (end - start > MAX_CLIP_SECONDS + 1e-6) throw Error(`每次最多 ${MAX_CLIP_SECONDS} 秒`);
  return { start, end: Math.min(end, duration) };
}
// Scale and shift taking `map` onto `target` (same length), fitted over every pixel. The scale is the ratio of the two
// spreads (reduced major axis), the shift then makes the means equal: symmetric in the two maps, so it has no bias to
// accumulate. Ordinary least squares on a noisy map answers a scale below the true one, and chained over 300 frames
// that shrank the contrast to under half (real run 2026-11-25); total least squares did the same when the maps' units
// differ. A flat map has no scale to find: shift only.
function fitScaleShift(map, target) {
  const n = map.length;
  let sx = 0, sy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const x = map[i], y = target[i];
    sx += x; sy += y; sxx += x * x; syy += y * y;
  }
  const vx = sxx - (sx * sx) / n,
    vy = syy - (sy * sy) / n;
  if (!(vx > 1e-9 * n)) return { scale: 1, shift: (sy - sx) / n };
  const scale = Math.sqrt(Math.max(0, vy) / vx);
  return { scale, shift: (sy - scale * sx) / n };
}
// One frame. state = the previous call's answer (null for the first frame). The frame is fitted onto the previous
// *aligned* frame (state.aligned), never onto the smoothed output: smoothing averages away part of each frame's spread,
// and fed back as the next target it compounded into a fading video. The smoothing (first order in time) only shapes
// what is written: out = smooth x aligned + (1 - smooth) x previous out.
function alignFrame(map, state, smooth = SMOOTH) {
  if (!state) return { aligned: Float32Array.from(map), out: Float32Array.from(map) };
  const { scale, shift } = fitScaleShift(map, state.aligned),
    aligned = new Float32Array(map.length),
    out = new Float32Array(map.length);
  for (let i = 0; i < map.length; i++) {
    aligned[i] = scale * map[i] + shift;
    out[i] = smooth * aligned[i] + (1 - smooth) * state.out[i];
  }
  return { aligned, out };
}
function percentile(sorted, p) {
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0;
}
// The clip's one value range (from the samples of every frame): low -> 0, high -> 255.
function clipLevels(samples) {
  const sorted = Float32Array.from(samples).sort();
  const low = percentile(sorted, LOW),
    high = percentile(sorted, HIGH);
  return { low, high: high > low ? high : low + 1 };
}
function toGrey(map, { low, high }) {
  const out = Buffer.alloc(map.length),
    k = 255 / (high - low);
  for (let i = 0; i < map.length; i++) out[i] = Math.max(0, Math.min(255, Math.round((map[i] - low) * k)));
  return out;
}
// I3: one depth frame per input frame, or the result is refused.
function verifyCounts(depth, frames) {
  if (depth !== frames) throw Error(`深度格數（${depth}）與影片格數（${frames}）不符，已停止`);
}

// ---- model ----
let sessionPromise;
function session() {
  if (!sessionPromise) {
    const ort = require("onnxruntime-node");
    // Half the cores at most: the host also serves the other tools while a clip runs.
    const threads = Math.max(1, Math.min(4, Math.floor((os.availableParallelism?.() || os.cpus().length) / 2)));
    sessionPromise = ort.InferenceSession.create(MODEL, { intraOpNumThreads: threads, interOpNumThreads: 1 }).then((s) => ({ ort, s }));
    sessionPromise.catch(() => (sessionPromise = null));
  }
  return sessionPromise;
}

// ---- FFmpeg ----
function ffmpeg(args, { signal, stdin = false, stdout = false }) {
  const child = spawn(require("ffmpeg-static"), ["-hide_banner", ...(stdin ? [] : ["-nostdin"]), ...args], {
    windowsHide: true,
    stdio: [stdin ? "pipe" : "ignore", stdout ? "pipe" : "ignore", "pipe"],
    signal,
  });
  let log = "";
  child.stderr.on("data", (c) => (log = (log + c).slice(-16000)));
  const done = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) =>
      signal?.aborted ? reject(Error("任務已取消")) : code === 0 ? resolve(log) : reject(Error("深度影片處理失敗：" + log.slice(-600))),
    );
  });
  done.catch(() => {}); // awaited by the caller; never an unhandled rejection while the other side is still running
  return { child, done };
}

// Pass 1. Writes each aligned map (SIZE x SIZE float32) to `store`; answers the frame count, samples and timings.
async function estimate(source, { start, end, store, signal, onFrame }) {
  const { ort, s } = await session(),
    frameBytes = SIZE * SIZE * 3,
    plane = SIZE * SIZE,
    data = new Float32Array(3 * plane),
    tensor = new ort.Tensor("float32", data, [1, 3, SIZE, SIZE]),
    inputName = s.inputNames[0],
    outputName = s.outputNames[0],
    samples = [],
    times = [];
  const { child, done } = ffmpeg(
    ["-ss", String(start), "-t", String(end - start), "-i", source, "-map", "0:v:0", "-vf", `setpts=PTS-STARTPTS,fps=${FPS},scale=${SIZE}:${SIZE}:flags=bicubic`, "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"],
    { signal, stdout: true },
  );
  const fd = fs.openSync(store, "w");
  let pending = Buffer.alloc(0),
    previous = null,
    frames = 0;
  try {
    for await (const chunk of child.stdout) {
      pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      while (pending.length >= frameBytes) {
        const frame = pending.subarray(0, frameBytes);
        pending = pending.subarray(frameBytes);
        for (let i = 0; i < plane; i++) {
          data[i] = frame[i * 3] / 255;
          data[plane + i] = frame[i * 3 + 1] / 255;
          data[2 * plane + i] = frame[i * 3 + 2] / 255;
        }
        const started = performance.now(),
          out = await s.run({ [inputName]: tensor });
        times.push(performance.now() - started);
        previous = alignFrame(out[outputName].data, previous);
        const map = previous.out;
        for (let i = 0; i < map.length; i += SAMPLE_STEP) samples.push(map[i]);
        fs.writeSync(fd, Buffer.from(map.buffer, map.byteOffset, map.byteLength));
        frames++;
        onFrame?.(frames);
      }
    }
  } catch (error) {
    child.kill();
    throw signal?.aborted ? Error("任務已取消") : error;
  } finally {
    fs.closeSync(fd);
  }
  await done;
  return { frames, samples, times };
}

async function depth(input, { file, output, signal }) {
  const source = file(input.references?.src?.url);
  if (!source) throw Error("請先選擇來源影片");
  const info = await require("./media-inspect.cjs").inspectMedia(source, signal);
  if (!info.video || !info.duration) throw Error("來源不是可讀取的影片");
  const { start, end } = clipRange(input.settings, info.duration); // I2: before anything is written
  const width = Math.round((info.displayWidth || info.width) / 2) * 2,
    height = Math.round((info.displayHeight || info.height) / 2) * 2,
    result = output("mp4"),
    store = path.join(path.dirname(result.file), "tmp-depth-" + crypto.randomUUID() + ".f32"),
    started = Date.now();
  try {
    const { frames, samples, times } = await estimate(source, { start, end, store, signal });
    if (!frames) throw Error("所選區間沒有可讀取的畫格");
    const levels = clipLevels(samples),
      frameBytes = SIZE * SIZE * 4;
    const { child, done } = ffmpeg(
      ["-stats", "-f", "rawvideo", "-pix_fmt", "gray", "-video_size", `${SIZE}x${SIZE}`, "-framerate", String(FPS), "-i", "pipe:0",
        "-vf", `scale=${width}:${height}:flags=bicubic,format=yuv420p`, "-an", "-c:v", "libx264", "-preset", "fast", "-crf", "18",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", result.file],
      { signal, stdin: true },
    );
    child.stdin.on("error", () => {}); // FFmpeg ending early surfaces through `done`
    const fd = fs.openSync(store, "r"),
      buffer = Buffer.alloc(frameBytes);
    let written = 0;
    try {
      for (let f = 0; f < frames; f++) {
        if (child.stdin.destroyed || signal?.aborted) break;
        fs.readSync(fd, buffer, 0, frameBytes, f * frameBytes);
        const map = new Float32Array(buffer.buffer, buffer.byteOffset, SIZE * SIZE);
        if (!child.stdin.write(toGrey(map, levels))) await Promise.race([once(child.stdin, "drain"), done]);
        written++;
      }
    } finally {
      fs.closeSync(fd);
    }
    child.stdin.end();
    const log = await done,
      encoded = Number([...log.matchAll(/frame=\s*(\d+)/g)].at(-1)?.[1]);
    verifyCounts(written, frames); // I3
    verifyCounts(encoded, frames);
    const ms = times.reduce((a, b) => a + b, 0);
    console.log(`[vw] depth ${frames} frames, model avg ${(ms / frames).toFixed(1)} ms/frame, total ${((Date.now() - started) / 1000).toFixed(1)} s`);
    return { type: "video", url: result.url, width, height, note: NOTE, depth: { frames, start, end, msPerFrame: Math.round(ms / frames) } };
  } catch (error) {
    fs.rmSync(result.file, { force: true }); // a refused or cancelled run leaves no file behind (I3, I5)
    throw error;
  } finally {
    fs.rmSync(store, { force: true });
  }
}
module.exports = { depth, clipRange, fitScaleShift, alignFrame, clipLevels, toGrey, verifyCounts, estimate, MODEL, SIZE, FPS, MAX_CLIP_SECONDS, NOTE, TIMEOUT_MS };
