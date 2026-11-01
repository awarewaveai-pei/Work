const assert = require("node:assert/strict"), path = require("node:path"), fs = require("node:fs"), os = require("node:os"), http = require("node:http");
const { pathToFileURL } = require("node:url");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = path.resolve(__dirname, "..");

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  let app, holder;
  try {
    const context = await browser.newContext();
    await context.route("https://**/*", (route) => route.abort());
    const page = await context.newPage();
    await page.goto(pathToFileURL(path.join(root, "index.html")).href);
    await page.getByRole("heading", { name: "請從 start.cmd 啟動工作台" }).waitFor({ timeout: 2500 });
    assert.equal(await page.locator("iframe").count(), 0);
    assert.equal(await page.evaluate(() => !!window.SeedStar), false);
    console.log("PASS direct index.html shows the startup instructions instead of a blank tool page");

    const { start } = require("../scripts/launch.cjs");
    holder = http.createServer((req, res) => res.end("old app"));
    await new Promise((resolve) => holder.listen(0, "127.0.0.1", resolve));
    let opened = false, created = false;
    await assert.rejects(start({ port: holder.address().port, createServer: () => { created = true; }, openBrowser: () => { opened = true; } }), { code: "EADDRINUSE" });
    assert.equal(opened, false);
    assert.equal(created, false);
    console.log("PASS occupied port never opens the browser or creates application data");

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "awarewave-startup-"));
    const running = await start({ port: 0, createServer: () => require("../server.cjs").createServer({ env: {}, dataDir: tmp, fetchImpl: () => { throw Error("Provider calls forbidden"); } }), openBrowser: async (url) => { assert.equal((await fetch(url)).status, 200); opened = true; } });
    app = running.server;
    assert.equal(opened, true);
    await page.goto(running.url);
    await page.waitForFunction(() => !!window.SeedStar?.router);
    await page.locator("#toolsNav").click();
    const tools = page.frameLocator("#toolsFrame");
    await tools.getByRole("heading", { name: "應用工具", exact: true }).waitFor();
    assert((await tools.locator("body").innerText()).length > 500);
    await page.locator("#generatorNav").click();
    await page.locator("#toolsNav").click();
    await tools.getByRole("heading", { name: "應用工具", exact: true }).waitFor();
    console.log("PASS browser opens only after the new server is reachable; tools render and survive navigation");
  } finally {
    await browser.close();
    if (app) await new Promise((resolve) => app.close(resolve));
    if (holder) await new Promise((resolve) => holder.close(resolve));
  }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
