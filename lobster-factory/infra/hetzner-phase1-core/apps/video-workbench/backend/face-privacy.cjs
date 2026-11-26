// 肖像權保護 (operation "privacy", card P1): faces found on this host by YuNet (OpenCV Zoo, MIT; vendor/face, sha256
// pinned by scripts/vendor-face.cjs) through onnxruntime-node on the CPU; frames never leave the machine.
// Pass 1: FFmpeg -> fixed 30 fps, small BGR frames -> detector. Tracks are built by the pure functions below.
// Pass 2: Node writes one low-resolution grey mask per frame to FFmpeg's stdin; FFmpeg pixelizes / blurs a copy of the
// picture, takes the mask as its alpha and overlays it on the original. When unsure, cover more (I2).
const { spawn } = require("node:child_process"),
  { once } = require("node:events"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const MODEL = path.join(__dirname, "..", "vendor", "face", "face_detection_yunet_2023mar.onnx");
const FPS = 30,
  INPUT = 640, // the model's fixed input (1x3x640x640); a frame is scaled to fit and padded right/bottom
  LIMIT_SECONDS = 300,
  SCORE = 0.6, // OpenCV FaceDetectorYN's usual recall setting; a false hit only covers more
  NMS = 0.3,
  EXPAND = 0.25, // each side grows by 25% of the face box (I2)
  EXTEND_SECONDS = 0.3,
  GAP_SECONDS = 1, // a face missing for up to 1 s stays the same track; the gap is interpolated (I2)
  MASK_SCALE = 4,
  TIMEOUT_MS = 30 * 60_000; // job limit (backend/api.cjs jobTimeoutMs): ~1x video length measured in a container, slower hosts need room
// Strength = effect size relative to the face width (the 90th-percentile covered box, so large faces get enough).
const STRENGTH = {
  馬賽克: { 低: 1 / 10, 中: 1 / 7, 高: 1 / 4 }, // pixelize block = width x ratio
  模糊: { 低: 0.05, 中: 0.08, 高: 0.12 }, // gblur sigma = width x ratio
};
const NOTE = (peak) => `已遮蓋人臉，同一格最多 ${peak} 處（含誤判）；側臉、遮擋、太小的臉可能漏掉，發布前請逐段檢查`;

// ---- pure functions (tests/privacy.cjs) ----
function iou(a, b) {
  const x1 = Math.max(a.x, b.x),
    y1 = Math.max(a.y, b.y),
    x2 = Math.min(a.x + a.w, b.x + b.w),
    y2 = Math.min(a.y + a.h, b.y + b.h),
    inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter ? inter / (a.w * a.h + b.w * b.h - inter) : 0;
}
// frames[i] = detections in frame i ([{x,y,w,h,score}]). A track's next box is predicted from its own last motion,
// so two faces passing each other keep their identities; pairs are matched greedily by IoU with that prediction.
function buildTracks(frames, { fps = FPS, minIou = 0.2 } = {}) {
  const maxGap = Math.round(GAP_SECONDS * fps),
    tracks = [];
  frames.forEach((detections, frame) => {
    const live = tracks.filter((t) => frame - t.dets.at(-1).frame <= maxGap),
      pairs = [];
    for (const track of live) {
      const predicted = predict(track, frame);
      detections.forEach((box, d) => {
        const score = matchScore(predicted, box, frame - track.dets.at(-1).frame, minIou);
        if (score > 0) pairs.push({ track, d, score });
      });
    }
    pairs.sort((a, b) => b.score - a.score);
    const usedTracks = new Set(),
      usedDets = new Set();
    for (const { track, d } of pairs) {
      if (usedTracks.has(track) || usedDets.has(d)) continue;
      usedTracks.add(track);
      usedDets.add(d);
      track.dets.push({ frame, box: detections[d] });
    }
    detections.forEach((box, d) => {
      if (!usedDets.has(d)) tracks.push({ dets: [{ frame, box }] });
    });
  });
  return tracks;
}
// IoU with the predicted box; failing that (a face that moved while the detector missed it), a nearby box of similar
// size still continues the track, ranked below every IoU match. The allowed distance grows with the gap.
function matchScore(predicted, box, gap, minIou) {
  const overlap = iou(predicted, box);
  if (overlap >= minIou) return overlap;
  const size = Math.max(predicted.w, box.w),
    ratio = box.w / predicted.w,
    limit = size * (0.5 + 0.1 * gap),
    distance = Math.hypot(predicted.x + predicted.w / 2 - box.x - box.w / 2, predicted.y + predicted.h / 2 - box.y - box.h / 2);
  return ratio > 0.5 && ratio < 2 && distance < limit ? 0.1 * (1 - distance / limit) : 0;
}
function predict(track, frame) {
  const last = track.dets.at(-1),
    prev = track.dets.at(-2);
  if (!prev) return last.box;
  const k = (frame - last.frame) / (last.frame - prev.frame);
  return { x: last.box.x + (last.box.x - prev.box.x) * k, y: last.box.y + (last.box.y - prev.box.y) * k, w: last.box.w, h: last.box.h };
}
// One box for every frame from the first to the last detection (gaps linearly interpolated, I2).
function fillTrack(track) {
  const out = [];
  for (let i = 0; i < track.dets.length; i++) {
    const a = track.dets[i],
      b = track.dets[i + 1];
    out.push({ frame: a.frame, box: a.box });
    if (!b) break;
    for (let f = a.frame + 1; f < b.frame; f++) {
      const t = (f - a.frame) / (b.frame - a.frame),
        mix = (k) => a.box[k] + (b.box[k] - a.box[k]) * t;
      out.push({ frame: f, box: { x: mix("x"), y: mix("y"), w: mix("w"), h: mix("h") } });
    }
  }
  return out;
}
// The box each side grown by EXPAND of its size. Not clamped to the picture: drawMask cuts the ellipse at the frame, so a
// face against an edge keeps its whole box under the mask (clamping here moved the ellipse off the face's corner).
function expandBox(box, ratio = EXPAND) {
  return { x: box.x - box.w * ratio, y: box.y - box.h * ratio, w: box.w * (1 + 2 * ratio), h: box.h * (1 + 2 * ratio) };
}
// Per-frame covered boxes + stats: faces = tracks (one face may split into several), peak = most boxes in one frame (shown). Zero faces anywhere = the job fails (I3): an untouched video is never
// delivered as a protected one.
function planMasks(frames, { fps = FPS } = {}) {
  const totalFrames = frames.length,
    tracks = buildTracks(frames, { fps });
  if (!tracks.length) throw Error("沒有偵測到人臉");
  const extend = Math.round(EXTEND_SECONDS * fps),
    perFrame = Array.from({ length: totalFrames }, () => []);
  for (const track of tracks) {
    const filled = fillTrack(track),
      first = filled[0],
      last = filled.at(-1);
    for (let f = Math.max(0, first.frame - extend); f < first.frame; f++) filled.push({ frame: f, box: first.box });
    for (let f = last.frame + 1; f <= Math.min(totalFrames - 1, last.frame + extend); f++) filled.push({ frame: f, box: last.box });
    for (const { frame, box } of filled) perFrame[frame].push(expandBox(box));
  }
  return { perFrame, stats: { faces: tracks.length, peak: Math.max(...perFrame.map((b) => b.length)), coveredFrames: perFrame.filter((b) => b.length).length, totalFrames } };
}
// I4: one mask per video frame, or the result is refused.
function verifyCounts(masks, frames) {
  if (masks !== frames) throw Error(`遮罩格數（${masks}）與影片格數（${frames}）不符，已停止`);
}
// Filled ellipses inscribed in each box, drawn on a w x h grey frame (box coordinates in the full picture / scale).
function drawMask(boxes, w, h, scale) {
  const mask = Buffer.alloc(w * h);
  for (const box of boxes) {
    const cx = (box.x + box.w / 2) / scale,
      cy = (box.y + box.h / 2) / scale,
      rx = box.w / 2 / scale,
      ry = box.h / 2 / scale;
    for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(h - 1, Math.ceil(cy + ry)); y++) {
      const dy = (y + 0.5 - cy) / ry;
      if (Math.abs(dy) > 1) continue;
      const half = rx * Math.sqrt(1 - dy * dy);
      mask.fill(255, y * w + Math.max(0, Math.floor(cx - half)), y * w + Math.min(w, Math.ceil(cx + half)));
    }
  }
  return mask;
}
function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0;
}

