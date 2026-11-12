// tools.html loads each tool's code when the tool opens (tools-0.js TOOLS[].scripts): the page boots with the list and
// the frame only; every tool opened from the list, from #hash (fresh page) and via a hash change + browser back/forward (popstate) renders its real screen with
// no page error. Real browser (Edge), isolated data dir; not in tests/gate.cjs (needs a browser).
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const BOOT = ["subtitles.js", "tool-processing.js", "tools-workflows.js", "tools-engine-host.js", "tools-0.js"];
(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-lazy-")),
    server = require("../server.cjs").createServer({ dataDir, env: {} });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port,
    browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
    await page.route("**/*", (r) => (r.request().url().startsWith(base + "/") ? r.continue() : r.abort()));
    const scripts = () => page.evaluate(() => [...document.scripts].map((s) => s.src.split("/").pop().split("?")[0]).filter(Boolean));
    // networkidle: a tool may save state on open; leaving mid-save makes the local adapter report a stale browser copy
    // (shared/adapters.js load), which is not what this test is about.
    const real = async (id) => {
      await page.waitForFunction((id) => typeof TOOLS !== "undefined" && tool === id && (TOOLS.find((t) => t.id === id).loaded || !TOOLS.find((t) => t.id === id).scripts) && !document.querySelector("#app [role=status]")?.textContent.includes("載入中") && document.querySelector("#app").children.length > 0, id);
      await page.waitForLoadState("networkidle");
    };

    const t0 = Date.now();
    await page.goto(base + "/pages/tools.html");
    await page.waitForSelector("#app [data-act^='open:']");
    console.log(`list shown ${Date.now() - t0} ms`);
    const boot = await scripts();
    for (const f of ["tools-editor.js", "tools-compositor.js", "tools-rig.js", "tools-3d.js", "tools-follow.js", "tools-overlays.js", "tools-voice-music.js", "tools-subtitles.js"])
      assert(!boot.includes(f), "not loaded at boot: " + f);
    for (const f of BOOT) assert(boot.includes(f), "boot loads " + f);

    const ids = await page.evaluate(() => [...document.querySelectorAll("#app [data-act^='open:']")].map((b) => b.dataset.act.slice(5)));
    const unique = [...new Set(ids)];
    assert(unique.length >= 15, "at least 15 tools listed: " + unique.join(","));
    for (const id of unique) {
      await page.goto(base + "/pages/tools.html");
      await page.waitForSelector("#app [data-act^='open:']");
      await page.locator(`#app [data-act="open:${id}"]`).first().click();
      await real(id);
      console.log("PASS open from list: " + id);
    }
    for (const id of unique) {
      await page.goto("about:blank");
      await page.goto(base + "/pages/tools.html#" + id);
      await real(id);
      console.log("PASS fresh #" + id);
    }
    // back to the list and forward again into a tool that is already loaded
    await page.goto(base + "/pages/tools.html");
    await page.waitForSelector("#app [data-act^='open:']");
    await page.locator('#app [data-act="open:compose"]').first().click();
    await real("compose");
    await page.locator('#app [data-act="home"]').first().click();
    await page.waitForSelector("#app [data-act^='open:']");
    await page.locator('#app [data-act="open:rig"]').first().click();
    await real("rig");
    // popstate: a hash change into a tool not loaded yet, then browser back to the list and forward into it again.
    await page.goto(base + "/pages/tools.html");
    await page.waitForSelector("#app [data-act^='open:']");
    await page.evaluate(() => (location.hash = "#follow"));
    await real("follow");
    await page.goBack();
    await page.waitForFunction(() => tool === null && document.querySelector("#app [data-act^='open:']"));
    await page.goForward();
    await real("follow");
    console.log("PASS hash change / back / forward");
    assert.deepEqual(errors, [], "no page errors");
    console.log(`tools-lazy-load ok (${unique.length} tools)`);
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
