// Gate ⑤ for either engine: same-origin iframe inside the workbench page. Usage: node embed.cjs effectcraft|filmcraft
const { OUT, fs, path, origin, launch, watch, ready, recorder } = require("./common.cjs");
const E = process.argv[2], { log, save } = recorder(E + "-embed");
const Q = { effectcraft: "?empty&nosw&nogpuworkers", filmcraft: "?empty" }[E];
(async () => {
  const base = await origin(), { browser, ctx } = await launch(), page = await ctx.newPage(), logs = [];
  watch(page, logs);
  const cdp = await ctx.newCDPSession(page); await cdp.send("Performance.enable");
  const heap = async () => (await cdp.send("Performance.getMetrics")).metrics.filter((m) => /JSHeapUsedSize|Documents/.test(m.name)).reduce((o, m) => ((o[m.name] = Math.round(m.value)), o), {});
  await page.goto(base + "/"); await page.waitForSelector("#toolsNav");
  log("parent.coi", await page.evaluate(() => crossOriginIsolated));
  log("before", { workers: page.workers().length, heap: await heap() });
  await page.evaluate(([e, q]) => { const f = document.createElement("iframe"); f.id = "eng"; f.src = "/__trial/" + e + "/index.html" + q; f.style.cssText = "position:fixed;right:0;top:0;width:1100px;height:800px;z-index:99;border:0"; f.allow = "autoplay; clipboard-read; clipboard-write"; document.body.appendChild(f); }, [E, Q]);
  const fr = await (await page.waitForSelector("#eng")).contentFrame();
  await ready(fr, E);
  log("frame.info", await fr.evaluate((n) => { const i = window[n].info(); return { backend: i.backend, compositor: i.compositor, coi: i.crossOriginIsolated, version: i.version }; }, E));
  log("during", { workers: page.workers().length, workerUrls: page.workers().map((w) => w.url().split("/").pop().split("?")[0]), heap: await heap() });
  await page.click("#toolsNav", { timeout: 5000 }).then(() => log("sidebar.click", "ok"), (e) => log("sidebar.click", "ERR " + e.message.slice(0, 160)));
  log("sidebar.active", await page.evaluate(() => document.querySelector(".sidebar .nav.active")?.id));
  const active = () => page.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.tagName));
  // as shipped: click into the engine, Escape, Tab
  await page.mouse.click(1000, 400); log("focus.inFrame", await active());
  await page.keyboard.press("Escape"); log("focus.afterEscape", await active());
  await page.keyboard.press("Tab"); log("focus.afterTab", await active());
  // host-side remedy (no engine patch): the workbench listens for one key inside the same-origin frame and takes focus back
  await page.evaluate(() => { const f = document.getElementById("eng"); f.contentWindow.addEventListener("keydown", (e) => { if (e.key === "F6") { e.preventDefault(); e.stopPropagation(); f.blur(); const t = document.getElementById("toolsNav"); t.focus(); } }, true); });
  await page.mouse.click(1000, 400); log("focus.inFrame2", await active());
  await page.keyboard.press("F6"); log("focus.afterF6", await active());
  await page.keyboard.press("Enter"); log("sidebar.activeAfterEnter", await page.evaluate(() => document.querySelector(".sidebar .nav.active")?.id));
  await page.screenshot({ path: path.join(OUT, E + "-embed.png") });
  await page.evaluate(() => document.getElementById("eng").remove());
  await page.waitForTimeout(3000);
  await cdp.send("HeapProfiler.enable").catch(() => {}); await cdp.send("HeapProfiler.collectGarbage").catch(() => {});
  log("after", { workers: page.workers().length, heap: await heap() });
  save(); await browser.close(); process.exit(0);
})().catch((e) => { console.error("FATAL", e); save(); process.exit(1); });
