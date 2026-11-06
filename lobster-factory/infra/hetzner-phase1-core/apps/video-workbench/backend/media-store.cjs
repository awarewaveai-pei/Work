// Content-addressed media files (plan §3 invariants 1/3/4): .data/media/<sha256>/ holds original.<ext>,
// probe.json, proxy.mp4 (only when the browser cannot decode the original), thumb.jpg, waveform.json and, once the
// editor asks for it, preview720.mp4.
// The directory only de-duplicates bytes: every ingest returns a fresh asset id. Each file is written to a
// temp name and renamed, and derivation for one sha256 runs once per process, so parallel ingests of the
// same content never see a half-written file.
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  { spawn } = require("node:child_process");
const ffmpeg = require("ffmpeg-static"),
  { inspectMedia } = require("./media-inspect.cjs"),
  { run } = require("./media.cjs");
const WAVEFORM_POINTS = 1000,
  WAVEFORM_RATE = 8000,
  PREVIEW_SHORT = 720,
  EXT = /^[a-z0-9]{2,5}$/,
  // Card P5: 3D files are stored like media (content-addressed, fresh asset id) but are not probed by ffprobe.
  MODELS = new Set(["glb", "bvh"]);
// A GLB starts with "glTF", version 2, and its header length equals the file size; a BVH starts with HIERARCHY.
function checkModel(file, ext) {
  const head = Buffer.alloc(12), fd = fs.openSync(file, "r");
  try {
    fs.readSync(fd, head, 0, 12, 0);
  } finally {
    fs.closeSync(fd);
  }
  const size = fs.statSync(file).size;
  if (ext === "glb" && (head.toString("latin1", 0, 4) !== "glTF" || head.readUInt32LE(4) !== 2 || head.readUInt32LE(8) !== size))
    throw Object.assign(Error("不是有效的 GLB 2.0 檔"), { status: 400 });
  if (ext === "bvh" && !/^\s*HIERARCHY/.test(head.toString("latin1")))
    throw Object.assign(Error("不是有效的 BVH 動作檔"), { status: 400 });
  return { format: ext, size };
}

