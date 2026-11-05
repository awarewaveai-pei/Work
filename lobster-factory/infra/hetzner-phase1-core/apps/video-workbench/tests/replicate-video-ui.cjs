// Card RV UI (docs/replicate-video-models-plan-20261105.md): video models are visible buttons with prices, no dropdown;
// Runway without an image cannot send; the default stays sora-2. Browser test (not in tests/gate.cjs); backend: replicate-video.cjs.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { isolatedServer } = require("./isolated-server.cjs");
const fetchImpl = async () => { throw Error("Provider calls are forbidden in tests"); };

(async () => {
  const env = { REPLICATE_API_TOKEN: "test-only-replicate" };
  {
    const src = fs.readFileSync(path.join(__dirname, "../scripts/projects-0.js"), "utf8");
    assert.doesNotMatch(src, /<select data-settings="model"/, "專案設定的模型仍是下拉選單");
    const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
    const { base } = await isolatedServer("vw-rv-ui-", { fetchImpl, env });
    const browser = await chromium.launch({ channel: "msedge", headless: true });
    try {
      const p = await browser.newPage(), errors = [];
      p.setDefaultTimeout(15000);
      p.on("pageerror", (e) => errors.push(e.message));
      await p.route("**/*", (r) => (r.request().url().startsWith(base + "/") ? r.continue() : r.abort()));
      await p.goto(base);
      await p.waitForFunction(() => window.VideoWorkbench?.generator?.controlsReady && VideoWorkbench.capabilities?.videoModels);
      await p.locator('[data-mode="reference"]').click();
      assert.match(await p.locator("#modelBtn").innerText(), /Sora 2/, "預設不是 sora-2");
      await p.locator("#prompt").fill("海邊日出");
      assert.match(await p.locator("#send").innerText(), /US\$0\.80/, "sora-2 8 秒的生成按鈕沒有價格");
      await p.locator('[data-panel="model"]').first().click();
      const buttons = p.locator("#popover [data-model]");
      assert.equal(await buttons.count(), 5);
      for (const text of await buttons.allInnerTexts()) assert.match(text, /US\$\d+\.\d\d/, "模型按鈕沒有價格：" + text);
      assert.equal(await p.locator("#popover select").count(), 0, "模型面板出現下拉選單");
      await p.locator('#popover [data-model="runway-gen4-turbo"]').click();
      assert.match(await p.locator("#modelBtn").innerText(), /Runway Gen-4 Turbo/);
      assert.equal(await p.locator("#send").isDisabled(), true, "Runway 沒有參考圖仍可送出");
      assert.match(await p.locator("#send").getAttribute("title"), /需要一張參考圖/);
      assert.match(await p.locator("#send").innerText(), /US\$0\.25/, "Runway 5 秒價格不對（時長應改成 5 秒）");
      // Restoring a Veo job brings back Veo (and its length), not the current model.
      await p.evaluate(() => generatorResultAction({ intent: "restore-job", job: { type: "video", input: { type: "video", mode: "reference", prompt: "還原測試", settings: { model: "veo-3-1-fast", ratio: "16:9", quality: "720p", duration: 6 } } } }));
      assert.match(await p.locator("#modelBtn").innerText(), /Veo 3\.1 Fast/, "還原任務沒有帶回原本的模型");
      assert.equal(await p.evaluate(() => state.duration), 6);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  }
  console.log("PASS 畫面：模型是可見按鈕且每顆有價格、無下拉；Runway 沒圖不能送；預設 sora-2");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
