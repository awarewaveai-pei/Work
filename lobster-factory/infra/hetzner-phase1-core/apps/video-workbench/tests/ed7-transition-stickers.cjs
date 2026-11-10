// Card ED.7 (docs/editor-parity-spec-20261106.md §1.3 轉場／貼圖): the 轉場 pane (cut must be clicked, five effects,
// 0.1-2 s clamped to the neighbours, 套用全部剪點, 預覽剪點, 移除轉場, 曲線) and the 貼圖 pane (watermark PNG/SVG kept in the
// account, project stickers, brand kit kept across projects). The curve is checked on a real export: frames of the
// output at a quarter of the transition. Real Edge, isolated data dir.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  { spawnSync } = require("node:child_process"),
  { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright"),
  ffmpeg = require("ffmpeg-static"),
  { media } = require("../backend/media.cjs");
const pass = (m) => console.log("PASS " + m);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-ed7-"));
function run(args, binary = false) {
  const r = spawnSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", ...args], { windowsHide: true, encoding: null, timeout: 60000 });
  assert.equal(r.status, 0, String(r.stderr));
  return r.stdout;
}
(async () => {
  // ---- real output: the curve changes the frames, not just the stored name -------------------------------------
  for (const c of ["red", "blue"]) run(["-f", "lavfi", "-i", `color=c=${c}:s=160x90:r=30:d=2`, "-c:v", "libx264", "-pix_fmt", "yuv420p", path.join(dir, c + ".mp4")]);
  const pixel = (file, t) => [...run(["-ss", String(t), "-i", file, "-frames:v", "1", "-vf", "scale=1:1", "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"])];
  const clip = (id, color, start) => ({ id, kind: "video", track: "V1", asset: { url: color + ".mp4" }, startFrame: start * 30, durationFrames: 60, sourceStartFrame: 0 });
  const exportCurve = async (transition, curve) => {
    const project = { ratio: "16:9", timebase: { num: 30, den: 1 }, clips: [clip("a", "red", 0), { ...clip("b", "blue", 2), transition, transitionFrames: 30, transitionCurve: curve }] };
    let out;
    const r = await media({ operation: "editor-export", settings: { project, quality: "720p" } }, { file: (u) => path.join(dir, u), output: (ext) => (out = { file: path.join(dir, crypto.randomUUID() + "." + ext), url: "" }) });
    return path.join(dir, r.url || path.basename(out.file));
  };
  for (const type of ["溶解", "黑場", "向左擦除", "向右擦除", "圓形展開"]) {
    const smooth = await exportCurve(type, "平滑"),
      fast = await exportCurve(type, "加速"),
      // The transition runs 1.5 s .. 2.5 s: 1.75 s is a quarter of it.
      [s, f] = [pixel(smooth, 1.75), pixel(fast, 1.75)];
    assert(f[0] > s[0] + 8, `${type}: 加速的四分之一處應比平滑更接近前段（紅）${s} ${f}`);
    for (const file of [smooth, fast]) {
      assert(pixel(file, 1.2)[0] > 200 && pixel(file, 2.8)[2] > 200, type + " 起訖畫面");
    }
    pass("真實輸出 " + type + "：曲線改變轉場途中的畫面（平滑 " + s + " ／ 加速 " + f + "）");
  }
  await assert.rejects(exportCurve("向左推移", "加速"), /不支援曲線/);
  pass("推移效果搭配曲線：輸出明確拒絕，不默默輸出線性");

  // ---- the panes in a real browser -------------------------------------------------------------------------------
  const mp4 = path.join(dir, "clip.mp4");
  run(["-f", "lavfi", "-i", "testsrc=s=320x180:r=30:d=3", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", mp4]);
  const png = path.join(dir, "mark.png"),
    svg = path.join(dir, "mark.svg");
  run(["-f", "lavfi", "-i", "color=c=orange:s=120x60", "-frames:v", "1", png]);
  fs.writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#12ab34"/></svg>');
  const dataDir = path.join(dir, "data"),
    server = require("../server.cjs").createServer({ dataDir, env: {} });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port,
    browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*", (r) => (r.request().url().startsWith(base + "/") ? r.continue() : r.abort()));
    await page.goto(base + "/pages/tools.html#edit");
    await page.getByRole("button", { name: "新建剪輯專案", exact: true }).click();
    await page.getByLabel("專案名稱").fill("ED7");
    await page.getByRole("button", { name: "建立專案", exact: true }).click();
    await page.waitForSelector("[data-ed-stage]");
    const asset = await page.evaluate(
      async (b64) => VideoWorkbench.uploadAsset(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], "clip.mp4", { type: "video/mp4" })),
      fs.readFileSync(mp4).toString("base64"),
    );
    for (let i = 0; i < 3; i++) await page.evaluate((a) => edAdd(a), asset);
    const v1 = () => page.evaluate(() => edProject().clips.filter((c) => c.track === "V1").sort((a, b) => a.startFrame - b.startFrame).map((c) => ({ id: c.id, t: c.transition, f: c.transitionFrames, k: c.transitionCurve, start: c.startFrame })));
    const group = (name) => page.getByRole("group", { name, exact: true });

    await page.locator('[data-ed-pane="轉場"]').click();
    assert.equal(await page.locator("[data-ed-transition-hint]").innerText(), "請先點選 V1 相鄰片段之間的剪點");
    assert.equal(await group("轉場").getByRole("button").count(), 5);
    assert.deepEqual(await group("轉場").getByRole("button").allInnerTexts(), ["融接", "淡入淡出", "向左擦除", "向右擦除", "圓形裁切"]);
    assert.equal(await group("轉場").locator("button:not([disabled])").count(), 0);
    assert.equal(await page.getByRole("button", { name: "套用全部剪點 (2)", exact: true }).isDisabled(), false);
    // a clip click is not a cut click
    await page.locator("[data-ed-clip]").nth(1).click();
    assert.equal(await group("轉場").locator("button:not([disabled])").count(), 0);
    pass("轉場分頁：未點剪點時只有提示與停用的控制項，點片段不算點剪點；五個效果、套用全部剪點 (2)");

    await page.getByRole("button", { name: "新增轉場效果（剪點 3.00 秒）", exact: true }).click();
    assert.match(await page.locator("[data-ed-transition-hint]").innerText(), /已選剪點：3\.00 秒/);
    await group("轉場").getByRole("button", { name: "向左擦除", exact: true }).click();
    let [a, b, c] = await v1();
    assert.deepEqual([a.t, b.t, c.t], [undefined, "向左擦除", undefined]);
    assert.equal(b.f, 15, "預設 0.5 秒");
    await page.getByLabel("轉場秒數").fill("0.05");
    await page.getByLabel("轉場秒數").press("Tab");
    assert.equal((await v1())[1].f, 3, "下限 0.1 秒＝3 格");
    await page.getByLabel("轉場秒數").fill("9");
    await page.getByLabel("轉場秒數").press("Tab");
    assert.equal((await v1())[1].f, 60, "上限 2 秒");
    await page.evaluate(() => {
      const p = edProject(),
        x = p.clips.filter((c) => c.track === "V1").sort((u, v) => u.startFrame - v.startFrame)[1];
      edCheckpoint();
      edTime(p, x, { duration: 0.8 });
      edCommit(p);
    });
    await page.getByLabel("轉場秒數").fill("2");
    await page.getByLabel("轉場秒數").press("Tab");
    assert.equal((await v1())[1].f, 24, "不超過左右片段各半（後段 0.8 秒 → 最長 0.8 秒）");
    await group("轉場曲線").getByRole("button", { name: "加速", exact: true }).click();
    assert.equal((await v1())[1].k, "加速");
    assert.equal(await group("轉場曲線").getByRole("button", { name: "加速" }).getAttribute("aria-pressed"), "true");
    assert(JSON.stringify(await page.evaluate(() => edNative(edProject()))).includes('"transitionCurve":"加速"'), "曲線進入匯出用的專案資料");
    pass("套用效果＋長度夾在 0.1–2 秒與左右片段各半之內＋曲線寫進專案");

    await page.evaluate(() => (ed.time = 0));
    await page.getByRole("button", { name: "預覽剪點", exact: true }).click();
    await page.waitForFunction(() => ed.playing, null, { timeout: 3000 });
    assert(await page.evaluate(() => ed.time >= 1.9 && ed.time < 4), "從剪點前 1 秒開始播放");
    await page.waitForFunction(() => !ed.playing, null, { timeout: 8000 });
    pass("預覽剪點：從剪點前 1 秒播放，過了轉場後 1 秒自動停");

    await page.getByRole("button", { name: "移除轉場", exact: true }).click();
    assert.equal((await v1())[1].t, "無");
    await page.getByRole("button", { name: "復原", exact: true }).click();
    assert.equal((await v1())[1].t, "向左擦除");
    await group("轉場").getByRole("button", { name: "圓形裁切", exact: true }).click();
    assert.equal((await v1())[1].t, "圓形展開");
    await page.getByRole("button", { name: "套用全部剪點 (2)", exact: true }).click();
    [a, b, c] = await v1();
    assert.deepEqual([b.t, c.t, b.k, c.k], ["圓形展開", "圓形展開", "加速", "加速"]);
    assert.equal(b.f, 24, "每個剪點各自夾在自己的上限");
    assert.equal(c.f, 24, "套用全部：長度取目前設定，再夾進各剪點的上限");
    pass("移除轉場、復原、換效果、套用全部剪點 (2)");

    // Codex ED.7 F2: a neighbour under 0.1 s caps the length at its own size, never past it (the export refuses that).
    await page.evaluate(() => {
      const p = edProject(),
        x = p.clips.filter((u) => u.track === "V1").sort((u, v) => u.startFrame - v.startFrame)[1];
      edCheckpoint();
      edTime(p, x, { duration: 0.07 });
      edCommit(p);
    });
    await page.getByLabel("轉場秒數").fill("1");
    await page.getByLabel("轉場秒數").press("Tab");
    assert.equal((await v1())[1].f, 2, "片段只有 2 格：轉場最多 2 格");
    pass("鄰接片段短於 0.1 秒：轉場長度不超過該片段");

    // ---- 貼圖 ----------------------------------------------------------------------------------------------------
    await page.locator('[data-ed-pane="貼圖"]').click();
    const choose = async (name, file) => {
      const chooser = page.waitForEvent("filechooser");
      await page.getByRole("button", { name, exact: true }).click();
      await (await chooser).setFiles(file);
    };
    await choose("新增浮水印（PNG／SVG）", png);
    await page.waitForSelector('[aria-label="浮水印"] .editor-sticker-row');
    await choose("新增浮水印（PNG／SVG）", svg);
    await page.waitForFunction(() => document.querySelectorAll('[aria-label="浮水印"] .editor-sticker-row').length === 2);
    const marks = await page.evaluate(async () => (await VideoWorkbench.assets.list()).filter((x) => x.watermark).map((x) => x.url));
    assert.equal(marks.length, 2);
    assert(marks.every((u) => /\.png$/.test(u)), "SVG 轉成 PNG：" + marks);
    assert.equal(await page.getByRole("button", { name: "使用中（取消）" }).count(), 1, "第一個浮水印自動成為影片浮水印");
    await page.getByRole("button", { name: "設為影片浮水印" }).click();
    assert.equal((await page.evaluate(() => VideoWorkbench.preferences.get("tools.editor.watermark", null))).url, marks[1]);
    pass("新增浮水印：PNG 與 SVG（轉成 PNG）存進帳戶素材庫，可切換使用中的浮水印");

    await page.reload();
    await page.getByRole("button", { name: /^ED7 · /, exact: false }).first().click();
    await page.waitForSelector("[data-ed-stage]");
    await page.locator('[data-ed-pane="貼圖"]').click();
    await page.waitForFunction(() => document.querySelectorAll('[aria-label="浮水印"] .editor-sticker-row').length === 2);
    assert.equal(await page.getByRole("button", { name: "使用中（取消）" }).count(), 1);
    pass("重新載入、重開專案：浮水印清單與使用中的浮水印還在");

    await page.getByRole("button", { name: /^加入疊加 V2：/ }).first().click();
    await page.waitForSelector('[data-ed-lane="V2"] [data-ed-clip]');
    assert.equal(await page.evaluate(() => edProject().clips.filter((c) => c.track === "V2").length), 1);
    await page.getByRole("button", { name: /^加入疊加 V2：mark/ }).first().waitFor();
    pass("專案貼圖清單點 ＋ 加到疊加 V2");

    // brand kit
    await page.getByLabel("新增品牌色").fill("#12ab34");
    await page.getByRole("button", { name: "新增", exact: true }).click();
    assert.equal(await page.locator(".editor-brand-swatch").count(), 1);
    await group("品牌字型").getByRole("button", { name: "Noto Serif TC", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "套用至選取文字" }).isDisabled(), true, "未選文字片段時停用");
    await page.getByRole("button", { name: "從圖片素材選", exact: true }).click();
    await page.locator("[data-picker-id]").first().click();
    await page.locator("[data-picker-confirm]").click();
    await page.waitForSelector(".editor-brand-save", { state: "attached" });
    assert.equal(await page.locator('[aria-label="品牌套件"] .editor-sticker-row').count(), 1, "品牌 Logo");
    assert.equal(await page.getByRole("button", { name: "儲存品牌套件" }).isDisabled(), false);
    await page.getByRole("button", { name: "儲存品牌套件", exact: true }).click();
    await page.waitForFunction(() => document.querySelector("[data-ed-kit-state]")?.textContent.startsWith("已儲存"));
    const kit = await page.evaluate(() => VideoWorkbench.preferences.get("tools.editor.brandKit", null));
    assert.deepEqual([kit.colors, kit.font, !!kit.logo?.url], [["#12ab34"], "Noto Serif TC", true]);
    // text clip + 套用至選取文字
    await page.evaluate(async () => {
      const p = edProject(),
        t = edText("新文字", 0, 3, p);
      edCheckpoint();
      p.clips.push(t);
      ed.selected = t.id;
      await edCommit(p);
    });
    await page.locator('[data-ed-pane="貼圖"]').click();
    await page.getByRole("button", { name: "套用至選取文字", exact: true }).click();
    assert.equal(await page.evaluate(() => edClip().font), "思源宋體");
    // another project sees the same kit
    await page.evaluate(() => (ed.current = null));
    await page.evaluate(() => edCreate("ED7 第二個", "16:9"));
    await page.locator('[data-ed-pane="貼圖"]').click();
    await page.waitForFunction(() => document.querySelectorAll(".editor-brand-swatch").length === 1);
    assert.equal(await page.getByRole("button", { name: "儲存品牌套件" }).isDisabled(), true);
    pass("品牌套件：色彩、字型、Logo 存成帳號偏好 tools.editor.brandKit，套用至選取文字，另一個專案也讀得到");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
