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

    // ED.3.2 套用範圍 (spec §4): 整片 writes the project and clears clip values, 此軌 the track, 此片段 the clip; the
    // panel shows the resolved value; 背景 goes to every main-track clip; the preview draws filter, leak and shake.
    const fxGroup = inspector.locator('[data-ed-group="畫面效果"]'),
      scope = (name) => fxGroup.getByRole("group", { name: "套用範圍" }).getByRole("button", { name }).click(),
      clipOf = (q, id) => q.clips.find((x) => x.id === id);
    await page.evaluate((url) => {
      const p = edProject();
      p.clips.push(edTime(p, { id: "v1second", kind: "video", track: "V1", asset: { id: "a1", url, name: "測試片", duration: 4 }, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, opacity: 1, scale: 1, x: 0, y: 0, rotation: 0, width: 25, filter: "復古" }, { startFrame: 100, durationFrames: 50, sourceStartFrame: 0 }));
      edRender();
    }, clipUrl);
    await scope("整片");
    await fxGroup.getByRole("group", { name: "濾鏡", exact: true }).getByRole("button", { name: "黑白" }).click();
    p = await project();
    assert.equal(p.filter, "黑白");
    assert.ok(p.clips.every((x) => !("filter" in x)), "整片寫入後各片段沒有 filter");
    assert.equal(await fxGroup.getByRole("group", { name: "濾鏡", exact: true }).getByRole("button", { name: "黑白" }).getAttribute("aria-pressed"), "true");
    await scope("此軌");
    await field("光漏（%）", 30);
    await scope("此片段");
    await field("震動（%）", 50);
    p = await project();
    assert.equal(p.tracks.find((t) => t.id === "V1").lightLeak, 0.3);
    assert.ok(!("lightLeak" in clipOf(p, "v1clip")) && clipOf(p, "v1clip").shake === 0.5 && !("shake" in clipOf(p, "v1second")));
    const background = inspector.locator('[data-ed-group="背景"]');
    await background.getByRole("button", { name: "模糊" }).click();
    await field("模糊強度", 30);
    p = await project();
    assert.ok(["v1clip", "v1second"].every((id) => clipOf(p, id).background === "模糊" && clipOf(p, id).backgroundBlur === 30), "背景套用到主軌所有片段");
    await page.evaluate(() => {
      ed.time = 0.5;
      edPaint();
    });
    const look = await page.evaluate(() => {
      const el = document.querySelector('[data-ed-layer="v1clip"]');
      return { filter: el.style.filter, transform: el.style.transform, leak: !!document.querySelector('[data-ed-leak="v1clip"]') };
    });
    assert.match(look.filter, /grayscale\(1\)/);
    assert.match(look.transform, /^translate\(.*\) scale\(1\.03\)/);
    assert.ok(look.leak, "光漏預覽層");
    await page.waitForFunction(() => document.querySelector('[data-ed-layer="v1clip"]').readyState >= 2);
    await page.locator("[data-ed-stage]").screenshot({ path: path.join(dir, "ed32-preview.png") });
    await inspector.screenshot({ path: path.join(dir, "ed32-effects.png") });
    pass("ED.3.2：整片黑白清掉片段濾鏡、此軌光漏 30% 寫軌道、此片段震動 50% 只寫該段；背景模糊＋強度 30 套用主軌兩段；預覽灰階＋震動位移放大＋光漏層");

    // ED.3.3: ◇ adds a key with the current values, editing a field off-key upserts one at the playhead (1920/2),
    // ◆ removes the key under the playhead, a split gives each half its keys; 分離音訊; 旁白時自動降低.
    const at = (seconds, id = "v1clip") =>
        page.evaluate(
          ([t, sel]) => {
            ed.time = t;
            ed.selected = sel;
            edRender();
          },
          [seconds, id],
        ),
      keysOf = async (id) => clipOf(await project(), id).transformKeys;
    await at(0);
    await inspector.getByRole("button", { name: "◇ 新增關鍵影格" }).click();
    await page.evaluate(() => ed.queue);
    assert.deepEqual(await keysOf("v1clip"), [{ frame: 0, scale: 1, x: 0, y: 0, rotation: 0 }]);
    await at(2);
    await field("X（px）", "1920/2");
    assert.deepEqual((await keysOf("v1clip")).map((k) => [k.frame, k.x]), [[0, 0], [50, 960]]);
    await at(2);
    await inspector.getByRole("button", { name: "◆ 移除此關鍵影格" }).click();
    await page.evaluate(() => ed.queue);
    assert.deepEqual((await keysOf("v1clip")).map((k) => k.frame), [0]);
    await at(2);
    await field("X（px）", 960);
    await at(1);
    await page.evaluate(() => edAction("split"));
    await page.evaluate(() => ed.queue);
    p = await project();
    const halves = p.clips.filter((x) => x.track === "V1" && x.asset?.name === "測試片" && x.id !== "v1second").sort((a, b) => a.startFrame - b.startFrame);
    assert.deepEqual(halves.map((h) => h.transformKeys.map((k) => [k.frame, k.x])), [[[0, 0], [25, 480]], [[0, 480], [25, 960]]]);
    await at(5, "v1second");
    await inspector.getByRole("button", { name: "分離音訊" }).click();
    await page.evaluate(() => ed.queue);
    await inspector.getByRole("button", { name: "旁白時自動降低" }).click();
    await page.evaluate(() => ed.queue);
    p = await project();
    const sound = p.clips.find((x) => x.detachedFrom === "v1second");
    assert.ok(sound && sound.track === "A1" && sound.kind === "audio" && sound.asset.url === clipUrl && sound.startFrame === 100 && sound.durationFrames === 50);
    assert.ok(clipOf(p, "v1second").muted === true && clipOf(p, "v1second").duck === true);
    assert.equal(await inspector.getByRole("button", { name: "已分離到旁白軌" }).isDisabled(), true);
    for (const name of ["變形", "音訊"]) await inspector.locator(`[data-ed-group="${name}"]`).screenshot({ path: path.join(dir, `ed33-${name}.png`) });
    pass("ED.3.3：◇ 新增 → 1 個關鍵影格；第 50 格 X 輸入 1920/2 → 960；◆ 移除；分割後兩半各自的關鍵影格（中點 480）；分離音訊到 A1（同一檔、原片靜音）；旁白時自動降低開");

    // ED.3.5: speed buttons change the length (source range kept), 來源終點, volume in dB, text choices + 套用到整片,
    // 取色 next to colour fields, and no <select> left in the inspector.
    await page.evaluate((url) => {
      const p = edProject();
      p.clips.push(edTime(p, { id: "speedclip", kind: "video", track: "V2", asset: { id: "a1", url, name: "測試片", duration: 4 }, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, opacity: 1, scale: 1, x: 50, y: 50, rotation: 0, width: 25 }, { startFrame: 0, durationFrames: 100, sourceStartFrame: 0 }));
      ed.selected = "speedclip";
      edRender();
    }, clipUrl);
    assert.equal(await inspector.locator("select").count(), 0);
    await inspector.getByRole("group", { name: "播放速度" }).getByRole("button", { name: "2x" }).click();
    await page.evaluate(() => ed.queue);
    assert.deepEqual([clipOf(await project(), "speedclip").speed, clipOf(await project(), "speedclip").durationFrames], [2, 50]);
    await field("來源終點", 2);
    assert.equal(clipOf(await project(), "speedclip").durationFrames, 25);
    await field("音量（dB）", -6);
    assert.ok(Math.abs(clipOf(await project(), "speedclip").volume - Math.pow(10, -6 / 20)) < 1e-9);
    for (const name of ["播放速度", "時間"]) await inspector.locator(`[data-ed-group="${name}"]`).screenshot({ path: path.join(dir, `ed35-${name}.png`) });
    await page.evaluate(async () => {
      await edAction("subtitle-add");
      ed.time = 5;
      await edAction("subtitle-add");
    });
    const texts = () => project().then((q) => q.clips.filter((x) => x.kind === "text"));
    assert.equal(await inspector.locator("select").count(), 0);
    await inspector.getByRole("group", { name: "字型" }).getByRole("button", { name: "Arial" }).click();
    await inspector.getByRole("group", { name: "文字對齊" }).getByRole("button", { name: "靠右" }).click();
    await inspector.getByRole("group", { name: "文字動畫" }).getByRole("button", { name: "彈出" }).click();
    await field("字體大小", 72);
    await inspector.getByRole("button", { name: "套用到整片" }).click();
    await page.evaluate(() => ed.queue);
    assert.deepEqual((await texts()).map((x) => [x.font, x.align, x.animation, x.fontSize]), [["Arial", "靠右", "彈出", 72], ["Arial", "靠右", "彈出", 72]]);
    await inspector.locator('[data-ed-group="文字"]').screenshot({ path: path.join(dir, "ed35-文字.png") });
    if (await page.evaluate(() => typeof window.EyeDropper === "function")) assert.ok((await inspector.getByRole("button", { name: "取色" }).count()) >= 1);
    pass("ED.3.5：無下拉；速度 2x → 100 格變 50 格；來源終點 2 → 25 格；音量 −6 dB；字型／對齊／動畫按鈕＋字體大小 72 套用到整片兩段文字；顏色欄位旁有取色");

    // §7 C: an old project opened and saved untouched gains none of the ED.3 fields.
    const fresh = ["filterStrength", "lightLeak", "shake", "backgroundBlur", "transformKeys", "duck", "detachedFrom"];
    await page.evaluate(async () => {
      const rows = await VideoWorkbench.preferences.get("tools.editor.projects", []);
      rows.push(
        ProjectEnvelope.wrap(
          { id: "pre-ed3", title: "ED3 前的舊專案", ratio: "16:9", timebase: { num: 30, den: 1 }, assets: [], markers: [], filter: "暖色",
            tracks: [{ id: "V1", kind: "video" }, { id: "T", kind: "text" }, { id: "A1", kind: "audio" }],
            clips: [
              { id: "old1", kind: "image", track: "V1", asset: { url: "/assets/none.png", kind: "image" }, startFrame: 0, durationFrames: 60, sourceStartFrame: 0, grain: 0.2, background: "模糊" },
              { id: "old2", kind: "text", track: "T", text: "舊字", startFrame: 0, durationFrames: 30, sourceStartFrame: 0 },
            ] },
          { revision: 0 },
        ),
      );
      await VideoWorkbench.preferences.set("tools.editor.projects", rows);
    });
    await page.reload();
    await page.getByRole("button", { name: "ED3 前的舊專案 · 16:9", exact: true }).click();
    await page.waitForSelector("[data-ed-stage]");
    await page.locator("[data-ed-stage]").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("Control+s");
    await page.waitForFunction(() => /^● 已儲存 \S/.test(document.querySelector("[data-ed-saved]").textContent));
    const stored = (await page.evaluate(() => VideoWorkbench.preferences.get("tools.editor.projects", []))).find((e) => e.native.id === "pre-ed3").native,
      owners = [stored, ...stored.tracks, ...stored.clips];
    assert.deepEqual(owners.flatMap((o) => fresh.filter((k) => k in o)), [], "沒有新欄位");
    assert.equal(stored.filter, "暖色");
    pass("§7 C：舊專案開啟不動、Ctrl+S，專案／軌道／片段都沒有 ED.3 新欄位，原有濾鏡照舊");

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
