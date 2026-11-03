// Content-addressed media files (plan §3 invariants 1/3/4): .data/media/<sha256>/ holds original.<ext>,
// probe.json, proxy.mp4 (only when the browser cannot decode the original), thumb.jpg and waveform.json.
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
  EXT = /^[a-z0-9]{2,5}$/;

// Browsers decode H.264 8-bit 4:2:0 up to 1080p in an MP4 reliably; anything else (a .mov included: ffprobe reports
// mov and mp4 as one format_name, and QuickTime playback varies by browser) gets an H.264 + AAC proxy.
// "1080p" = the short side, so a portrait 1080x1920 phone clip is not transcoded.
function needsProxy(probe, ext) {
  if (!probe.video) return false;
  const shortSide = Math.min(probe.displayWidth || 0, probe.displayHeight || 0);
  return ext !== "mp4" || probe.videoCodec !== "h264" || probe.bitDepth > 8 || probe.pixFmt !== "yuv420p" || shortSide > 1080;
}
const hasAlpha = (probe) => !!probe.video && /^(rgba|bgra|argb|abgr|yuva|gbrap|ya)/.test(probe.pixFmt || "");
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
    await derive(dir, "probe.json", async (tmp) => {
      const info = await inspectMedia(original, signal);
      fs.writeFileSync(tmp, JSON.stringify({ ...info, probe: undefined, ...info.probe }, null, 2));
    });
    const probe = JSON.parse(fs.readFileSync(path.join(dir, "probe.json"), "utf8"));
    const proxy = needsProxy(probe, path.extname(originalName).slice(1)),
      alpha = hasAlpha(probe);
    // Card P3: a source with an alpha channel (the compositor's PNG MOV) gets a VP9 + alpha WebM proxy instead, so
    // the editor preview shows it transparent too (H.264 has no alpha). Output still reads the original.
    if (proxy && alpha)
      await derive(dir, "proxy.webm", (tmp) =>
        run(
          ["-y", "-hide_banner", "-i", original, "-map", "0:v:0",
            "-vf", "scale=w='if(lte(iw,ih),trunc(min(iw,1080)/2)*2,-2)':h='if(lte(iw,ih),-2,trunc(min(ih,1080)/2)*2)',format=yuva420p",
            "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-deadline", "realtime", "-cpu-used", "8", "-b:v", "0", "-crf", "30",
            "-auto-alt-ref", "0", "-an", tmp],
          signal,
        ),
      );
    else if (proxy)
      await derive(dir, "proxy.mp4", (tmp) =>
        run(
          ["-y", "-hide_banner", "-i", original, "-map", "0:v:0", "-map", "0:a:0?",
            "-vf", "scale=w='if(lte(iw,ih),trunc(min(iw,1080)/2)*2,-2)':h='if(lte(iw,ih),-2,trunc(min(ih,1080)/2)*2)'",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", tmp],
          signal,
        ),
      );
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
  return { root, ingest, fileFor };
}
module.exports = { createMediaStore, needsProxy, hasAlpha };
