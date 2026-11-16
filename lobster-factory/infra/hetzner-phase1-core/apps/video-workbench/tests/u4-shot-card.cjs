// Card U4 (docs/video-unify-plan-20261116.md §4 U4): the shot card's new picture sources, on the projects page.
// 1 換圖 from the library: the top page puts it on the shot (one step, no job) and a clip cut from the old picture is now
//   stale (shared/episode-spine.js staleClip, the tests/pj4-stale.cjs rule);
// 2 讓這鏡動起來 on a shot with a picture: a video job with that picture, linked to the shot; when it succeeds the shot
//   has shot.video. /generations is mocked (no paid call).
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
      return r.fulfill({ status: 202, json: { id: "job-motion", type: "video", status: "succeeded", progress: 100, input: body, result: { url: video } } });
    });
    const openMain = async () => {
      await p.goto(base);
      await p.waitForFunction(() => window.VideoWorkbench?.router);
      await p.evaluate(() => VideoWorkbench.ready.then(() => VideoWorkbench.flush()));
    };
    await openMain();
    const [before, after] = await p.evaluate(async ({ STORE, a, b }) => {
      const up = async (name, data) => VideoWorkbench.assets.save({ ...(await VideoWorkbench.request("/uploads", { name, data, rightsConfirmed: true })), createdAt: new Date().toISOString() });
      const [first, second] = [await up("舊圖.png", a), await up("新圖.png", b)];
      VideoWorkbench.storage.setItem(STORE, JSON.stringify({ current: "proj-u4", episode: 0, projects: [{ id: "proj-u4", title: "保溫杯", type: "single", ratio: "16:9", style: 1, customStyle: "", settings: {}, assets: { character: [], scene: [], prop: [] },
        episodes: [{ id: "ep-u4", name: "第 1 集", outline: "", shots: [{ id: "s1", text: "清晨廚房，手倒熱水進保溫杯", seconds: 4, line: "", image: first.url }] }] }] }));
      await VideoWorkbench.flush();
      return [first, second];
    }, { STORE, a: png(1), b: png(2) });
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

    const motion = f.locator('[data-action="motionShot"][data-index="0"]');
    await f.locator('[data-action="motionShot"][data-index="0"] .paid-price').waitFor();
    assert.match(await motion.innerText(), /NT\$[\d.]+／秒/, "按鈕要標每秒 NT$");
    await motion.click();
    await p.waitForFunction(({ STORE, url }) => JSON.parse(VideoWorkbench.storage.getItem(STORE)).projects[0].episodes[0].shots[0].video === url, { STORE, url: video });
    assert.equal(sent.length, 1);
    assert.deepEqual([sent[0].type, sent[0].references.images[0].url, sent[0].link.target], ["video", after.url, "shot:s1"]);
    await f.locator(`.shot video[src="${video}"]`).waitFor();
    console.log("PASS 2 讓這鏡動起來 → 以這張圖建影片任務；完成後 shot.video 有值、鏡頭卡播影片");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
