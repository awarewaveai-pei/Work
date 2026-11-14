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

// settings.lock = { mask }: a PNG the page draws with the same calls as the post (scripts/tools-breakout.js
// toolBreakoutDraw): black, the post's text rows white, clipped like the card. It is the one source of what is held: the
// server knows no layout. A data URL at submit (durableInput then stores it as a /generated file, out of the library).
// None = nothing to hold (a job sent before the lock; a page from before the mask sent rows as boxes: not held).
function lockOf(settings) {
  const mask = settings?.lock?.mask;
  if (mask === undefined || mask === null) return { mask: null };
  if (typeof mask !== "string" || !/^(data:image\/png;base64,[A-Za-z0-9+/=]+|\/generated\/[a-f0-9-]+\.png)$/.test(mask)) throw Error("貼文文字鎖定資料無效");
  return { mask };
}

// Held pixels = mask pixels that are fully white with everything within LOCK.margin of them fully white too. That drops
// every pixel the page drew as a mix (anti-aliased row edges at fractional coordinates, a rounded card corner) and keeps a
// margin from the photo, so a model redrawing the photo a pixel or two off never reaches a held pixel. The rows of a post
// cover well under half the frame; a mask asking for more is refused, so the per-frame work stays bounded (LOCK_MAX_AREA).
const LOCK_MAX_AREA = 0.6;
const LOCK = Object.freeze({ changed: 60, touch: 4, margin: 2, tile: 32 });
function lockPixels(gray, w, h) {
  const r = LOCK.margin, row = new Uint8Array(w * h), held = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) // horizontal pass: white across [x - r, x + r]
    for (let x = 0; x < w; x++) {
      let ok = x >= r && x < w - r;
      for (let d = -r; ok && d <= r; d++) ok = gray[y * w + x + d] === 255;
      row[y * w + x] = ok ? 1 : 0;
    }
  let count = 0;
  for (let y = r; y < h - r; y++) // vertical pass over the horizontal one: the whole square is white
    for (let x = 0; x < w; x++) {
      let ok = true;
      for (let d = -r; ok && d <= r; d++) ok = row[(y + d) * w + x] === 1;
      if (ok) (held[y * w + x] = 1), count++;
    }
  if (count > LOCK_MAX_AREA * w * h) throw Error("貼文文字鎖定資料無效");
  return held;
}

// Held pixels are grouped into cells by LOCK.tile squares (a few characters). A pixel "changed" when its RGB distance (sum
// of |d|) from the first frame passes CHANGED. The subject arrives from outside the text: a cell opens when at least TOUCH
// of its own border pixels changed where they face something the subject can come from (a pixel that is not held: the
// photo, the outside of the post, the frame edge; or a cell already open), each pixel counted once; opening repeats within
// the frame until nothing more opens (a fast subject crosses several rows in one frame). An open cell shows the video as
// made from then on. Every other cell is put back where it changed: drifting digits and letters sit inside their row with
// a margin, so they never reach such a border, however compression softened them.
/**
 * cells: held pixel indices per cell; borders: per cell, flat [pixel, k, label1..labelk] for its border pixels, label =
 * the neighbouring cell or -1 (not held, or the frame edge).
 */
function lockGrid(held, w, h, tile = LOCK.tile) {
  const label = new Int32Array(w * h).fill(-1), ids = new Map(), lists = [], tilesX = Math.ceil(w / tile);
  for (let p = 0; p < w * h; p++) {
    if (!held[p]) continue;
    const t = Math.floor(p / w / tile) * tilesX + Math.floor((p % w) / tile);
    let c = ids.get(t);
    if (c === undefined) ids.set(t, (c = lists.push([]) - 1));
    label[p] = c;
    lists[c].push(p);
  }
  const borders = lists.map((pixels, c) => {
    const b = [];
    for (const p of pixels) {
      const x = p % w, y = (p - x) / w, out = [];
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        const n = nx < 0 || ny < 0 || nx >= w || ny >= h ? -1 : label[ny * w + nx];
        if (n !== c) out.push(n);
      }
      if (out.length) b.push(p, out.length, ...out);
    }
    return Int32Array.from(b);
  });
  return { cells: lists.map((l) => Int32Array.from(l)), borders };
}
/**
 * Holds one decoded frame's text cells to the first frame, in place. frame/ref: rgb24 buffers of the same size;
 * grid: lockGrid; open: one flag per cell, kept across frames. Returns the pixels put back.
 */
