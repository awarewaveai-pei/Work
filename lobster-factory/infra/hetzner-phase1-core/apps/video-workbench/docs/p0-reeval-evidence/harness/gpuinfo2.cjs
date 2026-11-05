const { VW, origin } = require("./common.cjs"); const { chromium } = require(VW + "/node_modules/playwright");
(async () => {
  const base = await origin();
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--force_high_performance_gpu"] }), page = await (await browser.newContext()).newPage();
  await page.goto(base + "/");
  console.log(JSON.stringify(await page.evaluate(async () => {
    const c = document.createElement("canvas"), gl = c.getContext("webgl2"), ext = gl.getExtension("WEBGL_debug_renderer_info");
    const a = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    return { webgl2: gl.getParameter(ext.UNMASKED_RENDERER_WEBGL), webgpu: a && { vendor: a.info?.vendor, arch: a.info?.architecture, fallback: a.info?.isFallbackAdapter } };
  })));
  await browser.close(); process.exit(0);
})();
