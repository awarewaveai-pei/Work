// Card ED.1 (docs/editor-parity-spec-20261106.md §1.2–1.5): new-project dialog, top bar, rail, collapsible and resizable
// panels kept per user, transport (jumps, loop, ruler seek, fullscreen). Real browser, isolated data dir.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const pass = (m) => console.log("PASS " + m);
(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-ed1-")),
    server = require("../server.cjs").createServer({ dataDir, env: {} });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port,
    browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*", (r) => (r.request().url().startsWith(base + "/") ? r.continue() : r.abort()));
    const open = async () => {
      await page.reload();
      await page.getByRole("button", { name: "ED1 版面 · 9:16", exact: true }).click();
      await page.waitForSelector("[data-ed-stage]");
    };

    await page.goto(base + "/pages/tools.html#edit");
    await page.getByRole("button", { name: "新建剪輯專案", exact: true }).click();
    assert.equal(await page.getByLabel("專案名稱").inputValue(), "未命名剪輯專案");
    assert.equal(await page.locator("dialog[open] [data-ed-create-ratio]").count(), 5);
    await page.getByLabel("專案名稱").fill("ED1 版面");
    await page.getByRole("radio", { name: /^9:16 / }).check();
    await page.getByRole("button", { name: "建立專案", exact: true }).click();
    await page.waitForSelector("[data-ed-stage]");
    assert.equal(await page.getByLabel("輸出比例").inputValue(), "9:16");
    assert.equal(await page.locator("[data-ed-pane]").count(), 8);
    assert.equal(await page.locator("[data-ed-total]").textContent(), "00:00.00");
    assert(await page.getByRole("button", { name: "匯出", exact: true }).isDisabled());
    assert.match(await page.locator("[data-ed-stage]").innerText(), /先放一個鏡頭，故事就開始。/);
    pass("新建視窗：預設名稱、五張比例卡；建立後頂列、八格側欄、空專案引導");

    await page.locator('[data-ed-pane="文字"]').click();
    await page.getByRole("button", { name: "空白文字", exact: true }).click();
    await page.waitForFunction(() => /^● 已儲存 \S/.test(document.querySelector("[data-ed-saved]").textContent));
    assert.equal(await page.locator("[data-ed-total]").textContent(), "00:03.00");
    pass("編輯後顯示「已儲存 時間」，總時長跟著片段");

    await page.getByRole("button", { name: "跳至結尾", exact: true }).click();
    assert.equal(await page.evaluate(() => ed.time), 3);
    await page.getByRole("button", { name: "後退 1 秒", exact: true }).click();
    assert.equal(await page.evaluate(() => ed.time), 2);
    await page.getByRole("button", { name: "跳至開頭", exact: true }).click();
    await page.getByRole("button", { name: "前進 1 秒", exact: true }).click();
    assert.equal(await page.evaluate(() => ed.time), 1);
    await page.locator("[data-ed-ruler]").click({ position: { x: (await page.evaluate(() => ed.zoom)) * 2, y: 8 } });
    assert(Math.abs((await page.evaluate(() => ed.time)) - 2) < 0.05);
    await page.getByRole("button", { name: "循環播放", exact: true }).click();
    await page.evaluate(() => (ed.time = 2.8));
    await page.getByRole("button", { name: "播放／暫停 (Space)", exact: true }).click();
    await page.waitForFunction(() => ed.playing && ed.time < 1);
    await page.keyboard.press("Space");
    pass("跳頭尾、前後一秒、時間尺點選、循環播放到尾端回到開頭");

    // Codex ED.1 F1: a 1 s project loops at 1 s, not at the empty timeline's 3 s minimum.
    await page.locator("[data-ed-clip]").first().click();
    await page.getByLabel("長度", { exact: true }).fill("1");
    await page.getByLabel("長度", { exact: true }).press("Tab");
    await page.evaluate(() => (ed.time = 0.9));
    await page.getByRole("button", { name: "播放／暫停 (Space)", exact: true }).click();
    await page.waitForFunction(() => ed.playing && ed.time < 0.5, null, { timeout: 1500 }); // wrapping at 3 s would take 2.1 s
    await page.evaluate(() => edStop());
    // F2: Esc and a click on empty lane space bring back 整片設定.
    await page.locator("[data-ed-clip]").first().click();
    assert.match(await page.locator(".editor-inspector-head").innerText(), /選取對象/);
    await page.keyboard.press("Escape");
    assert.match(await page.locator(".editor-inspector-head").innerText(), /整片設定/);
    await page.locator("[data-ed-clip]").first().click();
    await page.locator('[data-ed-lane="V2"]').click({ position: { x: 500, y: 20 } });
    assert.match(await page.locator(".editor-inspector-head").innerText(), /整片設定/);
    // F3: two quick writes, each answered 800 ms late. Once the first is stored the second is still pending: 儲存中.
    await page.route("**/api/vw/state", async (r) => {
      if (r.request().method() !== "PUT") return r.continue();
      await new Promise((ok) => setTimeout(ok, 800));
      await r.continue();
    });
    await page.getByLabel("專案名稱").fill("ED1 版面 2");
    await page.getByLabel("專案名稱").press("Tab");
    await page.getByLabel("專案名稱").fill("ED1 版面");
    await page.getByLabel("專案名稱").press("Tab");
    await page.waitForFunction(() => ed.save.pending === 1);
    assert.equal(await page.locator("[data-ed-saved]").textContent(), "● 儲存中…");
    await page.waitForFunction(() => /^● 已儲存 \S/.test(document.querySelector("[data-ed-saved]").textContent) && ed.save.pending === 0);
    await page.unroute("**/api/vw/state");
    pass("循環停在最後片段結尾；Esc／點空白回到整片設定；兩次寫入都存完才顯示已儲存");

    // Codex ED.1 round 2: view-only changes during playback keep playing.
    await page.evaluate(() => (ed.time = 0));
    await page.getByRole("button", { name: "播放／暫停 (Space)", exact: true }).click();
    await page.getByRole("button", { name: "循環播放", exact: true }).click();
    await page.locator('[data-ed-pane="音訊"]').click();
    await page.getByRole("button", { name: "收合左側面板", exact: true }).click();
    await page.getByRole("button", { name: "展開左側面板", exact: true }).click();
    assert(await page.evaluate(() => ed.playing), "切換循環、分頁、側欄不應停止播放");
    await page.evaluate(() => edStop());
    pass("播放中切換循環、分頁、收合側欄，播放不中斷");

    await page.keyboard.press("f");
    await page.waitForFunction(() => document.fullscreenElement?.matches("[data-ed-stage-frame]"));
    await page.keyboard.press("f");
    await page.waitForFunction(() => !document.fullscreenElement);
    pass("F 進出全螢幕預覽");

    const left = await page.locator('[data-ed-resize="left"]').boundingBox();
    await page.mouse.move(left.x + 3, left.y + 100);
    await page.mouse.down();
    await page.mouse.move(left.x + 53, left.y + 100, { steps: 4 });
    await page.mouse.up();
    await page.locator('[data-ed-resize="timeline"]').focus();
    await page.keyboard.press("ArrowUp");
    await page.getByRole("button", { name: "收合左側面板", exact: true }).click();
    await page.locator("[data-ed-stage]").click();
    await page.keyboard.press("]");
    assert.equal(await page.locator(".editor-library").count(), 0);
    assert.equal(await page.locator(".editor-inspector").count(), 0);
    await open();
    const layout = await page.evaluate(() => ed.layout);
    assert.deepEqual(layout, { left: 344, right: 300, timeline: 166, leftOpen: false, rightOpen: false, closed: [], preview: "1080P" });
    assert.equal(await page.locator(".editor-library").count(), 0);
    await page.keyboard.press("Alt+1");
    await page.keyboard.press("Alt+2");
    assert.equal(await page.locator(".editor-library").count(), 1);
    assert.equal(await page.locator(".editor-inspector").count(), 1);
    assert.equal(await page.locator("[data-ed-workspace]").evaluate((e) => getComputedStyle(e.querySelector(".editor-library")).width), "344px");
    pass("拖寬、時間軸加高、收合左右欄，重新整理後照舊；Alt+1／Alt+2 展開");

    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
