// Card ED.3 (docs/ed3-properties-spec-20261106.md §8 UI side, §7 C): the properties panel in real Edge on an isolated
// data dir. Screenshots go to the temp dir printed on the EVIDENCE line.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const pass = (m) => console.log("PASS " + m);
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-ed3-inspector-")),
    dataDir = path.join(dir, "data"),
    server = require("../server.cjs").createServer({ dataDir, env: {} });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port,
    browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*", (r) => (r.request().url().startsWith(base + "/") ? r.continue() : r.abort()));
    const inspector = page.locator(".editor-inspector"),
      project = () => page.evaluate(() => JSON.parse(JSON.stringify(edProject()))),
      field = async (label, value) => {
        await inspector.getByLabel(label, { exact: true }).fill(String(value));
        await inspector.getByLabel(label, { exact: true }).press("Tab");
        await page.evaluate(() => ed.queue);
      };

    await page.goto(base + "/pages/tools.html#edit");
    await page.getByRole("button", { name: "新建剪輯專案", exact: true }).click();
    await page.getByLabel("專案名稱").fill("ED3 屬性");
    await page.getByRole("button", { name: "建立專案", exact: true }).click();
    await page.waitForSelector("[data-ed-stage]");

    // ED.3.1 整片設定: four groups, buttons instead of dropdowns, effects at the project layer, track dB rows.
    assert.deepEqual(await inspector.locator(".editor-insp-group h4").allTextContents(), ["畫面", "聲音", "文字與字幕", "輸出"]);
    assert.equal(await inspector.locator("select").count(), 0);
    await inspector.getByRole("group", { name: "畫面比例" }).getByRole("button", { name: "9:16 直屏" }).click();
    await inspector.getByRole("group", { name: "影格率" }).getByRole("button", { name: "25 fps" }).click();
    await field("光漏（%）", 40);
    await field("配樂（dB）", -6);
    let p = await project();
    assert.equal(p.ratio, "9:16");
    assert.deepEqual(p.timebase, { num: 25, den: 1 });
    assert.equal(p.lightLeak, 0.4);
    assert.ok(Math.abs(p.tracks.find((t) => t.id === "A2").volume - Math.pow(10, -6 / 20)) < 1e-9);
    assert.ok(!("shake" in p) && !("filterStrength" in p) && !("grain" in p), "沒動到的效果不寫入");
    await inspector.screenshot({ path: path.join(dir, "ed31-project-settings.png") });
    await inspector.getByRole("button", { name: "更多特效與遮罩" }).click();
    assert.equal(await page.evaluate(() => ed.pane), "特效");
    pass("ED.3.1 整片設定：畫面／聲音／文字與字幕／輸出四組、無下拉；比例 9:16、25 fps、光漏 40%、配樂 −6 dB 寫入，未動的效果不寫入；捷徑開左側特效");

    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
  console.log("EVIDENCE " + dir);
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
