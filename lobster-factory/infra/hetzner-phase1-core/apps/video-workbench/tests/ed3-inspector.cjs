// Card ED.3 (docs/ed3-properties-spec-20261106.md §8 UI side, §7 C): the properties panel in real Edge on an isolated
// data dir. Screenshots go to the temp dir printed on the EVIDENCE line.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  { spawnSync } = require("node:child_process"),
  ffmpeg = require("ffmpeg-static"),
  { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const pass = (m) => console.log("PASS " + m);
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-ed3-inspector-")),
    dataDir = path.join(dir, "data");
  // A real 4 s clip with sound in the isolated data dir (served under /generated/), made before the server starts.
  fs.mkdirSync(path.join(dataDir, "generated"), { recursive: true });
  const clipUrl = "/generated/" + crypto.randomUUID() + ".mp4",
    made = spawnSync(ffmpeg, ["-y", "-hide_banner", "-f", "lavfi", "-i", "testsrc2=s=640x360:r=30:d=4", "-f", "lavfi", "-i", "sine=frequency=440:duration=4", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path.join(dataDir, clipUrl)], { encoding: "utf8", windowsHide: true });
  assert.equal(made.status, 0, made.stderr);
  const server = require("../server.cjs").createServer({ dataDir, env: {} });
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
    const groups = () => inspector.locator("[data-ed-group] > summary > b").allTextContents();
    assert.deepEqual(await groups(), ["畫面", "聲音", "文字與字幕", "輸出"]);
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

    // ED.3.6: groups fold and stay folded after a reload; number fields take arithmetic, arrows and Esc.
    await inspector.locator('[data-ed-group="聲音"] > summary').click();
    await page.waitForFunction(() => ed.layout.closed.includes("聲音"));
    await page.waitForTimeout(300);
    await page.reload();
    await page.getByRole("button", { name: "ED3 屬性 · 9:16", exact: true }).click();
    await page.waitForSelector("[data-ed-stage]");
    assert.equal(await inspector.locator('[data-ed-group="聲音"]').evaluate((d) => d.open), false);
    assert.equal(await inspector.locator('[data-ed-group="畫面"]').evaluate((d) => d.open), true);
    await field("光漏（%）", "100/4");
    assert.equal((await project()).lightLeak, 0.25);
    const shake = inspector.getByLabel("震動（%）", { exact: true });
    await shake.focus();
    await page.keyboard.press("ArrowUp");
    await page.evaluate(() => ed.queue);
    assert.equal((await project()).shake, 0.01);
    await inspector.getByLabel("震動（%）", { exact: true }).focus();
    await page.keyboard.press("Shift+ArrowUp");
    await page.evaluate(() => ed.queue);
    assert.equal((await project()).shake, 0.11);
    await inspector.getByLabel("震動（%）", { exact: true }).fill("77");
    await page.keyboard.press("Escape");
    assert.equal(await inspector.getByLabel("震動（%）", { exact: true }).inputValue(), "11");
    assert.equal((await project()).shake, 0.11);
    // Clip groups and their header values (reference: ×1.00, 黑邊, 1x, 100%, length in s).
    await page.evaluate((url) => {
      const p = edProject(),
        c = edTime(p, { id: "v1clip", kind: "video", track: "V1", asset: { id: "a1", url, name: "測試片", duration: 4 }, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, opacity: 1, scale: 1, x: 0, y: 0, rotation: 0, width: 25 }, { startFrame: 0, durationFrames: 100, sourceStartFrame: 0 });
      p.clips.push(c);
      ed.selected = c.id;
      edRender();
    }, clipUrl);
    assert.deepEqual(await groups(), ["畫面效果", "變形", "背景", "播放速度", "音訊", "時間", "調色"]);
    const values = await inspector.locator("[data-ed-group] > summary > .note").allTextContents();
    assert.deepEqual(values, ["", "×1.00", "黑邊", "1x", "100%", "4.00s", ""]);
    assert.equal(await inspector.locator("h4").first().textContent(), "主視訊 V1 片段");
    await inspector.screenshot({ path: path.join(dir, "ed36-clip-groups.png") });
    pass("ED.3.6：組可收合且重開後仍收合；100/4 → 25%、↑ → 1%、Shift+↑ → 11%、Esc 還原且不寫入；片段七組標題值 ×1.00／黑邊／1x／100%／4.00s");

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
