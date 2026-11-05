// FilmCraft parent bridge (?host=parent, upstream main #3341): files in from the workbench page, saves/exports back to it.
const { OUT, fs, path, origin, launch, watch, ready, ex, probe, recorder } = require("./common.cjs");
const E = "filmcraft", { log, save } = recorder("fc-host");
(async () => {
  const base = await origin(), { browser, ctx } = await launch(), page = await ctx.newPage(), logs = [];
  watch(page, logs);
  let downloads = 0; page.on("download", () => downloads++);
  await page.goto(base + "/"); await page.waitForSelector("#toolsNav");
  const mount = () => page.evaluate(() => {
    window.__fc = { msgs: [], saved: {} };
    if (!window.__fcListen) { window.__fcListen = true; window.addEventListener("message", (e) => { const d = e.data; if (!d || typeof d.type !== "string" || !d.type.startsWith("filmcraft:")) return; const row = { type: d.type, name: d.name, saveAs: d.saveAs, dirty: d.dirty, version: d.version, appVersion: d.appVersion, error: d.error, bytes: d.bytes ? d.bytes.byteLength : undefined, sameOrigin: e.origin === location.origin }; window.__fc.msgs.push(row); if (d.type === "filmcraft:save") window.__fc.saved[d.name] = new Uint8Array(d.bytes); }); }
    document.getElementById("eng")?.remove();
    const f = document.createElement("iframe"); f.id = "eng"; f.src = "/__trial/filmcraft/index.html?host=parent"; f.style.cssText = "position:fixed;right:0;top:0;width:1100px;height:800px;z-index:99;border:0"; document.body.appendChild(f);
  });
  const waitMsg = (type, n = 1, timeout = 120000) => page.waitForFunction(([t, n]) => window.__fc.msgs.filter((m) => m.type === t).length >= n, [type, n], { timeout });
  const send = (name, url) => page.evaluate(async ([name, url]) => { const bytes = await (await fetch(url)).arrayBuffer(); document.getElementById("eng").contentWindow.postMessage({ type: "filmcraft:open", name, bytes }, location.origin, [bytes]); return bytes.byteLength; }, [name, url]);
  const frameOf = async () => (await page.waitForSelector("#eng")).contentFrame();
  await mount(); await waitMsg("filmcraft:ready"); let fr = await frameOf(); await ready(fr, E);
  log("ready", await page.evaluate(() => window.__fc.msgs));
  log("open.mp4", await send("src.mp4", "/__fx/src.mp4")); log("open.wav", await send("a440.wav", "/__fx/a440.wav")); log("open.srt", await send("zh.srt", "/__fx/zh.srt"));
  await page.waitForTimeout(4000);
  const items = await ex(fr, E, "media.status", {}); log("media.status", items.ok ? items.r.map((x) => [x.item, x.name, x.status]) : items);
  log("seq", await ex(fr, E, "file.newSequence", { name: "Host", width: 1920, height: 1080, fps: 30, fromItem: items.r[0].item }));
  log("title", await ex(fr, E, "graphics.newText", { text: "嵌入橋測試：成品交回工作台", font: "Noto Sans TC", size: 80, position: [200, 300], seconds: 3, time: 0 }));
  await page.waitForTimeout(1500);
  log("saveAs", await ex(fr, E, "file.saveAs", { path: "/host.fcproj" }));
  log("export", await ex(fr, E, "file.exportMedia", { path: "/exports/host-out.mp4", format: "h264", width: 960, height: 540, fps: 30, range: "custom", startSeconds: 0, endSeconds: 3, captionSidecar: "srt", wait: false }));
  await waitMsg("filmcraft:save", 2, 300000).catch((e) => log("waitSave", String(e.message).slice(0, 200)));
  await page.waitForTimeout(3000);
  log("msgs", await page.evaluate(() => window.__fc.msgs));
  const saved = await page.evaluate(() => Object.fromEntries(Object.entries(window.__fc.saved).map(([k, v]) => [k, Array.from(v)])));
  for (const [name, arr] of Object.entries(saved)) fs.writeFileSync(path.join(OUT, "fc-host-" + name), Buffer.from(arr));
  const mp4 = Object.keys(saved).find((n) => /\.mp4$/.test(n));
  if (mp4) { const p = probe(path.join(OUT, "fc-host-" + mp4)); log("saved.probe", { duration: p.format.duration, streams: p.streams.map((s) => [s.codec_type, s.codec_name, s.width, s.height]) }); }
  log("downloads.browser", downloads);
  // reopen in a fresh frame: host mode restores nothing, so the page hands the project and its media over again
  const proj = Object.keys(saved).find((n) => /\.fcproj$/.test(n));
  await mount(); await waitMsg("filmcraft:ready"); fr = await frameOf(); await ready(fr, E);
  await page.evaluate(([name, arr]) => { const b = new Uint8Array(arr).buffer; document.getElementById("eng").contentWindow.postMessage({ type: "filmcraft:open", name, bytes: b }, location.origin, [b]); }, [proj, saved[proj]]);
  await page.waitForTimeout(3000);
  const m1 = await ex(fr, E, "media.status", {}); log("reopen.projectOnly", m1.ok ? m1.r.map((x) => [x.name, x.status]) : m1);
  await send("src.mp4", "/__fx/src.mp4"); await send("a440.wav", "/__fx/a440.wav"); await page.waitForTimeout(4000);
  const m2 = await ex(fr, E, "media.status", {}); log("reopen.afterMedia", m2.ok ? m2.r.map((x) => [x.name, x.path, x.status]) : m2);
  log("reopen.missing", await ex(fr, E, "media.findMissing", {}));
  log("reopen.msgs", await page.evaluate(() => window.__fc.msgs));
  save(); await browser.close(); process.exit(0);
})().catch((e) => { console.error("FATAL", e); save(); process.exit(1); });
