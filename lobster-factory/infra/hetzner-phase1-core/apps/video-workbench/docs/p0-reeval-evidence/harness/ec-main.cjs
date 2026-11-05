// EffectCraft v0.21.1 + TC fonts: gates ③ fonts, ① WebGL2 speed (this laptop), ② reopen media, ④/output.
const { OUT, FX, fs, path, origin, launch, watch, ready, ex, rq, probe, frame, meanVolume, recorder } = require("./common.cjs");
const E = "effectcraft", { log, save } = recorder("ec-main");
const srt = (t) => t.replace(/\r/g, "").trim().split(/\n\n+/).map((b) => { const l = b.split("\n"), m = l[1].match(/(\d+):(\d+):(\d+),(\d+) --> (\d+):(\d+):(\d+),(\d+)/), s = (a) => +a[0] * 3600 + +a[1] * 60 + +a[2] + +a[3] / 1000; return { in: s(m.slice(1, 5)), out: s(m.slice(5, 9)), text: l.slice(2).join("\n") }; });
(async () => {
  const base = await origin(), { browser, ctx } = await launch(), page = await ctx.newPage(), logs = [];
  watch(page, logs);
  const url = base + "/__trial/effectcraft/index.html?empty&nosw&nogpuworkers";
  const t0 = Date.now(); await page.goto(url); await ready(page, E);
  log("load", { ms: Date.now() - t0, load: await page.evaluate(() => window.effectcraftLoad), info: await page.evaluate(() => { const i = window.effectcraft.info(); return { version: i.version, backend: i.backend, gpu: i.gpu, coi: i.crossOriginIsolated, storage: i.storage && i.storage.backend, frameWorkers: i.frameWorkers && { workers: i.frameWorkers.workers, alive: i.frameWorkers.alive } }; }) });
  const add = (n) => page.evaluate((n) => window.effectcraft.addFile(location.origin + "/__fx/" + n, n).then((r) => ({ ok: true, r }), (e) => ({ ok: false, e: String(e.message || e) })), n);
  // ③ fonts
  const f = await ex(page, E, "text.fonts", {});
  log("fonts", f.ok ? f.r.families.map((x) => x.family + ":" + x.origin) : f);
  const media = ["src.mp4", "src_hevc10.mov", "logo.png", "a440.wav", "a880.wav"];
  const ti = Date.now(); for (const n of media) log("import." + n, await add(n)); log("import.ms", Date.now() - ti);
  log("import.srt", await add("zh.srt"));
  log("comp.new", await ex(page, E, "comp.new", { name: "Main", width: 1920, height: 1080, frameRate: 30, duration: 10 }));
  log("L.mp4", await ex(page, E, "layer.addItem", { item: "src.mp4", time: 0 }));
  log("L.a440", await ex(page, E, "layer.addItem", { item: "a440.wav", time: 0 }));
  log("L.a880", await ex(page, E, "layer.addItem", { item: "a880.wav", time: 0 }));
  log("L.mov", await ex(page, E, "layer.addItem", { item: "src_hevc10.mov", time: 0, in: 0, out: 3 }));
  log("L.png", await ex(page, E, "layer.addItem", { item: "logo.png", time: 0, in: 0, out: 2, position: [1500, 700] }));
  log("L.title", await ex(page, E, "layer.newText", { text: "覺知波：繁體中文標題「嘸」測試", font: "Noto Sans TC", size: 90, fill: "#ffff00", position: [960, 200] }));
  const cues = srt(fs.readFileSync(path.join(FX, "zh.srt"), "utf8"));
  for (const [i, c] of cues.entries()) log("L.cue" + (i + 1), await ex(page, E, "layer.newText", { text: c.text, name: "SRT " + (i + 1), font: i === 1 ? "Noto Serif TC" : "Noto Sans TC", size: 64, fill: "#ffffff", stroke: "#000000", applyStroke: true, strokeWidth: 4, position: [960, 950] }));
  const segs = () => ex(page, E, "comp.info", {}).then((x) => x.r.layers);
  for (const [i, c] of cues.entries()) {
    const nm = "SRT " + (i + 1);
    for (const t of [c.out, c.in]) { const L = (await segs()).filter((l) => l.name === nm && l.in < t && l.out > t); await ex(page, E, "time.set", { time: t }); await ex(page, E, "edit.splitLayer", { layers: L.map((l) => l.id) }); }
    const drop = (await segs()).filter((l) => l.name.startsWith(nm) && !(l.in >= c.in - 1e-6 && l.out <= c.out + 1e-6));
    if (drop.length) await ex(page, E, "edit.clear", { layers: drop.map((l) => l.id) });
    log(nm + ".io", (await segs()).filter((l) => l.name.startsWith(nm)).map((l) => [l.name, l.in, l.out]));
  }
  await ex(page, E, "time.set", { time: 0 });
  // ① WebGL2 playback speed: comp seconds advanced per wall second
  await page.mouse.click(800, 450); await page.keyboard.press("Shift");
  for (const res of ["Full", "Half", "Quarter"]) {
    await rq(page, E, "ui.set", { viewer: { res } }); await ex(page, E, "time.set", { time: 0 });
    await rq(page, E, "ui.playback", { action: "play" });
    const s = []; const w0 = Date.now();
    for (let i = 0; i < 6; i++) { await page.waitForTimeout(1000); const st = (await rq(page, E, "ui.playback", { action: "status" })).r; s.push(st && { t: st.time, audio: st.audio, lv: st.levelsDb }); }
    const wall = (Date.now() - w0) / 1000; await rq(page, E, "ui.playback", { action: "stop" });
    log("play." + res, { wall, compSeconds: s.at(-1) && s.at(-1).t, ratio: s.at(-1) && +(s.at(-1).t / wall).toFixed(2), samples: s, audio: (await page.evaluate(() => window.effectcraft.info())).audio });
  }
  await rq(page, E, "ui.set", { viewer: { res: "Full" } });
  for (const [t, name] of [[1, "ec-preview-t1"], [4, "ec-preview-t4"], [7, "ec-preview-t7"]]) { const fr = await rq(page, E, "render.frame", { time: t, base64: true }); if (fr.ok && fr.r.png) fs.writeFileSync(path.join(OUT, name + ".png"), Buffer.from(fr.r.png, "base64")); log(name, fr.ok ? { w: fr.r.width, h: fr.r.height } : fr); }
  const shot = await rq(page, E, "ui.screenshot", {}); if (shot.ok && shot.r.png) fs.writeFileSync(path.join(OUT, "ec-ui.png"), Buffer.from(shot.r.png, "base64"));
  // ② save, reload, reopen
  log("save", await page.evaluate(() => window.effectcraft.saveToBrowser("/reeval.ecproj").then((r) => r, (e) => "ERR " + e)));
  await page.evaluate(() => window.effectcraft.flush());
  const bytes = await page.evaluate(() => Promise.resolve(window.effectcraft.readFile("/reeval.ecproj")).then((u) => Array.from(u)));
  fs.writeFileSync(path.join(OUT, "reeval.ecproj"), Buffer.from(bytes)); log("ecproj.bytes", bytes.length);
  const before = await ex(page, E, "comp.info", {});
  await page.goto(url.replace("?empty&", "?")); await ready(page, E);
  log("reload.stored", await page.evaluate(() => window.effectcraft.listStored().then((s) => ({ backend: s.backend, files: s.files.map((x) => x.path + ":" + x.size) }))));
  log("reload.open", await ex(page, E, "file.open", { path: "/reeval.ecproj" }));
  log("comp.open", await ex(page, E, "comp.open", { comp: "Main" }));
  const after = await ex(page, E, "comp.info", {});
  log("reload.same", JSON.stringify(before.r) === JSON.stringify(after.r));
  const missing = await ex(page, E, "footage.missing", {}); log("reload.missing", missing);
  const nMissing = missing.ok ? (missing.r.missing || missing.r.items || missing.r || []).length : -1;
  if (nMissing) { // realistic host flow: the workbench hands the same media over again from its asset library
    for (const n of media) await add(n);
    const m2 = await ex(page, E, "footage.missing", {}); log("reload.missing.afterHostReAdd", m2);
    const still = m2.ok ? (m2.r.missing || m2.r.items || m2.r || []) : [];
    for (const it of still) log("relink." + (it.name || it.path || it.id), await ex(page, E, "footage.relink", { item: it.id ?? it.item ?? it.name, path: it.path || "/" + (it.name || "") }));
    log("reload.missing.afterRelink", await ex(page, E, "footage.missing", {}));
  }
  const fr = await rq(page, E, "render.frame", { time: 1, base64: true }); if (fr.ok && fr.r.png) fs.writeFileSync(path.join(OUT, "ec-reopen-t1.png"), Buffer.from(fr.r.png, "base64"));
  // output
  log("rq.add", await ex(page, E, "renderQueue.add", { comp: "Main", format: "h264", output: "/reeval_out.mp4", audio: "on" }));
  const dl = page.waitForEvent("download", { timeout: 1500000 }), tr = Date.now();
  log("rq.render", await ex(page, E, "renderQueue.render", { wait: true }));
  const d = await dl, outFile = path.join(OUT, "ec-out.mp4"); await d.saveAs(outFile);
  log("render.ms", Date.now() - tr);
  const p = probe(outFile); log("out.probe", { duration: p.format.duration, size: p.format.size, streams: p.streams.map((s) => ({ type: s.codec_type, codec: s.codec_name, w: s.width, h: s.height, fps: s.r_frame_rate, frames: s.nb_frames, sr: s.sample_rate, ch: s.channels })) });
  log("out.meanVolumeDb", meanVolume(outFile));
  for (const n of [30, 120, 210]) frame(outFile, n, 30, path.join(OUT, `ec-out-f${n}.png`));
  log("lost", logs.filter((l) => /device lost|context lost/i.test(l)));
  fs.writeFileSync(path.join(OUT, "ec-console.log"), logs.join("\n")); save();
  await browser.close(); process.exit(0);
})().catch((e) => { console.error("FATAL", e); save(); process.exit(1); });
