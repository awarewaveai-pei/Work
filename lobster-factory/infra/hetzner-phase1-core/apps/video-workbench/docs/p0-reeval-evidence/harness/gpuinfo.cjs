// Read-only: which adapter does the browser hand to WebGL2 / WebGPU. No rendering.
const { origin, launch } = require("./common.cjs");
(async () => {
  const base = await origin();
  for (const gpu of [false, true]) {
    const { browser, ctx } = await launch({ gpu }), page = await ctx.newPage();
    await page.goto(base + "/");
    const r = await page.evaluate(async () => {
      const c = document.createElement("canvas"), gl = c.getContext("webgl2"), ext = gl && gl.getExtension("WEBGL_debug_renderer_info");
      const out = { webgl2: gl ? gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) : null, hasWebGPU: !!navigator.gpu };
      if (navigator.gpu) for (const pp of ["high-performance", "low-power"]) { try { const a = await navigator.gpu.requestAdapter({ powerPreference: pp }); out[pp] = a ? { vendor: a.info?.vendor, arch: a.info?.architecture, device: a.info?.device, desc: a.info?.description, fallback: a.isFallbackAdapter ?? a.info?.isFallbackAdapter } : null; } catch (e) { out[pp] = "ERR " + e.message; } }
      return out;
    });
    console.log(gpu ? "webgpu-on" : "webgpu-off", JSON.stringify(r));
    await browser.close();
  }
  process.exit(0);
})();
