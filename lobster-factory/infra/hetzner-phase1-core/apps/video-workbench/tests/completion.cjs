const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright"),
  assert = require("node:assert/strict");
(async () => {
  const { base } = await require("./isolated-server.cjs").isolatedServer("vw-completion-");
  const b = await chromium.launch({ channel: "msedge" }),
    p = await b.newPage({ viewport: { width: 1440, height: 900 } }),
    errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.setDefaultTimeout(10000);
  await p.route("**/api/seedstar/generations", (r) =>
    r.fulfill({
      status: 503,
      json: { error: { message: "測試環境：生成服務尚未設定" } },
    }),
  );
  await p.goto(base);
  await p.waitForFunction(() => SeedStar?.router);
  for (const [name, title] of [
    ["assets", "素材庫"],
    ["skills", "我的技能"],
    ["workflows", "工作流"],
    ["history", "歷史紀錄"],
  ]) {
    await p.locator("#" + name + "Nav").click();
    assert.equal(await p.locator("#workspaceArea h1").innerText(), title);
  }
  console.log("PASS 四個原先無作用的側欄入口");
  await p.locator("#assetsNav").click();
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jTioAAAAASUVORK5CYII=",
    "base64",
  );
  await p.locator("#workspaceUpload").setInputFiles({
    name: "可共用的圖片.png",
    mimeType: "image/png",
    buffer: png,
  });
  await p
    .locator(".workspace-card h2")
    .filter({ hasText: "可共用的圖片.png" })
    .waitFor();
  const saved = await p.evaluate(() => SeedStar.assets.list());
  assert.match(saved[0].url, /^\/generated\//);
  assert.equal(
    (await p.request.get(new URL(saved[0].url, p.url()).href)).status(),
    200,
  );
  await p.locator("[data-asset-use]").first().click();
  await p.locator("#generatorView").waitFor({ state: "visible" });
  console.log("PASS 素材上傳、實體檔案、帶入生成");
  await p.locator("#projectsNav").click();
  const projects = p.frameLocator("#projectsFrame");
  await projects.locator("[data-action=create]").first().click();
  await projects.locator("#create-name").fill("共用素材專案");
  await projects.locator("[data-action=saveProject]").click();
  await projects.locator("[data-action=asset]").first().click();
  await projects.locator("#asset-name").fill("共享主角");
  await projects.locator("[data-action=library]").click();
  await projects.locator("[data-picker-id]").first().click();
  await projects.locator("[data-picker-confirm]").click();
  await projects.locator("[data-action=saveAsset]").click();
  await p.waitForFunction(
    async () => (await SeedStar.projects.list())[0]?.assets[0]?.references[0],
  );
  console.log("PASS 專案參考圖從統一素材庫選取");
  await p.locator("#skillsNav").click();
  await p.locator("[data-workspace-create]").click();
  await p.locator("#workspaceName").fill("清晰構圖");
  await p.locator("#workspacePrompt").fill("主體置中，清晰自然光。");
  await p.locator("#workspaceEditor [type=submit]").click();
  await p.locator("[data-row-use]").click();
  assert.match(await p.locator("#prompt").inputValue(), /主體置中/);
  console.log("PASS 自訂技能建立與實際套用");
  p.once("dialog", (d) => d.accept("可恢復的對話"));
  await p.locator("#saveGeneratorDraft").click();
  await p.locator("#draftStatus").filter({ hasText: "已儲存" }).waitFor();
  await p.locator("#directorNav").click();
  await p
    .locator("#directorSessions button")
    .filter({ hasText: "繼續編輯" })
    .click();
  assert.match(await p.locator("#prompt").inputValue(), /主體置中/);
  console.log("PASS 導演草稿儲存與恢復");
  await p.locator("#workflowsNav").click();
  await p.locator("[data-workspace-create]").click();
  await p.locator("#workspaceName").fill("兩步工作流");
  await p.locator("#workspacePrompt").fill("第一步構圖\n第二步調色");
  await p.locator("#workspaceEditor [type=submit]").click();
  await p.locator("[data-row-use]").click();
  assert.equal(await p.locator("#prompt").inputValue(), "第一步構圖");
  await p.locator("#activeWorkflow button").click();
  assert.equal(await p.locator("#prompt").inputValue(), "第二步調色");
  await p.locator("#activeWorkflow button").click();
  console.log("PASS 工作流步驟切換與完成");
  await p.locator("#send").click();
  await p.locator("#service-error").waitFor();
  await p.locator("#service-error button").click();
  await p.locator("#historyNav").click();
  await p.locator("[data-job-open]").first().click();
  assert.match(await p.locator(".job-view").innerText(), /blocked/);
  await p.locator(".job-view button").filter({ hasText: "關閉" }).click();
  await p.locator("[data-job-draft]").first().click();
  assert.equal(await p.locator("#prompt").inputValue(), "第二步調色");
  console.log("PASS 任務歷史檢視及草稿還原");
  await p.reload();
  await p.waitForFunction(() => SeedStar?.router);
  await p.locator("#skillsNav").click();
  await p
    .locator(".workspace-card h2")
    .filter({ hasText: "清晰構圖" })
    .waitFor();
  assert.deepEqual(errors, []);
  await b.close();
  console.log("PASS 重新整理後資料仍在，無未處理錯誤");
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
