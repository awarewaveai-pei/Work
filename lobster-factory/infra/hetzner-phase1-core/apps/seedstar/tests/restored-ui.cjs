const assert = require("node:assert/strict"),
  path = require("node:path"),
  fs = require("node:fs"),
  { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = path.resolve(__dirname, ".."),
  evidence = fs.mkdtempSync(
    path.join(require("node:os").tmpdir(), "seedstar-restored-ui-"),
  );
(async () => {
  const server = require(root + "/server.cjs").createServer({
    env: {},
    dataDir: path.join(evidence, "restore-test-data"),
    fetchImpl: () => {
      throw Error("Provider forbidden");
    },
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  const b = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
    p.setDefaultTimeout(4000);
    await p.route("**/*", (r) =>
      r.request().url().startsWith(base) ? r.continue() : r.abort(),
    );
    const calls = [];
    await p.route("**/api/seedstar/generations", (r) => {
      calls.push(r.request().postDataJSON());
      return r.fulfill({
        json: {
          id: "restored-" + calls.length,
          type: calls.at(-1).type,
          status: "succeeded",
          progress: 100,
          result: { url: "/assets/image-1.png" },
        },
      });
    });
    await p.goto(base);
    await p.waitForFunction(() => window.SeedStar?.router);
    await p.evaluate(() =>
      SeedStar.characters.save({
        id: "restore-character",
        name: "昨晚角色",
        description: "測試角色",
        image: "/assets/image-1.png",
      }),
    );
    await p.locator("[data-mode=spoken]").click();
    await p.locator("[data-action=cast]").click();
    await p.getByRole("button", { name: /昨晚角色/ }).click();
    await p.locator("[data-action=voice]").click();
    await p.locator("[data-action=voice-select]").first().click();
    assert.match(await p.locator("[data-action=cast]").innerText(), /昨晚角色/);
    const draft = await p.evaluate(() => SeedStar.generator.getDraft());
    assert(draft.cast);
    await p.locator("[data-mode=image]").click();
    await p.locator("[data-mode=spoken]").click();
    assert.match(await p.locator("[data-action=cast]").innerText(), /昨晚角色/);
    console.log("PASS 口播人物、聲音選擇與草稿保留");
    await p.screenshot({ path: path.join(evidence, "restored-spoken.png") });
    await p.locator("#toolsNav").click();
    const t = p.frameLocator("#toolsFrame");
    await t.locator('[data-act="open:edit"]').click();
    p.once("dialog", (d) => d.accept("找回的剪輯專案"));
    await t.locator("[data-act=newproject]").first().click();
    await t
      .locator("#project-list")
      .getByText(/找回的剪輯專案/)
      .waitFor();
    await t.locator("[data-key=trimStart]").waitFor();
    console.log("PASS 剪輯新建專案與裁切同時保留");
    await t.locator("[data-act=home]").first().click();
    await t.locator('[data-act="open:enhance"]').click();
    await t.locator('[data-act="set:enhanceType:畫面"]').click();
    await t.locator('[data-act="set:imageEnhance:AI 修復畫面"]').waitFor();
    await t.locator('[data-act="set:enhanceType:音訊"]').click();
    await t.locator('[data-act="set:enhanceOption:只保留人聲"]').click();
    assert(await t.locator("[data-act=submit]").isDisabled());
    console.log("PASS 畫面與音訊設定恢復，未接服務不誤送");
    await t.locator("[data-act=home]").first().click();
    await t.locator('[data-act="open:cta"]').click();
    await t.locator('[data-act="set:ctaAppear:彈出"]').click();
    await t.locator('[data-act="set:ctaFade:0.5 秒"]').click();
    await t.locator("[data-act=home]").first().click();
    await t.locator('[data-act="open:cta"]').click();
    assert.match(
      await t.locator('[data-act="set:ctaAppear:彈出"]').getAttribute("class"),
      /selected/,
    );
    assert.match(
      await t.locator('[data-act="set:ctaFade:0.5 秒"]').getAttribute("class"),
      /selected/,
    );
    console.log("PASS CTA 出場與淡入淡出設定持久保存");
    await p.screenshot({ path: path.join(evidence, "restored-cta.png") });
    await p.locator("#generatorNav").click();
    await p.locator("[data-mode=director]").click();
    await p.evaluate(() => {
      const d = SeedStar.generator.getDraft();
      d.mode = "director";
      d.directorStage = "script";
      d.directorGeneration = "idle";
      d.directorScript = "第一鏡：人物在海邊揮手。";
      SeedStar.generator.setDraft(d);
    });
    await p.locator("[data-action=director-storyboard]").click();
    assert.equal(calls.length, 0);
    await p.locator("[data-action=director-confirm-storyboard]").click();
    await p.locator(".job-view").waitFor();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].type, "image");
    assert.match(calls[0].prompt, /人物在海邊揮手/);
    await p.locator(".job-view button").filter({ hasText: "關閉" }).click();
    for (const status of ["generating", "result"]) {
      await p.evaluate((status) => {
        const d = SeedStar.generator.getDraft();
        d.directorGeneration = status;
        SeedStar.generator.setDraft(d);
      }, status);
      await p.locator("[data-action=director-history]").waitFor();
      await p.locator("[data-action=director-regenerate]").click();
      await p.locator("[data-action=director-generate-video]").waitFor();
    }
    console.log("PASS 導演分鏡入口、確認後送出、舊草稿可返回");
    await p.screenshot({ path: path.join(evidence, "restored-director.png") });
    console.log("Evidence: " + evidence);
  } finally {
    await b.close();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
