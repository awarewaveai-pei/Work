// Card ED.6 (docs/editor-parity-spec-20261106.md §1.3 音訊): 六分類、目標軌、內建曲庫（曲風／排序／試聽／加入）、音訊設定
// 五項＋BPM、AI 旁白先顯示價格（不按、不送付費 API）、舊專案打開不變；有設定的專案真實匯出一次聽結果。真 Edge、隔離資料夾。
// 曲庫不依賴真檔：測試自己產生音檔放進臨時 VW_LIBRARY_DIR，清單用 page.route 換成臨時清單。共用曲庫：兩個組織都讀得到、都匯出得到，
// 白名單外的檔名與未簽身分一律 404。
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  { spawnSync } = require("node:child_process"),
  { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright"),
  ffmpeg = require("ffmpeg-static");
const pass = (m) => console.log("PASS " + m);
function ff(args) {
  const r = spawnSync(ffmpeg, ["-v", "error", "-y", ...args], { encoding: "utf8", windowsHide: true, timeout: 120000 });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout + r.stderr;
}
(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vw-ed6-")),
    dataDir = path.join(root, "data"),
    generated = path.join(dataDir, "generated"),
    video = crypto.randomUUID() + ".mp4",
    voice = crypto.randomUUID() + ".mp3";
  fs.mkdirSync(generated, { recursive: true });
  const libraryDir = path.join(root, "library"),
    sound = (name, src, sec) => {
      const file = `${name}.mp3`;
      ff(["-f", "lavfi", "-i", src, "-t", String(sec), "-c:a", "libmp3lame", "-b:a", "128k", path.join(libraryDir, file)]);
      return file;
    },
    item = (id, title, usage, sec, src, extra = {}) => ({ id, title, usage, genre: null, bpm: null, sec, vocal: "none", use: "測試", file: sound({ music: "mus", sfx: "sfx", ambience: "amb" }[usage] + "-" + id, src, sec), source: "test", license: "CC0", added: "2026-11-10", ...extra });
  fs.mkdirSync(libraryDir);
  // White noise has energy above 4 kHz (the sound the export check listens to); the narration is a 1 kHz tone.
  const catalog = {
    genres: { pop: "流行", lofi: "Lo-fi" },
    items: [
      item("m1", "測試流行", "music", 3, "sine=frequency=330", { genre: "pop", bpm: 120, added: "2026-11-01" }),
      item("m2", "測試低傳真", "music", 2, "sine=frequency=220", { genre: "lofi", bpm: 80, added: "2026-11-02" }),
      item("s1", "白噪音四秒", "sfx", 4, "anoisesrc=color=white:amplitude=0.3"),
      item("s2", "短提示", "sfx", 1, "sine=frequency=880"),
      item("s3", "中提示", "sfx", 2, "sine=frequency=660"),
    ],
  };  ff(["-f", "lavfi", "-i", "color=c=blue:s=320x180:r=30:d=6", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "ultrafast", path.join(generated, video)]);
  // Narration = a 1 kHz tone, so a 4 kHz high-pass hears only the sound effect under it.
  ff(["-f", "lavfi", "-i", "sine=frequency=1000:duration=1.5", "-c:a", "libmp3lame", path.join(generated, voice)]);
  // Codex 2026-11-13：清單換了來源再匯入，資料夾裡的檔必須換成新來源轉出的（不因「檔案已存在」留下舊聲音）；同來源重跑不重轉。
  {
    const work = path.join(root, "import"),
      originals = path.join(work, "orig"),
      folder = path.join(work, "lib"),
      list = path.join(work, "list.json"),
      run = () => spawnSync(process.execPath, [path.join(__dirname, "../scripts/import-audio-library.cjs"), "--from", originals, "--to", folder, "--list", list], { encoding: "utf8", windowsHide: true }),
      write = (source) => fs.writeFileSync(list, JSON.stringify({ genres: {}, items: [{ id: "x1", title: "測", usage: "sfx", file: "sfx-x1.mp3", source }] }));
    fs.mkdirSync(originals, { recursive: true });
    ff(["-f", "lavfi", "-i", "sine=frequency=300", "-t", "1", "-c:a", "libmp3lame", path.join(originals, "x1.mp3")]);
    write("https://example.test/a");
    assert.equal(run().status, 0);
    const first = fs.readFileSync(path.join(folder, "sfx-x1.mp3"));
    assert.doesNotMatch(run().stdout, /ADDED/, "同來源重跑不重轉");
    ff(["-f", "lavfi", "-i", "sine=frequency=900", "-t", "2", "-c:a", "libmp3lame", path.join(originals, "x1.mp3")]);
    write("https://example.test/b");
    assert.match(run().stdout, /ADDED sfx-x1\.mp3/);
    assert(!fs.readFileSync(path.join(folder, "sfx-x1.mp3")).equals(first), "換來源後是新檔");
    assert.equal(JSON.parse(fs.readFileSync(list, "utf8")).items[0].sec, 2);
    pass("匯入腳本：同來源重跑不重轉；清單換來源後重新匯入＝換成新檔並重量長度");
  }
  // The AI 旁白 row needs a key to be selectable; the test never presses 產生旁白 (any POST /generations fails the test).
  const server = require("../server.cjs").createServer({ dataDir, env: { GEMINI_API_KEY: "ed6-test-never-sent", VW_LIBRARY_DIR: libraryDir } });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port,
    browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
      errors = [],
      paid = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => r.method() === "POST" && /\/generations(\/quote)?$/.test(r.url()) && !/editor-export/.test(r.postData() || "") && paid.push(r.postData()));
    await page.route("**/*", (r) =>
      r.request().url() === base + "/assets/audio-library.json"
        ? r.fulfill({ contentType: "application/json", body: JSON.stringify(catalog) })
        : r.request().url().startsWith(base + "/")
          ? r.continue()
          : r.abort(),
    );
    await page.goto(base + "/pages/tools.html#edit");
    await page.getByRole("button", { name: "新建剪輯專案", exact: true }).click();
    await page.getByLabel("專案名稱").fill("ED6 音訊");
    await page.getByRole("button", { name: "建立專案", exact: true }).click();
    await page.waitForSelector("[data-ed-stage]");
    const asset = { id: "fixture", name: "鏡頭", url: "/generated/" + video, type: "video/mp4" };
    await page.evaluate(async (a) => {
      await edAdd(a);
      await edAdd(a);
    }, asset);
    const project = () => page.evaluate(() => JSON.parse(JSON.stringify(edNative(edProject()))));

    // 舊專案（沒有 audioSettings）打開音訊分頁、逛遍每個分類，不改專案
    const untouched = await project();
    await page.locator('[data-ed-pane="音訊"]').click();
    const lib = page.locator(".editor-library");
    await lib.locator("[data-ed-aud-item], .ed-aud-empty").first().waitFor();
    assert.deepEqual(await lib.locator(".ed-aud-cats button").allInnerTexts(), ["配樂", "音效", "台詞旁白", "環境音", "未分類", "AI 旁白"]);
    for (const cat of ["音效", "台詞旁白", "環境音", "未分類", "AI 旁白", "配樂"]) await lib.locator(".ed-aud-cats").getByRole("button", { name: cat, exact: true }).click();
    assert.deepEqual(await project(), untouched);
    pass("六分類都點過；沒有音訊設定的舊專案打開音訊分頁不會被改");

    // 目標軌：配樂類預設 配樂 A2，台詞旁白預設 旁白 A1，可手動切換
    const target = lib.getByRole("group", { name: "目標軌" }),
      pressed = async () => (await target.locator('[aria-pressed="true"]').innerText()).trim();
    assert.equal(await pressed(), "配樂 A2");
    await lib.locator(".ed-aud-cats").getByRole("button", { name: "台詞旁白", exact: true }).click();
    assert.equal(await pressed(), "旁白 A1");
    await target.getByRole("button", { name: "配樂 A2", exact: true }).click();
    assert.equal(await pressed(), "配樂 A2");
    pass("目標軌：依分類預設，可在 配樂 A2／旁白 A1 間切換");

    // 內建曲庫：配樂沒有內建曲時顯示空狀態與上傳；音效有清單、排序、試聽、加入
    const music = catalog.items.filter((x) => x.usage === "music"),
      sfx = catalog.items.filter((x) => x.usage === "sfx");
    await lib.locator(".ed-aud-cats").getByRole("button", { name: "配樂", exact: true }).click();
    assert.equal(await lib.locator("[data-ed-aud-item]").count(), 2);
    assert.match(await lib.locator('[data-ed-aud-item="m1"]').innerText(), /流行 · 120 BPM · 0:03 · 純音樂 · 使用 0 次/);
    const genres = lib.getByRole("group", { name: "曲風" });
    await genres.getByRole("button", { name: "Lo-fi 1", exact: true }).click();
    assert.deepEqual(await lib.locator("[data-ed-aud-item]").evaluateAll((els) => els.map((e) => e.dataset.edAudItem)), ["m2"]);
    await genres.getByRole("button", { name: "全部 2", exact: true }).click();
    await lib.getByRole("group", { name: "排序" }).getByRole("button", { name: "最新", exact: true }).click();
    assert.deepEqual(await lib.locator("[data-ed-aud-item]").evaluateAll((els) => els.map((e) => e.dataset.edAudItem)), ["m2", "m1"]);
    assert.equal(await lib.getByRole("button", { name: "上傳自己的音樂", exact: true }).count(), 1, "上傳自己的音樂入口保留");
    await lib.locator(".ed-aud-cats").getByRole("button", { name: "環境音", exact: true }).click();
    assert.match(await lib.locator(".ed-aud-empty").innerText(), /還沒有曲子/);
    await lib.locator(".ed-aud-cats").getByRole("button", { name: "音效", exact: true }).click();
    assert.equal(await lib.locator("[data-ed-aud-item]").count(), sfx.length);
    const sorts = lib.getByRole("group", { name: "排序" });
    await sorts.getByRole("button", { name: "最短", exact: true }).click();
    const ids = await lib.locator("[data-ed-aud-item]").evaluateAll((els) => els.map((e) => e.dataset.edAudItem));
    assert.deepEqual(ids, [...sfx].sort((a, b) => a.sec - b.sec).map((x) => x.id));
    await sorts.getByRole("button", { name: "名稱", exact: true }).click();
    const play = lib.getByRole("button", { name: "試聽 " + sfx[0].title, exact: true });
    await play.click();
    assert.equal(await lib.getByRole("button", { name: "停止試聽 " + sfx[0].title, exact: true }).getAttribute("aria-pressed"), "true");
    await lib.getByRole("button", { name: "停止試聽 " + sfx[0].title, exact: true }).click();
    pass("內建曲庫：配樂曲風篩選（附數量）、排序最新／最短、每首曲風 BPM 長度人聲次數、上傳入口；環境音空狀態；試聽可開關");

    // 音訊設定：對齊切點、旁白時降低、循環、整體音量、響度、建議 BPM
    const loopItem = catalog.items.find((x) => x.id === "s1");
    await lib.getByRole("button", { name: "新增音訊對齊最近切點", exact: true }).click();
    await lib.getByRole("button", { name: "旁白時配樂降低 12 dB", exact: true }).click();
    await page.evaluate(() => (ed.time = 0.3));
    await lib.getByRole("button", { name: `加入「${loopItem.title}」`, exact: true }).click();
    await page.waitForFunction((url) => edProject().clips.some((c) => c.asset?.url === url), "/library/" + loopItem.file);
    let p = await project();
    const added = p.clips.find((c) => c.asset?.url === "/library/" + loopItem.file && !c.loopOf);
    assert.equal(added.track, "A2");
    assert.equal(added.startFrame, 0, "0.3 秒對齊到最近切點 0");
    assert.equal(added.duck, true);
    assert(p.assets.some((a) => a.id === "builtin-" + loopItem.id));
    assert(await page.evaluate((id) => VideoWorkbench.assets.list().then((rows) => rows.some((a) => a.id === id && a.tags.includes("sfx"))), "builtin-" + loopItem.id), "內建曲存進素材庫並帶用途標籤");
    // Codex 2026-11-10：加入期間專案已切走＝沒有加入，也不存進素材庫
    assert.equal(await page.evaluate(async (it) => {
      const other = { ...edProject(), id: "not-open" };
      await edAudAddBuiltin(other, it);
      return (await VideoWorkbench.assets.list()).some((a) => a.id === "builtin-" + it.id);
    }, catalog.items.find((x) => x.id === "s2")), false);
    await lib.getByRole("button", { name: "循環延伸至影片結尾", exact: true }).click();
    p = await project();
    const a2 = p.clips.filter((c) => c.track === "A2").sort((x, y) => x.startFrame - y.startFrame),
      mainEnd = Math.max(...p.clips.filter((c) => c.track === "V1").map((c) => c.startFrame + c.durationFrames));
    assert(a2.length >= 2 && a2.slice(1).every((c) => c.loopOf === added.id), "循環複本");
    assert.equal(a2.at(-1).startFrame + a2.at(-1).durationFrames, mainEnd, "延伸到主視訊結尾");
    // 整體音量（目標軌 A2）
    const vol = lib.getByLabel(/^整體音量/);
    await vol.fill("-6");
    await vol.press("Enter");
    p = await project();
    assert(Math.abs(p.tracks.find((t) => t.id === "A2").volume - Math.pow(10, -6 / 20)) < 0.01);
    await lib.getByRole("group", { name: "響度目標" }).getByRole("button", { name: "-16 LUFS", exact: true }).click();
    assert.equal((await project()).output.loudness, -16);
    assert.match(await lib.locator("[data-ed-aud-bpm]").innerText(), /約 80（鏡頭中位長度 6\.0 秒）/);
    pass("音訊設定：對齊切點（0.3→0 s）、旁白時降低（duck）、循環延伸到主視訊結尾、整體音量 −6 dB、響度 −16、建議 BPM 80");

    // 台詞旁白／未分類：用途標籤決定分類；未分類可歸類；＋加到旁白 A1
    await page.evaluate(async (url) => {
      await VideoWorkbench.assets.save({ id: "vo-1", name: "我的旁白", url, kind: "audio", type: "audio/mpeg", tags: ["dialogue"] });
      await VideoWorkbench.assets.save({ id: "raw-1", name: "未命名音檔", url, kind: "audio", type: "audio/mpeg", tags: [] });
    }, "/generated/" + voice);
    await lib.locator(".ed-aud-cats").getByRole("button", { name: "未分類", exact: true }).click();
    await page.evaluate(() => edAudLoad());
    await lib.getByRole("group", { name: "歸類 未命名音檔" }).getByRole("button", { name: "音效", exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('[aria-label="歸類 未命名音檔"]'));
    await lib.locator(".ed-aud-cats").getByRole("button", { name: "台詞旁白", exact: true }).click();
    await page.evaluate(() => (ed.time = 1));
    await lib.getByRole("button", { name: "加入「我的旁白」", exact: true }).click();
    // 對齊切點仍開著：1 s 對齊到最近的切點 0
    await page.waitForFunction(() => edProject().clips.some((c) => c.asset?.id === "vo-1"));
    p = await project();
    const vo = p.clips.find((c) => c.asset?.id === "vo-1");
    assert.equal(vo.track, "A1");
    assert.equal(vo.startFrame, 0);
    assert.equal(vo.duck, undefined);
    pass("台詞旁白依標籤列出、＋加到旁白 A1（1 s 對齊到切點 0）、不帶降低；未分類歸類為音效後離開未分類");

    // AI 旁白：按下前就顯示價格（或免費）；不按
    await lib.locator(".ed-aud-cats").getByRole("button", { name: "AI 旁白", exact: true }).click();
    await lib.getByLabel("旁白內容").fill("這是一段測試旁白");
    await lib.getByLabel("聲音描述").fill("溫暖");
    for (const [label, v] of [["語速（%）", "120"], ["音高（半音）", "2"], ["音量（%）", "80"]]) await lib.getByLabel(label).fill(v);
    const go = lib.locator('[data-ed-action="aud-vo-generate"]');
    await page.waitForFunction(() => /NT\$|免費/.test(document.querySelector('[data-ed-action="aud-vo-generate"]')?.textContent || ""));
    const price = (await go.innerText()).trim();
    assert.match(price, /^產生旁白 · (免費|約 NT\$[\d.,]+／分鐘|NT\$[\d.,]+／千字)$/);
    assert.equal(await lib.getByRole("group", { name: "配音服務" }).locator('[aria-pressed="true"]').count(), 1);
    pass(`AI 旁白：文字、聲音描述、語速、音高、音量；按下前顯示「${price}」（未按）`);

    // 真實匯出：降低與循環聽得到
    await page.getByRole("button", { name: "匯出", exact: true }).click();
    await page.locator('[data-ed-action="quality:720p"]').click();
    await page.locator("[data-ed-export]").click();
    await page.waitForFunction(() => document.querySelector(".job-view")?.textContent.match(/succeeded|failed/), null, { timeout: 240000 });
    const panel = page.locator(".job-view");
    assert(!(await panel.innerText()).includes("failed"), await panel.innerText());
    const file = path.join(dataDir, (await panel.locator("video").getAttribute("src")).slice(1));
    // 4 kHz high-pass = the sound effect only (the narration is a 1 kHz tone). Same source offset: original under narration
    // (0–1.5 s on the timeline) vs. its first loop copy (no narration there).
    const rms = (from, len) => Number(/RMS level dB:\s*(-?[\d.]+|-inf)/.exec(ff(["-v", "info", "-ss", String(from), "-t", String(len), "-i", file, "-af", "highpass=f=4000,astats=metadata=0:measure_overall=RMS_level:measure_perchannel=none", "-f", "null", "-"]))[1]);
    const copy = a2[1].startFrame / 30,
      offset = 0.4,
      len = 0.7,
      under = rms(offset, len),
      free = rms(copy + offset, len),
      tail = rms(mainEnd / 30 - 0.6, 0.4);
    assert(free - under >= 9 && free - under <= 15, JSON.stringify({ under, free }));
    assert(tail > -70, "循環複本在結尾仍有聲音 " + tail);
    pass(`真實匯出：同一段音效在旁白下 ${under} dB、循環複本 ${free} dB（低 ${(free - under).toFixed(1)} dB）；結尾 ${tail} dB 有聲`);
    // Codex 2026-11-10 四項：循環開著再加配樂不留空隙；影片變長後「重新延伸到結尾」；縮短的最後一段只留範圍內的音量關鍵影格；
    // 超過匯出上限（非文字 64 段）整個不套用。
    const a2rows = async () => (await project()).clips.filter((c) => c.track === "A2").sort((x, y) => x.startFrame - y.startFrame);
    await panel.locator("button").filter({ hasText: "關閉" }).click();
    await page.evaluate(() => (ed.selected = null));
    await lib.locator(".ed-aud-cats").getByRole("button", { name: "音效", exact: true }).click();
    await target.getByRole("button", { name: "配樂 A2", exact: true }).click();
    await page.evaluate(() => (ed.time = 2));
    await lib.getByRole("button", { name: "加入「中提示」", exact: true }).click();
    await page.waitForFunction((url) => edProject().clips.some((c) => c.asset?.url === url && !c.loopOf), "/library/" + catalog.items.find((x) => x.id === "s3").file);
    let rows = await a2rows();
    assert.equal(rows[1].startFrame, 120, "新配樂接在原配樂後，不被舊複本擠到片尾");
    rows.reduce((end, c) => (assert.equal(c.startFrame, end, "配樂軌沒有空隙"), c.startFrame + c.durationFrames), 0);
    assert.equal(rows.at(-1).startFrame + rows.at(-1).durationFrames, mainEnd);
    await page.getByRole("button", { name: "復原", exact: true }).click();
    assert.deepEqual((await a2rows()).map((c) => c.startFrame), a2.map((c) => c.startFrame));
    await page.evaluate(async () => {
      const c = edProject().clips.find((x) => x.track === "A2" && !x.loopOf);
      c.volumeKeys = [{ frame: 110, gain: 0.5 }];
      await edSave();
    });
    await page.evaluate(async (a) => edAdd(a), asset);
    await page.locator('[data-ed-pane="音訊"]').click();
    await lib.getByRole("button", { name: "重新延伸到結尾", exact: true }).click();
    rows = await a2rows();
    assert.equal(rows.at(-1).startFrame + rows.at(-1).durationFrames, 540, "延伸到新的結尾 18 s");
    assert.equal(rows.at(-1).durationFrames, 60);
    assert.equal(rows.at(-1).volumeKeys, undefined, "縮短的最後一段不帶範圍外的關鍵影格");
    assert.deepEqual(rows[1].volumeKeys, [{ frame: 110, gain: 0.5 }]);
    assert.equal(await lib.getByRole("button", { name: "重新延伸到結尾", exact: true }).count(), 0);
    const before = await project();
    await page.evaluate(async () => {
      const c = edProject().clips.find((x) => x.track === "A2" && !x.loopOf);
      delete c.volumeKeys;
      edTime(edProject(), c, { durationFrames: 6 });
      edProject().clips = edProject().clips.filter((x) => !x.loopOf);
      await edSave();
      edRender();
    });
    const short = await project();
    await page.locator('[data-ed-pane="音訊"]').click();
    await lib.getByRole("button", { name: "重新延伸到結尾", exact: true }).click();
    await page.waitForTimeout(300);
    assert.deepEqual(await project(), short, "超過 64 段：不套用、不改專案");
    assert.match(await page.locator("body").innerText(), /超過匯出上限/);
    assert(before.clips.length > short.clips.length);
    pass("循環：加配樂不留空隙、影片變長後重新延伸、縮短段只留範圍內關鍵影格、超過 64 段整個不套用並說明");
    // 共用曲庫：正式站模式（簽章身分、每個組織各自的資料夾）下，兩個組織都讀得到同一個 /library/ 檔、都匯出得到；
    // 白名單外的檔名、不存在的檔、未簽身分、非 GET／HEAD 一律 404。
    {
      const http = require("node:http"),
        { sign } = require("../backend/session-signature.cjs"),
        TOKEN = "ed6-internal",
        orgs = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"],
        proxy = require("../server.cjs").createServer({ dataDir: path.join(root, "proxy"), env: { VW_TRUST_PROXY_IDENTITY: "1", VW_INTERNAL_TOKEN: TOKEN, VW_ALLOWED_HOSTS: "127.0.0.1:*", VW_LIBRARY_DIR: libraryDir } });
      await new Promise((r) => proxy.listen(0, "127.0.0.1", r));
      const port = proxy.address().port,
        as = (org) => {
          const f = { userId: "u-" + org.slice(0, 4), orgId: org, billingOrgId: "", userKind: "member", role: "owner", expires: String(Math.floor(Date.now() / 1000) + 600) };
          return { "X-VW-User-Id": f.userId, "X-VW-Org-Id": f.orgId, "X-VW-Billing-Org-Id": "", "X-VW-User-Kind": f.userKind, "X-VW-Role": f.role, "X-VW-Expires": f.expires, "X-VW-Signature": sign(TOKEN, f) };
        },
        call = (method, url, headers = {}, body) =>
          new Promise((resolve, reject) => {
            const req = http.request({ host: "127.0.0.1", port, method, path: url, headers }, (res) => {
              const chunks = [];
              res.on("data", (c) => chunks.push(c));
              res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
            });
            req.on("error", reject);
            req.end(body);
          });
      try {
        const url = "/library/" + loopItem.file,
          bytes = fs.readFileSync(path.join(libraryDir, loopItem.file)),
          mp4 = fs.readFileSync(path.join(generated, video));
        fs.writeFileSync(path.join(libraryDir, "notes.txt"), "x");
        for (const org of orgs) {
          const got = await call("GET", url, as(org));
          assert.equal(got.status, 200, "組織 " + org.slice(0, 4) + " 讀共用曲庫");
          assert(got.body.equals(bytes));
          assert.equal((await call("HEAD", url, as(org))).status, 200);
        }
        for (const [method, u, h] of [["GET", url, {}], ["POST", url, as(orgs[0])], ["GET", "/library/notes.txt", as(orgs[0])], ["GET", "/library/sfx-missing.mp3", as(orgs[0])], ["GET", "/library/..%2Fdata%2Fstate.json", as(orgs[0])]])
          assert.equal((await call(method, u, h)).status, 404, `${method} ${u} 應 404`);
        // Each org exports its own uploaded video with the shared library sound under it.
        for (const org of orgs) {
          const up = await call("POST", "/api/vw/uploads", { ...as(org), "Content-Type": "application/json" }, JSON.stringify({ data: "data:video/mp4;base64," + mp4.toString("base64"), name: "v.mp4" }));
          assert.equal(up.status, 201, up.body.toString());
          const v = JSON.parse(up.body).url,
            project = { id: "p-" + org.slice(0, 4), ratio: "16:9", timebase: { num: 30, den: 1 }, output: { loudness: -16 }, clips: [
              { id: "v", kind: "video", track: "V1", asset: { url: v }, startFrame: 0, durationFrames: 90, volume: 0 },
              { id: "a", kind: "audio", track: "A2", asset: { url }, startFrame: 0, durationFrames: 90 },
            ] };
          const made = await call("POST", "/api/vw/generations", { ...as(org), "Content-Type": "application/json" }, JSON.stringify({ type: "video", operation: "editor-export", prompt: "ED6", settings: { project, quality: "720p" } }));
          assert(made.status < 300, made.body.toString());
          let job = JSON.parse(made.body);
          for (let i = 0; i < 240 && !["succeeded", "failed"].includes(job.status); i++) {
            await new Promise((r) => setTimeout(r, 500));
            job = JSON.parse((await call("GET", "/api/vw/generations/" + job.id, as(org))).body);
          }
          assert.equal(job.status, "succeeded", JSON.stringify(job.error || job));
          const out = await call("GET", job.result.url, as(org));
          assert.equal(out.status, 200);
          const log = ff(["-v", "info", "-i", path.join(root, "proxy", "orgs", org, job.result.url.slice(1)), "-af", "highpass=f=4000,astats=metadata=0:measure_overall=RMS_level:measure_perchannel=none", "-f", "null", "-"]);
          assert(Number(/RMS level dB:\s*(-?[\d.]+)/.exec(log)[1]) > -60, "匯出有共用曲庫的聲音");
        }
      } finally {
        proxy.closeAllConnections();
        await new Promise((r) => proxy.close(r));
      }
      pass("共用曲庫：兩個組織都讀得到同一個 /library/ 檔並匯出有聲；未簽、POST、白名單外、不存在、路徑跳脫都 404");
    }
    assert.deepEqual(paid, [], "沒有送出付費請求");
    assert.deepEqual(errors, []);
    console.log("EVIDENCE " + root);
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
