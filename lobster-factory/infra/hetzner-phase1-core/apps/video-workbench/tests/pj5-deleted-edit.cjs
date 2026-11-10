// Card PJ.5 (docs/pj-project-spine-spec-20261106.md §3.4): deleting an edit file or a project.
// 1 (a) an episode whose edit file was deleted says so and 建立剪輯檔 gives it a new one; 2 (b) a file deleted in the
// editor's list (ED.9) is not adopted back; 3 (c) a project dropped from the projects page stays gone, its edit file
// stays in the library. Mutation: adopt ignores `known` -> 3 red. No generation is sent (a POST /generations fails).
const assert = require("node:assert/strict"),
  { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright"),
  { isolatedServer } = require("./isolated-server.cjs"),
  ProjectEnvelope = require("../shared/project-envelope.js");
const STORE = "awarewave-projects-screenshot-frontend-v1";

(async () => {
  const { base } = await isolatedServer("vw-pj5-");
  const browser = await chromium.launch({ channel: "msedge", headless: true }),
    errors = [],
    paid = [];
  try {
    const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    p.setDefaultTimeout(20000);
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("dialog", (d) => d.accept());
    await p.route("**/*", (r) => {
      if (r.request().method() === "POST" && /\/api\/vw\/generations$/.test(new URL(r.request().url()).pathname)) {
        paid.push(r.request().url());
        return r.abort();
      }
      return r.request().url().startsWith(base + "/") ? r.continue() : r.abort();
    });
    const openMain = async () => {
      await p.goto(base);
      await p.waitForFunction(() => window.VideoWorkbench?.router);
      await p.evaluate(() => VideoWorkbench.ready.then(() => VideoWorkbench.flush()));
    };
    const state = () => p.evaluate((STORE) => JSON.parse(VideoWorkbench.storage.getItem(STORE)), STORE);
    const library = () => p.evaluate(() => JSON.parse(VideoWorkbench.storage.getItem("tools.editor.projects") || "[]").map((r) => r.native?.id ?? r.id));
    const project = (id) => ({
      id: "proj-" + id, title: "專案 " + id, type: "single", ratio: "16:9", style: 1, customStyle: "", settings: {}, assets: { character: [], scene: [], prop: [] },
      episodes: [{ id: "ep-" + id, name: "第一集", outline: "", shots: [], edit: { engine: "workbench-editor", projectId: "ed-" + id }, steps: [], outputs: [] }],
    });
    const row = (id) => ProjectEnvelope.wrap({ id: "ed-" + id, title: "剪輯 " + id, ratio: "16:9", clips: [], assets: [], markers: [], output: {} }, { revision: 0 });
    await openMain();
    await p.evaluate(async ({ STORE, projects, rows }) => {
      VideoWorkbench.storage.setItem(STORE, JSON.stringify({ current: null, episode: 0, projects }));
      await VideoWorkbench.preferences.set("tools.editor.projects", rows);
      await VideoWorkbench.flush();
    }, { STORE, projects: ["a", "b", "c"].map(project), rows: ["a", "b", "c"].map(row) });
    await openMain();
    const tools = () => p.frames().find((x) => x.url().includes("tools.html"));

    // 2 (b) the editor's list deletes ed-a (ED.9's own button and confirm).
    await p.evaluate(() => VideoWorkbench.generator.import({ intent: "open-tool", tool: "edit" }));
    const t = p.frameLocator("#toolsFrame");
    await t.locator('[data-ed-list="delete:ed-a"]').click();
    await t.locator("dialog form button[type=submit]").click();
    await p.waitForFunction(() => !JSON.parse(VideoWorkbench.storage.getItem("tools.editor.projects") || "[]").some((r) => (r.native?.id ?? r.id) === "ed-a"));
    await p.evaluate(() => VideoWorkbench.flush());
    await openMain();
    await openMain();
    assert.deepEqual((await library()).sort(), ["ed-b", "ed-c"]);
    assert.deepEqual((await state()).projects.map((x) => x.id).sort(), ["proj-a", "proj-b", "proj-c"], "刪掉剪輯檔後多出或少了專案");
    console.log("PASS 2 剪輯器清單刪掉 ed-a → 重開主頁兩次：內容庫沒有它、沒有多出專案");

    // 1 (a) proj-a's episode says its file is gone; 建立剪輯檔 makes a new one and attaches it.
    await p.locator("#projectsNav").click();
    const projects = p.frameLocator("#projectsFrame");
    await projects.locator('[data-action="openProject"]').first().waitFor();
    await p.evaluate(() => VideoWorkbench.spine.open({ projectId: "proj-a", episodeId: "ep-a" }));
    await projects.locator('[data-step="6"]').getByText("剪輯檔已刪除。").waitFor();
    const create = projects.locator('[data-step="6"] [data-action="openEdit"]');
    assert.equal(await create.innerText(), "建立剪輯檔");
    await create.click();
    await p.frameLocator("#toolsFrame").locator('[data-ed-action="spine-arrange"]').waitFor();
    const fresh = (await state()).projects.find((x) => x.id === "proj-a").episodes[0].edit.projectId;
    assert.notEqual(fresh, "ed-a");
    assert.equal(await tools().evaluate(() => edProject()?.id), fresh);
    await p.waitForFunction((id) => JSON.parse(VideoWorkbench.storage.getItem("tools.editor.projects") || "[]").some((r) => (r.native?.id ?? r.id) === id), fresh);
    console.log("PASS 1 剪輯檔已刪的一集：第 6 步「剪輯檔已刪除。」、按「建立剪輯檔」→ 開出新檔、edit 換成新 id");

    // 3 (c) proj-c is dropped the way the projects page writes (the whole list), then the top page loads twice.
    await p.evaluate(async (STORE) => {
      const s = JSON.parse(VideoWorkbench.storage.getItem(STORE));
      VideoWorkbench.storage.setItem(STORE, JSON.stringify({ ...s, projects: s.projects.filter((x) => x.id !== "proj-c") }));
      await VideoWorkbench.flush();
    }, STORE);
    await openMain();
    await openMain();
    const left = (await state()).projects;
    assert(!left.some((x) => x.episodes.some((e) => e.edit?.projectId === "ed-c")), "刪掉的專案的剪輯檔又被收成專案");
    assert.deepEqual(left.map((x) => x.id).sort(), ["proj-a", "proj-b"]);
    assert((await library()).includes("ed-c"), "專案刪掉後剪輯檔也不見了");
    console.log("PASS 3 刪掉專案 → 重開主頁兩次：專案沒回來、剪輯檔還在內容庫");

    assert.deepEqual(paid, []);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
