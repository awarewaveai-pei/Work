const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path"), crypto = require("node:crypto");
const { chromium } = require("playwright");
const evidence = fs.mkdtempSync(path.join(os.tmpdir(), "seedstar-deep-actions-"));
(async () => {
  const server = require("../server.cjs").createServer({ dataDir: path.join(evidence, "data"), env: {}, fetchImpl: async () => { throw Error("No provider calls permitted"); } });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); p.setDefaultTimeout(8000);
    const errors = [], generations = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.route("**/*", (r) => {
      if (r.request().url().includes("/generations") && r.request().method() === "POST") { generations.push(r.request().url()); return r.abort(); }
      return r.request().url().startsWith(base + "/") ? r.continue() : r.abort();
    });
    await p.goto(base); await p.waitForFunction(() => window.SeedStar?.generator?.controlsReady);
    await p.evaluate(async () => {
      for (const id of ["a", "b"]) await SeedStar.assets.save({ id, name: "圖片 " + id, kind: "image", type: "image/png", url: "/assets/image-" + (id === "a" ? 1 : 2) + ".png" });
    });
    await p.locator('[data-action="library"]').click();
    const picker = p.locator(".asset-workspace");
    await picker.locator('[data-picker-id="a"]').click(); await picker.locator('[data-picker-id="b"]').click();
    await picker.locator("[data-picker-clear]").click(); assert.equal(await picker.locator("[aria-pressed=true][data-picker-id]").count(), 0);
    await picker.locator('[data-picker-id="a"]').click(); await picker.locator("[data-picker-confirm]").click();
    await p.locator('[data-gen-reference-replace="images:0"]').click();
    await picker.locator("[data-picker-close]").click(); assert.match(await p.locator(".reference-selected img").getAttribute("src"), /image-1/);
    await p.locator('[data-gen-reference-replace="images:0"]').click();
    await picker.locator('[data-picker-id="b"]').click(); assert.equal(await picker.count(), 0);
    assert.equal(await p.locator(".reference-selected").count(), 1); assert.match(await p.locator(".reference-selected img").getAttribute("src"), /image-2/);
    await p.locator('[data-gen-reference-preview="images:0"]').click();
    const download = p.waitForEvent("download"); await p.locator("#modalContent").getByRole("link", { name: "下載／開新分頁" }).click();
    const file = await (await download).path(); assert(fs.statSync(file).size > 0);
    await p.locator("#closeModal").click();
    console.log("PASS 素材勾選清除、取消替換、單選立即替換、數量／編號不變、真實下載");
    await p.locator("#prompt").fill("保留清除前內容");
    const before = await p.evaluate(() => SeedStar.generator.getDraft());
    await p.locator('[data-action="clear"]').click(); assert.equal(await p.locator(".reference-selected").count(), 0);
    await p.locator(".generator-clear-notice").getByRole("button", { name: "復原" }).click();
    assert.equal(await p.locator("#prompt").inputValue(), before.data.reference);
    assert.deepEqual((await p.evaluate(() => SeedStar.generator.getDraft())).refs.reference, before.refs.reference);
    await p.locator('[data-action="clear"]').click(); await p.locator("#prompt").fill("清除後的新內容");
    await p.locator(".generator-clear-notice").getByRole("button", { name: "復原" }).click();
    assert.equal(await p.locator("#prompt").inputValue(), "清除後的新內容");
    console.log("PASS 清除可復原提示詞與整組素材，新輸入不會被復原覆蓋");

    const job = { id: "result-test", type: "image", status: "succeeded", result: { url: "/assets/test-image-1.png", width: 1024, height: 1024 }, input: { type: "image", mode: "image", prompt: "原始成果提示詞", settings: { model: "old-model", ratio: "9:16", quality: "2K", skill: "不套用技能" }, references: { images: [{ id: "original-reference", name: "原參考", kind: "image", type: "image/png", url: "/assets/test-image-2.png" }] } } };
    const show = () => p.evaluate((value) => SeedStar.showJob(value), job);
    await show(); await p.getByRole("button", { name: "重新生成（先還原設定）", exact: true }).click();
    assert.equal(await p.locator("#prompt").inputValue(), job.input.prompt);
    assert.match(await p.locator("#outputBtn").innerText(), /9:16 · 2K/);
    assert.match(await p.locator(".uploads img").first().getAttribute("src"), /image-2/);
    assert.equal((await p.evaluate(() => SeedStar.generator.getDraft())).mode, "image");
    assert.notEqual((await p.evaluate(() => SeedStar.generator.getDraft())).model.image, "old-model");
    await show(); await p.getByRole("button", { name: "用於生成（首幀）", exact: true }).click();
    let draft = await p.evaluate(() => SeedStar.generator.getDraft());
    assert.equal(draft.mode, "reference"); assert.equal(draft.refType, "first"); assert.equal(draft.refs.reference.firstFrame[0].url, job.result.url);
    await show(); await p.getByRole("button", { name: "模仿動作", exact: true }).click();
    draft = await p.evaluate(() => SeedStar.generator.getDraft()); assert.equal(draft.refType, "motion"); assert.equal(draft.refs.reference.motionImage[0].url, job.result.url);
    await show(); await p.getByRole("button", { name: "建立口播影片", exact: true }).click();
    await p.locator('[data-action="cast-clear"]').click();
    draft = await p.evaluate(() => SeedStar.generator.getDraft()); assert.equal(draft.cast, "");
    await p.locator('[data-action="voice"]').click(); await p.locator('[data-action="voice-select"]').first().click(); await p.locator('[data-action="voice-clear"]').click();
    assert.equal((await p.evaluate(() => SeedStar.generator.getDraft())).voice, "");
    console.log("PASS 成果重新生成只還原全部設定、不換供應商；首幀／動作／口播帶入與個別清除");
    await show(); await p.getByRole("button", { name: "編輯圖片", exact: true }).click();
    const tool = p.frameLocator("#toolsFrame");
    await tool.locator("#stage .upload-preview").waitFor();
    assert.match(await tool.locator("#stage .upload-preview").getAttribute("src"), /image-1/);
    assert.equal(await p.locator(".job-view").count(), 0);
    await p.locator("#generatorNav").click();
    await show(); await p.getByRole("button", { name: "配音", exact: true }).click();
    await tool.locator('[data-key="voiceText"]').waitFor();
    assert.equal(generations.length, 0);
    console.log("PASS 成果圖片真實帶入局部編輯器與配音工具，所有結果操作皆零生成請求");
    await p.locator("#generatorNav").click();
    for (const operation of ["character-image", "character-test", "project-shot", "image-output"]) {
      await p.evaluate(({ operation, job }) => SeedStar.generator.import({ intent: "restore-job", job: { ...job, input: { ...job.input, operation, references: { src: { url: "/assets/test-image-1.png" } } } } }), { operation, job });
      assert.equal((await p.evaluate(() => SeedStar.generator.getDraft())).mode, "image");
    }
    await p.evaluate(() => SeedStar.generator.import({ intent: "restore-job", job: { type: "audio", input: { operation: "separate", references: { src: { url: "/generated/test.mp4" } }, settings: {} } } }));
    await tool.locator('video[data-flow-media="src"]').waitFor(); // 音軌分離 uses the workflow screen (wfSource), not #stage
    await p.locator("#generatorNav").click();
    const directorJob = { ...job, type: "video", input: { type: "video", mode: "director", prompt: "還原的全新腳本", settings: { duration: 8 } } };
    await p.evaluate(j => SeedStar.generator.import({ intent: "restore-job", job: j }), directorJob);
    draft = await p.evaluate(() => SeedStar.generator.getDraft());
    assert.equal(draft.directorMessages.length, 2); assert.match(draft.directorMessages[0].text, /還原的全新腳本/);
    console.log("PASS 角色／專案／圖片後處理還原與無提示詞音軌工具；導演還原建立獨立腳本上下文");
    await p.locator("#generatorNav").click(); await show();
    await p.locator(".job-view details summary").click();
    await p.screenshot({ path: path.join(evidence, "result-actions.png"), fullPage: true });
    assert.deepEqual(errors, []);
    const protectedFiles = JSON.parse(fs.readFileSync(path.join(__dirname, "storyboards-design-baseline.json"), "utf8"));
    for (const [file, hash] of Object.entries(protectedFiles)) assert.equal(crypto.createHash("sha256").update(fs.readFileSync(path.join(__dirname, "..", file))).digest("hex"), hash, file + " changed");
    console.log("PASS 分鏡靈感五個原檔及共用 workspaces.css 雜湊完全不變");
    console.log("EVIDENCE " + evidence);
  } finally { await browser.close(); server.closeAllConnections(); await new Promise((r) => server.close(r)); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
