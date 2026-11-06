// Card P1, Codex 2026-11-02: a title finished in project A must not be offered (or inserted) in project B.
const assert = require("node:assert/strict"),
  { chromium } = require("playwright");
const { isolatedServer } = require("./isolated-server.cjs");

(async () => {
  const { base } = await isolatedServer("vw-title-project-");
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*", (r) => (r.request().url().startsWith(base + "/") ? r.continue() : r.abort()));
    await page.goto(base + "/pages/tools.html#edit");
    const newProject = async () => {
      await page.getByRole("button", { name: "新建剪輯專案", exact: true }).click();
      await page.getByRole("button", { name: "建立專案", exact: true }).click();
      await page.waitForSelector("[data-ed-stage]");
      await page.locator('[data-ed-pane="文字"]').click();
    };
    const insert = page.getByRole("button", { name: "放到時間軸開頭", exact: true });
    await newProject();
    // Project A has a finished title, and its asset is in the library (as after a real job), so a later
    // edTitleRefresh would still find it by jobId.
    await page.evaluate(async () => {
      const asset = await VideoWorkbench.assets.save({ id: "job-job-a", kind: "video", type: "video/mp4", url: "/media/a/original.mp4", name: "片頭 A" });
      ed.title.jobId = "job-a";
      ed.title.done = asset;
      edRender();
    });
    assert.equal(await insert.count(), 1, "project A offers its own title");
    await page.getByRole("button", { name: "所有專案", exact: true }).click();
    await newProject();
    assert.equal(await insert.count(), 0, "project B must not offer project A's title");
    assert.equal(await page.evaluate(() => ed.title.done), null);
    assert.deepEqual(errors, []);
    console.log("PASS 片頭狀態綁專案：A 的片頭不會出現在 B");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error("FAIL", error);
  process.exit(1);
});
