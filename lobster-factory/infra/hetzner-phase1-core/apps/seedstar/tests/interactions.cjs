const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
process.env.EVIDENCE_DIR ||= fs.mkdtempSync(
  require("node:path").join(require("node:os").tmpdir(), "seedstar-ui-"),
);
(async () => {
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  });
  const p = await ctx.newPage();
  await p.route("**/api/seedstar/generations", (r) =>
    r.fulfill({
      status: 503,
      json: { error: { message: "測試環境：生成服務尚未設定" } },
    }),
  );
  p.setDefaultTimeout(8000);
  let failures = [];
  const passed = [];
  p.on("pageerror", (e) => failures.push(e.message));
  async function test(name, fn) {
    try {
      await fn();
      passed.push(name);
      console.log("PASS", name);
    } catch (e) {
      failures.push(name + ": " + e.stack);
      console.log("FAIL", name, e.message);
    }
  }
  await p.goto("http://127.0.0.1:4178");
  await p.waitForFunction(
    () => window.AwareWaveTheme && window.SeedStar?.sanitize,
  );
  const frame = async (name) => {
    await p.locator("#" + name + "Nav").click();
    const f = p.frameLocator("#" + name + "Frame");
    await f.locator("body").waitFor();
    await p.waitForFunction(
      (n) =>
        document.querySelector("#" + n + "Frame").contentWindow.SeedStar
          ?.sanitize,
      name,
    );
    return f;
  };
  await test("所有子頁可載入", async () => {
    for (const n of [
      "characters",
      "projects",
      "tools",
      "templates",
      "storyboards",
    ]) {
      const f = await frame(n);
      await f.locator("h1").first().waitFor();
      assert((await f.locator("body").innerText()).length > 100);
    }
  });
  await test("角色詳情開啟與返回", async () => {
    const f = await frame("characters");
    await f.locator('[data-act="open"]').first().click();
    await f.locator("#detailRoot h2").waitFor();
    assert((await f.locator("#detailRoot").innerText()).includes("自我介紹"));
    await f.locator('[data-detail="back"]').click();
    assert.equal(await f.locator("#detailRoot").count(), 0);
  });
  await test("收藏、素材庫跨頁保存", async () => {
    const f = await frame("characters");
    await f.locator('[data-act="open"]').first().click();
    await f.locator('[data-detail="favorite"]').click();
    await f.locator('[data-detail="add"]').click();
    await p.waitForFunction(async () => {
      const c = await SeedStar.characters.list();
      return c.length && c[0].favorite && c[0].inLibrary;
    });
    await p.waitForFunction(
      async () => (await SeedStar.assets.list()).length > 0,
    );
    await f.locator('[data-detail="back"]').click();
  });
  await test("建立角色與儲存", async () => {
    const f = await frame("characters");
    await f.locator("[data-tab=mine]").click();
    await f.locator("#createBtn").click();
    await f
      .locator('[data-start="manual"]')
      .count()
      .then(async (count) => {
        if (count) await f.locator('[data-start="manual"]').click();
        else await f.getByText("手動建立", { exact: true }).click();
      });
    await f.locator("#charName").fill("測試角色");
    await f.locator("#charDescription").fill("測試設定");
    await f.locator("#save").click();
    await p.waitForFunction(async () =>
      (await SeedStar.characters.list()).some((c) => c.name === "測試角色"),
    );
  });
  await test("專案取消後可返回列表", async () => {
    const f = await frame("projects");
    await f.locator('[data-action="create"]').first().click();
    await f.locator("#create-name").fill("取消測試");
    await f.locator('.create-actions [data-action="close"]').click();
    await f.locator('[data-action="create"]').first().waitFor();
  });
  await test("專案建立、設定及注入防護", async () => {
    const f = await frame("projects");
    await f.locator('[data-action="create"]').first().click();
    await f
      .locator("#create-name")
      .fill("測試專案 <img src=x onerror=window.pwned=1>");
    await f
      .locator("#style-hint")
      .fill("</textarea><img src=x onerror=window.pwned=1>");
    await f.locator('[data-action="chooseRatio"]').first().click();
    assert.equal(
      await f.locator("#style-hint").inputValue(),
      "</textarea><img src=x onerror=window.pwned=1>",
    );
    await f.locator('[data-action="saveProject"]').click();
    await f.locator("#workbench").waitFor({ state: "visible" });
    assert.equal(
      await p
        .locator("#projectsFrame")
        .evaluate((el) => el.contentWindow.pwned),
      undefined,
    );
    await f.locator('[data-action="asset"]').first().click();
    await f.locator("#asset-name").fill("角色 A");
    await f.locator('[data-action="saveAsset"]').click();
    await p.waitForFunction(async () => {
      const a = await SeedStar.projects.list();
      return (
        a.length &&
        Array.isArray(a[0].assets) &&
        a[0].assets[0]?.kind === "character"
      );
    });
  });
  await test("主題編輯同步到全部子頁", async () => {
    await p.evaluate(() =>
      AwareWaveTheme.setTokens({
        "--accent": "rgb(1, 2, 3)",
        "--font-size-base": "17px",
      }),
    );
    for (const n of [
      "characters",
      "projects",
      "tools",
      "templates",
      "storyboards",
    ]) {
      const f = await frame(n);
      await p.waitForFunction(
        (n) =>
          getComputedStyle(
            document.querySelector("#" + n + "Frame").contentDocument
              .documentElement,
          )
            .getPropertyValue("--accent")
            .trim() === "rgb(1, 2, 3)",
        n,
      );
    }
    await p.evaluate(() => AwareWaveTheme.resetTokens());
  });
  await test("生成失敗可見且沒有假成功", async () => {
    await p.locator("#generatorNav").click();
    await p.locator("[data-mode=image]").click();
    await p.locator("#send").click();
    await p.locator("#service-error").waitFor();
    assert.match(await p.locator("#service-error").innerText(), /尚未設定/);
    const jobs = await p.evaluate(
      () => JSON.parse(localStorage.getItem("seedstar.app.v1")).jobs,
    );
    assert.equal(jobs.at(-1).status, "blocked");
    await p.locator("#service-error button").click();
  });
  await test("模板透過訊息帶入生成頁", async () => {
    const f = await frame("templates");
    const result = await p.locator("#templatesFrame").evaluate((el) =>
      el.contentWindow.SeedStar.generator.import({
        target: "image",
        title: "測試帶入",
        image: new URL("assets/image-1.webp", location.href).href,
        imagePrompt: "測試帶入提示",
      }),
    );
    assert.equal(result.ok, true);
    await p.locator("#prompt").waitFor();
    assert.equal(await p.locator("#prompt").inputValue(), "測試帶入提示");
  });
  await test("重新整理保留角色與專案", async () => {
    await p.reload();
    await p.waitForFunction(() => SeedStar?.characters);
    assert(
      (await p.evaluate(() => SeedStar.characters.list())).some(
        (c) => c.name === "測試角色",
      ),
    );
    assert((await p.evaluate(() => SeedStar.projects.list())).length === 1);
  });
  await test("桌面與手機無雙重垂直捲軸", async () => {
    for (const width of [1440, 390]) {
      await p.setViewportSize({ width, height: 900 });
      if (width === 390) {
        await p.evaluate(() =>
          document.getElementById("charactersNav").click(),
        );
      } else await p.locator("#charactersNav").click();
      await p.waitForTimeout(300);
      const f = p.frameLocator("#charactersFrame");
      await f.locator('[data-act="open"]').first().click();
      const sizes = await p.evaluate(() => {
        const d = document.querySelector("#charactersFrame").contentDocument;
        return {
          outer: document.scrollingElement.scrollHeight <= innerHeight + 1,
          inner:
            d.scrollingElement.scrollHeight <= d.defaultView.innerHeight + 1,
          detail:
            d.querySelector("#detailRoot").scrollHeight >
            d.querySelector("#detailRoot").clientHeight,
        };
      });
      assert(sizes.outer && sizes.inner, JSON.stringify(sizes));
      await f.locator('[data-detail="back"]').click();
    }
    await p.setViewportSize({ width: 1440, height: 900 });
  });
  await p.screenshot({
    path: process.env.EVIDENCE_DIR + "/seedstar.png",
    fullPage: true,
  });
  fs.writeFileSync(
    process.env.EVIDENCE_DIR + "/results.json",
    JSON.stringify({ passed, failures }, null, 2),
  );
  await browser.close();
  console.log(JSON.stringify({ passed: passed.length, failures }, null, 2));
  process.exitCode = failures.length ? 1 : 0;
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
