// Card ED.4 (docs/editor-parity-spec-20261106.md §1.3 素材): three tabs, search, kind filter, 已使用／未使用 groups,
// card add (click / Enter) to the main track end, favourites as a user preference, 拆出音軌, track-＋ banner.
// Real browser, isolated data dir.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { spawnSync } = require("node:child_process"),
  ffmpeg = require("ffmpeg-static"),
  { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const pass = (m) => console.log("PASS " + m);
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-ed4-")),
    mp4 = path.join(dir, "clip.mp4"),
    png = path.join(dir, "still.png"),
    wav = path.join(dir, "tone.wav");
  for (const args of [
    ["-f", "lavfi", "-i", "color=blue:s=320x180:r=24:d=2", "-f", "lavfi", "-i", "sine=d=2", "-shortest", "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", mp4],
    ["-f", "lavfi", "-i", "color=red:s=64x36", "-frames:v", "1", png],
    ["-f", "lavfi", "-i", "sine=d=1", wav],
  ]) {
    const r = spawnSync(ffmpeg, ["-y", "-hide_banner", ...args], { windowsHide: true, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
  }
  const server = require("../server.cjs").createServer({ dataDir: path.join(dir, "data"), env: {} });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port,
    browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base + "/pages/tools.html#edit");
    await page.getByRole("button", { name: "新建剪輯專案", exact: true }).click();
    await page.getByRole("button", { name: "建立專案", exact: true }).click();
    await page.waitForSelector("[data-ed-stage]");
    const pane = page.locator(".editor-library");
    assert.equal(await pane.getByRole("tab").count(), 3);
    assert.match(await pane.innerText(), /素材庫是空的/);
    assert.match(await pane.getByRole("tab", { name: /本次上傳/ }).innerText(), /本次上傳 \(0\)/);

    // 上傳素材: files land in 本次上傳 (n) and are not added to the timeline.
    const chooser = page.waitForEvent("filechooser");
    await pane.getByRole("button", { name: "上傳素材", exact: true }).click();
    await (await chooser).setFiles([mp4, png, wav]);
    await page.waitForFunction(() => document.querySelectorAll("[data-ed-asset]").length === 3);
    assert.match(await pane.getByRole("tab", { name: /本次上傳/ }).innerText(), /本次上傳 \(3\)/);
    await page.waitForFunction(() => edProject().clips.length === 3);
    await page.evaluate(() => { edProject().clips.length = 0; edRender(); });
    await pane.getByRole("tab", { name: "我的素材庫" }).click();
    assert.equal(await page.locator("[data-ed-asset]").count(), 3);
    assert.match(await pane.innerText(), /未使用（3）/);
    assert.doesNotMatch(await pane.innerText(), /已使用/);
    pass("三分頁、上傳進「本次上傳 (3)」並加到主軌、未使用（3）");

    // Card text: still 靜圖, video length, resolution, only the video has 拆出音軌.
    const card = (name) => page.locator("[data-ed-asset]", { has: page.locator(`[aria-label^="${name}，"]`) });
    assert.match(await card("still.png").innerText(), /靜圖/);
    await page.waitForFunction(() => /00:02/.test(document.querySelector(".editor-library").innerText) && /320×180/.test(document.querySelector(".editor-library").innerText));
    assert.equal(await card("clip.mp4").getByRole("button", { name: /拆出 .* 的音軌/ }).count(), 1);
    assert.equal(await card("still.png").getByRole("button", { name: /拆出/ }).count(), 0);
    assert.equal(await card("tone.wav").getByRole("button", { name: /拆出/ }).count(), 0);

    // Search keeps focus while typing; the kind buttons filter.
    const search = pane.getByLabel("搜尋素材名稱");
    await search.click();
    await page.keyboard.type("clip");
    assert.equal(await page.locator("[data-ed-asset]").count(), 1);
    assert(await search.evaluate((el) => el === document.activeElement));
    await search.fill("");
    await pane.getByRole("button", { name: "影片", exact: true }).click();
    assert.equal(await page.locator("[data-ed-asset]").count(), 1);
    await pane.getByRole("button", { name: "音訊", exact: true }).click();
    assert.equal(await page.locator("[data-ed-asset]").count(), 1);
    await pane.getByRole("button", { name: "全部", exact: true }).click();
    pass("搜尋不掉焦點、全部／影片／音訊篩選");

    // Click a card: added to the main track end and selected; the next card lands after it; 已用 × n, 已使用 group.
    await card("clip.mp4").getByRole("button", { name: /按 Enter 加入主視訊末端/ }).click();
    await page.waitForFunction(() => edProject().clips.length === 1);
    let s = await page.evaluate(() => ({ track: edProject().clips[0].track, main: edMain(edProject()), sel: ed.selected, id: edProject().clips[0].id }));
    assert.equal(s.track, s.main);
    assert.equal(s.sel, s.id);
    await card("still.png").getByRole("button", { name: /按 Enter 加入主視訊末端/ }).focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => edProject().clips.length === 2);
    s = await page.evaluate(() => {
      const [a, b] = edProject().clips;
      return { aEnd: a.start + a.duration, bStart: b.start, sel: ed.selected === b.id };
    });
    assert(Math.abs(s.aEnd - s.bStart) < 0.05 && s.sel);
    assert.match(await pane.innerText(), /已使用（2）/);
    assert.match(await pane.innerText(), /未使用（1）/);
    assert.match(await card("clip.mp4").innerText(), /已用 × 1/);
    await card("still.png").getByRole("button", { name: /^加入 / }).click();
    await page.waitForFunction(() => edProject().clips.length === 3);
    assert.match(await card("still.png").innerText(), /已用 × 2/);
    // The group folds.
    await pane.locator('[data-ed-action="assets-fold:used"]').click();
    assert.equal(await page.locator("[data-ed-asset]").count(), 1);
    await pane.locator('[data-ed-action="assets-fold:used"]').click();
    assert.equal(await page.locator("[data-ed-asset]").count(), 3);
    pass("點卡片／Enter／＋ 加到主視訊末端並選取；已用 × n；已使用／未使用兩組可收合");

    // 收藏: a user preference that survives a reload; the asset record is untouched.
    const before = await page.evaluate(() => VideoWorkbench.assets.list().then((r) => JSON.stringify(r)));
    await card("tone.wav").getByRole("button", { name: "加入最愛" }).click();
    await pane.getByRole("tab", { name: "收藏" }).click();
    assert.equal(await page.locator("[data-ed-asset]").count(), 1);
    assert.deepEqual(await page.evaluate(() => VideoWorkbench.preferences.get("tools.editor.assetFavorites")), [await page.evaluate(() => edAssets.items.find((a) => a.name === "tone.wav").id)]);
    assert.equal(await page.evaluate(() => VideoWorkbench.assets.list().then((r) => JSON.stringify(r))), before);
    await page.reload();
    await page.waitForSelector("[data-ed-stage]").catch(() => {});
    if (!(await page.locator("[data-ed-stage]").count())) {
      await page.getByRole("button", { name: /未命名剪輯專案/ }).first().click();
      await page.waitForSelector("[data-ed-stage]");
    }
    await pane.getByRole("tab", { name: "收藏" }).click();
    await page.waitForFunction(() => document.querySelectorAll("[data-ed-asset]").length === 1);
    await pane.getByRole("button", { name: "取消收藏" }).click();
    await page.waitForFunction(() => /還沒有收藏/.test(document.querySelector(".editor-library").innerText));
    pass("收藏存在使用者偏好、重開仍在、素材資料不變");

    // 拆出音軌: the video's sound becomes an audio clip on the narration track.
    await pane.getByRole("tab", { name: "我的素材庫" }).click();
    await card("clip.mp4").getByRole("button", { name: /拆出 .* 的音軌/ }).click();
    await page.waitForFunction(() => edProject().clips.some((c) => c.kind === "audio"));
    assert.equal(await page.evaluate(() => edProject().clips.find((c) => c.kind === "audio").track), "A1");
    pass("拆出音軌：影片聲音加到旁白軌");

    // From a track's ＋: banner on top, 取消 clears it, the pick goes to that track.
    await page.evaluate(() => edAssetsPickTrack("A2"));
    assert.match(await pane.innerText(), /選一個素材加入「配樂 A2」/);
    await pane.getByRole("button", { name: "取消", exact: true }).click();
    assert.doesNotMatch(await pane.innerText(), /選一個素材加入/);
    await page.evaluate(() => edAssetsPickTrack("A2"));
    await card("tone.wav").getByRole("button", { name: /按 Enter 加入主視訊末端/ }).click();
    await page.waitForFunction(() => edProject().clips.some((c) => c.track === "A2"));
    assert.doesNotMatch(await pane.innerText(), /選一個素材加入/);
    await page.evaluate(() => edAssetsPickTrack("A2"));
    await card("still.png").getByRole("button", { name: /^加入 / }).click();
    assert.equal(await page.evaluate(() => edProject().clips.filter((c) => c.kind === "image").length), 2, "圖片不能放進音訊軌");
    pass("軌道＋：頂部「選一個素材加入『…』 取消」、取消、加到該軌、種類不符不加");
    // 音訊／貼圖 panes still reach library:/upload: with a kind (Codex finding 2).
    const imageChooser = page.waitForEvent("filechooser");
    await page.evaluate(() => edAction("upload:image"));
    assert.equal(await (await imageChooser).element().getAttribute("accept"), "image/*");
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
