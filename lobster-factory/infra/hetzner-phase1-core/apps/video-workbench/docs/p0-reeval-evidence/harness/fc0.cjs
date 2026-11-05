// FC.0: a real FilmCraft window for the operator (sound, Chinese IME, English UI). Discrete GPU only
// (--force_high_performance_gpu): her own Edge sits on the Intel adapter, so a device loss here cannot reach it.
// Stays open until she closes the window (max 45 min); writes out/fc0.json with what was observed.
const { VW, OUT, fs, path, origin, watch, ready, ex, rq } = require("./common.cjs");
const { chromium } = require(VW + "/node_modules/playwright");
const E = "filmcraft", TPS = 254016000000, R = { samples: [] };
const save = () => fs.writeFileSync(path.join(OUT, "fc0.json"), JSON.stringify(R, null, 1));
(async () => {
  const base = await origin();
  const browser = await chromium.launch({ channel: "msedge", headless: false, args: ["--force_high_performance_gpu", "--start-maximized", "--autoplay-policy=no-user-gesture-required"] });
  const ctx = await browser.newContext({ viewport: null }), page = await ctx.newPage(), logs = [];
  watch(page, logs);
  await page.goto(base + "/__trial/filmcraft/index.html?empty"); await ready(page, E);
  R.adapter = await page.evaluate(async () => { const i = window.filmcraft.info(), a = navigator.gpu && (await navigator.gpu.requestAdapter({ powerPreference: "high-performance" })); return { backend: i.backend, compositor: i.compositor, webgpu: a && a.info && a.info.vendor + " " + a.info.architecture }; });
  console.log("adapter", JSON.stringify(R.adapter));
  if (!/nvidia/i.test(String(R.adapter.webgpu))) { console.log("ABORT: not on the discrete GPU"); save(); await browser.close(); process.exit(2); }
  const imp = (n) => page.evaluate((n) => window.filmcraft.importUrl(location.origin + "/__fx/" + n, n).then((r) => r.items[0]), n);
  const mp4 = await imp("src.mp4");
  await ex(page, E, "file.newSequence", { name: "FC0", width: 1920, height: 1080, fps: 30, video: 3, audio: 3 });
  await ex(page, E, "timeline.place", { item: mp4, track: "V1", audioTrack: "A1", seconds: 0 });
  await ex(page, E, "graphics.newText", { text: "請在這裡打中文", font: "Noto Sans TC", size: 90, position: [200, 200], seconds: 10, time: 0 });
  await page.evaluate(() => window.filmcraft.importUrl(location.origin + "/__fx/zh.srt", "zh.srt"));
  await ex(page, E, "playhead.set", { seconds: 0 });
  console.log("READY");
  const t0 = Date.now(); let closed = false; browser.on("disconnected", () => { closed = true; });
  while (!closed && Date.now() - t0 < 45 * 60000) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const st = (await rq(page, E, "ui.inspect", {})).r;
      if (st && st.playback && st.playback.playing) R.samples.push({ t: Math.round((Date.now() - t0) / 1000), sec: +(st.playhead / TPS).toFixed(2), audioClock: st.playback.audioClock, shown: st.playback.shown, dropped: st.playback.dropped });
      const texts = await ex(page, E, "captions.list", {});
      if (texts.ok) R.captions = texts.r.tracks.flatMap((t) => t.captions.map((c) => c.text));
      R.lost = logs.filter((l) => /device lost|context lost/i.test(l));
      save();
    } catch { /* window closing */ }
  }
  save(); if (!closed) await browser.close(); process.exit(0);
})().catch((e) => { console.error("FATAL", e.message); R.fatal = String(e.message); save(); process.exit(1); });
