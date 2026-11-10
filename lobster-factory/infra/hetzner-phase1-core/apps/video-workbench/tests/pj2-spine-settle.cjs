// Card PJ.2 (docs/pj-project-spine-spec-20261106.md §2 PJ.2): a finished job comes back to its episode once.
// 1 unit: settle twice = one step; a deleted episode records nothing; a video on shot:x sets shot.video.
// 2 UI: a shot generated with its job panel closed still gets its picture when the main page reopens (spec §0 F5),
//   and step 3 reads 做好了; old shots got ids and kept their picture (spec §3.3).
// 3 UI: the watermark tool opened from the tools home belongs to no episode, even after it was opened for one.
// /generations is mocked; nothing calls a provider.
const assert = require("node:assert/strict");
const Spine = require("../shared/episode-spine.js");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { isolatedServer } = require("./isolated-server.cjs");
const STORE = "awarewave-projects-screenshot-frontend-v1";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jTioAAAAASUVORK5CYII=", "base64");

function unit() {
  const projects = () => [{ id: "p", episodes: [{ id: "e", shots: [{ id: "x", text: "鏡頭" }] }] }];
  const job = (id, extra = {}) => ({ id, type: "image", status: "succeeded", result: { url: "/generated/" + id + ".png" }, input: { link: { projectId: "p", episodeId: "e", tool: "generator", step: "shot", target: "shot:x" } }, ...extra });
  const ps = projects();
  assert.equal(Spine.settle(ps, job("a")), true);
  assert.equal(Spine.settle(ps, job("a")), false);
  assert.equal(ps[0].episodes[0].steps.length, 1);
  assert.equal(ps[0].episodes[0].shots[0].image, "/generated/a.png");
  const gone = [{ id: "p", episodes: [] }];
  assert.equal(Spine.settle(gone, job("b")), false);
  assert.deepEqual(gone, [{ id: "p", episodes: [] }]);
  const vs = projects();
  assert.equal(Spine.settle(vs, job("c", { type: "video", result: { url: "/generated/c.mp4" } })), true);
  assert.equal(vs[0].episodes[0].shots[0].video, "/generated/c.mp4");
  assert.equal(vs[0].episodes[0].shots[0].image, undefined);
  console.log("PASS 1 同一任務兩次只記一筆；集被刪不記；影片落到 shot.video");
}

