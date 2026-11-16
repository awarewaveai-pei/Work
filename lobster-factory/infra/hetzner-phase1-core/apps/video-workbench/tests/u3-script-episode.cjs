// Card U3 (docs/video-unify-plan-20261116.md §4 U3): 腳本 hands its script to the projects page through the top page.
// 1 送去做影片 (spine.create): one more project, its one episode's shots = the script's scenes (new ids, no picture),
//   the Story Bible cast as its characters, and the projects page opens it;
// 2 寫回這一集 (spine.setShots): the same projects and episodes, that episode's shots replaced -- and the projects page
//   shows them, so its next write keeps them (it never writes its old shots back);
// 3 腳本 opened from an episode carries ?project=&episode=; opened from the sidebar it carries nothing.
const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { isolatedServer } = require("./isolated-server.cjs");

const STORE = "awarewave-projects-screenshot-frontend-v1";

(async () => {
  const { base } = await isolatedServer("vw-u3-");
  const browser = await chromium.launch({ channel: "msedge", headless: true }),
    errors = [];
  try {
    const p = await browser.newPage();
    p.setDefaultTimeout(20000);
    p.on("pageerror", (e) => errors.push(e.message));
    await p.route("**/*", (r) => (r.request().url().startsWith(base + "/") ? r.continue() : r.abort()));
    const openMain = async () => {
      await p.goto(base);
      await p.waitForFunction(() => window.VideoWorkbench?.router);
      await p.evaluate(() => VideoWorkbench.ready.then(() => VideoWorkbench.flush()));
    };
    await openMain();
    await p.evaluate(async (STORE) => {
      VideoWorkbench.storage.setItem(STORE, JSON.stringify({ current: null, episode: 0, projects: [{ id: "proj-old", title: "舊專案", type: "single", ratio: "16:9", style: 1, customStyle: "", settings: {}, assets: { character: [], scene: [], prop: [] },
        episodes: [{ id: "ep-old", name: "第 1 集", outline: "", shots: [{ id: "s1", text: "舊鏡頭一", seconds: 5, line: "" }, { id: "s2", text: "舊鏡頭二", seconds: 5, line: "" }] }] }] }));
      await VideoWorkbench.flush();
    }, STORE);
    await openMain();
    const state = () => p.evaluate((STORE) => JSON.parse(VideoWorkbench.storage.getItem(STORE)), STORE);

    const scenes = [{ text: "清晨廚房，手倒熱水進保溫杯", seconds: 3, line: "早上五分鐘，熱到下班。" }, { text: "辦公桌上的保溫杯", seconds: 5, line: "你也可以。" }, { text: "產品特寫", seconds: 4, line: "" }];
    const made = await p.evaluate((scenes) => VideoWorkbench.spine.create({ title: "保溫杯", shots: scenes.map((s, i) => (i === 0 ? { ...s, character: "char_1" } : s)), characters: [{ key: "char_1", name: "小美", role: "主角", refs: ["https://r2.example/a.png", "javascript:alert(1)"] }], storyBibleSeries: "series_1" }), scenes);
    const after = await state(),
      created = after.projects.find((x) => x.id === made.projectId);
    assert.equal(after.projects.length, 2, "送去做影片 → 多一個專案");
    assert.equal(created.episodes.length, 1);
    assert.equal(created.storyBibleSeries, "series_1");
    const shots = created.episodes[0].shots;
    assert.deepEqual(shots.map(({ text, seconds, line }) => ({ text, seconds, line })), scenes, "鏡頭數＝場景數，畫面、秒數、旁白照腳本");
    assert.ok(shots.every((s) => s.id && !s.image && !s.video));
    assert.deepEqual(created.assets.character.map((c) => [c.name, c.role, c.refs]), [["小美", "主角", ["https://r2.example/a.png"]]]);
    assert.deepEqual(shots.map((s) => s.characterIds), [[created.assets.character[0].id], undefined, undefined], "場景點名的角色綁到那一鏡");
    assert.equal(await p.evaluate(() => VideoWorkbench.router.active), "projects");
    await p.frameLocator("#projectsFrame").locator('textarea[data-bind="shot.0.text"]').first().waitFor();
    assert.equal(await p.frameLocator("#projectsFrame").locator('textarea[data-bind="shot.2.text"]').inputValue(), "產品特寫");
    console.log("PASS 1 送去做影片 → 多一個專案一集，鏡頭數＝場景數（新 id、沒有圖），角色帶入並綁到點名它的鏡頭，專案頁打開這一集");

    await p.evaluate(() => VideoWorkbench.spine.setShots({ projectId: "proj-old", episodeId: "ep-old", shots: [{ text: "新的一鏡", seconds: 6, line: "改過的旁白" }] }));
    const f = p.frameLocator("#projectsFrame");
    await f.locator('textarea[data-bind="shot.0.text"]').first().waitFor();
    assert.equal(await f.locator('textarea[data-bind="shot.0.text"]').inputValue(), "新的一鏡", "專案頁要顯示寫回的鏡頭");
    assert.equal(await f.locator('textarea[data-bind="shot.1.text"]').count(), 0);
    // The projects page writes its whole list on every keystroke: the written-back shots must survive it.
    await f.locator('textarea[data-bind="episode.outline"]').fill("大綱");
    await p.waitForFunction((STORE) => JSON.parse(VideoWorkbench.storage.getItem(STORE)).projects.find((x) => x.id === "proj-old").episodes[0].outline === "大綱", STORE);
    const back = await state(),
      old = back.projects.find((x) => x.id === "proj-old");
    assert.equal(back.projects.length, 2, "寫回這一集 → 專案數不變");
    assert.equal(old.episodes.length, 1, "集數不變");
    assert.deepEqual(old.episodes[0].shots.map(({ text, seconds, line }) => ({ text, seconds, line })), [{ text: "新的一鏡", seconds: 6, line: "改過的旁白" }], "鏡頭被取代");
    assert.ok(!["s1", "s2"].includes(old.episodes[0].shots[0].id));
    console.log("PASS 2 寫回這一集 → 集數不變、鏡頭被取代；專案頁顯示新鏡頭，之後它自己的寫入也不會把舊鏡頭寫回");

    await p.evaluate(() => VideoWorkbench.navigate("script-forge", "project=proj-old&episode=ep-old"));
    assert.equal(await p.locator("#script-forgeFrame").getAttribute("src"), "/script-forge?project=proj-old&episode=ep-old");
    assert.equal(await p.evaluate(() => VideoWorkbench.router.active), "script-forge");
    await p.evaluate(() => VideoWorkbench.router.activate("script-forge"));
    assert.equal(await p.locator("#script-forgeFrame").getAttribute("src"), "/script-forge");
    console.log("PASS 3 從一集開腳本帶 ?project=&episode=；從側欄開不帶");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
