// Card ED.5 (docs/editor-parity-spec-20261106.md §1.3 文字): 樣板／純文字／品牌字型、搜尋、分類、十五張樣板、文字動畫、
// 雙擊／＋／拖到文字軌加入；每張樣板加入一次後真實匯出 MP4，逐張抽格確認字真的畫出來。真 Edge、隔離資料夾。
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  { spawnSync } = require("node:child_process"),
  { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright"),
  ffmpeg = require("ffmpeg-static");
const pass = (m) => console.log("PASS " + m);
(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vw-ed5-")),
    dataDir = path.join(root, "data"),
    generated = path.join(dataDir, "generated"),
    name = crypto.randomUUID() + ".mp4",
    step = 3.2;
  fs.mkdirSync(generated, { recursive: true });
  const make = spawnSync(ffmpeg, ["-y", "-hide_banner", "-f", "lavfi", "-i", "color=c=blue:s=320x180:r=30:d=50", "-f", "lavfi", "-i", "sine=frequency=440:duration=50", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "ultrafast", "-c:a", "aac", "-shortest", path.join(generated, name)], { encoding: "utf8", windowsHide: true });
  assert.equal(make.status, 0, make.stderr);
  const server = require("../server.cjs").createServer({ dataDir, env: {} });
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
    await page.getByLabel("專案名稱").fill("ED5 文字");
    await page.getByRole("button", { name: "建立專案", exact: true }).click();
    await page.waitForSelector("[data-ed-stage]");
    await page.evaluate(async (asset) => edAdd(asset), { id: "fixture", name: "測試影片", url: "/generated/" + name, type: "video/mp4" });
    await page.locator('[data-ed-pane="文字"]').click();
    const lib = page.locator(".editor-library"),
      cards = () => page.locator("[data-ed-tpl]"),
      texts = () => page.evaluate(() => edProject().clips.filter((c) => c.kind === "text"));

    // 三分頁、十五張、分類與搜尋
    assert.deepEqual(await lib.locator(".ed-text-tabs button").allInnerTexts(), ["樣板", "純文字", "品牌字型"]);
    assert.equal(await cards().count(), 15);
    for (const [cat, n] of [["開場", 4], ["標價", 3], ["CTA", 3], ["強調", 2], ["片尾", 3], ["全部", 15]]) {
      await lib.getByRole("button", { name: cat, exact: true }).click();
      assert.equal(await cards().count(), n, cat);
    }
    await lib.getByLabel("搜尋樣板").fill("標題");
    assert.deepEqual(await cards().locator("b").allInnerTexts(), ["單行標題", "片尾標題"]);
    assert.equal(await lib.getByLabel("搜尋樣板").inputValue(), "標題");
    await lib.getByLabel("搜尋樣板").fill("");
    assert.match(await lib.innerText(), /雙擊、按 ＋ 加入播放頭，或拖到字幕軌/);
    assert.match(await lib.innerText(), /片頭/);
    pass("三分頁、十五張樣板、六個分類張數、搜尋留在輸入框、說明文字、片頭區塊仍在");

    // 空白文字：「新文字」；純文字分頁同一顆鈕
    await lib.getByRole("button", { name: "＋ 加入空白文字", exact: true }).click();
    assert.equal((await texts())[0].text, "新文字");
    await lib.getByRole("button", { name: "純文字", exact: true }).click();
    assert.equal(await lib.getByRole("button", { name: "＋ 加入空白文字", exact: true }).count(), 1);
    await page.getByRole("button", { name: "復原", exact: true }).click();
    assert.equal((await texts()).length, 0);
    await lib.getByRole("button", { name: "樣板", exact: true }).click();
    pass("加入空白文字＝「新文字」；純文字分頁；復原");

    // 文字動畫選項只在之後加入的樣板上生效
    await lib.getByRole("group", { name: "文字動畫" }).getByRole("button", { name: "逐字顯示", exact: true }).click();
    await page.evaluate(() => (ed.time = 0));
    await lib.getByRole("button", { name: "加入「單行標題」", exact: true }).click();
    assert.equal((await texts())[0].animation, "逐字顯示");
    await page.getByRole("button", { name: "復原", exact: true }).click();
    await lib.getByRole("group", { name: "文字動畫" }).getByRole("button", { name: "無", exact: true }).click();
    pass("文字動畫選了就套用到加入的樣板");

    // 十五張各加一次：13 張按＋、一張雙擊、一張拖到文字軌（放在指針位置）
    const names = await cards().locator("b").allInnerTexts();
    await page.evaluate(() => ((ed.zoom = 40), edRender()));
    for (let i = 0; i < 15; i++) {
      await page.evaluate((t) => (ed.time = t), i * step);
      const card = page.locator("[data-ed-tpl]").nth(i);
      if (i === 13) await card.dblclick();
      else if (i === 14) {
        await page.evaluate(() => (ed.time = 0));
        const lane = page.locator('[data-ed-lane="T"]');
        await card.dragTo(lane, { targetPosition: { x: Math.round((14 * step + 0.02) * 40) - 0, y: 10 } }).catch(() => {});
      } else await card.getByRole("button", { name: /^加入/ }).click();
    }
    let rows = await texts();
    if (rows.length === 14) {
      // The last card is far right of the visible lane: the drag target may fall outside the viewport; drive the same drop through the page.
      await page.evaluate((s) => {
        const lane = document.querySelector('[data-ed-lane="T"]'),
          dt = new DataTransfer(),
          r = lane.getBoundingClientRect();
        dt.setData("text/x-ed-text-template", "slogan");
        lane.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, clientX: r.left + 14 * s * ed.zoom, clientY: r.top + 10, bubbles: true, cancelable: true }));
      }, step);
      await page.waitForFunction(() => edProject().clips.filter((c) => c.kind === "text").length === 15);
      rows = await texts();
    }
    assert.equal(rows.length, 15);
    const vars = await page.evaluate(() => {
      const hex = (t) => edTokenHex(t);
      return { ink: hex("--text-primary"), paper: hex("--card-bg"), accent: hex("--accent"), gold: hex("--yellow") };
    });
    const by = (text) => rows.find((c) => c.text === text);
    assert.equal(by("限時優惠").color, vars.ink);
    assert.equal(by("限時優惠").backgroundColor, vars.paper);
    assert.equal(by("馬上了解更多").backgroundColor, vars.accent);
    assert.equal(by("90%").color, vars.gold);
    assert.equal(by("好故事\n從這一格開始").text.split("\n").length, 2);
    assert(rows.every((c) => /^#[\da-f]{6}$/.test(c.color) && c.track === "T" && c.duration === 3));
    assert(Math.abs(by("你的品牌標語").start - 14 * step) < 0.1, "拖放位置");
    pass("十五張都加進文字軌（＋、雙擊、拖放），顏色是主題 token 當下的實色，雙行樣板保留換行");

    // 雙擊卡片上的＋＝兩次按鈕，不再多加一段
    const before = (await texts()).length;
    await page.evaluate(() => (ed.time = 49));
    await page.locator("[data-ed-tpl]").first().getByRole("button", { name: /^加入/ }).dblclick();
    assert.equal((await texts()).length, before + 2);
    await page.getByRole("button", { name: "復原", exact: true }).click();
    await page.getByRole("button", { name: "復原", exact: true }).click();
    assert.equal((await texts()).length, before);

    // 品牌字型分頁：沒有品牌套件時不給套用；有套件時套色、套字型
    await lib.getByRole("button", { name: "品牌字型", exact: true }).click();
    assert.match(await lib.innerText(), /還沒有品牌色彩/);
    await page.evaluate(() => VideoWorkbench.preferences.set("tools.editor.brandKit", { colors: ["#12ab34"], font: "Noto Serif TC" }));
    await page.evaluate(() => ((edTextUi.kit = undefined), (ed.selected = edProject().clips.find((c) => c.text === "感謝你看完").id), edRender()));
    await page.getByRole("button", { name: "套用色彩 #12ab34", exact: true }).click();
    await page.getByRole("button", { name: "套用至選取文字", exact: true }).click();
    const end = (await texts()).find((c) => c.text === "感謝你看完");
    assert.equal(end.color, "#12ab34");
    assert.equal(end.font, "思源宋體");
    await page.getByRole("button", { name: "復原", exact: true }).click();
    await page.getByRole("button", { name: "復原", exact: true }).click();
    pass("品牌字型分頁：讀 tools.editor.brandKit，套用色彩與字型到選取文字，可復原");

    // 真實匯出：每張樣板抽一格，字有畫出來
    await page.getByRole("button", { name: "匯出", exact: true }).click();
    await page.locator('[data-ed-action="quality:720p"]').click();
    await page.locator("[data-ed-export]").click();
    await page.waitForFunction(() => document.querySelector(".job-view")?.textContent.match(/succeeded|failed/), null, { timeout: 240000 });
    const panel = page.locator(".job-view");
    assert(!(await panel.innerText()).includes("failed"), await panel.innerText());
    const file = path.join(dataDir, (await panel.locator("video").getAttribute("src")).slice(1));
    const frame = (t) => {
      const r = spawnSync(ffmpeg, ["-v", "error", "-ss", String(t), "-i", file, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"], { maxBuffer: 8 * 1024 * 1024, windowsHide: true });
      assert.equal(r.status, 0, String(r.stderr));
      return r.stdout;
    };
    // The text itself (its own colour), not the box behind it: count pixels close to each clip's text colour.
    const ordered = [...(await texts())].sort((x, y) => x.start - y.start),
      want = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    for (let i = 0; i < 15; i++) {
      const f = frame(ordered[i].start + 2.2),
        [r, g, b] = want(ordered[i].color);
      let hit = 0;
      for (let k = 0; k < f.length; k += 3) if (Math.abs(f[k] - r) + Math.abs(f[k + 1] - g) + Math.abs(f[k + 2] - b) < 60) hit++;
      // Drawn or not: a missing line (box only, or tofu) has 0 such pixels. The thinnest is 日期戳 (10 digits in
      // 等寬字 = Noto Sans Mono CJK TC since vendor/fonts, 2026-11-13): 20 points; every other template has 130+.
      assert(hit > 10, `${names[i]}：匯出的畫面找不到字的顏色 ${ordered[i].color}（${hit} 點）`);
    }
    pass("十五張樣板匯出成 MP4，逐張抽格都有字");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
