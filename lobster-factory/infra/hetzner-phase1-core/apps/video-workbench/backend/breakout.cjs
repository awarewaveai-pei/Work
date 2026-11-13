// 破框貼文動畫 (tool "breakout") on the server: the page renders the post to a PNG (scripts/tools-breakout.js) and sends
// it as the first frame of a normal video job; this checks that job, builds its prompt from shared/breakout-rules.js and
// finishes the downloaded video (finish): the post's text rows are held to the first frame, then the output ratio is cut.
// First-frame models make only 9:16 / 16:9 (shared/breakout-rules.js modelRatio): a 4:5 or 1:1 post is drawn centred in a
// 9:16 frame and the finished video is cropped to that centred box; 16:9 runs as is.
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const { Worker, isMainThread, parentPort, workerData } = require("node:worker_threads");
const rules = require("../shared/breakout-rules.js");
const generationPolicy = require("./generation-policy.cjs");

/** Throws a user-facing error unless input is a valid breakout job; returns the prompt the model is sent. */
function prepare(input, env) {
  const s = input.settings || {};
  if (!Object.hasOwn(rules.LAYOUTS, s.layout)) throw Error("請選擇貼文版面");
  if (!rules.OUTPUT_RATIOS.includes(s.outputRatio)) throw Error("輸出比例只支援 " + rules.OUTPUT_RATIOS.join("、"));
  if (s.ratio !== rules.modelRatio(s.outputRatio)) throw Error("破框貼文動畫的 " + s.outputRatio + " 以 " + rules.modelRatio(s.outputRatio) + " 生成");
  const vm = generationPolicy.videoModels(env).find((m) => m.id === s.model);
  if (!vm || !rules.eligible([vm]).length) throw Error("這個影片模型不能保留貼文當第一格畫面，請換一個模型");
  // The length the job runs and is charged for is read like api.cjs does (top-level duration first), not settings alone.
  if (Number(input.duration || s.duration || 8) !== rules.seconds(vm)) throw Error(vm.label + " 的破框影片長度是 " + rules.seconds(vm) + " 秒");
  // Nothing may be appended after the stay-still instruction (api.cjs adds cartoonStyle after the prompt).
  if (input.cartoonStyle !== undefined) throw Error("破框貼文動畫不接受風格附加文字");
  const frames = input.references?.firstFrame;
  if (!Array.isArray(frames) || frames.length !== 1 || !frames[0]?.url) throw Error("缺少貼文第一格畫面");
  lockOf(s); // throws on a malformed lock
  return rules.prompt(input.prompt, s);
}

// settings.lock = { boxes: [[x, y, w, h], ...] }: the post's text rows, 0..1 of the model frame. None = nothing to hold
// (a job sent before the lock). Other keys are ignored (a page from before the cell rule also sent ink colours).
// The rows of a post cover well under half the frame and never overlap; a lock asking for more is refused, so the
// per-frame work stays bounded whatever a request sends (LOCK_MAX_AREA).
const LOCK_MAX_AREA = 0.6;
function lockOf(settings) {
  const lock = settings?.lock;
  if (lock === undefined || lock === null) return { boxes: [] };
  const unit = (v) => Number.isFinite(v) && v >= 0 && v <= 1;
  const boxes = Array.isArray(lock.boxes) ? lock.boxes : null;
  const bad = () => Error("貼文文字鎖定資料無效");
  if (!boxes || boxes.length > rules.LOCK_MAX_BOXES ||
    !boxes.every((b) => Array.isArray(b) && b.length === 4 && b.every(unit) && b[0] + b[2] <= 1.0001 && b[1] + b[3] <= 1.0001))
    throw bad();
  if (boxes.reduce((sum, b) => sum + b[2] * b[3], 0) > LOCK_MAX_AREA) throw bad();
  const eps = 1e-6,
    overlap = (a, b) => a[0] + eps < b[0] + b[2] && b[0] + eps < a[0] + a[2] && a[1] + eps < b[1] + b[3] && b[1] + eps < a[1] + a[3];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (overlap(boxes[i], boxes[j])) throw bad();
  return { boxes };
}

// Each row is cut into cells about as wide as 1.5 row heights (a few characters). A pixel "changed" when its RGB distance
// (sum of |d|) from the first frame passes CHANGED. A cell whose changed share passes OPEN has the subject in it (the
// burst): from that frame on it shows the video as made. Any other cell is put back whole: drifting digits and letters
// return, however compression softened their edges. Text never fills a cell, so even a whole number shifting (old + new
// place) stays under half; a subject entering a cell is held back until it covers half of it, then shows from then on.
const LOCK = Object.freeze({ changed: 60, open: 0.5 });
let scratch = new Int32Array(0); // reused changed-pixel list (one per thread)
/**
 * Holds one decoded frame's text cells to the first frame, in place. frame/ref: rgb24 buffers of the same size (width w);
 * cells in pixels [x, y, w, h] (lockCells); open: one flag per cell, kept across frames. Returns the pixels put back.
 */
