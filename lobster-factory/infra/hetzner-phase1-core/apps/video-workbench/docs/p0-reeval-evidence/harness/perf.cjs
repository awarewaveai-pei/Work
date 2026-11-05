// Gate ① on this laptop without WebGPU (WebGL2 start-up, CPU compositing), run alone. Usage: node perf.cjs effectcraft|filmcraft
// Two loads: A = one 1080p H.264 clip + one CJK title; B = the full gate comp (2 videos incl. HEVC 10-bit, PNG, 2 WAV, title, 3 cues).
const { origin, launch, watch, ready, ex, rq, recorder } = require("./common.cjs");
const E = process.argv[2], GPU = process.argv[3] === "nvidia" ? "nvidia" : false, { log, save } = recorder(E + "-perf" + (GPU ? "-webgpu" : "")), TPS = 254016000000;
(async () => {
  const base = await origin(), { browser, ctx } = await launch({ gpu: GPU }), page = await ctx.newPage(), logs = [];
  watch(page, logs);
  await page.goto(base + "/__trial/" + E + "/index.html?empty" + (E === "effectcraft" ? "&nosw" + (GPU ? "" : "&nogpuworkers") : "")); await ready(page, E);
  const lost = () => logs.filter((l) => /device lost|context lost|devicelost/i.test(l));
  log("adapter", await page.evaluate(async (n) => { const i = window[n].info(), a = navigator.gpu && (await navigator.gpu.requestAdapter({ powerPreference: "high-performance" })); return { backend: i.backend, compositor: i.compositor, gpu: i.gpu, webgpuAdapter: a && a.info && a.info.vendor + " " + a.info.architecture }; }, E));
  if (GPU) { await page.waitForTimeout(15000); log("idle15s.lost", lost()); if (lost().length) { save(); process.exit(2); } }
  await page.mouse.click(800, 450); await page.keyboard.press("Shift");
  if (E === "effectcraft") {
    const add = (n) => page.evaluate((n) => window.effectcraft.addFile(location.origin + "/__fx/" + n, n), n);
    for (const n of ["src.mp4", "src_hevc10.mov", "logo.png", "a440.wav", "a880.wav"]) await add(n);
    const play = async (name) => {
      for (const res of ["Full", "Half", "Quarter"]) {
        await rq(page, E, "ui.set", { viewer: { res } }); await ex(page, E, "time.set", { time: 0 }); await page.waitForTimeout(500);
        await rq(page, E, "ui.playback", { action: "play" }); const w0 = Date.now(); await page.waitForTimeout(8000);
        const st = (await rq(page, E, "ui.playback", { action: "status" })).r, wall = (Date.now() - w0) / 1000; await rq(page, E, "ui.playback", { action: "stop" });
        const a = (await page.evaluate(() => window.effectcraft.info())).audio;
        log(name + "." + res, { wall, compSeconds: st.time, ratio: +(st.time / wall).toFixed(2), audioPosted: a.posted, audioPlayed: a.played, underruns: a.underruns });
      }
    };
    await ex(page, E, "comp.new", { name: "A", width: 1920, height: 1080, frameRate: 30, duration: 10 });
    await ex(page, E, "layer.addItem", { item: "src.mp4", time: 0 });
    await ex(page, E, "layer.newText", { text: "覺知波：繁體中文標題", font: "Noto Sans TC", size: 90, fill: "#ffff00", position: [960, 200] });
    await play("A");
    await ex(page, E, "comp.new", { name: "B", width: 1920, height: 1080, frameRate: 30, duration: 10 });
    for (const [item, extra] of [["src.mp4", {}], ["a440.wav", {}], ["a880.wav", {}], ["src_hevc10.mov", { in: 0, out: 3 }], ["logo.png", { in: 0, out: 2, position: [1500, 700] }]]) await ex(page, E, "layer.addItem", { item, time: 0, ...extra });
    await ex(page, E, "layer.newText", { text: "覺知波：繁體中文標題", font: "Noto Sans TC", size: 90, fill: "#ffff00", position: [960, 200] });
    for (let i = 0; i < 3; i++) await ex(page, E, "layer.newText", { text: "第 " + (i + 1) + " 句字幕", font: "Noto Sans TC", size: 64, fill: "#ffffff", position: [960, 950] });
    await play("B");
  } else {
    const imp = (n) => page.evaluate((n) => window.filmcraft.importUrl(location.origin + "/__fx/" + n, n).then((r) => r.items[0]), n);
    const id = {}; for (const n of ["src.mp4", "src_hevc10.mov", "logo.png", "a440.wav", "a880.wav"]) id[n] = await imp(n);
    const play = async (name) => {
      await ex(page, E, "playhead.set", { seconds: 0 }); await page.waitForTimeout(1500);
      await rq(page, E, "ui.playback", { action: "play" }); const w0 = Date.now(); await page.waitForTimeout(8000);
      const st = (await rq(page, E, "ui.inspect", {})).r, wall = (Date.now() - w0) / 1000; await rq(page, E, "ui.playback", { action: "stop" });
      const total = st.playback.shown + st.playback.dropped;
      log(name, { wall, playheadSeconds: +(st.playhead / TPS).toFixed(2), ratio: +(st.playhead / TPS / wall).toFixed(2), shown: st.playback.shown, dropped: st.playback.dropped, shownFps: +(st.playback.shown / wall).toFixed(1), shownShare: total ? +(st.playback.shown / total).toFixed(2) : null, audioClock: st.playback.audioClock, uiFps: Math.round(st.fps) });
    };
    await ex(page, E, "file.newSequence", { name: "A", width: 1920, height: 1080, fps: 30, video: 3, audio: 3 });
    await ex(page, E, "timeline.place", { item: id["src.mp4"], track: "V1", audioTrack: "A1", seconds: 0 });
    await ex(page, E, "graphics.newText", { text: "覺知波：繁體中文標題", font: "Noto Sans TC", size: 90, position: [200, 200], seconds: 10, time: 0 });
    await play("A");
    await ex(page, E, "file.newSequence", { name: "B", width: 1920, height: 1080, fps: 30, video: 3, audio: 3 });
    await ex(page, E, "timeline.place", { item: id["src.mp4"], track: "V1", audioTrack: "A1", seconds: 0 });
    await ex(page, E, "timeline.place", { item: id["src_hevc10.mov"], track: "V2", seconds: 0, duration: { frame: 90 }, audio: false });
    await ex(page, E, "timeline.place", { item: id["logo.png"], track: "V3", seconds: 0, duration: { seconds: 2 } });
    await ex(page, E, "timeline.place", { item: id["a440.wav"], track: "A2", seconds: 0, video: false });
    await ex(page, E, "timeline.place", { item: id["a880.wav"], track: "A3", seconds: 0, video: false });
    await ex(page, E, "graphics.newText", { text: "覺知波：繁體中文標題", font: "Noto Sans TC", size: 90, position: [200, 200], seconds: 10, time: 0 });
    await page.evaluate(() => window.filmcraft.importUrl(location.origin + "/__fx/zh.srt", "zh.srt"));
    await play("B");
    await ex(page, E, "playhead.set", { seconds: 4 }); // B again, after the HEVC clip ended (t >= 3 s)
    await rq(page, E, "ui.playback", { action: "play" }); const w0 = Date.now(); await page.waitForTimeout(5000);
    const st = (await rq(page, E, "ui.inspect", {})).r; await rq(page, E, "ui.playback", { action: "stop" });
    log("B.from4s", { wall: (Date.now() - w0) / 1000, shown: st.playback.shown, dropped: st.playback.dropped });
  }
  if (GPU && !lost().length) { // soak: 70 s of 1080p playback on the full comp, stop at the first device loss
    const w0 = Date.now(); let loops = 0;
    while (Date.now() - w0 < 70000 && !lost().length) { if (E === "effectcraft") await ex(page, E, "time.set", { time: 0 }); else await ex(page, E, "playhead.set", { seconds: 0 }); await rq(page, E, "ui.playback", { action: "play" }); await page.waitForTimeout(9000); await rq(page, E, "ui.playback", { action: "stop" }); loops++; }
    log("soak", { seconds: (Date.now() - w0) / 1000, loops, lost: lost(), info: await page.evaluate((n) => { const i = window[n].info(); return { backend: i.backend, gpu: i.gpu, compositor: i.compositor, frameWorkers: i.frameWorkers && i.frameWorkers.gpu }; }, E) });
  }
  log("lost", lost());
  save(); await browser.close(); process.exit(0);
})().catch((e) => { console.error("FATAL", e); save(); process.exit(1); });
