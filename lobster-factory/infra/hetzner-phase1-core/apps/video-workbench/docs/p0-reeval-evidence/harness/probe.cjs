// Dump an engine's command list and start-up info. Usage: node probe.cjs effectcraft|filmcraft [query]
const { OUT, fs, path, origin, launch, watch, ready } = require("./common.cjs");
const E = process.argv[2], Q = process.argv[3] || "?empty" + (E === "effectcraft" ? "&nosw&nogpuworkers" : "");
(async () => {
  const base = await origin(), { browser, ctx } = await launch(), page = await ctx.newPage(), logs = [];
  watch(page, logs);
  const t0 = Date.now(); await page.goto(base + "/__trial/" + E + "/index.html" + Q); await ready(page, E);
  console.log("loaded", Date.now() - t0, "ms", JSON.stringify(await page.evaluate((n) => window[n + "Load"], E)));
  console.log("info", JSON.stringify(await page.evaluate((n) => window[n].info(), E)).slice(0, 1500));
  const cmds = await page.evaluate((n) => window[n].commands(), E);
  fs.writeFileSync(path.join(OUT, E + "-commands.json"), JSON.stringify(cmds, null, 1));
  const list = Array.isArray(cmds) ? cmds : cmds.commands || [];
  console.log("commands", list.length);
  await page.screenshot({ path: path.join(OUT, E + "-start.png") });
  await browser.close(); process.exit(0);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