function lockFrame(frame, ref, w, cells, open) {
  let restored = 0;
  cells.forEach(([cx, cy, cw, ch], c) => {
    if (open[c] || cw <= 0 || ch <= 0) return;
    if (scratch.length < cw * ch) scratch = new Int32Array(cw * ch);
    let n = 0;
    for (let y = cy; y < cy + ch; y++)
      for (let x = cx; x < cx + cw; x++) {
        const i = (y * w + x) * 3;
        if (Math.abs(frame[i] - ref[i]) + Math.abs(frame[i + 1] - ref[i + 1]) + Math.abs(frame[i + 2] - ref[i + 2]) > LOCK.changed) scratch[n++] = i;
      }
    if (n > LOCK.open * cw * ch) {
      open[c] = 1;
      return;
    }
    for (let k = 0; k < n; k++) {
      const i = scratch[k];
      frame[i] = ref[i];
      frame[i + 1] = ref[i + 1];
      frame[i + 2] = ref[i + 2];
    }
    restored += n;
  });
  return restored;
}

/** Rows (0..1) -> cells in pixels of a w x h frame. */
function lockCells(boxes, w, h) {
  return boxes.flatMap(([x, y, bw, bh]) => {
    const x0 = Math.max(0, Math.floor(x * w)), y0 = Math.max(0, Math.floor(y * h)),
      x1 = Math.min(w, Math.ceil((x + bw) * w)), y1 = Math.min(h, Math.ceil((y + bh) * h)),
      step = Math.max(16, Math.round((y1 - y0) * 1.5)), cells = [];
    for (let cx = x0; cx < x1; cx += step) cells.push([cx, y0, Math.min(step, x1 - cx), y1 - y0]);
    return cells;
  });
}

// One ffmpeg child: resolves its stdout, rejects with its stderr tail; killed when signal aborts.
function run(ffmpeg, args, signal, { stdout = true } = {}) {
  const child = spawn(ffmpeg, args, { windowsHide: true, stdio: ["pipe", stdout ? "pipe" : "ignore", "pipe"] });
  const kill = () => child.kill();
  signal?.addEventListener("abort", kill, { once: true });
  const done = new Promise((resolve, reject) => {
    const parts = [];
    let log = "";
    child.stdout?.on("data", (c) => parts.push(c));
    child.stderr.on("data", (c) => (log = (log + c).slice(-4000)));
    child.on("error", reject);
    child.on("close", (code) => {
      signal?.removeEventListener("abort", kill);
      code === 0 ? resolve(Buffer.concat(parts)) : reject(Error(signal?.aborted ? "已停止" : "媒體處理失敗：" + log.slice(-400)));
    });
  });
  return { child, done };
}

// Model output is HD video (BT.709). Converting through rgb24 must name that matrix both ways and tag the file, or every
// finished video shifts colour (sws defaults to BT.601 and writes no tags).
const TO_RGB = "scale=in_color_matrix=bt709:in_range=tv:out_range=pc";
const TO_YUV = "scale=out_color_matrix=bt709:in_range=pc:out_range=tv,format=yuv420p";
const TAGS = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"];