// ---- detector ----
let sessionPromise;
function session() {
  if (!sessionPromise) {
    const ort = require("onnxruntime-node");
    // Half the cores at most: the host also serves the other tools while a long video runs.
    const threads = Math.max(1, Math.min(4, Math.floor((os.availableParallelism?.() || os.cpus().length) / 2)));
    sessionPromise = ort.InferenceSession.create(MODEL, { intraOpNumThreads: threads, interOpNumThreads: 1 }).then((s) => ({ ort, s }));
    sessionPromise.catch(() => (sessionPromise = null));
  }
  return sessionPromise;
}
// YuNet's outputs -> boxes in model-input pixels (OpenCV face_detect.cpp decoding: score = sqrt(cls x obj)).
function decode(out) {
  const boxes = [];
  for (const stride of [8, 16, 32]) {
    const cols = INPUT / stride,
      cls = out["cls_" + stride].data,
      obj = out["obj_" + stride].data,
      bbox = out["bbox_" + stride].data;
    for (let i = 0; i < cols * cols; i++) {
      const score = Math.sqrt(Math.min(1, Math.max(0, cls[i])) * Math.min(1, Math.max(0, obj[i])));
      if (score < SCORE) continue;
      const r = Math.floor(i / cols),
        c = i % cols,
        cx = (c + bbox[i * 4]) * stride,
        cy = (r + bbox[i * 4 + 1]) * stride,
        w = Math.exp(bbox[i * 4 + 2]) * stride,
        h = Math.exp(bbox[i * 4 + 3]) * stride;
      boxes.push({ x: cx - w / 2, y: cy - h / 2, w, h, score });
    }
  }
  boxes.sort((a, b) => b.score - a.score);
  const kept = [];
  for (const box of boxes) if (kept.every((k) => iou(k, box) <= NMS)) kept.push(box);
  return kept;
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
      signal?.aborted ? reject(Error("任務已取消")) : code === 0 ? resolve(log) : reject(Error("肖像權保護處理失敗：" + log.slice(-600))),
    );
  });
  done.catch(() => {}); // awaited by the caller; never an unhandled rejection while the other side is still running
  return { child, done };
}
const normalize = (width, height) => `setpts=PTS-STARTPTS,fps=${FPS},scale=${width}:${height},setsar=1`;

