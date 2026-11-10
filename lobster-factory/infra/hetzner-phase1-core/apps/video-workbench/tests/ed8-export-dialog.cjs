// Card ED.8 (docs/editor-parity-spec-20261106.md §1.7): the export dialog. Gate: the five platform presets are each exported
// once and the file's size equals the dialog's own label; with 影片浮水印 套用 the account watermark is on a sampled frame,
// without it nothing is. (Old projects export unchanged: tests/ed3-legacy-golden.cjs.) Real Edge, isolated data folder, no paid API.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  { spawnSync } = require("node:child_process"),
  { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright"),
  ffmpeg = require("ffmpeg-static");
const pass = (m) => console.log("PASS " + m);
const ff = (args, encoding = "utf8") => spawnSync(ffmpeg, ["-y", "-hide_banner", ...args], { encoding, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vw-ed8-")),
    dataDir = path.join(root, "data"),
    generated = path.join(dataDir, "generated"),
    name = crypto.randomUUID() + ".mp4",
    png = path.join(root, "mark.png");
  fs.mkdirSync(generated, { recursive: true });
  let r = ff(["-f", "lavfi", "-i", "color=c=black:s=640x360:r=30:d=3", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "ultrafast", "-c:a", "aac", "-shortest", path.join(generated, name)]);
  assert.equal(r.status, 0, r.stderr);
  r = ff(["-f", "lavfi", "-i", "color=c=0xff00ff:s=200x80", "-frames:v", "1", png]);
  assert.equal(r.status, 0, r.stderr);
  const server = require("../server.cjs").createServer({ dataDir, env: {} });
  await new Promise((res) => server.listen(0, "127.0.0.1", res));
  const base = "http://127.0.0.1:" + server.address().port,
    browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*", (q) => (q.request().url().startsWith(base + "/") ? q.continue() : q.abort()));
    await page.goto(base + "/pages/tools.html#edit");
    await page.getByRole("button", { name: "新建剪輯專案", exact: true }).waitFor();
    await page.getByRole("button", { name: "新建剪輯專案", exact: true }).click();
    await page.getByLabel("專案名稱").fill("ED8 匯出");
    await page.getByRole("button", { name: "建立專案", exact: true }).click();
    await page.waitForSelector("[data-ed-stage]");
    await page.evaluate((n) => edAdd({ id: "fixture", name: "測試影片", url: "/generated/" + n, type: "video/mp4" }), name);
    await page.waitForFunction(() => edProject().clips.length === 1);
    const dlg = page.locator("dialog[open]"),
      open = async () => {
        await page.getByRole("button", { name: "匯出", exact: true }).click();
        await dlg.locator("[data-ed-export]").waitFor();
      },
      exportNow = async () => {
        await dlg.locator("[data-ed-export]").click();
        await page.waitForFunction(() => document.querySelector(".job-view")?.textContent.match(/succeeded|failed/), null, { timeout: 240000 });
        const panel = page.locator(".job-view");
        assert(!(await panel.innerText()).includes("failed"), await panel.innerText());
        const file = path.join(dataDir, (await panel.locator("video").getAttribute("src")).slice(1));
        await panel.getByRole("button", { name: "關閉" }).click();
        return file;
      },
      size = (file) => {
        const m = /Video:[^\n]*?\b(\d{3,5})x(\d{3,5})\b/.exec(ff(["-i", file]).stderr);
        return m ? m[1] + "×" + m[2] : "?";
      },
      magenta = (file) => {
        const o = ff(["-v", "error", "-ss", "1", "-i", file, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"], null);
        assert.equal(o.status, 0, String(o.stderr));
        let n = 0;
        for (let k = 0; k < o.stdout.length; k += 3) if (o.stdout[k] > 150 && o.stdout[k + 1] < 60 && o.stdout[k + 2] > 150) n++;
        return n;
      };

    // 1. Default = 自訂 (project ratio, the three quality buttons); no watermark yet -> a way to set it, no 套用.
    await open();
    assert.equal(await dlg.locator("select").count(), 0);
    assert.equal(await dlg.locator('[data-ed-action^="quality:"]').count(), 3);
    assert.deepEqual(await dlg.getByRole("group", { name: "輸出到" }).getByRole("button").allInnerTexts(), ["TikTok／Reels", "YouTube Shorts", "YouTube 推薦", "Instagram 貼文", "自訂"]);
    assert.match(await dlg.locator("[data-ed-export-total]").innerText(), /剪輯總時長：.*預估費用：免費/s);
    await dlg.locator("[data-ed-watermark-setup]").waitFor();
    assert.equal(await dlg.getByRole("button", { name: "套用", exact: true }).count(), 0);
    await dlg.locator("[data-ed-watermark-setup]").click();
    await page.getByRole("button", { name: "新增浮水印（PNG／SVG）", exact: true }).waitFor();
    assert.equal(await dlg.count(), 0, "前往設定後對話框關閉");
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "新增浮水印（PNG／SVG）", exact: true }).click();
    await (await chooser).setFiles(png);
    await page.waitForFunction(async () => (await VideoWorkbench.preferences.get("tools.editor.watermark", null))?.url);
    pass("預設 自訂：3 個畫質鈕、總時長與免費預估、無浮水印時只有「前往設定浮水印」，點了開貼圖分頁；設定後存進帳戶");

    // 2. Five presets, one real export each: the file's size = the label the dialog showed.
    const sizes = [];
    for (const [platform, want] of [["TikTok／Reels", "9:16 · 1080×1920"], ["YouTube Shorts", "9:16 · 1080×1920"], ["YouTube 推薦", "16:9 · 1920×1080"], ["Instagram 貼文", "1:1 · 1080×1080"], ["自訂", "16:9 · 1280×720"]]) {
      await open();
      await dlg.getByRole("button", { name: platform, exact: true }).click();
      if (platform === "自訂") await dlg.locator('[data-ed-action="quality:720p"]').click();
      const label = await dlg.locator("[data-ed-export-spec]").innerText();
      assert(label.startsWith(want), `${platform}：標示 ${label}`);
      const file = await exportNow();
      sizes.push([platform, size(file)]);
      assert.equal(size(file), want.split(" · ")[1], `${platform}：檔案 ${size(file)} 與標示 ${label} 不同`);
    }
    pass("五個平台預設各真實匯出一次，檔案尺寸與標示相同：" + sizes.map((s) => s.join(" ")).join("、"));
    await open();
    await dlg.getByRole("button", { name: "Instagram 貼文", exact: true }).click();
    await dlg.getByRole("button", { name: "4:5", exact: true }).click();
    assert.match(await dlg.locator("[data-ed-export-spec]").innerText(), /^4:5 · 1080×1350/);
    await dlg.locator("[data-ed-export-cancel]").click();
    assert.equal(await dlg.count(), 0);
    pass("Instagram 貼文可選 4:5（1080×1350）；取消關閉視窗");

    // 3. Watermark: 套用 puts it on the picture (magenta on black), 不套用 leaves none; the project is untouched.
    const before = await page.evaluate(() => JSON.stringify(edNative(edProject())));
    await open();
    await dlg.locator('[data-ed-action="quality:720p"]').click();
    assert.equal(await dlg.locator('[data-ed-action="watermark:套用"]').getAttribute("aria-pressed"), "false", "預設不套用");
    const plain = await exportNow();
    await open();
    await dlg.locator('[data-ed-action="quality:720p"]').click();
    await dlg.locator('[data-ed-action="watermark:套用"]').click();
    assert.equal(await dlg.locator("[data-ed-watermark-name]").count(), 1);
    const marked = await exportNow();
    assert.equal(magenta(plain), 0, "不套用：畫面沒有浮水印");
    const hits = magenta(marked);
    assert(hits > 300, "套用：畫面有浮水印，洋紅點數 " + hits);
    assert.equal(await page.evaluate(() => JSON.stringify(edNative(edProject()))), before, "匯出不改專案");
    pass(`影片浮水印：不套用 0 個洋紅點、套用 ${hits} 個；專案本身未改`);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