function lockFrame(frame, ref, grid, open) {
  const changed = (p) => {
    const i = p * 3;
    return Math.abs(frame[i] - ref[i]) + Math.abs(frame[i + 1] - ref[i + 1]) + Math.abs(frame[i + 2] - ref[i + 2]) > LOCK.changed;
  };
  for (let again = true; again; ) {
    again = false;
    grid.borders.forEach((b, c) => {
      if (open[c]) return;
      let touch = 0;
      for (let k = 0; k < b.length && touch < LOCK.touch; k += 2 + b[k + 1]) {
        let entry = false;
        for (let j = 0; j < b[k + 1] && !entry; j++) entry = b[k + 2 + j] === -1 || open[b[k + 2 + j]] === 1;
        if (entry && changed(b[k])) touch++;
      }
      if (touch >= LOCK.touch) open[c] = again = 1;
    });
  }
  let restored = 0;
  grid.cells.forEach((pixels, c) => {
    if (open[c]) return;
    for (const p of pixels) {
      if (!changed(p)) continue;
      const i = p * 3;
      frame[i] = ref[i];
      frame[i + 1] = ref[i + 1];
      frame[i + 2] = ref[i + 2];
      restored++;
    }
  });
  return restored;
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

async function finishHere({ src, frameFile, maskFile, dst, settings, ffmpeg, signal }) {
  const { mask } = lockOf(settings),
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
  if (!mask && outH === H) return { ratio, restored: 0, opened: 0, untouched: true }; // nothing to hold, nothing to cut
  const rate = info.probe?.avgFrameRate || info.probe?.frameRate, // media-inspect rational { num, den }
    fps = rate?.num > 0 && rate?.den > 0 ? `${rate.num}/${rate.den}` : "24",
    crop = outH < H ? `crop=${W}:${outH}:0:${Math.floor((H - outH) / 4) * 2},` : "",
    out = ["-map", "0:v", "-c:v", "libx264", "-crf", "18", ...TAGS, "-c:a", "copy", "-movflags", "+faststart", dst];
  if (!mask) {
    // nothing to hold: one ffmpeg crop straight from the file (no rgb round trip)
    await run(ffmpeg, ["-y", "-v", "error", "-i", src, "-map", "0:a?", "-vf", crop + "format=yuv420p", ...out], signal, { stdout: false }).done;
    return { ratio, restored: 0, opened: 0 };
  }
  // the mask at the video's size, nearest (no new mixed pixels); then the held pixels and their cells
  const gray = await run(ffmpeg, ["-v", "error", "-i", maskFile, "-vf", `scale=${W}:${H}:flags=neighbor`, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "-"], signal).done;
  if (gray.length !== W * H) throw Error("鎖定遮罩尺寸不符");
  const grid = lockGrid(lockPixels(gray, W, H), W, H), open = new Uint8Array(grid.cells.length), size = W * H * 3;
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
        restored += lockFrame(frame, ref, grid, open);
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
  return { ratio, restored, opened: open.reduce((n, v) => n + v, 0) };
}

const FINISH_TIMEOUT_MS = 5 * 60 * 1000;
// A file's own ratio when finishing could not set it: the listed ratio it matches, else its "w:h" (never assumed).
async function fileRatio(file) {
  try {
    const { width: w, height: h } = await require("./media-inspect.cjs").inspectMedia(file);
    const match = ["9:16", "16:9", ...rules.OUTPUT_RATIOS].find((r) => {
      const [a, b] = r.split(":").map(Number);
      return Math.abs(h / w - b / a) < 0.02;
    });
    return match || `${w}:${h}`;
  } catch {
    return undefined; // unreadable: readers fall back to the job's settings
  }
}
/**
 * The finished breakout video: text rows held to the first frame (settings.lock), then cut to settings.outputRatio's
 * centred box, in one encode. src: the model's mp4 (9:16 or 16:9); frameFile: the first-frame PNG the job sent; dst: output mp4.
 * Runs in a worker thread (the per-frame pixel work must not hold the API's event loop), at most FINISH_TIMEOUT_MS.
 * Returns { ratio, restored, untouched? }: ratio = the written file's own ratio; untouched = nothing written, keep src.
 * A failure removes dst.
 */
function finish({ src, frameFile, maskFile, dst, settings, ffmpeg, signal, timeoutMs = FINISH_TIMEOUT_MS }) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, { workerData: { breakoutFinish: { src, frameFile, maskFile, dst, settings, ffmpeg } } });
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

module.exports = { prepare, finish, finishHere, fileRatio, lockFrame, lockGrid, lockPixels, lockOf, LOCK, LOCK_MAX_AREA, FINISH_TIMEOUT_MS };