async function detectFaces(source, { width, height, signal, onFrame }) {
  const { ort, s } = await session(),
    k = INPUT / Math.max(width, height),
    dw = Math.max(2, Math.round((width * k) / 2) * 2),
    dh = Math.max(2, Math.round((height * k) / 2) * 2),
    frameBytes = dw * dh * 3,
    data = new Float32Array(3 * INPUT * INPUT),
    tensor = new ort.Tensor("float32", data, [1, 3, INPUT, INPUT]),
    frames = [],
    times = [];
  const { child, done } = ffmpeg(["-i", source, "-map", "0:v:0", "-vf", `${normalize(width, height)},scale=${dw}:${dh}`, "-pix_fmt", "bgr24", "-f", "rawvideo", "pipe:1"], { signal, stdout: true });
  let pending = Buffer.alloc(0);
  try {
    for await (const chunk of child.stdout) {
      pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      while (pending.length >= frameBytes) {
        const frame = pending.subarray(0, frameBytes);
        pending = pending.subarray(frameBytes);
        // BGR HWC bytes -> CHW floats 0..255 (YuNet's own input convention); the padding stays 0.
        for (let y = 0; y < dh; y++)
          for (let x = 0; x < dw; x++) {
            const from = (y * dw + x) * 3,
              to = y * INPUT + x;
            data[to] = frame[from];
            data[INPUT * INPUT + to] = frame[from + 1];
            data[2 * INPUT * INPUT + to] = frame[from + 2];
          }
        const started = performance.now(),
          out = await s.run({ input: tensor });
        times.push(performance.now() - started);
        frames.push(
          decode(out)
            .map((b) => {
              const x = Math.max(0, b.x / k),
                y = Math.max(0, b.y / k);
              return { x, y, w: Math.min(width, (b.x + b.w) / k) - x, h: Math.min(height, (b.y + b.h) / k) - y, score: b.score };
            })
            .filter((b) => b.w > 1 && b.h > 1),
        );
        onFrame?.(frames.length);
      }
    }
  } catch (error) {
    child.kill();
    throw signal?.aborted ? Error("任務已取消") : error;
  }
  await done;
  return { frames, times };
}

