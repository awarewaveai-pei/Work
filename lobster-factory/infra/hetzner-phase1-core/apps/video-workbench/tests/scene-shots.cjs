// Card S2 (docs/creative-suite-plan-20261102.md §4): several shots in one scene. Each shot picks its scene, cast and
// shot size with buttons; the request carries the scene's reference images first plus its own shot-size phrase;
// regenerating one shot replaces only that shot's image; the choices survive a reload. /generations is mocked.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { isolatedServer } = require("./isolated-server.cjs");

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jTioAAAAASUVORK5CYII=", "base64");
const STORE = "awarewave-projects-screenshot-frontend-v1";
const SIZES = ["遠景", "中景", "近景"], PHRASES = ["遠景（wide shot）", "中景（medium shot）", "近景（close-up）"];

(async () => {
  // Card item 6: no third-party model label left on the pages (storyboards-0.js is a protected baseline file).
  const scripts = path.join(__dirname, "../scripts");
  const labelled = fs.readdirSync(scripts).filter((n) => n !== "storyboards-0.js" && fs.readFileSync(path.join(scripts, n), "utf8").includes("Seedance"));
  assert.deepEqual(labelled, [], "scripts 仍有 Seedance 字樣");
  const { base, dataDir } = await isolatedServer("vw-scene-shots-");
  const upload = async (name) =>
    (await (await fetch(base + "/api/seedstar/uploads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, data: "data:image/png;base64," + png.toString("base64") }) })).json()).url;
  const [scene1, scene2, castRef, propRef] = [await upload("s1.png"), await upload("s2.png"), await upload("c.png"), await upload("p.png")];
  const results = [];
  for (let i = 0; i < 4; i++) results.push(await upload("result-" + i + ".png"));

  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const errors = [], sent = [];
  try {
    const p = await browser.newPage();
    p.setDefaultTimeout(20000);
    p.on("pageerror", (e) => errors.push(e.message));
    await p.route("**/*", (r) => (r.request().url().startsWith(base + "/") ? r.continue() : r.abort()));
    await p.route("**/api/seedstar/generations**", async (r) => {
      const route = new URL(r.request().url()).pathname.replace("/api/seedstar", "");
      if (route !== "/generations") return r.fulfill({ status: 404, json: { error: { message: "unexpected " + route } } });
      const body = r.request().postDataJSON(), n = sent.push(body) - 1;
      return r.fulfill({ status: 202, json: { id: "job-" + n, type: "image", status: "succeeded", progress: 100, input: body, result: { url: results[n] } } });
    });
    await p.goto(base);
    await p.waitForFunction(() => window.SeedStar?.router);
    await p.evaluate(async ({ STORE, scene1, scene2, castRef, propRef }) => {
      await SeedStar.ready;
      SeedStar.storage.setItem(STORE, JSON.stringify({
        current: "proj-scene", episode: 0,
        projects: [{
          id: "proj-scene", title: "豆花店", type: "single", ratio: "16:9", style: 1, customStyle: "溫暖寫實", settings: {},
          assets: {
            character: [{ id: "char-1", name: "阿姨", descr: "短髮圍裙", refs: [castRef] }],
            scene: [{ id: "scene-1", name: "豆花店", descr: "木桌與蒸氣", time: "黃昏", refs: [scene1, scene2] }],
            prop: [{ id: "prop-1", name: "碗", descr: "白瓷碗", refs: [propRef] }],
          },
          episodes: [{ id: "ep-1", name: "第 1 集", outline: "", shots: [1, 2, 3].map((n) => ({ id: "shot-" + n, text: "鏡頭" + n + "：阿姨端出豆花", seconds: 4 })) }],
        }],
      }));
      await SeedStar.flush();
    }, { STORE, scene1, scene2, castRef, propRef });

    const openProjects = async () => {
      await p.locator("#projectsNav").click();
      const f = p.frameLocator("#projectsFrame");
      await f.locator(".shot").nth(2).waitFor();
      return f;
    };
    let f = await openProjects();
    for (let i = 0; i < 3; i++) {
      await f.locator(`[data-action=shotScene][data-index="${i}"][data-value="scene-1"]`).click();
      await f.locator(`[data-action=shotSize][data-index="${i}"][data-value="${SIZES[i]}"]`).click();
      if (i === 0) await f.locator(`[data-action=shotCharacter][data-index="0"][data-value="char-1"]`).click();
      await f.locator(`[data-action=shotGenerate][data-index="${i}"]`).click();
      await f.locator(".shot").nth(i).locator("img").waitFor();
      await f.locator("[data-job-close]").last().click();
    }
    assert.equal(sent.length, 3);
    sent.forEach((body, i) => {
      const urls = body.references.images.map((r) => r.url);
      assert.deepEqual(urls.slice(0, 2), [scene1, scene2], "鏡頭 " + (i + 1) + " 的參考圖沒有以場景圖開頭");
      assert.deepEqual(urls, i === 0 ? [scene1, scene2, castRef] : [scene1, scene2], "鏡頭 " + (i + 1) + " 帶了未選的素材");
      assert.equal(body.sceneId, "scene-1");
      assert.equal(body.shotSize, SIZES[i]);
      assert(body.prompt.includes("場景：豆花店，木桌與蒸氣，時間 黃昏"), body.prompt);
      assert(body.prompt.includes(PHRASES[i]), "鏡頭 " + (i + 1) + " 缺少自己的景別描述");
      PHRASES.filter((_, j) => j !== i).forEach((other) => assert(!body.prompt.includes(other), "鏡頭 " + (i + 1) + " 混入其他景別"));
      assert.equal(body.shotId, "shot-" + (i + 1));
    });
    console.log("PASS 三個鏡頭同一場景：參考圖以場景圖開頭，各自帶自己的景別描述");

    const images = async () => p.evaluate(async () => (await SeedStar.projects.list()).find((x) => x.id === "proj-scene").episodes[0].shots.map((s) => s.image));
    const before = await images();
    assert.deepEqual(before, results.slice(0, 3));
    await f.locator('[data-action=shotGenerate][data-index="1"]').click();
    for (let i = 0; i < 100 && (await images())[1] !== results[3]; i++) await p.waitForTimeout(200);
    assert.deepEqual(await images(), [results[0], results[3], results[2]], "重新生成鏡頭 2 改到其他鏡頭");
    assert.equal(sent[3].shotId, "shot-2");
    assert.equal(sent[3].shotSize, "中景");
    console.log("PASS 只重新生成鏡頭 2，其他鏡頭畫面不變");

    await p.reload();
    await p.waitForFunction(() => window.SeedStar?.router);
    f = await openProjects();
    for (let i = 0; i < 3; i++) {
      assert.equal(await f.locator(`[data-action=shotScene][data-index="${i}"][data-value="scene-1"]`).getAttribute("aria-pressed"), "true");
      assert.equal(await f.locator(`[data-action=shotSize][data-index="${i}"][data-value="${SIZES[i]}"]`).getAttribute("aria-pressed"), "true");
    }
    const stored = JSON.parse(fs.readFileSync(path.join(dataDir, "state.json"), "utf8")).projects.find((x) => x.id === "proj-scene").episodes[0].shots;
    assert.deepEqual(stored.map((s) => [s.sceneId, s.shotSize]), [["scene-1", "遠景"], ["scene-1", "中景"], ["scene-1", "近景"]]);
    assert.deepEqual(stored[0].characterIds, ["char-1"]);
    console.log("PASS 重新載入後場景、景別、角色選擇仍在（伺服器 state.json）");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
