// Re-evaluation harness (2026-11-06). One origin = the isolated workbench server behind a tiny proxy that also
// serves the trial engine builds under /__trial/<engine>/ and the fixtures under /__fx/. Nothing is written into the repo;
// the operator's 4178 is never touched (tests/isolated-server.cjs: free port + throwaway data dir).
const VW = "D:/Work/lobster-factory/infra/hetzner-phase1-core/apps/video-workbench";
const { chromium } = require(VW + "/node_modules/playwright");
const { isolatedServer } = require(VW + "/tests/isolated-server.cjs");
const fs = require("node:fs"), path = require("node:path"), http = require("node:http");
const { execFileSync } = require("node:child_process");
const ROOT = __dirname, OUT = path.join(ROOT, "out"), FX = path.join(process.env.TEMP, "ecp0", "fx");
const DIST = { effectcraft: path.join(ROOT, "dist", "effectcraft"), filmcraft: path.join(ROOT, "dist", "filmcraft") };
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".css": "text/css", ".mp4": "video/mp4", ".mov": "video/quicktime", ".wav": "audio/wav", ".srt": "text/plain; charset=utf-8", ".otf": "font/otf", ".ttf": "font/ttf" };
fs.mkdirSync(OUT, { recursive: true });

function sendFile(res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "Content-Length": st.size, "Cache-Control": "no-store" });
    fs.createReadStream(file).pipe(res);
  });
}
async function origin() {
  const { base } = await isolatedServer("vw-reeval-");
  const up = new URL(base);
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    const trial = u.pathname.match(/^\/__trial\/(effectcraft|filmcraft)\/(.*)$/);
    if (trial) {
      const rel = decodeURIComponent(trial[2]) || "index.html", file = path.join(DIST[trial[1]], rel);
      if (!file.startsWith(DIST[trial[1]])) { res.writeHead(400); return res.end(); }
      return sendFile(res, file);
    }
    if (u.pathname.startsWith("/__fx/")) return sendFile(res, path.join(FX, path.basename(decodeURIComponent(u.pathname))));
    if (u.pathname.startsWith("/__host/")) return sendFile(res, path.join(ROOT, "host", path.basename(u.pathname)));
    const p = http.request({ host: up.hostname, port: up.port, path: req.url, method: req.method, headers: { ...req.headers, host: up.host, ...(req.headers.origin ? { origin: base } : {}) } }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    p.on("error", (e) => { res.writeHead(502); res.end(String(e.message)); });
    req.pipe(p);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  server.unref();
  return "http://127.0.0.1:" + server.address().port;
}
// gpu:false = WebGPU hidden (the 2026-11-02 run lost the device and took the operator's Edge down with it).
async function launch({ gpu = false, headless = true } = {}) {
  // gpu:"nvidia" = WebGPU on the discrete adapter only (--force_high_performance_gpu): the operator's own Edge sits on the
  // Intel adapter by default, so a device loss here cannot reset the GPU her tabs use.
  const args = ["--autoplay-policy=no-user-gesture-required", ...(gpu === "nvidia" ? ["--force_high_performance_gpu"] : gpu ? [] : ["--disable-features=WebGPU,WebGPUService", "--disable-webgpu"])];
  const browser = await chromium.launch({ channel: "msedge", headless, args });
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1600, height: 900 } });
  if (!gpu) await ctx.addInitScript(() => { try { Object.defineProperty(Navigator.prototype, "gpu", { get: () => undefined, configurable: true }); } catch {} });
  return { browser, ctx };
}
function watch(page, logs) {
  page.on("console", (m) => { const t = m.text(); logs.push(t); if (/lost|panic|error/i.test(t)) console.log("[console]", t.slice(0, 240)); });
  page.on("pageerror", (e) => { logs.push("PAGEERROR " + e.message); console.log("[pageerror]", e.message.slice(0, 240)); });
}
const API = { effectcraft: "effectcraft", filmcraft: "filmcraft" };
const ready = (target, engine) => target.waitForFunction((n) => window[n] && window[n + "Load"] && window[n + "Load"].readyMs, API[engine], { timeout: 240000 });
const call = (target, engine, kind, name, params = {}) => target.evaluate(([n, k, c, p]) => window[n][k](c, p).then((r) => ({ ok: true, r }), (e) => ({ ok: false, e: String((e && e.message) || e) })), [API[engine], kind, name, params]);
const ex = (t, e, c, p) => call(t, e, "execute", c, p), rq = (t, e, m, p) => call(t, e, "request", m, p);
const FF = VW + "/node_modules/ffmpeg-static/ffmpeg.exe", FP = VW + "/vendor/ffprobe/ffprobe.exe";
const probe = (file) => JSON.parse(execFileSync(FP, ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file], { encoding: "utf8" }));
function frame(file, n, fps, out) { execFileSync(FF, ["-v", "error", "-y", "-i", file, "-vf", `select=eq(n\\,${n})`, "-frames:v", "1", out]); return out; }
function meanVolume(file) { try { const r = require("node:child_process").spawnSync(FF, ["-i", file, "-af", "volumedetect", "-vn", "-f", "null", "-"], { encoding: "utf8" }); const m = /mean_volume: (-?[\d.]+) dB/.exec(r.stderr || ""); return m ? +m[1] : null; } catch { return null; } }
function recorder(name) { const R = {}; const log = (k, v) => { R[k] = v; console.log(k, (JSON.stringify(v) || "undefined").slice(0, 600)); }; const save = () => fs.writeFileSync(path.join(OUT, name + ".json"), JSON.stringify(R, null, 1)); return { R, log, save }; }
module.exports = { VW, ROOT, OUT, FX, DIST, fs, path, origin, launch, watch, ready, ex, rq, call, probe, frame, meanVolume, recorder };