// Browsers decode H.264 8-bit 4:2:0 up to 1080p in an MP4 reliably; anything else (a .mov included: ffprobe reports
// mov and mp4 as one format_name, and QuickTime playback varies by browser) gets an H.264 + AAC proxy.
// "1080p" = the short side, so a portrait 1080x1920 phone clip is not transcoded.
function needsProxy(probe, ext) {
  if (!probe.video) return false;
  const shortSide = Math.min(probe.displayWidth || 0, probe.displayHeight || 0);
  return ext !== "mp4" || probe.videoCodec !== "h264" || probe.bitDepth > 8 || probe.pixFmt !== "yuv420p" || shortSide > 1080;
}
const hasAlpha = (probe) => !!probe.video && /^(rgba|bgra|argb|abgr|yuva|gbrap|ya)/.test(probe.pixFmt || "");
// Browser-playable copy with the short side capped at `short` px (even sizes; portrait = width is the short side);
// crf is the H.264 quality (the alpha WebM keeps CRF 30).
// Card P3: an alpha source gets VP9 + alpha WebM (H.264 has no alpha), so the editor preview shows it transparent too.
function transcode(original, tmp, short, alpha, crf, signal) {
  const scale = `scale=w='if(lte(iw,ih),trunc(min(iw,${short})/2)*2,-2)':h='if(lte(iw,ih),-2,trunc(min(ih,${short})/2)*2)'`;
  return run(
    alpha
      ? ["-y", "-hide_banner", "-i", original, "-map", "0:v:0", "-vf", scale + ",format=yuva420p",
          "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-deadline", "realtime", "-cpu-used", "8", "-b:v", "0", "-crf", "30",
          "-auto-alt-ref", "0", "-an", tmp]
      : ["-y", "-hide_banner", "-i", original, "-map", "0:v:0", "-map", "0:a:0?", "-vf", scale,
          "-c:v", "libx264", "-preset", "veryfast", "-crf", String(crf), "-pix_fmt", "yuv420p",
          "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", tmp],
    signal,
  );
}
function createMediaStore({ dataDir }) {
  const root = path.join(dataDir, "media");
  fs.mkdirSync(root, { recursive: true });
  const pending = new Map();
  const temp = (dir, name) => {
    const ext = path.extname(name);
    return path.join(dir, path.basename(name, ext) + ".tmp-" + crypto.randomUUID() + ext);
  };
  function place(tmp, target) {
    try {
      if (fs.existsSync(target)) fs.rmSync(tmp, { force: true });
      else fs.renameSync(tmp, target);
    } catch (error) {
      fs.rmSync(tmp, { force: true });
      if (!fs.existsSync(target)) throw error;
    }
  }
  async function derive(dir, name, make) {
    const target = path.join(dir, name);
    if (fs.existsSync(target)) return;
    const tmp = temp(dir, name);
    try {
      await make(tmp);
      place(tmp, target);
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }
  function waveform(source, duration, signal) {
    return new Promise((resolve, reject) => {
      const child = spawn(
        ffmpeg,
        ["-v", "error", "-i", source, "-map", "0:a:0", "-ac", "1", "-ar", String(WAVEFORM_RATE), "-f", "s16le", "-"],
        { windowsHide: true, stdio: ["ignore", "pipe", "pipe"], signal },
      );
      const total = Math.max(1, Math.round((duration || 1) * WAVEFORM_RATE)),
        peaks = new Float64Array(WAVEFORM_POINTS);
      let index = 0,
        carry = null,
        log = "";
      child.stdout.on("data", (chunk) => {
        if (carry) {
          chunk = Buffer.concat([carry, chunk]);
          carry = null;
        }
        const usable = chunk.length - (chunk.length % 2);
        if (usable < chunk.length) carry = chunk.subarray(usable);
        for (let i = 0; i < usable; i += 2, index++) {
          const bucket = Math.min(WAVEFORM_POINTS - 1, Math.floor((index / total) * WAVEFORM_POINTS)),
            value = Math.abs(chunk.readInt16LE(i)) / 32768;
          if (value > peaks[bucket]) peaks[bucket] = value;
        }
      });
      child.stderr.on("data", (c) => {
        log = (log + c).slice(-4000);
      });
      child.once("error", reject);
      child.once("close", (code) =>
        code === 0
          ? resolve({
              points: WAVEFORM_POINTS,
              sampleRate: WAVEFORM_RATE,
              duration,
              peaks: Array.from(peaks, (p) => Math.round(p * 1000) / 1000),
            })
          : reject(Error("波形產生失敗：" + log.slice(-600))),
      );
    });
  }
  async function prepare(sha, ext, incoming, signal) {
    const dir = path.join(root, sha);
    fs.mkdirSync(dir, { recursive: true });
    const existing = fs.readdirSync(dir).find((f) => /^original\.[a-z0-9]+$/.test(f));
    if (existing) fs.rmSync(incoming, { force: true });
    else place(incoming, path.join(dir, "original." + ext));
    const originalName = existing || "original." + ext,
      original = path.join(dir, originalName);
    if (MODELS.has(ext)) {
      const probe = checkModel(original, ext);
      await derive(dir, "probe.json", async (tmp) => fs.writeFileSync(tmp, JSON.stringify(probe, null, 2)));
      return { checksum_sha256: sha, url: "/media/" + sha + "/" + originalName, previewUrl: null, probe, thumbUrl: null, waveformUrl: null };
    }
    await derive(dir, "probe.json", async (tmp) => {
      const info = await inspectMedia(original, signal);
      fs.writeFileSync(tmp, JSON.stringify({ ...info, probe: undefined, ...info.probe }, null, 2));
    });
    const probe = JSON.parse(fs.readFileSync(path.join(dir, "probe.json"), "utf8"));
    // Output always reads the original; the proxy is only what the editor plays.
    const proxy = needsProxy(probe, path.extname(originalName).slice(1)),
      alpha = hasAlpha(probe);
    if (proxy) await derive(dir, alpha ? "proxy.webm" : "proxy.mp4", (tmp) => transcode(original, tmp, 1080, alpha, 20, signal));
    const visual = probe.video || /^(png|jpg|jpeg|webp|gif)$/.test(ext);
    if (visual)
      await derive(dir, "thumb.jpg", (tmp) =>
        run(
          ["-y", "-hide_banner", ...(probe.video && probe.duration > 1 ? ["-ss", "1"] : []), "-i", original,
            "-frames:v", "1", "-vf", "scale=-2:'min(360,ih)'", "-q:v", "4", tmp],
          signal,
        ),
      );
    if (probe.audio)
      await derive(dir, "waveform.json", async (tmp) =>
        fs.writeFileSync(tmp, JSON.stringify(await waveform(original, probe.duration, signal))),
      );
    const url = (name) => "/media/" + sha + "/" + name;
    return {
      checksum_sha256: sha,
      url: url(originalName),
      previewUrl: url(proxy ? (alpha ? "proxy.webm" : "proxy.mp4") : originalName),
      probe,
      thumbUrl: visual ? url("thumb.jpg") : null,
      waveformUrl: probe.audio ? url("waveform.json") : null,
    };
  }
  async function ingest({ buffer, file, ext, signal }) {
    ext = String(ext || "").toLowerCase();
    if (!EXT.test(ext)) throw Error("不支援此素材格式");
    const incoming = temp(root, "incoming." + ext);
    let sha;
    try {
      if (buffer) {
        sha = crypto.createHash("sha256").update(buffer).digest("hex");
        fs.writeFileSync(incoming, buffer);
      } else {
        fs.copyFileSync(file, incoming);
        const hash = crypto.createHash("sha256");
        for await (const chunk of fs.createReadStream(incoming)) hash.update(chunk);
        sha = hash.digest("hex");
      }
      if (MODELS.has(ext)) checkModel(incoming, ext); // before it can reach the content directory
      for (let attempt = 0; ; attempt++) {
        let job = pending.get(sha);
        const owner = !job;
        if (owner) {
          job = prepare(sha, ext, incoming, signal).finally(() => pending.delete(sha));
          pending.set(sha, job);
        }
        try {
          const result = await job;
          return { id: crypto.randomUUID(), ...result };
        } catch (error) {
          // Another caller's cancelled derivation: retry once with our own signal.
          if (owner || signal?.aborted || attempt) throw error;
        }
      }
    } finally {
      fs.rmSync(incoming, { force: true });
    }
  }
  // Absolute path of a /media/<sha256>/<name> url when the file exists in the store, else null.
  function fileFor(url, names = /^original\.[a-z0-9]+$/) {
    const match = /^\/media\/([a-f0-9]{64})\/([a-z0-9.]+)$/.exec(url || "");
    if (!match || !names.test(match[2])) return null;
    const file = path.join(root, match[1], match[2]);
    return fs.existsSync(file) ? file : null;
  }
  // Card ED.1.4: the editor's 720P preview (preview720.mp4 / .webm), made the first time it is asked for through the same
  // derive(). The answer never waits for ffmpeg (a long source would outlive the HTTP timeout): { making: true } until
  // the file exists, and the editor asks again. Jobs run one at a time (an editor asks for every clip at once).
  // previewUrl null = nothing smaller to make (not a stored video, or short side <= 720): the editor keeps previewUrl.
  const previewJobs = new Map();
  let previewQueue = Promise.resolve();
  function preview(url) {
    const original = fileFor(url),
      dir = original && path.dirname(original),
      probeFile = dir && path.join(dir, "probe.json");
    if (!probeFile || !fs.existsSync(probeFile)) return { previewUrl: null };
    const probe = JSON.parse(fs.readFileSync(probeFile, "utf8"));
    if (!probe.video || Math.min(probe.displayWidth || 0, probe.displayHeight || 0) <= PREVIEW_SHORT) return { previewUrl: null };
    const alpha = hasAlpha(probe),
      name = alpha ? "preview720.webm" : "preview720.mp4",
      key = path.basename(dir) + "/" + name;
    if (fs.existsSync(path.join(dir, name))) return { previewUrl: "/media/" + key };
    const job = previewJobs.get(key);
    if (job?.error) {
      previewJobs.delete(key); // reported once; the next ask tries again
      return { previewUrl: null, error: job.error };
    }
    if (!job) {
      const entry = {};
      previewJobs.set(key, entry);
      previewQueue = previewQueue
        .then(() => derive(dir, name, (tmp) => transcode(original, tmp, PREVIEW_SHORT, alpha, 23)))
        .then(() => previewJobs.delete(key), (e) => (entry.error = "720P 預覽檔產生失敗：" + String(e?.message || e).slice(-300)));
    }
    return { previewUrl: null, making: true };
  }
  return { root, ingest, fileFor, preview };
}
module.exports = { createMediaStore, needsProxy, hasAlpha };
