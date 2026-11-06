const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  { spawnSync } = require("node:child_process"),
  { chromium } = require("playwright"),
  ffmpeg = require("ffmpeg-static");
const evidence = fs.mkdtempSync(path.join(os.tmpdir(), "vw-editor-"));
(async () => {
  const dataDir = path.join(evidence, "data"),
    generated = path.join(dataDir, "generated");
  fs.mkdirSync(generated, { recursive: true });
  const name = crypto.randomUUID() + ".mp4";
  const make = spawnSync(
    ffmpeg,
    [
      "-y",
      "-hide_banner",
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:s=320x180:r=30:d=3",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=3",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-c:a",
      "aac",
      "-shortest",
      path.join(generated, name),
    ],
    { encoding: "utf8", windowsHide: true },
  );
  assert.equal(make.status, 0, make.stderr);
  const server = require("../server.cjs").createServer({ dataDir, env: {} });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port,
    browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*", (r) =>
      r
        .request()
        .url()
        .startsWith(base + "/")
        ? r.continue()
        : r.abort(),
    );
    await page.goto(base + "/pages/tools.html#edit");
    await page.getByRole("button", { name: "新建剪輯專案", exact: true }).click();
    await page.getByLabel("專案名稱").fill("時間軸測試");
    await page.getByRole("radio", { name: /^4:5 / }).check();
    await page.getByRole("button", { name: "建立專案", exact: true }).click();
    await page.waitForSelector("[data-ed-stage]");
    assert.equal(await page.locator("[data-ed-pane]").count(), 8);
    assert.equal(await page.locator("[data-ed-lane]").count(), 5);
    await page.evaluate(async (asset) => edAdd(asset), {
      id: "fixture",
      name: "測試影片",
      url: "/generated/" + name,
      type: "video/mp4",
    });
    await page.getByLabel("片段長度（秒）").fill("2");
    await page.getByLabel("片段長度（秒）").press("Tab");
    await page.locator("[data-ed-ruler]").click({ position: { x: await page.evaluate(() => ed.zoom), y: 8 } });
    await page.getByRole("button", { name: "分割", exact: true }).click();
    assert.equal(await page.locator("[data-ed-clip]").count(), 2);
    await page.getByRole("button", { name: "復原", exact: true }).click();
    assert.equal(await page.locator("[data-ed-clip]").count(), 1);
    await page.getByRole("button", { name: "重做", exact: true }).click();
    assert.equal(await page.locator("[data-ed-clip]").count(), 2);
    // Card ED.2: a redo comes back with nothing selected; the transition goes on the second half.
    await page.locator("[data-ed-clip]").nth(1).click();
    await page.locator('[data-ed-pane="轉場"]').click();
    await page.getByRole("group", { name: "轉場", exact: true }).getByRole("button", { name: "溶解", exact: true }).click();
    await page.getByLabel("轉場秒數").fill("0.4");
    await page.getByLabel("轉場秒數").press("Tab");
    await page.locator('[data-ed-pane="文字"]').click();
    await page.getByRole("button", { name: "主標題", exact: true }).click();
    await page.getByLabel("文字內容").fill("EXPORT TEST");
    await page.getByLabel("文字內容").press("Tab");
    await page.getByLabel("片段長度（秒）").fill("1");
    await page.getByLabel("片段長度（秒）").press("Tab");
    await page.getByRole("button", { name: "匯出", exact: true }).click();
    await page.locator('[data-ed-action="quality:720p"]').click();
    await page.locator("[data-ed-export]").click();
    await page.waitForFunction(
      () =>
        document
          .querySelector(".job-view")
          ?.textContent.match(/succeeded|failed/),
      null,
      { timeout: 60000 },
    );
    const panel = page.locator(".job-view");
    assert(
      !(await panel.innerText()).includes("failed"),
      await panel.innerText(),
    );
    const url = await panel.locator("video").getAttribute("src"),
      probe = spawnSync(ffmpeg, ["-i", path.join(dataDir, url.slice(1))], {
        encoding: "utf8",
        windowsHide: true,
      });
    assert.match(probe.stderr, /720x900/);
    assert.match(probe.stderr, /Audio: aac/);
    assert.match(probe.stderr, /00:00:02/);
    await panel.locator("[data-job-close]").click();
    await page.evaluate(() => edSave());
    await page.reload();
    await page.waitForFunction(() => typeof ed !== "undefined" && ed.ready);
    await page
      .getByRole("button", { name: "時間軸測試 · 4:5", exact: true })
      .click();
    assert.equal(await page.locator("[data-ed-clip]").count(), 3);
    for (const pane of [
      "素材",
      "文字",
      "音訊",
      "轉場",
      "特效",
      "貼圖",
      "字幕",
      "剪贅字",
    ]) {
      await page.locator('[data-ed-pane="' + pane + '"]').click();
      assert(await page.locator(".editor-library").isVisible());
    }
    await page.screenshot({
      path: path.join(evidence, "editor.png"),
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    console.log(
      "PASS 真實專案儲存、五軌、八分頁、分割／復原、文字、融接、720×900 MP4 與 AAC 匯出",
    );
    console.log("EVIDENCE " + evidence);
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
