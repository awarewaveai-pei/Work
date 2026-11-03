// P6 L0 (SeedStar -> video-workbench): old names keep working. (1) a browser that cached under seedstar.app.v1*
// gets every key copied to vw.app.v1* and keeps the original; (2) SEEDSTAR_* env still applies, VW_* wins.
const assert = require("node:assert/strict"), { chromium } = require("playwright");
const { isolatedServer } = require("./isolated-server.cjs");
const { vwEnv } = require("../backend/env-compat.cjs");

(async () => {
  assert.equal(vwEnv({ SEEDSTAR_DATA_DIR: "old" }, "DATA_DIR"), "old");
  assert.equal(vwEnv({ SEEDSTAR_DATA_DIR: "old", VW_DATA_DIR: "new" }, "DATA_DIR"), "new");
  assert.equal(vwEnv({}, "DATA_DIR"), undefined);
  console.log("PASS env：VW_* 優先，舊 SEEDSTAR_* 仍生效");

  const { base } = await isolatedServer("vw-l0-");
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage();
    await page.route("**/*", (r) => (r.request().url().startsWith(base + "/") ? r.continue() : r.abort()));
    await page.goto(base + "/index.html");
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem("seedstar.app.v1", '{"old":1}');
      localStorage.setItem("seedstar.app.v1.pre-server-2026-11-01T00:00:00.000Z", '{"orig":1}');
    });
    await page.reload();
    await page.waitForFunction(() => localStorage.getItem("vw.app.v1.pre-server-2026-11-01T00:00:00.000Z") !== null);
    const keys = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])));
    assert.equal(keys["vw.app.v1.pre-server-2026-11-01T00:00:00.000Z"], '{"orig":1}');
    assert.equal(keys["seedstar.app.v1"], '{"old":1}', "old key kept");
    assert.ok("vw.app.v1" in keys);
    console.log("PASS 瀏覽器快取：舊 seedstar.app.v1* 複製到 vw.app.v1*，原鍵保留");
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
