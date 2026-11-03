const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { chromium } = require("playwright");
const evidence = fs.mkdtempSync(path.join(os.tmpdir(), "vw-buttons-test-"));
(async () => {
  const server = require("../server.cjs").createServer({ dataDir: path.join(evidence, "data"), env: {}, fetchImpl: async () => { throw Error("Provider calls forbidden"); } });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    p.setDefaultTimeout(6000);
    const errors = [], requests = []; p.on("pageerror", (e) => errors.push(e.message));
    await p.route("**/*", (r) => r.request().url().startsWith(base + "/") ? r.continue() : r.abort());
    await p.goto(base); await p.waitForFunction(() => window.VideoWorkbench?.generator?.controlsReady);
    await p.evaluate(async () => {
      await VideoWorkbench.assets.save({ id: "test-image", name: "人物測試圖", kind: "image", url: "/assets/test-image-1.png", type: "image/png" });
      await VideoWorkbench.assets.save({ id: "test-video", name: "短影片", kind: "video", duration: 8, url: "/generated/test.mp4", type: "video/mp4" });
      await VideoWorkbench.characters.save({ id: "test-character", name: "測試角色", image: "/assets/test-image-2.png" });
      await VideoWorkbench.preferences.set("workspace.skills", [{ id: "test-skill", name: "自訂驗證", prompt: "CUSTOM_INSTRUCTION" }]);
    });
    const panel = p.locator("#popover");
    for (const mode of ["reference", "cartoon", "image", "spoken", "reshoot"]) {
      await p.locator(`[data-mode="${mode}"]`).click();
      for (const name of ["model", "settings"]) {
        const button = p.locator(`[data-panel="${name}"]`).first();
        await button.click(); assert(await panel.isVisible());
        await button.click(); assert(await panel.isHidden());
      }
      if (mode !== "reshoot") {
        await p.locator('[data-panel="skill"]').click(); assert(await panel.isVisible());
        await p.locator('[data-gen-skill-tab="custom"]').click(); await p.getByRole("checkbox", { name: /自訂驗證/ }).waitFor();
        await p.locator('[data-panel="skill"]').click(); assert(await panel.isHidden());
      }
    }
    console.log("PASS 五種 dock：模型／輸出／技能反覆開關，模式切換無殘留");
    await p.locator('[data-mode="reference"]').click();
    await p.locator('[data-panel="subtitle"]').click(); await p.locator('[data-subtitle="開"]').click();
    for (const language of ["English", "日本語"]) await p.locator(`[data-gen-subtitle-language="${language}"]`).click();
    assert.equal(await p.locator("[data-gen-subtitle-language][aria-checked=true]").count(), 2);
    for (const style of ["白字黑邊", "白字灰底", "黑底白字", "白底黑字", "白字陰影", "黃字黑邊"]) {
      await p.locator(`[data-gen-subtitle-option="style"][data-value="${style}"]`).click();
      assert.equal(await p.locator("[data-subtitle-preview]").getAttribute("data-style"), style);
    }
    for (const size of ["小", "中", "大"]) await p.locator(`[data-gen-subtitle-option="size"][data-value="${size}"]`).click();
    for (const position of ["下方", "中下", "中間", "上方"]) await p.locator(`[data-gen-subtitle-option="position"][data-value="${position}"]`).click();
    const subtitle = (await p.evaluate(() => VideoWorkbench.generator.getDraft())).subtitleOptions;
    assert.deepEqual(subtitle, { languages: ["原文", "English"], style: "黃字黑邊", size: "大", position: "上方" });
    await p.screenshot({ path: path.join(evidence, "subtitles.png"), fullPage: true });
    await p.locator('[data-mode="image"]').click(); await p.locator('[data-mode="reference"]').click();
    assert.deepEqual((await p.evaluate(() => VideoWorkbench.generator.getDraft())).subtitleOptions, subtitle);
    await p.evaluate(async () => { VideoWorkbench.capabilities.video = true; });
    await p.locator("#prompt").fill("不支援字幕時不得送供應商");
    await p.locator("#send").click(); await p.getByRole("alert").waitFor();
    assert.match(await p.getByRole("alert").innerText(), /字幕/);
    await p.getByRole("alert").getByRole("button", { name: "關閉" }).click();
    await p.locator('[data-panel="subtitle"]').click(); await p.locator('[data-subtitle="關"]').click();
    await p.locator('[data-panel="subtitle"]').click();
    console.log("PASS 字幕全部樣式／位置／大小、兩種語言上限、草稿保存、未接服務拒絕送出");

    await p.locator('[data-panel="skill"]').click(); await p.locator('[data-gen-skill-tab="system"]').click();
    for (const key of ["short-ad", "review", "brand", "story", "product", "tutorial"]) await p.locator(`[data-gen-skill="system:${key}"]`).click();
    assert.equal(await p.locator("[data-gen-skill][aria-checked=true]").count(), 5);
    await p.locator('[data-gen-skill="system:review"]').click();
    await p.locator('[data-gen-skill-tab="custom"]').click(); await p.locator('[data-gen-skill="custom:test-skill"]').click();
    await p.locator('[data-panel="skill"]').click();
    await p.route("**/api/vw/generations", (r) => { requests.push(r.request().postDataJSON()); return r.fulfill({ json: { id: "test-generation", type: "video", status: "queued" } }); });
    await p.locator("#send").click(); await p.locator(".job-view").waitFor();
    assert.equal(requests.length, 1); assert.equal(requests[0].settings.skills.length, 5);
    assert.match(requests[0].prompt, /CUSTOM_INSTRUCTION/);
    assert(!requests[0].prompt.includes("以日常使用情境"));
    await p.locator(".job-view").getByRole("button", { name: "關閉", exact: true }).click();
    await p.evaluate(() => generatorApplyPreset({ settings: { skill: "自訂驗證" } }));
    assert.deepEqual((await p.evaluate(() => VideoWorkbench.generator.getDraft())).skills, []);
    assert.deepEqual((await p.evaluate(() => VideoWorkbench.generator.getDraft())).subtitleOptions, { languages: ["原文"], style: "白字黑邊", size: "中", position: "下方" });
    await p.locator('[data-panel="skill"]').click();
    await p.locator('[data-gen-skill-tab="custom"]').click();
    assert.equal(await p.locator('[data-gen-skill="custom:test-skill"]').getAttribute("aria-checked"), "true");
    await p.locator('[data-panel="skill"]').click();
    console.log("PASS 系統／自訂技能複選最多五個，取消後不套用，依選取順序送出真實指引");

    await p.locator('[data-action="library"]').click();
    assert(await panel.isHidden());
    const picker = p.locator(".asset-workspace");
    for (const source of ["characters", "platform", "licensed", "assets"]) {
      await picker.locator(`[data-picker-source="${source}"]`).click();
      assert.equal(await picker.locator('[role="tab"][aria-selected="true"]').getAttribute("data-picker-source"), source);
    }
    await picker.locator('[data-picker-preview="test-image"]').click(); await picker.locator(".picker-preview img").waitFor();
    await picker.locator("[data-picker-preview-close]").click();
    await picker.locator('[data-picker-id="test-image"]').click(); await picker.locator("[data-picker-confirm]").click();
    assert.equal(await p.locator(".reference-selected").count(), 1);
    await p.locator('[data-action="mention"]').click(); assert.equal(await p.locator("#modal:not(.hidden)").count(), 0);
    await p.getByRole("button", { name: /@image1 · 人物測試圖/ }).click();
    assert.match(await p.locator("#prompt").inputValue(), /@image1/);
    await p.locator('[data-remove="images:0"]').click();
    await p.locator("#prompt").fill("人物 @人物");
    await p.locator("[data-gen-mention]").waitFor(); await p.locator("#prompt").press("Enter");
    assert.equal(await p.locator("#prompt").inputValue(), "人物 @image1 ");
    assert.equal(await p.locator(".reference-selected").count(), 1);
    await p.locator('[data-gen-extract]').click();
    await picker.locator('[data-picker-duration="long"]').click(); assert.equal(await picker.locator("[data-picker-id]").count(), 0);
    await picker.locator('[data-picker-duration="10"]').click(); assert.equal(await picker.locator("[data-picker-id]").count(), 1);
    await picker.locator("[data-picker-close]").click();
    console.log("PASS 素材四來源、預覽返回、選取確認、影片長度篩選、引用內嵌與鍵盤自動加入素材");

    await p.locator('[data-mode="reshoot"]').click(); await p.locator('[data-panel="settings"]').click();
    assert.equal(await panel.locator("[data-gen-duration],[data-audio],[data-watermark]").count(), 0);
    for (const ratio of ["1:1", "9:16", "16:9"]) { await panel.locator(`[data-ratio="${ratio}"]`).click(); assert.equal(await panel.locator("[data-ratio][aria-pressed=true]").count(), 1); }
    for (const quality of ["480p", "1080p", "720p"]) await panel.locator(`[data-quality="${quality}"]`).click();
    await p.locator('[data-mode="reference"]').click(); await p.locator('[data-reftype="motion"]').click();
    await p.locator('[data-gen-motion-facing="image"]').click(); assert.match(await p.locator(".motion-workspace").innerText(), /最長 10 秒/);
    await p.locator('[data-gen-motion-facing="video"]').click(); assert.match(await p.locator(".motion-workspace").innerText(), /最長 30 秒/);
    await p.locator('[data-mode="cartoon"]').click();
    for (let i = 0; i < 6; i++) { await p.locator(`[data-style="${i}"]`).click(); assert.equal(await p.locator(".style.on").count(), 1); }
    await p.locator('[data-mode="spoken"]').click(); await p.locator('[data-action="voice"]').click();
    assert.equal(await p.locator(".spoken-tabs").count(), 0);
    assert.equal(await p.locator('[data-action="voice-select"]').count(), 6);
    await p.locator('[data-action="spoken-back"]').click();
    await p.locator("#prompt").fill("請聯絡 @");
    assert.equal((await p.evaluate(() => VideoWorkbench.generator.getDraft())).spokenPanel, "none");
    assert.equal(await p.locator("#prompt").evaluate((node) => node === document.activeElement), true);
    await p.locator('[data-action="mention"]').click();
    await p.locator('[data-action="cast-tab"][data-value="search"]').click();
    assert.match(await p.locator(".spoken-picker").innerText(), /授權角色來源尚未接入/);
    assert.equal(await p.locator('[data-action="cast-select"]').count(), 0);
    await p.locator('[data-action="spoken-back"]').click();
    await p.locator('[data-mode="director"]').click(); assert(await p.locator(".dock").isHidden());
    await p.locator('[data-mode="product"]').click(); assert(await p.locator(".dock").isHidden());
    await p.locator('[data-mode="reference"]').click(); await p.locator('[data-reftype="all"]').click();
    await p.setViewportSize({ width: 390, height: 844 }); await p.locator('[data-panel="subtitle"]').click(); await p.locator('[data-subtitle="開"]').click();
    assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await p.screenshot({ path: path.join(evidence, "mobile-subtitles.png"), fullPage: true });
    assert.deepEqual(errors, []);
    console.log("PASS 拍片獨立輸出、動作10／30秒、六種卡通、六種聲音、導演／商品獨立流程與手機設定");
    console.log("EVIDENCE " + evidence);
  } finally { await browser.close(); server.closeAllConnections(); await new Promise((r) => server.close(r)); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
