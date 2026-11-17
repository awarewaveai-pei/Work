// Card U4 (docs/video-unify-plan-20261116.md §4 U4): the shot card's new picture sources, on the projects page.
// 1 換圖 from the library: the top page puts it on the shot (one step, no job) and a clip cut from the old picture is now
//   stale (shared/episode-spine.js staleClip, the tests/pj4-stale.cjs rule);
// 3 圖庫素材 (B1): the top page writes the shot while the dialog is open; the card shows the picture once it closes;
// 2 讓這鏡動起來 (U4.5): one button per first-frame model of this ratio, each with seconds and NT$／秒, none past the
//   card's edge (B2); the job carries the model clicked; when it succeeds the shot has shot.video. /generations,
//   the Pexels search and the URL import are mocked (no paid call);
// 4 生圖模型 (U4.4): a vendor group, then a model with its NT$／張; the job carries settings.imageModel and no references,
//   and a shot with cast pictures says those models do not use them.
const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { isolatedServer } = require("./isolated-server.cjs");

const png = (n) => "data:image/png;base64," + Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jTioAAAAASUVORK5CYII=", "base64").toString("base64") + "A".repeat(n * 4);
const STORE = "awarewave-projects-screenshot-frontend-v1";

(async () => {
  // A placeholder Replicate key lists the first-frame video models as available; every vendor call still throws.
  const { base } = await isolatedServer("vw-u4-", { env: { REPLICATE_API_TOKEN: "test-only" } });
  const browser = await chromium.launch({ channel: "msedge", headless: true }),
    errors = [],
    sent = [];
  const video = "/generated/00000000-0000-4000-8000-000000000001.mp4";
  try {
    const p = await browser.newPage();
    p.setDefaultTimeout(20000);
    p.on("pageerror", (e) => errors.push(e.message));
    await p.route("**/*", (r) => (r.request().url().startsWith(base + "/") ? r.continue() : r.abort()));
    await p.route("**/api/vw/generations**", async (r) => {
      const route = new URL(r.request().url()).pathname.replace("/api/vw", "");
      if (route !== "/generations") return r.fulfill({ status: 404, json: { error: { message: "unexpected " + route } } });
      const body = r.request().postDataJSON();
      sent.push(body);
      // A picture job stays queued (nothing settles onto the shot); the motion job succeeds with its video.
      if (body.type === "image") return r.fulfill({ status: 202, json: { id: "job-picture", type: "image", status: "queued", progress: 0, input: body } });
      return r.fulfill({ status: 202, json: { id: "job-motion", type: "video", status: "succeeded", progress: 100, input: body, result: { url: video } } });
    });
    const openMain = async () => {
      await p.goto(base);
      await p.waitForFunction(() => window.VideoWorkbench?.router);
      await p.evaluate(() => VideoWorkbench.ready.then(() => VideoWorkbench.flush()));
    };
    await openMain();
    const [before, after, stock] = await p.evaluate(async ({ STORE, a, b, c }) => {
      const up = async (name, data) => VideoWorkbench.assets.save({ ...(await VideoWorkbench.request("/uploads", { name, data, rightsConfirmed: true })), createdAt: new Date().toISOString() });
      const [first, second, third] = [await up("舊圖.png", a), await up("新圖.png", b), await up("圖庫.png", c)];
      VideoWorkbench.storage.setItem(STORE, JSON.stringify({ current: "proj-u4", episode: 0, projects: [{ id: "proj-u4", title: "保溫杯", type: "single", ratio: "16:9", style: 1, customStyle: "", settings: {}, assets: { character: [{ id: "c1", name: "阿明", refs: [first.url] }], scene: [], prop: [] },
        episodes: [{ id: "ep-u4", name: "第 1 集", outline: "", shots: [{ id: "s1", text: "清晨廚房，手倒熱水進保溫杯", seconds: 4, line: "", image: first.url }] }] }] }));
      await VideoWorkbench.flush();
      return [first, second, third];
    }, { STORE, a: png(1), b: png(2), c: png(3) });
    // 圖庫素材 needs the main system: connected in /capabilities, the Pexels search and the URL import answered here.
    // The scene models' buttons are next-admin's list as the server reads it; only "connected" is set here.
    await p.route("**/api/vw/capabilities", async (r) => {
      const caps = await (await r.fetch()).json();
      return r.fulfill({ json: { ...caps, mainSystem: { organizationId: "00000000-0000-4000-8000-0000000000aa", externalAudioAllowed: true }, sceneImage: { ...caps.sceneImage, available: true } } });
    });
    await p.route("**/api/video/regenerate-image", (r) => r.fulfill({ json: { ok: true, imageUrl: "https://images.pexels.com/photos/1/kitchen.jpeg" } }));
    await p.route("**/api/vw/stock/import", (r) => r.fulfill({ status: 201, json: stock }));
    await openMain();
    const episode = () => p.evaluate((STORE) => JSON.parse(VideoWorkbench.storage.getItem(STORE)).projects[0].episodes[0], STORE);
    const clip = { slot: "shot:s1", asset: { url: before.url } };
    assert.equal(await p.evaluate(({ e, clip }) => EpisodeSpine.staleClip(e, clip), { e: await episode(), clip }), false, "換圖前片段不該過期");

    await p.locator("#projectsNav").click();
    const f = p.frameLocator("#projectsFrame");
    await f.locator('[data-action="swapShot"][data-index="0"]').click();
    await f.locator(`[data-picker-id="${after.id}"]`).click();
    await f.locator("[data-picker-confirm]").click();
    await p.waitForFunction(({ STORE, url }) => JSON.parse(VideoWorkbench.storage.getItem(STORE)).projects[0].episodes[0].shots[0].image === url, { STORE, url: after.url });
    const swapped = await episode(),
      step = swapped.steps.at(-1);
    assert.deepEqual([step.tool, step.jobId, step.target, step.output.url, step.output.kind], ["library", null, "shot:s1", after.url, "image"]);
    assert.equal(await p.evaluate(({ e, clip }) => EpisodeSpine.staleClip(e, clip), { e: swapped, clip }), true, "換圖後用舊圖剪的片段要標成過期");
    await f.locator(`.shot img[src="${after.url}"]`).waitFor();
    console.log("PASS 1 換圖（素材庫）→ 主頁寫上鏡頭、記一筆沒有任務的步驟；舊圖剪的片段標成過期");

    // B1 (2026-11-16 live): the 圖庫素材 dialog is still open when the top page's spine-set-shot comes back, and the card
    // used to stay as it was until a reload. The search and the import are mocked; the picture is the third upload.
    await f.locator('[data-action="stockShot"][data-index="0"]').click();
    await f.locator("#stock-keyword").fill("kitchen");
    await f.locator('[data-action="stockSearch"]').click();
    await p.waitForFunction(({ STORE, url }) => JSON.parse(VideoWorkbench.storage.getItem(STORE)).projects[0].episodes[0].shots[0].image === url, { STORE, url: stock.url });
    await f.locator(`.shot img[src="${stock.url}"]`).waitFor({ timeout: 5000 });
    assert.equal(await f.locator("#overlay").isHidden(), true);
    console.log("PASS 3 圖庫素材（對話框開著時主頁寫上鏡頭）→ 關窗後鏡頭卡就換成新圖，不必重整");

    // U4.5: one button per first-frame model this ratio can run, each with its seconds and NT$／秒; the one clicked is sent.
    const motion = f.locator('[data-action="motionShot"][data-index="0"]');
    await f.locator('[data-action="motionShot"][data-index="0"] .paid-price').first().waitFor();
    const offered = await motion.evaluateAll((els) => els.map((el) => ({ id: el.dataset.value, text: el.textContent.trim() })));
    assert.ok(offered.length >= 2, "要列出可選的首幀影片模型：" + JSON.stringify(offered));
    for (const o of offered) assert.match(o.text, /\d+ 秒 · NT\$[\d.]+／秒$/, "每顆標秒數與每秒 NT$：" + o.text);
    assert.equal(offered.some((o) => o.text.includes("$") && !o.text.includes("NT$")), false, "不得出現 US$");
    // B2: at a narrow card no button runs past the card's right edge.
    const overflow = await f.locator(".shot").first().evaluate((card) => {
      const edge = card.getBoundingClientRect().right;
      return [...card.querySelectorAll(".btn")].filter((b) => b.getBoundingClientRect().right > edge + 0.5).map((b) => b.innerText);
    });
    assert.deepEqual(overflow, [], "鏡頭卡的按鈕不得超出卡片右緣");
    const chosen = offered[1];
    await f.locator(`[data-action="motionShot"][data-index="0"][data-value="${chosen.id}"]`).click();
    await p.waitForFunction(({ STORE, url }) => JSON.parse(VideoWorkbench.storage.getItem(STORE)).projects[0].episodes[0].shots[0].video === url, { STORE, url: video });
    const motionJob = sent.find((b) => b.type === "video");
    assert.equal(sent.filter((b) => b.type === "video").length, 1);
    assert.deepEqual([motionJob.type, motionJob.model, motionJob.settings.model, motionJob.references.images[0].url, motionJob.link.target], ["video", chosen.id, chosen.id, stock.url, "shot:s1"]);
    await f.locator(`.shot video[src="${video}"]`).waitFor();
    console.log("PASS 2 讓這鏡動起來 → 列出首幀模型（秒數＋NT$／秒、不溢出卡片），送出的任務帶所選模型；完成後 shot.video 有值");

    // U4.4: 生圖模型 -- a vendor group, then one of its models with its NT$／張; the shot has cast pictures, which these
    // models do not use: the card says so. 生成畫面 sends that model and no references.
    await f.locator('[data-action="shotImageGroup"][data-index="0"][data-value="FLUX"]').dispatchEvent("click");
    const flux = f.locator('[data-action="shotImageModel"][data-index="0"][data-value="flux-dev"]');
    await flux.dispatchEvent("click");
    await f.locator('[data-action="shotImageModel"][data-value="flux-dev"][aria-pressed="true"] .paid-price').waitFor();
    assert.match(await f.locator('[data-action="shotImageModel"][data-value="flux-dev"]').textContent(), /FLUX dev · NT\$[\d.]+／張$/);
    await f.getByText("這個模型不會參考角色與場景圖").waitFor();
    assert.match(await f.locator('[data-action="shotGenerate"][data-index="0"]').textContent(), /NT\$[\d.]+／張/);
    await f.locator('[data-action="shotGenerate"][data-index="0"]').dispatchEvent("click");
    for (let t = 0; t < 50 && !sent.some((b) => b.operation === "project-shot"); t++) await new Promise((r) => setTimeout(r, 100));
    const shotJob = sent.find((b) => b.operation === "project-shot");
    assert.ok(shotJob, "生成畫面要送出任務");
    assert.deepEqual([shotJob.type, shotJob.settings?.imageModel, shotJob.references.images.length], ["image", "flux-dev", 0]);
    console.log("PASS 4 生圖模型（FLUX dev · NT$／張）→ 任務帶 imageModel、不送參考圖；有角色參考圖時卡片說明不會參考");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
