const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), os = require("node:os"), { spawnSync } = require("node:child_process");
const { chromium } = require("playwright");
const evidence = fs.mkdtempSync(path.join(os.tmpdir(), "seedstar-generate-parity-"));
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jTioAAAAASUVORK5CYII=", "base64");
(async () => {
  const providerCalls = [];
  const server = require("../server.cjs").createServer({ dataDir: path.join(evidence, "data"), env: { OPENAI_API_KEY: "test-only", SEEDSTAR_VIDEO_MODEL: "configured-video" }, fetchImpl: async (url, options) => {
    providerCalls.push({ url, body: options.body });
    if (url.endsWith("/videos")) return Response.json({ id: "fixture-video", status: "queued" });
    if (url.endsWith("/images/generations")) return Response.json({ data: [{ b64_json: png.toString("base64") }] });
    throw Error("Unexpected provider call: " + url);
  } });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [], submissions = [];
    p.on("pageerror", (e) => errors.push(e.message));
    p.setDefaultTimeout(7000);
    await p.route("**/*", (r) => r.request().url().startsWith(base + "/") ? r.continue() : r.abort());
    await p.goto(base);
    await p.waitForFunction(() => window.SeedStar?.generator?.controlsReady);
    await p.locator("[data-mode=reference]").click();
    assert.match(await p.locator("#modelBtn").innerText(), /configured-video/);
    await p.locator("#prompt").fill("測試海邊影片");
    await p.locator("[data-panel=settings]").first().click();
    assert(await p.locator('[data-ratio="1:1"]').isDisabled());
    await p.locator('[data-ratio="9:16"]').click();
    await p.locator("[data-gen-duration='12']").click();
    await p.locator("[data-panel=presets]").click();
    await p.locator("#generatorPresetName").fill("直橫雙比例");
    await p.locator("[data-gen-preset-save]").click();
    await p.getByRole("button", { name: "設為預設", exact: true }).click();
    await p.locator("#closeModal").click();
    await p.reload();
    await p.waitForFunction(() => SeedStar.generator.controlsReady);
    await p.locator("[data-mode=reference]").click();
    assert.match(await p.locator("#outputBtn").innerText(), /16:9、9:16.*12s/);
    console.log("PASS 儲存設定與預設跨重新整理生效；多比例、支援時長、服務端模型");

    {
      const chooser = p.waitForEvent("filechooser");
      await p.locator('[data-upload="images"]').click();
      await (await chooser).setFiles({ name: "我的參考圖.png", mimeType: "image/png", buffer: png });
    }
    await p.locator(".reference-selected").waitFor();
    await p.locator("#prompt").fill("以這個角色拍片");
    await p.locator('[data-action="mention"]').click();
    await p.getByRole("button", { name: /@image1 · 我的參考圖/ }).click();
    assert.match(await p.locator("#prompt").inputValue(), /@image1/);
    console.log("PASS @ 引用選擇實際素材");

    await p.route("**/api/seedstar/generations", async (r) => {
      const body = r.request().postDataJSON(); submissions.push(body);
      if (body.operation === "separate") return r.continue();
      if (body.settings?.ratio === "9:16") return r.fulfill({ status: 503, json: { error: { message: "測試：直式暫時不可用" } } });
      return r.fulfill({ json: { id: "mock-" + submissions.length, type: "video", status: "queued", progress: 0 } });
    });
    await p.locator("#send").click();
    await p.getByRole("heading", { name: "多比例生成任務" }).waitFor();
    assert.equal(submissions.length, 2);
    assert.deepEqual(submissions.map((r) => r.settings.ratio), ["16:9", "9:16"]);
    assert.match(await p.locator("#modalContent").innerText(), /直式暫時不可用/);
    await p.screenshot({ path: path.join(evidence, "batch-result.png") });
    await p.locator("#closeModal").click();
    console.log("PASS 多比例逐項送出，部分失敗可見且不重送成功項");

    await p.locator("[data-mode=reshoot]").click();
    assert.equal(await p.locator('[data-upload="source"]').count(), 2);
    assert.match(await p.locator("#content").innerText(), /0 \/ 28/);
    assert(!/818|朝向電影/.test(await p.locator("#content").innerText()));
    await p.screenshot({ path: path.join(evidence, "reshoot.png") });
    await p.locator("[data-mode=product]").click();
    await p.locator("#manualProductName").fill("真實商品");
    await p.locator("#manualProductDescription").fill("手動輸入的商品資料");
    await p.locator('[data-action="product-manual"]').click();
    assert.equal(await p.locator(".product-image-choice").count(), 0);
    assert.equal(await p.locator("#content select").count(), 0);
    await p.locator('[data-gen-product-choice="target"][data-value="促進購買"]').click();
    assert.equal(await p.locator('[data-gen-product-choice="target"][data-value="促進購買"]').getAttribute("aria-pressed"), "true");
    console.log("PASS 拍片來源與素材欄位；商品不再顯示假圖，選項可見且重繪保留");
    await p.evaluate(async () => {
      await SeedStar.preferences.set("workspace.skills", [{ id: "hidden-skill", name: "先前技能", prompt: "HIDDEN_SKILL_MARKER" }]);
      const draft = SeedStar.generator.getDraft();
      draft.mode = "product"; draft.skill = "先前技能"; draft.productStep = 3;
      draft.ratio = "16:9"; draft.ratios = ["16:9", "9:16"];
      draft.productScripts = [{ time: "0–8秒", text: "商品實測腳本" }];
      SeedStar.generator.setDraft(draft);
    });
    await p.locator('[data-action="product-submit"]').click();
    await p.getByRole("heading", { name: "多比例生成任務" }).waitFor();
    assert(await p.locator('.product-script [data-panel="skill"]').isVisible());
    assert(submissions.at(-1).prompt.includes("HIDDEN_SKILL_MARKER"));
    await p.locator("#closeModal").click();
    assert(await p.evaluate(() => {
      const data = new DataTransfer(); data.setData("text/plain", "文字拖放");
      return document.querySelector(".board").dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }));
    }));
    console.log("PASS 商品顯示已選技能並實際套用，文字拖放不會被當成檔案攔截");

    await p.locator("[data-mode=cartoon]").click();
    await p.locator("[data-panel=settings]").first().click();
    await p.locator('[data-ratio="9:16"]').click();
    await p.locator("[data-panel=settings]").first().click();
    await p.locator("#prompt").fill("小貓散步");
    assert(await p.locator("#send").isDisabled());
    await p.locator("[data-style='1']").click();
    await p.locator("#send").click();
    await p.getByRole("heading", { name: "多比例生成任務" }).waitFor();
    assert.equal(submissions.at(-1).type, "cartoon");
    assert.match(submissions.at(-1).settings.model, /configured-video/);
    await p.locator("#closeModal").click();
    console.log("PASS 卡通風格必選，送出影片設定");

    const source = path.join(evidence, "source.mp4");
    const ff = spawnSync(require("ffmpeg-static"), ["-y", "-f", "lavfi", "-i", "color=c=blue:s=160x90:d=0.6", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.6", "-c:v", "libx264", "-c:a", "aac", "-shortest", source], { windowsHide: true });
    assert.equal(ff.status, 0, ff.stderr?.toString());
    await p.locator("[data-mode=reference]").click();
    await p.locator("[data-gen-extract]").click();
    await p.locator("[data-picker-upload]").setInputFiles(source);
    await p.locator("[data-picker-id].selected").filter({ hasText: "source.mp4" }).waitFor();
    await p.locator("[data-picker-confirm]").click();
    await p.getByRole("button", { name: "加入參考音訊" }).waitFor();
    await p.getByRole("button", { name: "加入參考音訊" }).click();
    const extracted = await p.evaluate(() => SeedStar.generator.getDraft().refs.reference.audios[0]);
    assert.match(extracted.url, /\.mp3$/);
    assert.equal((await p.request.get(base + extracted.url)).status(), 200);
    await p.screenshot({ path: path.join(evidence, "reference.png") });
    await p.setViewportSize({ width: 390, height: 844 });
    await p.screenshot({ path: path.join(evidence, "reference-mobile.png"), fullPage: true });
    assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    console.log("PASS 從影片擷取真實 MP3 並套用，手機版無橫向溢出");
    await p.evaluate(() => {
      const draft = SeedStar.generator.getDraft();
      draft.refType = "first"; draft.refs.reference.firstFrame = draft.refs.reference.images.slice(0, 1);
      draft.refs.reference.audios = []; draft.refs.reference.lastFrame = [];
      draft.refs.reference.videos = [{ name: "隱藏的全能參考影片", type: "video/mp4", url: "/generated/hidden.mp4" }];
      SeedStar.generator.setDraft(draft);
    });
    await p.locator("#send").click();
    await p.getByRole("heading", { name: "多比例生成任務" }).waitFor();
    assert.deepEqual(Object.keys(submissions.at(-1).references), ["firstFrame"]);
    await p.locator("#closeModal").click();
    console.log("PASS 切換參考模式只送出可見欄位，隱藏的影片不混入請求");
    await p.setViewportSize({ width: 1440, height: 1000 });
    await p.locator("[data-mode=image]").click();
    await p.locator("[data-panel=settings]").first().click();
    await p.locator('[data-ratio="1:1"]').click();
    await p.locator("[data-mode=reference]").click();
    assert(!(await p.evaluate(() => SeedStar.generator.getDraft().ratios)).includes("1:1"));
    await p.evaluate(() => {
      const draft = SeedStar.generator.getDraft();
      draft.mode = "director"; draft.directorStage = "script"; draft.directorScript = "六圖分鏡測試";
      draft.refs.director.images = Array.from({ length: 6 }, (_, i) => ({ id: "r" + i, name: "參考" + i, url: "/assets/test-image-1.png", type: "image/png" }));
      SeedStar.generator.setDraft(draft);
    });
    await p.locator("[data-action=director-storyboard]").click();
    assert.equal(await p.locator("[data-storyboard-reference]").count(), 6);
    assert.equal(await p.locator("[data-storyboard-reference]:checked").count(), 4);
    await p.locator("[data-storyboard-reference='5']").check();
    const submissionsBefore = submissions.length;
    await p.locator("[data-action=director-confirm-storyboard]").click();
    assert.equal(submissions.length, submissionsBefore);
    assert.match(await p.locator("#service-error").innerText(), /最多使用 4/);
    await p.locator("#service-error button").click();
    await p.locator("[data-storyboard-reference='0']").uncheck();
    await p.locator("[data-action=director-confirm-storyboard]").click();
    await p.locator(".job-view").waitFor();
    assert.equal(submissions.at(-1).references.length, 4);
    assert.equal(submissions.at(-1).references.at(-1).name, "參考5");
    console.log("PASS 圖片切影片不殘留無法取消的 1:1；六張導演參考圖可明選四張，超量不送出");
    assert.deepEqual(errors, []);

    const before = providerCalls.length;
    for (const settings of [{ subtitle: "開" }, { audio: "靜音" }, { quality: "480p" }, { ratio: "1:1" }]) {
      const response = await fetch(base + "/api/seedstar/generations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "video", prompt: "guard", settings }) });
      assert.equal(response.status, 400);
    }
    assert.equal(providerCalls.length, before);
    const response = await fetch(base + "/api/seedstar/generations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "cartoon", prompt: "cat", cartoonStyle: "水彩", settings: { duration: 4 } }) });
    assert.equal(response.status, 202);
    assert.equal((await response.json()).type, "video");
    await new Promise((r) => setTimeout(r, 100));
    assert(providerCalls.at(-1).url.endsWith("/videos"));
    assert.match(JSON.parse(providerCalls.at(-1).body).prompt, /水彩/);
    console.log("PASS 後端拒絕不支援設定且不呼叫供應商；卡通實際使用影片 adapter");
    console.log("EVIDENCE " + evidence);
  } finally { await browser.close(); server.closeAllConnections(); await new Promise((r) => server.close(r)); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
