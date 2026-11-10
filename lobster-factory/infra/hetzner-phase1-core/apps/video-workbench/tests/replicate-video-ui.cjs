// Card RV UI (docs/replicate-video-models-plan-20261105.md): video models are visible buttons with prices, no dropdown;
// Runway without an image cannot send; the default is Veo 3.1 Fast; an old project saved with Sora 2 (shut down)
// opens on the default and says so once. Browser test (not in tests/gate.cjs); backend: replicate-video.cjs.
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
      assert.match(await p.locator("#modelBtn").innerText(), /Veo 3\.1 Fast/, "預設不是 Veo 3.1 Fast");
      await p.locator("#prompt").fill("海邊日出");
      // Expected prices from the page's formatter and capabilities (VideoWorkbenchMoney, usdPerSec x seconds).
      const shown = (id, seconds) => p.evaluate(([id, seconds]) => VideoWorkbenchMoney(VideoWorkbenchVideoModels.get(VideoWorkbench.capabilities, id).usdPerSec * seconds), [id, seconds]);
      const veo8 = await shown("veo-3-1-fast", 8);
      assert.match(veo8, /^NT\$\d/);
      assert(( await p.locator("#send").innerText()).includes(veo8), "Veo 3.1 Fast 8 秒的生成按鈕沒有價格");
      await p.locator('[data-panel="model"]').first().click();
      const buttons = p.locator("#popover [data-model]");
      assert.equal(await buttons.count(), 4);
      // Each button: that model's length (the one it shows) x its rate x the ratios sent (index-0.js model panel).
      const count = await p.evaluate(() => (state.mode === "director" ? 1 : generatorRatios().length));
      for (const [i, text] of (await buttons.allInnerTexts()).entries()) {
        const id = await buttons.nth(i).getAttribute("data-model"), s = Number(/（(\d+) 秒）/.exec(text)?.[1]);
        assert(text.includes(await shown(id, s * count)), "模型按鈕的價格不對：" + text);
      }
      assert.equal(await p.locator("#popover select").count(), 0, "模型面板出現下拉選單");
      await p.locator('#popover [data-model="runway-gen4-turbo"]').click();
      assert.match(await p.locator("#modelBtn").innerText(), /Runway Gen-4 Turbo/);
      assert.equal(await p.locator("#send").isDisabled(), true, "Runway 沒有參考圖仍可送出");
      assert.match(await p.locator("#send").getAttribute("title"), /需要一張參考圖/);
      assert((await p.locator("#send").innerText()).includes(await shown("runway-gen4-turbo", 5)), "Runway 5 秒價格不對（時長應改成 5 秒）");
      // Restoring a Veo job brings back Veo (and its length), not the current model.
      await p.evaluate(() => generatorResultAction({ intent: "restore-job", job: { type: "video", input: { type: "video", mode: "reference", prompt: "還原測試", settings: { model: "veo-3-1-fast", ratio: "16:9", quality: "720p", duration: 6 } } } }));
      assert.match(await p.locator("#modelBtn").innerText(), /Veo 3\.1 Fast/, "還原任務沒有帶回原本的模型");
      assert.equal(await p.evaluate(() => state.duration), 6);
      // Director length choices = the director model's durations (Veo 3.1 Fast 4/6/8): no 12 s script paid for a refused video.
      const lengths = await p.evaluate(() => [...directorLength().matchAll(/data-action="director-length" data-value="(\d+)"/g)].map((m) => +m[1]));
      assert.deepEqual(lengths, await p.evaluate(() => generatorVideoModel("director").durations));
      assert(!lengths.includes(12), "導演模式仍可選 12 秒");
      // Restoring an old Sora job runs the default model, with its price on the button.
      await p.evaluate(() => generatorResultAction({ intent: "restore-job", job: { type: "video", input: { type: "video", mode: "reference", prompt: "舊 Sora 任務", settings: { model: "sora-2", ratio: "16:9", quality: "720p", duration: 8 } } } }));
      assert.match(await p.locator("#modelBtn").innerText(), /Veo 3\.1 Fast/, "舊 Sora 任務沒有改用預設");
      assert((await p.locator("#send").innerText()).includes(veo8));
      // An old project saved with Sora 2: opening it moves it to the default and shows one sentence.
      await p.evaluate(async () => {
        VideoWorkbench.storage.setItem("awarewave-projects-screenshot-frontend-v1", JSON.stringify({ projects: [{ id: "sora-old", title: "舊 Sora 專案", type: "single", ratio: "16:9", style: 1, customStyle: "", settings: { model: "sora-2", lockModel: true }, assets: { character: [], scene: [], prop: [] }, episodes: [{ id: "ep1", name: "第一集", outline: "", shots: [] }] }], current: null, episode: 0 }));
        await VideoWorkbench.flush();
      });
      await p.reload();
      await p.waitForFunction(() => window.VideoWorkbench?.router);
      await p.locator("#projectsNav").click();
      const f = p.frameLocator("#projectsFrame");
      await f.locator('[data-action=openProject][data-id="sora-old"]').click();
      assert.equal(await f.locator("#toast").innerText(), "Sora 2 已停止服務，已改用 Google Veo 3.1 Fast");
      const saved = await p.evaluate(async () => (await VideoWorkbench.flush(), (await (await fetch("/api/vw/state")).json()).projects[0].settings.model));
      assert.equal(saved, "veo-3-1-fast", "舊專案的模型沒有改存成新預設");
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  }
  console.log("PASS 畫面：模型是可見按鈕且每顆有價格、無下拉；Runway 沒圖不能送；預設 Veo 3.1 Fast；舊 Sora 任務／專案改用預設並提示");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
