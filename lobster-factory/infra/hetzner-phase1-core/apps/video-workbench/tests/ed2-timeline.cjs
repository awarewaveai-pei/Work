// Card ED.2 (docs/editor-parity-spec-20261106.md §1.4 / §1.6, compare rows 14-32): toolbar, track headers, multi-select
// and group drag, 磁吸, 磁性主軌, ripple delete, clip / style clipboard, markers, zoom, J/K/L, help notes, key table,
// thumbnails, waveforms, the clip volume line, cut buttons, redo without selection, and an old project that opens and
// exports unchanged. Real Edge, isolated data dir, real uploaded media (thumb.jpg + waveform.json from media-store).
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { spawnSync } = require("node:child_process"),
  { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright"),
  ffmpeg = require("ffmpeg-static");
const pass = (m) => console.log("PASS " + m);
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-ed2-")),
    mp4 = path.join(dir, "clip.mp4");
  const made = spawnSync(
    ffmpeg,
    ["-y", "-hide_banner", "-f", "lavfi", "-i", "testsrc=s=320x180:r=30:d=4", "-f", "lavfi", "-i", "sine=frequency=440:duration=4",
      "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", mp4],
    { encoding: "utf8", windowsHide: true },
  );
  assert.equal(made.status, 0, made.stderr);
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
    const state = () =>
        page.evaluate(() => {
          const p = edProject();
          return {
            clips: p.clips.map((c) => ({ id: c.id, track: c.track, kind: c.kind, start: c.startFrame, len: c.durationFrames, filter: c.filter, fontSize: c.fontSize, volume: c.volume })),
            picked: edPicked().map((c) => c.id),
            selected: ed.selected,
          };
        }),
      on = (track) => state().then((s) => s.clips.filter((c) => c.track === track).sort((a, b) => a.start - b.start)),
      clip = (id) => page.locator(`[data-ed-clip="${id}"]`),
      tool = (name) => page.locator(".editor-toolbar").getByRole("button", { name, exact: true }),
      key = async (k) => {
        await page.locator("[data-ed-stage]").click({ position: { x: 5, y: 5 } });
        await page.keyboard.press(k);
      },
      // Drag a clip by dx pixels in small steps; shift held during the move = no snapping.
      drag = async (id, dx, { shift = false, at = 0.5, px } = {}) => {
        await clip(id).scrollIntoViewIfNeeded();
        const box = await clip(id).boundingBox(),
          x = px !== undefined ? box.x + px : box.x + box.width * at,
          y = box.y + 12;
        await page.mouse.move(x, y);
        await page.mouse.down();
        if (shift) await page.keyboard.down("Shift");
        await page.mouse.move(x + dx / 2, y, { steps: 4 });
        await page.mouse.move(x + dx, y, { steps: 4 });
        if (shift) await page.keyboard.up("Shift");
        await page.mouse.up();
      };

    await page.goto(base + "/pages/tools.html#edit");
    await page.getByRole("button", { name: "新建剪輯專案", exact: true }).click();
    await page.getByLabel("專案名稱").fill("ED2 時間軸");
    await page.getByRole("button", { name: "建立專案", exact: true }).click();
    await page.waitForSelector("[data-ed-stage]");

    // Toolbar: icon + word, shortcut in the tooltip; switches on by default; zoom 50 px/s.
    for (const name of ["復原", "重做", "分割", "刪除", "波紋刪除", "複製", "字幕", "標記", "磁吸", "磁性主軌"])
      assert.equal(await tool(name).locator(".editor-tool-icon").count(), 1, name);
    // 複製／貼上樣式 are icon-only (operator screenshot 2026-11-06); 磁吸／磁性主軌 are outlined switches.
    for (const name of ["複製樣式 (Ctrl+Shift+C)", "貼上樣式 (Ctrl+Shift+V)"]) assert.equal((await tool(name).innerText()).trim().length, 1, name);
    assert.equal(await tool("磁吸").evaluate((b) => b.classList.contains("editor-switch")), true);
    assert.equal(await tool("分割").getAttribute("title"), "在播放頭位置分割選取的片段 (S / Ctrl+B)");
    assert.equal(await tool("磁吸").getAttribute("aria-pressed"), "true");
    assert.equal(await tool("磁性主軌").getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator("[data-ed-picked]").textContent(), "已選 0");
    assert.equal(await page.locator("[data-ed-zoom-text]").textContent(), "50 px/s");
    assert.deepEqual(await page.locator("[data-ed-zoom]").evaluate((i) => [i.min, i.max]), ["10", "200"]);
    assert.deepEqual(await page.locator(".editor-track-label").allTextContents(), ["T字幕 / 文字", "◫疊加 V2", "▣主視訊 V1", "♪旁白 A1", "♪配樂 A2"]);
    assert.equal(await page.locator('[data-ed-track="V2"]').getByRole("button", { name: "上移疊加層" }).isDisabled(), true);
    assert.equal(await page.locator('[data-ed-track="V2"]').getByRole("button", { name: "下移疊加層" }).isDisabled(), true);
    assert.match(await page.locator("[data-ed-clock]").textContent(), / · 1×$/);
    assert.deepEqual((await page.locator("[data-ed-ruler] .editor-tick").allTextContents()).slice(0, 3), ["00:00.00", "00:02.00", "00:04.00"]);
    pass("工具列圖示＋文字與快捷鍵提示、磁吸／磁性主軌預設開、已選 0、縮放 50 px/s（10–200）；軌道 字幕 / 文字、疊加 V2、主視訊 V1、旁白 A1、配樂 A2；時間旁顯示 1×；時間尺有刻度");

    // Real media: uploaded once, used as video (V1 ×3, V2) and as audio (A1 ×2).
    const asset = await page.evaluate(
      async (b64) => VideoWorkbench.uploadAsset(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], "clip.mp4", { type: "video/mp4" })),
      fs.readFileSync(mp4).toString("base64"),
    );
    const sound = await page.evaluate(
      async (b64) => VideoWorkbench.uploadAsset(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], "聲音.mp4", { type: "audio/mp4" })),
      fs.readFileSync(mp4).toString("base64"),
    );
    assert.match(asset.thumbUrl, /thumb\.jpg$/);
    assert.match(asset.waveformUrl, /waveform\.json$/);
    for (let i = 0; i < 3; i++) await page.evaluate((a) => edAdd(a), asset);
    await page.evaluate((a) => edAdd(a, "overlay"), asset);
    for (let i = 0; i < 2; i++) await page.evaluate((a) => edAdd(a), sound);
    const [v1a, v1b, v1c] = await on("V1"),
      [v2] = await on("V2"),
      [a1a, a1b] = await on("A1");
    assert.deepEqual([v1a.start, v1b.start, v1c.start, a1a.start, a1b.start], [0, 120, 240, 0, 120]);
    assert.equal(await clip(v1a.id).locator("img.editor-clip-thumb").getAttribute("src"), asset.thumbUrl);
    assert.equal((await page.request.get(base + asset.thumbUrl)).status(), 200);
    await page.waitForFunction((id) => {
      const c = document.querySelector(`[data-ed-clip="${id}"] canvas[data-ed-wave]`);
      return c && c.width > 10 && c.getContext("2d").getImageData(0, 0, c.width, c.height).data.some((v, i) => i % 4 === 3 && v > 0);
    }, a1a.id);
    pass("上傳的素材：片段左側是縮圖（thumb.jpg 200），聲音片段畫出波形（waveform.json）");

    // 新增轉場效果 on each cut between touching V1 clips: opens 轉場 with the later clip selected.
    assert.equal(await page.getByRole("button", { name: /^新增轉場效果/ }).count(), 2);
    await page.getByRole("button", { name: "新增轉場效果（剪點 4.00 秒）", exact: true }).click();
    assert.equal(await page.locator('[data-ed-pane="轉場"]').getAttribute("aria-pressed"), "true");
    assert.equal((await state()).selected, v1b.id);
    assert.equal(await page.getByRole("group", { name: "轉場", exact: true }).count(), 1);
    pass("主視訊相鄰片段之間的「新增轉場效果」鈕：開轉場分頁並選取剪點後段");

    // Multi-select: Ctrl / Shift click, 已選 n, Ctrl+A, Esc; Enter on a focused clip.
    await clip(v1a.id).click();
    await clip(v1c.id).click({ modifiers: ["Control"] });
    await clip(v2.id).click({ modifiers: ["Shift"] });
    assert.equal(await page.locator("[data-ed-picked]").textContent(), "已選 3");
    await clip(v1c.id).click({ modifiers: ["Control"] });
    assert.deepEqual(new Set((await state()).picked), new Set([v1a.id, v2.id]));
    await key("Control+a");
    assert.equal(await page.locator("[data-ed-picked]").textContent(), "已選 6");
    await key("Escape");
    assert.equal(await page.locator("[data-ed-picked]").textContent(), "已選 0");
    await clip(a1b.id).focus();
    await page.keyboard.press("Enter");
    await clip(a1a.id).focus();
    await page.keyboard.press("Shift+Enter");
    assert.equal((await state()).picked.length, 2);
    await key("Escape");
    pass("Ctrl／Shift 點選加入或取消、已選 n、Ctrl+A 全選、Esc 取消、聚焦片段按 Enter／Shift+Enter 選取與加選");

    // Group drag across tracks: both move by the same amount; 磁性主軌 is skipped for a cross-track move.
    await page.evaluate(() => {
      ed.time = 0;
      edPaint();
    });
    await page.locator('[data-ed-track="T"]').getByRole("button", { name: "新增一段字幕", exact: true }).click();
    const [t1] = await on("T");
    assert.deepEqual([t1.start, t1.len], [0, 90]);
    await clip(t1.id).click();
    await clip(v2.id).click({ modifiers: ["Shift"] });
    await drag(t1.id, 100, { shift: true });
    assert.deepEqual([(await on("T"))[0].start, (await on("V2"))[0].start], [60, 60]);
    pass("跨軌多選整組拖曳 2 秒：字幕與疊加片段一起移動，相對時間不變");

    // 磁吸: a lone text clip dragged to 3.9 s snaps to the 4.00 s cut; Shift while dragging does not snap.
    await key("Escape");
    await page.evaluate(() => {
      ed.time = 0;
      edPaint();
    });
    await drag(t1.id, -150, { shift: true });
    assert.equal((await on("T"))[0].start, 0);
    await drag(t1.id, 195);
    assert.equal((await on("T"))[0].start, 120, "吸到 4.00 秒");
    await drag(t1.id, -100, { shift: true });
    await drag(t1.id, 95, { shift: true });
    assert.equal((await on("T"))[0].start, 117, "Shift 拖曳不吸附（3.9 秒＝117 格）");
    await key("n");
    assert.equal(await tool("磁吸").getAttribute("aria-pressed"), "false");
    await drag(t1.id, 4);
    await drag(t1.id, -2);
    assert.notEqual((await on("T"))[0].start, 120, "磁吸關閉不會吸到 4 秒");
    await key("n");
    pass("磁吸：拖到 3.9 秒吸到 4.00 秒剪點；按住 Shift 不吸；N 關閉後不吸、再按 N 打開");

    // 磁性主軌: deleting the middle V1 clip closes the gap; other tracks stay. Off: the gap stays.
    await clip(v1b.id).click();
    await key("Delete");
    assert.deepEqual((await on("V1")).map((c) => c.start), [0, 120]);
    assert.deepEqual((await on("A1")).map((c) => c.start), [0, 120], "其他軌不動");
    await tool("復原").click();
    await tool("磁性主軌").click();
    await clip(v1b.id).click();
    await key("Delete");
    assert.deepEqual((await on("V1")).map((c) => c.start), [0, 240]);
    // 波紋刪除 (Alt+Delete) closes the gap on its own track even with 磁性主軌 off.
    await clip(v1a.id).click();
    await key("Alt+Delete");
    assert.deepEqual((await on("V1")).map((c) => c.start), [120]);
    await clip(a1a.id).click();
    await tool("波紋刪除").click();
    assert.deepEqual((await on("A1")).map((c) => [c.id, c.start]), [[a1b.id, 0]]);
    for (let i = 0; i < 3; i++) await tool("復原").click();
    assert.deepEqual((await on("V1")).map((c) => c.start), [0, 120, 240]);
    await page.reload();
    await page.getByRole("button", { name: "ED2 時間軸 · 16:9", exact: true }).click();
    await page.waitForSelector("[data-ed-stage]");
    assert.equal(await tool("磁性主軌").getAttribute("aria-pressed"), "false", "開關重新整理後照舊");
    await tool("磁性主軌").click();
    pass("磁性主軌：刪中段後面補上、其他軌不動；關閉時留空隙；Alt+Delete／波紋刪除鈕補同軌空隙；開關重新整理後記得");

    // Codex ED.2 F2: a drag whose every step is refused (it would cover a1a) changes nothing and keeps the redo stack.
    await page.evaluate(() => edAction("marker"));
    await tool("復原").click();
    const stacks = () => page.evaluate(() => [ed.undo.length, ed.redo.length]),
      beforeRefused = await stacks();
    await drag(a1b.id, -60, { shift: true, at: 0.6 });
    assert.deepEqual((await on("A1")).map((c) => c.start), [0, 120]);
    assert.deepEqual(await stacks(), beforeRefused, "被拒的拖曳不建復原點、不清重做");
    // Codex ED.2 F4: the left trim of a text clip stops one frame before its right edge.
    const t0 = (await on("T"))[0];
    await drag(t0.id, 600, { shift: true, px: 3 });
    const trimmed = (await on("T"))[0];
    assert.deepEqual([trimmed.start + trimmed.len, trimmed.len], [t0.start + t0.len, 1], "結尾不動、最短 1 格");
    await tool("復原").click();
    pass("被拒的拖曳不動復原／重做；文字左側裁切拖過頭停在結尾前 1 格");

    // Clip clipboard: Ctrl+C / Ctrl+V at the playhead; a cross-track pair keeps its spacing.
    await clip(v2.id).click();
    await key("Control+c");
    await page.evaluate(() => {
      ed.time = 10;
      edPaint();
    });
    await key("Control+v");
    assert.deepEqual((await on("V2")).map((c) => c.start), [60, 300]);
    await tool("復原").click();
    await clip(t1.id).click();
    await clip(v2.id).click({ modifiers: ["Control"] });
    const pair = (await on("T"))[0].start - (await on("V2"))[0].start;
    await key("Control+c");
    await key("Control+v");
    const pasted = (await state()).picked;
    assert.equal(pasted.length, 2);
    const copies = (await state()).clips.filter((c) => pasted.includes(c.id));
    assert.equal(copies.find((c) => c.track === "T").start - copies.find((c) => c.track === "V2").start, pair);
    // Ctrl+D on the same pair: copies after the pair, spacing kept.
    await key("Control+d");
    assert.equal((await state()).picked.length, 2);
    for (let i = 0; i < 2; i++) await tool("復原").click();
    pass("Ctrl+C／Ctrl+V 貼在播放頭；跨軌兩段一起複製貼上與 Ctrl+D 保留彼此時間差");

    // Style clipboard: filter from one V1 clip to another (Ctrl+Shift+C / V); text style likewise.
    await clip(v1a.id).click();
    await page.locator(".editor-inspector").getByLabel("片段濾鏡").selectOption("黑白");
    await key("Control+Shift+c");
    await clip(v1c.id).click();
    await key("Control+Shift+v");
    assert.equal((await state()).clips.find((c) => c.id === v1c.id).filter, "黑白");
    await clip(t1.id).click();
    await page.locator(".editor-inspector").getByLabel("字級").fill("80");
    await page.locator(".editor-inspector").getByLabel("字級").press("Tab");
    await tool("複製樣式 (Ctrl+Shift+C)").click();
    await page.locator('[data-ed-track="T"]').getByRole("button", { name: "新增一段字幕", exact: true }).click();
    await tool("貼上樣式 (Ctrl+Shift+V)").click();
    const styled = await state();
    await tool("字幕").click();
    const viaToolbar = await state();
    assert.equal(viaToolbar.clips.find((c) => c.id === viaToolbar.selected).track, "T", "工具列 ＋字幕 加在字幕軌");
    await tool("復原").click();
    assert.equal(styled.clips.find((c) => c.id === styled.selected).fontSize, 80);
    pass("複製／貼上樣式：濾鏡從一段影片貼到另一段，字級從一段文字貼到另一段");

    // Markers: M toggles, Alt+M / Shift+M jump to the previous / next one.
    for (const t of [1, 5]) {
      await page.evaluate((s) => {
        ed.time = s;
        edPaint();
      }, t);
      await key("m");
    }
    await page.evaluate(() => {
      ed.time = 3;
      edPaint();
    });
    await key("Alt+m");
    assert.equal(await page.evaluate(() => ed.time), 1);
    await key("Shift+M");
    assert.equal(await page.evaluate(() => ed.time), 5);
    await key("m");
    assert.deepEqual(await page.evaluate(() => edProject().markers), [1]);
    pass("M 在播放頭加入／再按移除標記；Alt+M 上一個、Shift+M 下一個");

    // Arrow keys: 0.1 s, Shift 1 s.
    await page.evaluate(() => {
      ed.time = 2;
      edPaint();
    });
    await key("ArrowRight");
    await page.keyboard.press("Shift+ArrowRight");
    await page.keyboard.press("ArrowLeft");
    assert(Math.abs((await page.evaluate(() => ed.time)) - 3) < 1e-9);
    pass("←→ 0.1 秒、Shift+←→ 1 秒");

    // Zoom: − / + 15 px/s, Ctrl+= / Ctrl+- / Ctrl+0, Shift+Z fits the cut in the visible lane.
    const zoom = () => page.evaluate(() => ed.zoom);
    await page.getByRole("button", { name: "放大 (Ctrl+=)", exact: true }).click();
    assert.equal(await zoom(), 65);
    await page.getByRole("button", { name: "縮小 (Ctrl+-)", exact: true }).click();
    await page.getByRole("button", { name: "縮小 (Ctrl+-)", exact: true }).click();
    assert.equal(await zoom(), 35);
    await key("Control+0");
    assert.equal(await zoom(), 50);
    await key("Control+=");
    assert.equal(await zoom(), 65);
    await key("Control+-");
    assert.equal(await zoom(), 50);
    await key("Shift+Z");
    const fit = await page.evaluate(() => {
      const t = document.querySelector("[data-ed-timeline]"),
        head = t.querySelector(".editor-track-name").offsetWidth;
      return { zoom: ed.zoom, visible: t.clientWidth - head, total: edTotal() };
    });
    assert(fit.total * fit.zoom <= fit.visible && fit.total * (fit.zoom + 1) > fit.visible - 40, JSON.stringify(fit));
    assert.equal(await page.locator("[data-ed-zoom-text]").textContent(), fit.zoom + " px/s");
    await page.locator("[data-ed-timeline]").hover();
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -300);
    await page.keyboard.up("Control");
    assert(await zoom() > fit.zoom, "Ctrl+滾輪放大");
    await key("Control+0");
    pass("縮放：＋／− 每次 15、Ctrl+=／-／0、Shift+Z 自適應全片、Ctrl+滾輪");

    // J / K / L: forward 1× → 2× → 4×, K stops, J plays backwards (muted) with its rate next to the time.
    await page.evaluate(() => {
      ed.time = 6;
      edPaint();
    });
    await key("l");
    assert.deepEqual(await page.evaluate(() => [ed.playing, ed.rate]), [true, 1]);
    await page.keyboard.press("l");
    await page.keyboard.press("l");
    await page.keyboard.press("l");
    assert.equal(await page.evaluate(() => ed.rate), 4);
    assert.match(await page.locator("[data-ed-clock]").textContent(), / · 4×$/);
    await page.keyboard.press("k");
    assert.deepEqual(await page.evaluate(() => [ed.playing, ed.rate]), [false, 1]);
    const before = await page.evaluate(() => ed.time);
    await page.keyboard.press("j");
    await page.keyboard.press("j");
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => ed.rate), -2);
    assert.match(await page.locator("[data-ed-clock]").textContent(), / · 倒播 2×$/);
    assert(await page.evaluate((t) => ed.time < t, before), "倒播時間往回走");
    assert(await page.evaluate(() => [...document.querySelectorAll("[data-ed-layer]")].filter((m) => m.matches("video,audio")).every((m) => m.muted && m.paused)));
    await page.keyboard.press("k");
    pass("L 1×→2×→4×、K 停、J 倒播 2×（靜音），時間旁顯示倍速");

    // Help notes and the keyboard table.
    for (const [name, title] of [["查看說明：磁性時間軸與吸附", "磁性時間軸與吸附"], ["查看說明：多選與批次編輯", "多選與批次編輯"], ["查看說明：播放快捷鍵", "播放快捷鍵"]]) {
      await page.getByRole("button", { name, exact: true }).click();
      assert.equal(await page.locator("dialog[open] h3").textContent(), title);
      await page.getByRole("button", { name: "關閉說明", exact: true }).click();
    }
    await key("?");
    assert.equal(await page.locator("dialog[open] h3").textContent(), "鍵盤快捷鍵");
    assert.deepEqual(await page.locator("dialog[open] h4").allTextContents(), ["播放", "剪輯", "選取", "檢視"]);
    assert.equal(await page.locator("dialog[open] dt").count(), 26);
    await page.keyboard.press("Escape");
    pass("兩則說明（磁性時間軸、多選）與播放快捷鍵說明；? 開鍵盤快捷鍵表（四組 26 列）");

    // Clip volume line: drag down, double-click back to 0 dB, arrow up +1 dB. Each is one undo step.
    const line = clip(v1a.id).locator("[data-ed-volume]"),
      vol = () => page.evaluate((id) => edProject().clips.find((c) => c.id === id).volume, v1a.id);
    // The Ctrl+wheel zoom above scrolled the timeline sideways (the scroll is kept across renders): back to the start.
    await page.evaluate(() => (document.querySelector("[data-ed-timeline]").scrollLeft = 0));
    await line.scrollIntoViewIfNeeded();
    const lb = await line.boundingBox();
    await page.mouse.move(lb.x + 30, lb.y + 1);
    await page.mouse.down();
    await page.mouse.move(lb.x + 30, lb.y + 9, { steps: 3 });
    await page.mouse.up();
    assert(Math.abs(EditorModelDb(await vol()) + 33) < 0.6, String(await vol()));
    await clip(v1a.id).locator("[data-ed-volume]").dblclick();
    assert.equal(await vol(), 1);
    await clip(v1a.id).locator("[data-ed-volume]").focus();
    await page.keyboard.press("ArrowUp");
    assert(Math.abs(EditorModelDb(await vol()) - 1) < 1e-6);
    assert.match(await clip(v1a.id).locator("[data-ed-volume]").getAttribute("title"), /^片段音量：1\.0 dB/);
    pass("片段上的音量線：往下拖到約 −33 dB、雙擊回 0 dB、↑ 加 1 dB");

    // Track headers: + adds media to that track (picker), overlay up / down.
    await page.locator('[data-ed-track="V1"]').getByRole("button", { name: "加入素材到「主視訊 V1」", exact: true }).click();
    const picker = page.locator('[role="dialog"][aria-label="選擇素材"]');
    await picker.locator(`[data-picker-id="${asset.id}"]`).click();
    await picker.locator("[data-picker-confirm]").click();
    await page.waitForFunction(() => edProject().clips.filter((c) => c.track === "V1").length === 4);
    await page.getByRole("button", { name: "新增影片軌", exact: true }).click();
    assert.deepEqual((await page.locator(".editor-track-label").allTextContents()).slice(0, 4), ["T字幕 / 文字", "◫疊加 V3", "◫疊加 V2", "▣主視訊 V1"]);
    await page.locator('[data-ed-track="V3"]').getByRole("button", { name: "下移疊加層", exact: true }).click();
    assert.deepEqual((await page.locator(".editor-track-label").allTextContents()).slice(1, 3), ["◫疊加 V2", "◫疊加 V3"]);
    assert.deepEqual(await page.evaluate(() => edProject().tracks.filter((t) => t.kind === "video").map((t) => t.id)), ["V1", "V3", "V2"]);
    assert.equal(await page.locator('[data-ed-track="V3"]').getByRole("button", { name: "下移疊加層" }).isDisabled(), true);
    await page.locator('[data-ed-track="V3"]').getByRole("button", { name: "上移疊加層", exact: true }).click();
    assert.deepEqual(await page.evaluate(() => edProject().tracks.filter((t) => t.kind === "video").map((t) => t.id)), ["V1", "V2", "V3"]);
    pass("軌道 ＋ 從素材庫加到該軌；疊加層上移／下移改變圖層順序，到底的鍵停用");

    // Redo comes back with nothing selected; Ctrl+S saves now.
    await clip(v1a.id).click();
    await page.evaluate(() => {
      ed.time = 2;
      edPaint();
    });
    await tool("分割").click();
    await tool("復原").click();
    await key("Control+y");
    assert.deepEqual([(await state()).selected, (await state()).picked.length], [null, 0]);
    await key("Control+s");
    await page.waitForFunction(() => /^● 已儲存 \S/.test(document.querySelector("[data-ed-saved]").textContent));
    pass("重做後不保留選取；Ctrl+S 立即儲存");

    // An old project (saved before ED.2, a gap on V1, no thumbnails fields) opens with its clips where they were, a
    // non-V1 edit leaves the gap, and it still exports.
    await page.evaluate(async (a) => {
      const rows = await VideoWorkbench.preferences.get("tools.editor.projects", []);
      const { thumbUrl, waveformUrl, ...old } = a;
      rows.push(
        ProjectEnvelope.wrap(
          { id: "pre-ed2", title: "舊專案有空隙", ratio: "16:9", timebase: { num: 30, den: 1 }, assets: [old], markers: [],
            tracks: [{ id: "V1", kind: "video" }, { id: "T", kind: "text" }, { id: "A1", kind: "audio" }],
            clips: [
              { id: "o1", kind: "video", track: "V1", asset: { ...old, kind: "video", duration: 4 }, startFrame: 0, durationFrames: 60, sourceStartFrame: 0 },
              { id: "o2", kind: "video", track: "V1", asset: { ...old, kind: "video", duration: 4 }, startFrame: 90, durationFrames: 60, sourceStartFrame: 30 },
            ] },
          { revision: 0 },
        ),
      );
      await VideoWorkbench.preferences.set("tools.editor.projects", rows);
    }, asset);
    await page.reload();
    await page.getByRole("button", { name: "舊專案有空隙 · 16:9", exact: true }).click();
    await page.waitForSelector("[data-ed-stage]");
    assert.deepEqual((await on("V1")).map((c) => c.start), [0, 90]);
    assert.equal(await clip("o1").locator("img.editor-clip-thumb").getAttribute("src"), asset.thumbUrl, "舊素材從 /media/ 網址找到縮圖");
    await key("m");
    assert.deepEqual((await on("V1")).map((c) => c.start), [0, 90], "非主軌的編輯不補空隙");
    await page.locator(".editor-inspector").getByRole("group", { name: "影格率" }).getByRole("button", { name: "25 fps" }).click();
    assert.deepEqual((await on("V1")).map((c) => c.start), [0, 75], "改影格率只換算格數，不補空隙");
    await page.getByRole("button", { name: "匯出", exact: true }).click();
    await page.locator('[data-ed-action="quality:720p"]').click();
    await page.locator("[data-ed-export]").click();
    await page.waitForFunction(() => document.querySelector(".job-view")?.textContent.match(/succeeded|failed/), null, { timeout: 90000 });
    const panel = page.locator(".job-view");
    assert(!(await panel.innerText()).includes("failed"), await panel.innerText());
    const out = await panel.locator("video").getAttribute("src"),
      probe = spawnSync(ffmpeg, ["-i", path.join(dataDir, out.slice(1))], { encoding: "utf8", windowsHide: true });
    assert.match(probe.stderr, /1280x720/);
    assert.match(probe.stderr, /Duration: 00:00:05/);
    await panel.locator("[data-job-close]").click();
    pass("ED.2 前的舊專案：開啟後主軌空隙原樣、縮圖照樣出現、加標記、改影格率都不補空隙，匯出 720p 5 秒成功");

    // Codex ED.2 F1: an older clip at gain 4 (+12 dB) keeps it; ↓ on its volume line is 1 dB less, not a cut to +6 dB.
    // (Set after the export above: a +12 dB sine cannot meet the export's -16 LUFS check, which is not this card's.)
    await page.evaluate(() => {
      edProject().clips.find((c) => c.id === "o1").volume = 4;
      edRender();
    });
    const gain = () => page.evaluate(() => edProject().clips.find((c) => c.id === "o1").volume);
    await clip("o1").locator("[data-ed-volume]").focus();
    await page.keyboard.press("ArrowUp");
    assert.equal(await gain(), 4);
    await clip("o1").locator("[data-ed-volume]").focus();
    await page.keyboard.press("ArrowDown");
    assert(Math.abs(20 * Math.log10(await gain()) - (20 * Math.log10(4) - 1)) < 0.06, String(await gain()));
    // Codex ED.2 F3: turning 磁性主軌 on closes the gaps an older project already has (one undo step).
    await tool("磁性主軌").click();
    await tool("磁性主軌").click();
    assert.deepEqual((await on("V1")).map((c) => c.start), [0, 50]);
    await tool("復原").click();
    assert.deepEqual((await on("V1")).map((c) => c.start), [0, 75]);
    pass("舊專案 +12 dB 片段音量保留、↓ 只降 1 dB；打開磁性主軌時補齊舊空隙，可復原");

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
function EditorModelDb(v) {
  return 20 * Math.log10(v);
}