async function privacy(input, { file, output, signal }) {
  const settings = input.settings || {},
    type = settings.privacyType || "馬賽克",
    strength = settings.privacyStrength || "中",
    ratio = STRENGTH[type]?.[strength];
  if (!ratio) throw Error("保護方式或強度無效");
  const source = file(input.references?.src?.url);
  if (!source) throw Error("請先選擇來源影片");
  const info = await require("./media-inspect.cjs").inspectMedia(source, signal);
  if (!info.video || !info.duration) throw Error("來源不是可讀取的影片");
  if (info.duration > LIMIT_SECONDS + 0.05) throw Error("影片超過 5 分鐘上限，請先剪短再保護");
  // Display size (rotation applied, as FFmpeg's autorotate decodes it), even for yuv420p (backend/follow.cjs does the same).
  const width = Math.round((info.displayWidth || info.width) / 2) * 2,
    height = Math.round((info.displayHeight || info.height) / 2) * 2;
  const started = Date.now(),
    { frames, times } = await detectFaces(source, { width, height, signal });
  const { perFrame, stats } = planMasks(frames, { width, height }); // throws on zero faces (I3) before anything is written
  const reference = percentile(perFrame.flat().map((b) => b.w), 0.9),
    block = Math.min(1024, Math.max(4, Math.round(reference * ratio))),
    effect = type === "馬賽克" ? `pixelize=w=${block}:h=${block}` : `gblur=sigma=${Math.min(1024, Math.max(2, reference * ratio)).toFixed(2)}`;
  const mw = Math.ceil(width / MASK_SCALE),
    mh = Math.ceil(height / MASK_SCALE),
    result = output("mp4");
  const graph =
    `[0:v]${normalize(width, height)},split[base][copy];[copy]${effect},format=yuva420p[fx];` +
    `[1:v]scale=${width}:${height}:flags=bilinear,format=gray[mask];[fx][mask]alphamerge[covered];` +
    `[base][covered]overlay=format=auto,format=yuv420p[v]`;
  try {
    const { child, done } = ffmpeg(
      ["-stats", "-i", source, "-f", "rawvideo", "-pix_fmt", "gray", "-video_size", `${mw}x${mh}`, "-framerate", String(FPS), "-i", "pipe:0",
        "-filter_complex", graph, "-map", "[v]", "-map", "0:a:0?", "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-movflags", "+faststart", result.file],
      { signal, stdin: true },
    );
    child.stdin.on("error", () => {}); // FFmpeg ending early surfaces through `done`
    let written = 0;
    for (const boxes of perFrame) {
      if (child.stdin.destroyed) break;
      if (!child.stdin.write(drawMask(boxes, mw, mh, MASK_SCALE))) await Promise.race([once(child.stdin, "drain"), done]);
      written++;
    }
    child.stdin.end();
    const log = await done,
      encoded = Number([...log.matchAll(/frame=\s*(\d+)/g)].at(-1)?.[1]);
    verifyCounts(written, stats.totalFrames);
    verifyCounts(written, encoded);
    const ms = times.reduce((a, b) => a + b, 0);
    console.log(`[vw] privacy ${stats.totalFrames} frames, ${stats.faces} faces, detect avg ${(ms / times.length).toFixed(1)} ms/frame, total ${((Date.now() - started) / 1000).toFixed(1)} s`);
    return { type: "video", url: result.url, width, height, note: NOTE(stats.peak), privacy: stats };
  } catch (error) {
    fs.rmSync(result.file, { force: true }); // a refused or cancelled run leaves no file behind (I3, I6)
    throw error;
  }
}
module.exports = { privacy, iou, buildTracks, fillTrack, expandBox, planMasks, verifyCounts, drawMask, decode, detectFaces, MODEL, LIMIT_SECONDS, TIMEOUT_MS, NOTE };