async function finishHere({ src, frameFile, dst, settings, ffmpeg, signal }) {
  const { boxes } = lockOf(settings),
    ratio = rules.OUTPUT_RATIOS.includes(settings?.outputRatio) ? settings.outputRatio : "9:16",
    [ma, mb] = rules.modelRatio(ratio).split(":").map(Number);
  const info = await require("./media-inspect.cjs").inspectMedia(src, signal);
  const W = info.width, H = info.height;
  if (!(W > 0 && H > 0)) throw Error("讀不到影片尺寸");
  // The frame the page drew has the model's shape and the crop is cut from it: another shape or a rotated file would put
  // the rows and the crop in the wrong place (and result.ratio would not be the file's), so it is refused and kept as made.
  if (info.probe?.rotation) throw Error("影片帶旋轉標記，無法鎖定與裁切");
  if (Math.abs(H / W - mb / ma) > 0.02) throw Error(`影片不是 ${ma}:${mb}（${W}×${H}）`);
  const outH = rules.outputHeight(ratio, W);
  if (outH > H) throw Error("輸出比例超出影片範圍");
  if (!boxes.length && outH === H) return { ratio, restored: 0, untouched: true }; // nothing to hold, nothing to cut
  const rate = info.probe?.avgFrameRate || info.probe?.frameRate, // media-inspect rational { num, den }
    fps = rate?.num > 0 && rate?.den > 0 ? `${rate.num}/${rate.den}` : "24",
    crop = outH < H ? `crop=${W}:${outH}:0:${Math.floor((H - outH) / 4) * 2},` : "",
    out = ["-map", "0:v", "-c:v", "libx264", "-crf", "18", ...TAGS, "-c:a", "copy", "-movflags", "+faststart", dst];
  if (!boxes.length) {
    // nothing to hold: one ffmpeg crop straight from the file (no rgb round trip)
    await run(ffmpeg, ["-y", "-v", "error", "-i", src, "-map", "0:a?", "-vf", crop + "format=yuv420p", ...out], signal, { stdout: false }).done;
    return { ratio, restored: 0 };
  }
  const cells = lockCells(boxes, W, H), open = new Uint8Array(cells.length), size = W * H * 3;
  const ref = await run(ffmpeg, ["-v", "error", "-i", frameFile, "-vf", `scale=${W}:${H}:flags=area`, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], signal).done;
  if (ref.length !== size) throw Error("第一格畫面尺寸不符");
  const decoder = run(ffmpeg, ["-v", "error", "-noautorotate", "-i", src, "-vf", TO_RGB, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], signal);
  const encoder = run(ffmpeg, ["-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${W}x${H}`, "-r", fps, "-i", "-", "-i", src,
    "-map", "1:a?", "-vf", crop + TO_YUV, "-shortest", ...out], signal, { stdout: false });
  encoder.child.stdin.on("error", () => {}); // a dead encoder is reported by its own close
  // Frames are assembled in one reused buffer (no growing concat per chunk); a frame is written as a copy so the
  // encoder pipe never sees a buffer that is being refilled.
  const frame = Buffer.alloc(size);
  let filled = 0, restored = 0;
  decoder.child.stdout.removeAllListeners("data"); // run() collected stdout; here it streams instead
  decoder.child.stdout.on("data", (chunk) => {
    for (let at = 0; at < chunk.length; ) {
      const n = Math.min(size - filled, chunk.length - at);
      chunk.copy(frame, filled, at, at + n);
      filled += n;
      at += n;
      if (filled === size) {
        restored += lockFrame(frame, ref, W, cells, open);
        filled = 0;
        if (!encoder.child.stdin.write(Buffer.from(frame))) {
          decoder.child.stdout.pause();
          encoder.child.stdin.once("drain", () => decoder.child.stdout.resume());
        }
      }
    }
  });
  decoder.child.stdout.on("end", () => encoder.child.stdin.end());
  try {
    await Promise.all([decoder.done, encoder.done]);
  } catch (e) {
    decoder.child.kill();
    encoder.child.kill();
    throw e;
  }
  if (filled) throw Error("影片解碼後剩下不完整的畫格");
  return { ratio, restored };
}

const FINISH_TIMEOUT_MS = 5 * 60 * 1000;
/**
 * The finished breakout video: text rows held to the first frame (settings.lock), then cut to settings.outputRatio's
 * centred box, in one encode. src: the model's mp4 (9:16 or 16:9); frameFile: the first-frame PNG the job sent; dst: output mp4.
 * Runs in a worker thread (the per-frame pixel work must not hold the API's event loop), at most FINISH_TIMEOUT_MS.
 * Returns { ratio, restored, untouched? }: ratio = the written file's own ratio; untouched = nothing written, keep src.
 * A failure removes dst.
 */
function finish({ src, frameFile, dst, settings, ffmpeg, signal, timeoutMs = FINISH_TIMEOUT_MS }) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, { workerData: { breakoutFinish: { src, frameFile, dst, settings, ffmpeg } } });
    let settled = false;
    const end = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", stop);
      if (fn === reject) fs.rmSync(dst, { force: true });
      fn(value);
    };
    const stop = () => worker.postMessage("abort");
    const timer = setTimeout(() => {
      stop();
      end(reject, Error("貼文鎖定／裁切逾時"));
    }, timeoutMs);
    signal?.addEventListener("abort", stop, { once: true });
    worker.on("message", (m) => (m.ok ? end(resolve, m.result) : end(reject, Error(m.error))));
    worker.on("error", (e) => end(reject, e));
    worker.on("exit", (code) => end(reject, Error("貼文鎖定程序結束（" + code + "）")));
  });
}

if (!isMainThread && workerData?.breakoutFinish) {
  const controller = new AbortController();
  parentPort.on("message", (m) => m === "abort" && controller.abort());
  finishHere({ ...workerData.breakoutFinish, signal: controller.signal })
    .then((result) => parentPort.postMessage({ ok: true, result }), (e) => parentPort.postMessage({ ok: false, error: e.message }))
    .finally(() => parentPort.close());
}

module.exports = { prepare, finish, finishHere, lockFrame, lockCells, lockOf, LOCK, LOCK_MAX_AREA };
