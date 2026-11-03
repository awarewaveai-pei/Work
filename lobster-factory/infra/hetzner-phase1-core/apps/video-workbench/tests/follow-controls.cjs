const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  { chromium } = require("playwright"),
  math = require("../shared/follow-math.js");
(async () => {
  const histA = [1, 0],
    histB = [0, 1],
    previous = { cx: 0.45, cy: 0.5, w: 0.2, h: 0.4 };
  const target = { ...previous, cx: 0.48, hist: histA },
    other = { ...previous, cx: 0.46, hist: histB };
  assert.equal(math.match([other, target], previous, histA), target);
  assert.equal(math.match([target, { ...target }], previous, histA), null);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "follow-controls-"));
  fs.mkdirSync(path.join(dir, "generated"));
  const name = "00000000-0000-0000-0000-000000000000.mp4";
  fs.copyFileSync(
    path.join(
      fs
        .readFileSync(
          path.join(os.tmpdir(), "seedstar-follow-latest.txt"),
          "utf8",
        )
        .trim(),
      "moving-person.mp4",
    ),
    path.join(dir, "generated", name),
  );
  const server = require("../server.cjs").createServer({
    dataDir: dir,
    env: {},
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(
      "http://127.0.0.1:" + server.address().port + "/pages/tools.html",
    );
    await page.waitForFunction(() => VideoWorkbench.tools);
    await page.evaluate(
      (asset) =>
        VideoWorkbench.tools.acceptAsset({
          tool: "follow",
          asset,
          settings: { followStart: 1, followEnd: 6 },
        }),
      {
        id: "test",
        url: "/generated/" + name,
        type: "video/mp4",
        duration: 6,
        width: 1280,
        height: 720,
      },
    );
    await page.waitForSelector("[data-follow-person]", { timeout: 30000 });
    await page.locator('[data-follow-person="0"]').click();
    await page.waitForFunction(() => followRuntime.busy);
    await page.locator('[data-flow-action="follow-cancel"]').click();
    await page.waitForFunction(() => !followRuntime.busy);
    assert(
      await page.locator('[data-flow-action="follow-detect"]').isEnabled(),
    );
    await page.locator('[data-flow-action="follow-track"]').click();
    await page.waitForFunction(() => followRuntime.busy);
    await page.locator('[data-key="followStart"]').fill("0.5");
    await page.waitForFunction(() => !followRuntime.busy);
    assert(
      await page.locator('[data-flow-action="follow-detect"]').isEnabled(),
    );
    assert.equal(
      await page.locator('[data-key="followStart"]').inputValue(),
      "0.5",
    );
    await page.locator('[data-key="followEnd"]').fill('5.5');
    await page.locator('[data-flow-media="src"]').evaluate(m=>{m.currentTime=5.3;});
    await page.locator('[data-flow-action="follow-preview"]').click();
    await page.waitForFunction(()=>{const m=document.querySelector('[data-flow-media="src"]');return m.paused&&m.currentTime>=5.49&&m.currentTime<5.8;});
    assert.match(await page.locator('[data-follow-clock]').innerText(),/5\.0 \/ 5\.0/);
    await page.locator('[data-flow-action="follow-track"]').click();
    await page.waitForFunction(() => followRuntime.busy);
    await page.locator('[data-act="home"]').click();
    await page.waitForFunction(() => !followRuntime.busy && tool === null);
    assert.deepEqual(errors, []);
    console.log(
      "PASS 自動偵測、取消、追蹤中修改區間、離開工具，不鎖按鍵／不寫入過期結果；兩人交錯依外觀選人，歧義時不自動換人",
    );
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