(async () => {
  unit();
  const { base } = await isolatedServer("vw-pj2-settle-");
  const upload = async (name) =>
    (await (await fetch(base + "/api/vw/uploads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, data: "data:image/png;base64," + png.toString("base64") }) })).json()).url;
  const [oldPicture, shotResult, markResult] = [await upload("old.png"), await upload("shot.png"), await upload("mark.png")];
  const state = async () => (await fetch(base + "/api/vw/state")).json();
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const sent = [], errors = [];
  let shotDone = false;
  try {
    const p = await browser.newPage();
    p.setDefaultTimeout(20000);
    p.on("pageerror", (e) => errors.push(e.message));
    await p.route("**/*", (r) => (r.request().url().startsWith(base + "/") ? r.continue() : r.abort()));
    await p.route("**/api/vw/generations**", async (r) => {
      const route = new URL(r.request().url()).pathname.replace("/api/vw", "");
      if (route === "/generations" && r.request().method() === "POST") {
        const body = r.request().postDataJSON(), n = sent.push(body) - 1;
        // The shot job stays queued until the test says so; the watermark job is done at once.
        if (body.operation === "project-shot") return r.fulfill({ status: 202, json: { id: "job-shot", type: "image", status: "queued", progress: 0, input: body } });
        return r.fulfill({ status: 202, json: { id: "job-" + n, type: "video", status: "succeeded", progress: 100, input: body, result: { url: markResult } } });
      }
      if (route === "/generations/job-shot") {
        const input = sent.find((b) => b.operation === "project-shot");
        return r.fulfill({ json: shotDone ? { id: "job-shot", type: "image", status: "succeeded", progress: 100, input, result: { url: shotResult } } : { id: "job-shot", type: "image", status: "queued", progress: 0, input } });
      }
      return r.fulfill({ status: 404, json: { error: { message: "unexpected " + route } } });
    });
    const openMain = async () => {
      await p.goto(base);
      await p.waitForFunction(() => window.VideoWorkbench?.router);
      await p.evaluate(() => VideoWorkbench.ready.then(() => VideoWorkbench.flush()));
    };
    await openMain();
    // Old data: shots without id, one already has a picture (spec §3.2).
    await p.evaluate(async ({ STORE, oldPicture }) => {
      VideoWorkbench.storage.setItem(STORE, JSON.stringify({
        current: "proj-pj2", episode: 0,
        projects: [{ id: "proj-pj2", title: "保溫杯", type: "single", ratio: "9:16", style: 1, customStyle: "", settings: {}, assets: { character: [], scene: [], prop: [] },
          episodes: [{ id: "ep-1", name: "保溫杯 30 秒", outline: "", shots: [{ text: "清晨廚房，倒熱水", seconds: 6 }, { text: "捷運車廂", seconds: 6, image: oldPicture }] }] }],
      }));
      await VideoWorkbench.flush();
    }, { STORE, oldPicture });
    await openMain(); // load names the old shots
    let shots = (await state()).projects.find((x) => x.id === "proj-pj2").episodes[0].shots;
    assert(shots.every((s) => typeof s.id === "string" && s.id), "舊鏡頭沒有補上 id");
    assert.equal(shots[1].image, oldPicture, "補 id 時改到原有畫面");

    await p.locator("#projectsNav").click();
    let f = p.frameLocator("#projectsFrame");
    await f.locator('[data-action=shotGenerate][data-index="0"]').click();
    await f.locator("[data-job-close]").last().click(); // nobody watches the job any more
    assert.equal(sent[0].link.target, "shot:" + shots[0].id);
    shotDone = true;
    await openMain();
    let image = null;
    for (let i = 0; i < 50 && !image; i++) {
      image = (await state()).projects.find((x) => x.id === "proj-pj2").episodes[0].shots[0].image ?? null;
      if (!image) await p.waitForTimeout(200);
    }
    assert.equal(image, shotResult, "任務面板關掉後完成的鏡頭沒有拿到畫面");
    await p.locator("#projectsNav").click();
    f = p.frameLocator("#projectsFrame");
    await f.locator(".shot").first().locator("img").waitFor();
    assert.equal(await f.locator('[data-step="3"] .badge').innerText(), "做好了");
    const ep = (await state()).projects.find((x) => x.id === "proj-pj2").episodes[0];
    assert.equal(ep.steps.length, 1);
    assert.equal(ep.shots[1].image, oldPicture);
    console.log("PASS 2 面板關掉才完成的鏡頭：重開主頁後有圖、第 3 步做好了；舊鏡頭補 id、原畫面不變");

    // Codex finding 2026-11-10: the panel saved the asset, then its settle failed -- the asset is no proof the
    // episode has the job, so the next load still settles it.
    await p.goto("about:blank");
    const s0 = await state();
    s0.jobs.push({ id: "job-lost", type: "image", status: "succeeded", progress: 100, serverAccepted: true, input: { operation: "project-shot", link: { projectId: "proj-pj2", episodeId: "ep-1", tool: "generator", step: "shot", target: "shot:" + shots[1].id } }, result: { url: markResult } });
    s0.assets.push({ id: "job-job-lost", kind: "image", name: "lost", url: markResult, type: "image/png" });
    assert.equal((await fetch(base + "/api/vw/state", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s0) })).status, 200);
    await openMain();
    let lost = null;
    for (let i = 0; i < 50 && !lost; i++) {
      lost = (await state()).projects.find((x) => x.id === "proj-pj2").episodes[0].steps.find((s) => s.jobId === "job-lost") ?? null;
      if (!lost) await p.waitForTimeout(200);
    }
    assert(lost, "素材已存在、集卻沒有這一步：補帳跳過了它");
    assert.equal((await state()).projects.find((x) => x.id === "proj-pj2").episodes[0].shots[1].image, markResult);
    console.log("PASS 2b 素材已存、寫回該集失敗過的任務：重開主頁後補進該集");

    // Opened for the episode first (so the tool has a link to forget), then from the tools home.
    await p.evaluate(() => VideoWorkbench.generator.import({ intent: "open-tool", tool: "watermark", link: { projectId: "proj-pj2", episodeId: "ep-1", target: "output" } }));
    const tools = () => p.frames().find((x) => x.name() === "toolsFrame" || x.url().includes("tools.html"));
    assert.equal((await tools().evaluate(() => VideoWorkbench.spineLink({})))?.episodeId, "ep-1", "從集打開時沒有帶上歸屬");
    const t = p.frameLocator("#toolsFrame");
    await t.locator('[data-act="home"]').first().click();
    await t.locator('[data-act="open:watermark"]').click();
    await tools().evaluate(async () => {
      const job = await VideoWorkbench.generations.create({ type: "video", operation: "watermark", settings: {}, references: {} });
      VideoWorkbench.showJob(job);
      await VideoWorkbench.flush();
    });
    const mark = sent.find((b) => b.operation === "watermark");
    assert.equal(mark.link, undefined, "工具首頁打開的浮水印仍帶著集的歸屬");
    await p.waitForTimeout(500);
    const after = (await state()).projects.flatMap((x) => x.episodes).reduce((n, e) => n + (e.steps || []).length, 0);
    assert.equal(after, 2, "工具頁單獨跑浮水印卻多出步驟");
    console.log("PASS 3 工具首頁單獨開浮水印跑一次，沒有任何集多出步驟");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
