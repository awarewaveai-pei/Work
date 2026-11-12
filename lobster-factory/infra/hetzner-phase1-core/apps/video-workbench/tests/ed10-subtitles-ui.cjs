// Card ED.10 UI (docs/editor-parity-spec-20261106.md §1.3 字幕): the 驗收閘 only. 辨識 and 翻譯 show their price before the
// click; 逐句 add / edit / split / merge / delete / export SRT; 逐字高亮 burned into a real MP4 (the lit word moves right);
// 找回已完成的字幕結果; SRT import stops at the video's end; an old project's subtitles open unchanged.
// Real Edge, isolated data folder. The recognition provider is a mock whisper worker; translation is answered by a
// route mock: no paid API is called.
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vw-ed10ui-")),
    dataDir = path.join(root, "data"),
    generated = path.join(dataDir, "generated"),
    name = crypto.randomUUID() + ".mp4";
  fs.mkdirSync(generated, { recursive: true });
  const make = spawnSync(ffmpeg, ["-y", "-hide_banner", "-f", "lavfi", "-i", "color=c=blue:s=640x360:r=30:d=4", "-f", "lavfi", "-i", "sine=frequency=440:duration=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "ultrafast", "-c:a", "aac", "-shortest", path.join(generated, name)], { encoding: "utf8", windowsHide: true });
  assert.equal(make.status, 0, make.stderr);
  // Mock whisper worker: two segments in file time (one clip at 0 = timeline time); the second scores under 0.8.
  let whisperCalls = 0;
  const fetchImpl = async (url) => {
    if (!String(url).startsWith("http://whisper.test:8421/v1/transcribe")) throw Error("未預期的網路請求：" + url);
    whisperCalls++;
    const words = [["大家", 0.4, 0.8], ["好", 0.8, 1.5], ["今天", 2.5, 3.0], ["見", 3.0, 3.5]].map(([word, start, end]) => ({ word, start, end }));
    return Response.json({
      language: "chinese",
      duration: 4,
      segments: [
        { start: 0.4, end: 1.6, text: "大家好", avg_logprob: -0.1, compression_ratio: 1.2, no_speech_prob: 0.01 },
        { start: 2.4, end: 3.7, text: "今天見", avg_logprob: -1.6, compression_ratio: 1.2, no_speech_prob: 0.01 },
      ],
      words,
    });
  };
  const server = require("../server.cjs").createServer({ dataDir, env: { VW_TRANSCRIBE_WORKER_URL: "http://whisper.test:8421/", VW_TRANSCRIBE_WORKER_TOKEN: "worker-test" }, fetchImpl });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port,
    browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*", (r) => (r.request().url().startsWith(base + "/") ? r.continue() : r.abort()));
    let translateCalls = 0;
    await page.route("**/api/vw/tools/subtitles/translate", (r) => {
      translateCalls++;
      const input = JSON.parse(r.request().postData());
      r.fulfill({ json: { cues: input.cues.map((c) => ({ id: c.id, text: "EN " + c.text })) } });
    });
    await page.goto(base + "/pages/tools.html#edit");
    await page.getByRole("button", { name: "新建剪輯專案", exact: true }).waitFor();

    // 1. An old project (before ED.10: a text track without language, plain text clips) opens unchanged.
    const oldClips = [
      { id: "old1", kind: "text", track: "T", text: "舊字幕一", startFrame: 0, durationFrames: 45, sourceStartFrame: 0, fontSize: 40, color: "#ffffff", y: 85 },
      { id: "old2", kind: "text", track: "T", text: "舊字幕二", startFrame: 60, durationFrames: 30, sourceStartFrame: 0, fontSize: 40, color: "#ffffff", y: 85 },
    ];
    await page.evaluate(async (clips) => {
      const rows = await VideoWorkbench.preferences.get("tools.editor.projects", []);
      rows.push(ProjectEnvelope.wrap({ id: "pre-ed10", title: "ED10 前的舊專案", ratio: "16:9", timebase: { num: 30, den: 1 }, assets: [], markers: [], tracks: [{ id: "V1", kind: "video" }, { id: "T", kind: "text" }, { id: "A1", kind: "audio" }], clips }, { revision: 0 }));
      await VideoWorkbench.preferences.set("tools.editor.projects", rows);
    }, oldClips);
    await page.reload();
    await page.getByRole("button", { name: "ED10 前的舊專案 · 16:9", exact: true }).click();
    await page.waitForSelector("[data-ed-stage]");
    await page.locator('[data-ed-pane="字幕"]').click();
    const lib = page.locator(".editor-library");
    for (const tab of ["逐句", "樣式", "辨識翻譯", "逐句"]) await lib.getByRole("button", { name: tab, exact: true }).click();
    assert.deepEqual(await lib.getByRole("group", { name: "字幕軌" }).getByRole("button").allInnerTexts(), ["原文字軌（2）"]);
    assert.deepEqual(await lib.locator("textarea").evaluateAll((a) => a.map((x) => x.value)), ["舊字幕一", "舊字幕二"]);
    await page.locator("[data-ed-stage]").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("Control+s");
    await page.waitForFunction(() => /^● 已儲存 \S/.test(document.querySelector("[data-ed-saved]").textContent));
    const stored = (await page.evaluate(() => VideoWorkbench.preferences.get("tools.editor.projects", []))).find((e) => e.native.id === "pre-ed10").native;
    for (const want of oldClips) {
      const got = stored.clips.find((c) => c.id === want.id);
      for (const [k, v] of Object.entries(want)) assert.deepEqual(got[k], v, `${want.id}.${k}`);
      assert.deepEqual(["subtitleStyle", "words", "needsReview"].filter((k) => k in got), [], "舊片段沒有新欄位");
    }
    assert.ok(!("language" in stored.tracks.find((t) => t.id === "T")), "舊文字軌沒有 language");
    pass("舊專案：字幕分頁三頁都打開、Ctrl+S 後兩段字幕的文字／時間／樣式不變，沒有新欄位；軌名顯示「原文字軌（2）」");

    // 2. New project with one voiced clip on V1. 整片辨識: the price is on screen before anything is sent.
    await page.getByRole("button", { name: /回到/ }).click();
    await page.getByRole("button", { name: "新建剪輯專案", exact: true }).click();
    await page.getByLabel("專案名稱").fill("ED10 字幕");
    await page.getByRole("button", { name: "建立專案", exact: true }).click();
    await page.waitForSelector("[data-ed-stage]");
    await page.evaluate(async (asset) => edAdd(asset), { id: "fixture", name: "測試影片", url: "/generated/" + name, type: "video/mp4" });
    await page.locator('[data-ed-pane="字幕"]').click();
    await lib.getByRole("button", { name: "辨識翻譯", exact: true }).click();
    assert.equal(await lib.getByRole("button", { name: /^開始整片辨識/ }).count(), 0);
    await lib.getByRole("button", { name: "查看費用", exact: true }).click();
    await lib.locator("[data-ed-sub-quote]").waitFor();
    assert.match(await lib.locator("[data-ed-sub-quote]").innerText(), /1 段有聲片段，共 4 秒 · 免費/);
    assert.equal(whisperCalls, 0, "估價不送辨識");
    await lib.getByRole("button", { name: "開始整片辨識（免費）", exact: true }).click();
    await page.waitForFunction(() => edProject().tracks.some((t) => t.language === "繁體中文" && edProject().clips.filter((c) => c.track === t.id).length === 2), null, { timeout: 60000 });
    assert.equal(whisperCalls, 1);
    const cues = () => page.evaluate(() => { const t = edProject().tracks.find((x) => x.language === "繁體中文"); return edProject().clips.filter((c) => c.track === t.id).sort((a, b) => a.startFrame - b.startFrame); });
    let rows = await cues();
    assert.deepEqual(rows.map((c) => [c.text, c.start, Math.round(c.duration * 100) / 100, !!c.needsReview]), [["大家好", 0.4, 1.2, false], ["今天見", 2.4, 1.3, true]]);
    assert.deepEqual(rows[0].words.map((w) => [w.text, Math.round(w.start * 100) / 100]), [["大家", 0], ["好", 0.4]]);
    await lib.getByRole("button", { name: "逐句", exact: true }).click();
    assert.equal(await lib.locator(".ed-sub-review").count(), 1);
    pass("一鍵整片字幕：先「查看費用」顯示「1 段有聲片段，共 4 秒 · 免費」才有開始鈕，估價不送辨識；完成後成「繁體中文」軌兩句、逐字時間、分數低的一句標需校對");

    // 3. 逐句: 新增、改字、分割（逐字）、合併、刪除、匯出此軌 SRT.
    await page.evaluate(() => (ed.time = 4));
    await lib.getByRole("button", { name: "新增字幕", exact: true }).click();
    assert.deepEqual((await cues()).map((c) => c.text), ["大家好", "今天見", "新字幕"]);
    const added = (await cues())[2];
    assert.equal(added.subtitleStyle, "白字暗底", "新句跟此軌樣式");
    await lib.getByLabel("第 3 句文字").fill("加的一句");
    await lib.getByLabel("第 3 句文字").blur();
    await page.waitForFunction(() => edProject().clips.some((c) => c.text === "加的一句"));
    await lib.getByRole("button", { name: "刪除此句", exact: true }).click();
    assert.deepEqual((await cues()).map((c) => c.text), ["大家好", "今天見"]);
    await lib.getByRole("button", { name: "選取第 1 句", exact: true }).click();
    await page.evaluate(() => (ed.time = 1.0));
    await lib.getByRole("button", { name: "播放頭分割", exact: true }).click();
    rows = await cues();
    assert.deepEqual(rows.map((c) => [c.text, c.start, c.words?.map((w) => w.text)]), [["大家", 0.4, ["大家"]], ["好", 1, ["好"]], ["今天見", 2.4, ["今天", "見"]]]);
    await lib.getByRole("button", { name: "選取第 1 句", exact: true }).click();
    await lib.getByRole("button", { name: "合併下一句", exact: true }).click();
    rows = await cues();
    assert.deepEqual(rows.map((c) => [c.text, c.start, Math.round(c.duration * 100) / 100, c.words?.length]), [["大家好", 0.4, 1.2, 2], ["今天見", 2.4, 1.3, 2]]);
    await lib.getByLabel("第 2 句起點（秒）").fill("2.5");
    await lib.getByLabel("第 2 句起點（秒）").blur();
    await page.waitForFunction(() => edProject().clips.some((c) => c.text === "今天見" && c.startFrame === 75));
    const [download] = await Promise.all([page.waitForEvent("download"), lib.getByRole("button", { name: "匯出此軌 SRT", exact: true }).click()]);
    const srt = fs.readFileSync(await download.path(), "utf8");
    assert.match(srt, /00:00:00,400 --> 00:00:01,600\r?\n大家好/);
    assert.match(srt, /00:00:02,500 --> 00:00:03,700\r?\n今天見/);
    pass("逐句：新增（播放頭、跟軌樣式）、改字、刪除、播放頭分割依逐字時間切成「大家／好」、合併回「大家好」兩個字、改起點、匯出此軌 SRT 時間與文字正確");

    // 3b. The timeline's own tools (設為入點, 分割) move word times with the clip window (EditorModel.wordsWindow): a word
    // stays with the side its middle is on, rebased to that side's start, and the line becomes the words still said (so the
    // export keeps 逐字高亮). 「好」 starts at 0.6 s here: the split in 3 clamped
    // it to the cut at 1.0 s before the merge.
    const timeline = async (time, label) => {
      await page.evaluate((t) => {
        ed.selected = edProject().clips.find((c) => c.text === "大家好").id;
        ed.time = t;
        edRender();
      }, time);
      await page.getByRole("button", { name: label, exact: true }).click();
      await page.evaluate(() => ed.queue);
      const got = (await cues()).filter((c) => c.start < 2).map((c) => [c.text, c.start, c.words?.map((w) => [w.text, Math.round(w.start * 100) / 100, Math.round(w.end * 100) / 100])]);
      await page.getByRole("button", { name: "復原", exact: true }).click();
      return got;
    };
    assert.deepEqual(await timeline(0.8, "設為入點"), [["好", 0.8, [["好", 0.2, 0.7]]]]);
    assert.deepEqual(await timeline(1.0, "分割"), [["大家", 0.4, [["大家", 0, 0.4]]], ["好", 1, [["好", 0, 0.5]]]]);
    assert.deepEqual((await cues())[0].words.map((w) => w.text), ["大家", "好"], "復原後逐字時間回來");
    pass("時間軸「設為入點」0.8 秒：「大家」移除、文字改成「好」、逐字時間平移 0.4 秒；「分割」1.0 秒：前半「大家」、後半「好」，文字與逐字時間各自對上；復原還原");

    // 4. 樣式: 逐字高亮 + 字級 on the whole track, then a real MP4: the yellow lit word moves right with time.
    await lib.getByRole("button", { name: "樣式", exact: true }).click();
    await lib.getByRole("button", { name: /逐字高亮$/ }).click();
    await page.evaluate(() => {
      const el = document.querySelector('[data-ed-sub-style="fontSize"]');
      el.value = "96";
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.waitForFunction(() => edProject().clips.filter((c) => c.kind === "text").every((c) => c.subtitleStyle === "逐字高亮" && c.fontSize === 96));
    await page.evaluate(() => ed.queue);
    await page.getByRole("button", { name: "匯出", exact: true }).click();
    await page.locator('[data-ed-action="quality:720p"]').click();
    await page.locator("[data-ed-export]").click();
    await page.waitForFunction(() => document.querySelector(".job-view")?.textContent.match(/succeeded|failed/), null, { timeout: 240000 });
    const panel = page.locator(".job-view");
    assert(!(await panel.innerText()).includes("failed"), await panel.innerText());
    const file = path.join(dataDir, (await panel.locator("video").getAttribute("src")).slice(1));
    const yellow = (t) => {
      const r = spawnSync(ffmpeg, ["-v", "error", "-ss", String(t), "-i", file, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"], { maxBuffer: 16 * 1024 * 1024, windowsHide: true });
      assert.equal(r.status, 0, String(r.stderr));
      let n = 0, sx = 0;
      for (let k = 0; k < r.stdout.length; k += 3)
        if (Math.abs(r.stdout[k] - 250) + Math.abs(r.stdout[k + 1] - 204) + Math.abs(r.stdout[k + 2] - 21) < 90) n++, (sx += (k / 3) % 1280);
      return { n, x: n ? sx / n : -1 };
    };
    const first = yellow(0.6), second = yellow(1.2), none = yellow(2.0);
    assert(first.n > 50 && second.n > 50, `高亮字的黃色點數 ${first.n} / ${second.n}`);
    assert(second.x > first.x + 20, `亮的字要往右移：${first.x} → ${second.x}`);
    assert.equal(none.n, 0, "兩句之間沒有字");
    await panel.getByRole("button", { name: "關閉" }).click();
    pass(`樣式：逐字高亮＋字級 96 套到全軌；真實匯出 MP4：0.6 秒亮「大家」、1.2 秒亮「好」，黃色重心往右 ${Math.round(second.x - first.x)} px，兩句之間無字`);

    // 5. 翻譯: price on the button before the click; result = its own hidden English track with the same times.
    await lib.getByRole("button", { name: "辨識翻譯", exact: true }).click();
    const en = lib.getByRole("button", { name: /^翻譯成 English/ });
    assert.equal(await en.getAttribute("data-paid"), "video.script");
    // One snapshot: a re-render replaces the button and paid-price.js puts the price back on the next frame.
    const priced = await (await page.waitForFunction(() => {
      const el = document.querySelector('[data-ed-action="sub-translate:English"]');
      return el?.querySelector(".paid-price") && el.innerText;
    }, null, { timeout: 10000 })).jsonValue();
    assert.match(priced, / · (約 )?NT\$[\d.]+／|免費/, "翻譯鈕先顯示價格：" + priced);
    assert.match(await lib.innerText(), /2 句分 1 批送出，每批計費一次/);
    assert.equal(translateCalls, 0);
    await en.click();
    await page.waitForFunction(() => edProject().tracks.some((t) => t.language === "English"));
    const english = await page.evaluate(() => { const t = edProject().tracks.find((x) => x.language === "English"); return { hidden: t.hidden, cues: edProject().clips.filter((c) => c.track === t.id).sort((a, b) => a.startFrame - b.startFrame).map((c) => [c.text, c.startFrame, c.durationFrames]) }; });
    const zh = (await cues()).map((c) => [c.startFrame, c.durationFrames]);
    assert.equal(english.hidden, true);
    assert.deepEqual(english.cues, [["EN 大家好", ...zh[0]], ["EN 今天見", ...zh[1]]]);
    assert.equal(translateCalls, 1);
    pass(`翻譯：按鈕先顯示「${priced.replace(/^翻譯成 English/, "").trim()}」與「2 句分 1 批」；結果是獨立的 English 軌、預設隱藏、時間與來源相同`);

    // 6. 找回已完成的字幕結果: clear the Chinese track, apply the saved result again.
    await lib.getByRole("group", { name: "字幕軌" }).getByRole("button", { name: /^繁體中文/ }).click();
    await lib.getByRole("button", { name: "清空此軌", exact: true }).click();
    assert.equal((await cues()).length, 0);
    await lib.getByRole("button", { name: "找回已完成的字幕結果", exact: true }).click();
    assert.match(await lib.locator(".ed-sub-results").innerText(), /繁體中文 · 2 句（1 句需校對）/);
    await lib.locator(".ed-sub-results").getByRole("button", { name: "套用", exact: true }).click();
    await page.waitForFunction(() => edProject().clips.filter((c) => c.text === "大家好" || c.text === "今天見").length === 2);
    assert.equal(whisperCalls, 1, "找回不重新辨識");
    pass("找回已完成的字幕結果：清空後從清單套用，兩句回來，不再送辨識");

    // 7. 匯入 SRT: replaces the chosen track; a cue after the video's end (4 s) is not imported.
    const srtFile = path.join(root, "in.srt");
    fs.writeFileSync(srtFile, "1\n00:00:00,000 --> 00:00:01,000\n第一\n\n2\n00:00:02,000 --> 00:00:04,500\n第二\n\n3\n00:00:05,000 --> 00:00:06,000\n片尾後\n");
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), lib.getByRole("button", { name: "匯入 SRT／VTT", exact: true }).click()]);
    await chooser.setFiles(srtFile);
    await page.waitForFunction(() => edProject().clips.some((c) => c.text === "第一"));
    assert.deepEqual((await cues()).map((c) => [c.text, c.start, c.duration]), [["第一", 0, 1], ["第二", 2, 2]]);
    pass("匯入 SRT：取代「繁體中文」軌，影片結尾後的一句不匯入、跨過結尾的一句截在 4 秒");

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
