// FilmCraft main@46763a8 + TC fonts: gates ③ fonts, ① WebGL2/CPU speed (this laptop), ② reopen media, ④/output.
const { OUT, FX, fs, path, origin, launch, watch, ready, ex, rq, probe, frame, meanVolume, recorder } = require("./common.cjs");
const E = "filmcraft", { log, save } = recorder("fc-main"), TPS = 254016000000;
(async () => {
  const base = await origin(), { browser, ctx } = await launch(), page = await ctx.newPage(), logs = [];
  watch(page, logs);
  const downloads = []; page.on("download", async (d) => { const f = path.join(OUT, "fc-dl-" + d.suggestedFilename()); await d.saveAs(f).catch(() => {}); downloads.push(f); console.log("[download]", d.suggestedFilename()); });
  const url = base + "/__trial/filmcraft/index.html?empty";
  const t0 = Date.now(); await page.goto(url); await ready(page, E);
  log("load", { ms: Date.now() - t0, load: await page.evaluate(() => window.filmcraftLoad), info: await page.evaluate(() => { const i = window.filmcraft.info(); return { backend: i.backend, compositor: i.compositor, coi: i.crossOriginIsolated, opfs: i.opfs, webcodecs: i.webcodecs, threads: i.threads }; }) });
  const imp = (n) => page.evaluate((n) => window.filmcraft.importUrl(location.origin + "/__fx/" + n, n).then((r) => ({ ok: true, r }), (e) => ({ ok: false, e: String(e.message || e) })), n);
  // ③ fonts
  const f = await ex(page, E, "fonts.list", { system: false });
  log("fonts", f.ok ? JSON.stringify(f.r).slice(0, 900) : f);
  const media = ["src.mp4", "src_hevc10.mov", "logo.png", "a440.wav", "a880.wav"], id = {};
  const ti = Date.now();
  for (const n of media) { const r = await imp(n); log("import." + n, r); if (r.ok && r.r.items && r.r.items[0] != null) id[n] = r.r.items[0].id ?? r.r.items[0]; }
  log("import.ms", Date.now() - ti);
  log("project.items", await ex(page, E, "project.items", {}));
  log("seq.new", await ex(page, E, "file.newSequence", { name: "Main", width: 1920, height: 1080, fps: 30, video: 3, audio: 3 }));
  log("place.mp4", await ex(page, E, "timeline.place", { item: id["src.mp4"], track: "V1", audioTrack: "A1", seconds: 0 }));
  log("place.mov", await ex(page, E, "timeline.place", { item: id["src_hevc10.mov"], track: "V2", seconds: 0, duration: { frame: 90 }, audio: false }));
  log("place.png", await ex(page, E, "timeline.place", { item: id["logo.png"], track: "V3", seconds: 0, duration: { seconds: 2 } }));
  log("place.a440", await ex(page, E, "timeline.place", { item: id["a440.wav"], track: "A2", seconds: 0, video: false }));
  log("place.a880", await ex(page, E, "timeline.place", { item: id["a880.wav"], track: "A3", seconds: 0, video: false }));
  const rz = await ex(page, E, "timeline.razor", { time: 6 * TPS, track: "V1" }); log("razor.f180", rz);
  log("title", await ex(page, E, "graphics.newText", { text: "覺知波：繁體中文標題「嘸」測試", font: "Noto Sans TC", size: 90, position: [200, 200], seconds: 10, time: 0 }));
  const cap = await imp("zh.srt"); log("import.srt", cap);
  if (!cap.ok || (cap.r.errors && cap.r.errors.length)) log("captions.import", await ex(page, E, "captions.import", { path: (cap.ok && cap.r.paths && cap.r.paths[0]) || "/zh.srt" }));
  log("captions.style", await ex(page, E, "captions.setStyle", { track: "C1", font: "Noto Serif TC", fontStyle: "Regular", size: 64 }));
  log("captions.list", await ex(page, E, "captions.list", {}));
  log("transition", await ex(page, E, "sequence.applyVideoTransition", { effect: "cross_dissolve", frames: 15 }));
  const insp = await rq(page, E, "ui.inspect", {}); fs.writeFileSync(path.join(OUT, "fc-inspect.json"), JSON.stringify(insp, null, 1));
  // ① playback speed
  await page.mouse.click(800, 450); await page.keyboard.press("Shift");
  await ex(page, E, "playhead.set", { seconds: 0 });
  const p0 = await rq(page, E, "ui.playback", { action: "play" }); log("play", p0);
  const s = []; const w0 = Date.now();
  for (let i = 0; i < 8; i++) { await page.waitForTimeout(1000); const st = await rq(page, E, "ui.inspect", {}); s.push(st.ok ? { sec: +(st.r.playhead / TPS).toFixed(3), uiFps: Math.round(st.r.fps), ...st.r.playback } : st); }
  const wall = (Date.now() - w0) / 1000; await rq(page, E, "ui.playback", { action: "stop" });
  log("play.samples", { wall, samples: s });
  log("info.afterPlay", await page.evaluate(() => { const i = window.filmcraft.info(); return { backend: i.backend, compositor: i.compositor, webcodecsStats: i.webcodecsStats && { framesDecoded: i.webcodecsStats.framesDecoded, fallbacks: i.webcodecsStats.fallbacks, sources: i.webcodecsStats.sources } }; }));
  for (const [sec, name] of [[1, "fc-preview-t1"], [4, "fc-preview-t4"], [7, "fc-preview-t7"]]) {
    await ex(page, E, "playhead.set", { seconds: sec }); await page.waitForTimeout(2500);
    const sh = await page.evaluate(() => window.filmcraft.screenshot({}).then((r) => r.pngBase64, (e) => null));
    if (sh) fs.writeFileSync(path.join(OUT, name + ".png"), Buffer.from(sh, "base64")); log(name, !!sh);
  }
  // ② save, reload, reopen
  log("saveAs", await ex(page, E, "file.saveAs", { path: "/reeval.fcproj" }));
  log("files", await page.evaluate(() => window.filmcraft.files()));
  const bytes = await page.evaluate(() => Promise.resolve(window.filmcraft.readFile("/reeval.fcproj")).then((u) => Array.from(u), () => null));
  if (bytes) fs.writeFileSync(path.join(OUT, "reeval.fcproj"), Buffer.from(bytes)); log("fcproj.bytes", bytes && bytes.length);
  await page.waitForTimeout(8000); // background OPFS media copies + the 5 s recovery snapshot
  await page.goto(url.replace("?empty", "?norecover")); await ready(page, E);
  log("reload.info", await page.evaluate(() => { const i = window.filmcraft.info(); return { restoredMedia: i.restoredMedia, opfs: i.opfs }; }));
  log("reload.open", await page.evaluate((b) => window.filmcraft.openProject(new File([new Uint8Array(b)], "reeval.fcproj")).then((r) => ({ ok: true, r }), (e) => ({ ok: false, e: String(e.message || e) })), bytes));
  log("reload.missing", await ex(page, E, "media.findMissing", {}));
  log("reload.status", await ex(page, E, "media.status", {}));
  // realistic host flow: the workbench hands the same media over again from its asset library
  for (const n of media) await imp(n);
  log("reload.status.afterHostReAdd", await ex(page, E, "media.status", {}));
  await ex(page, E, "playhead.set", { seconds: 1 }); await page.waitForTimeout(2500);
  const sh = await page.evaluate(() => window.filmcraft.screenshot({}).then((r) => r.pngBase64, () => null)); if (sh) fs.writeFileSync(path.join(OUT, "fc-reopen-t1.png"), Buffer.from(sh, "base64"));
  // output
  const tr = Date.now();
  const exp = await ex(page, E, "file.exportMedia", { path: "/exports/fc-out.mp4", format: "h264", width: 1920, height: 1080, fps: 30, audio: true, burnCaptions: true, captionSidecar: "srt", loudnessLufs: -16, wait: false });
  log("export", exp);
  let jobs = null;
  for (let i = 0; i < 900; i++) { await page.waitForTimeout(1000); jobs = await ex(page, E, "jobs.list", {}); const txt = JSON.stringify(jobs); if (i % 20 === 0) console.log("jobs", txt.slice(0, 300)); if (!/"(running|queued|pending|rendering|active)"/i.test(txt) && (await page.evaluate(() => window.filmcraft.files())).some((x) => /fc-out\.mp4$/.test(x.path) && x.size > 0)) break; }
  log("jobs.final", jobs);
  log("export.ms", Date.now() - tr);
  log("export.files", await page.evaluate(() => window.filmcraft.files()));
  const ob = await page.evaluate(() => Promise.resolve(window.filmcraft.readFile("/exports/fc-out.mp4")).then((u) => Array.from(u), () => null));
  const outFile = path.join(OUT, "fc-out.mp4");
  if (ob) fs.writeFileSync(outFile, Buffer.from(ob)); else if (downloads.find((d) => /\.mp4$/.test(d))) fs.copyFileSync(downloads.find((d) => /\.mp4$/.test(d)), outFile);
  if (fs.existsSync(outFile)) {
    const p = probe(outFile); log("out.probe", { duration: p.format.duration, size: p.format.size, streams: p.streams.map((s) => ({ type: s.codec_type, codec: s.codec_name, w: s.width, h: s.height, fps: s.r_frame_rate, frames: s.nb_frames, sr: s.sample_rate, ch: s.channels })) });
    log("out.meanVolumeDb", meanVolume(outFile));
    for (const n of [30, 120, 210]) frame(outFile, n, 30, path.join(OUT, `fc-out-f${n}.png`));
  }
  log("downloads", downloads.map((d) => path.basename(d)));
  log("lost", logs.filter((l) => /device lost|context lost/i.test(l)));
  fs.writeFileSync(path.join(OUT, "fc-console.log"), logs.join("\n")); save();
  await browser.close(); process.exit(0);
})().catch((e) => { console.error("FATAL", e); save(); process.exit(1); });
