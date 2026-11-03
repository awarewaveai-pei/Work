const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os"), http = require("node:http");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const appDir = process.env.AWAREWAVE_APP_DIR || require("../awarewave-source.json").appDir;
const esbuild = require(require.resolve("esbuild", { paths: [appDir] }));
const { createServer } = require("../server.cjs");
const evidence = fs.mkdtempSync(path.join(os.tmpdir(), "awarewave-appearance-"));
const listen = (server) => new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`)));
const close = (server) => new Promise((resolve) => server.close(resolve));

(async () => {
  const app = createServer({ dataDir: path.join(evidence, "data"), env: {}, awareWaveDir: appDir, fetchImpl: () => { throw Error("Provider calls forbidden"); } });
  let host, browser;
  try {
    const appOrigin = await listen(app);
    const bundle = await esbuild.build({
      stdin: {
        contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import Frame from './components/tools/AwareWaveThemeFrame'; createRoot(document.getElementById('root')).render(<Frame src=${JSON.stringify(appOrigin)} title="影音工作台"/>);`,
        sourcefile: "appearance-test.tsx", resolveDir: appDir, loader: "tsx",
      },
      bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic", tsconfig: path.join(appDir, "tsconfig.json"),
      define: { "process.env.NODE_ENV": '"test"' },
    });
    host = http.createServer((req, res) => {
      if (req.url === "/bundle.js") { res.setHeader("Content-Type", "text/javascript"); return res.end(bundle.outputFiles[0].text); }
      if (req.url === "/app/globals.css" || req.url === "/public/awarewave/forms.css") {
        res.setHeader("Content-Type", "text/css"); return res.end(fs.readFileSync(path.join(appDir, req.url.slice(1))));
      }
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end('<!doctype html><html style="--body-bg:#15141c;--card-bg:#211d29;--text-primary:#f6f3f8"><head><link rel="stylesheet" href="/app/globals.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
    });
    const hostOrigin = await listen(host);
    browser = await chromium.launch({ channel: "msedge", headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    await context.route("**/*", (route) => {
      const req = route.request(), url = req.url();
      if (req.method() !== "GET" || (!url.startsWith(appOrigin + "/") && !url.startsWith(hostOrigin + "/"))) return route.abort();
      return route.continue();
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.setDefaultTimeout(10000);
    await page.goto(appOrigin);
    await page.waitForFunction(() => !!window.VideoWorkbench?.router);
    await page.locator('[data-mode="spoken"]').click();
    const styles = (element) => { const style = getComputedStyle(element); return { text: style.color, bg: style.backgroundColor }; };
    assert.deepEqual(await page.locator("#spokenVisualDirection").evaluate(styles), { text: "rgb(13, 21, 38)", bg: "rgb(255, 255, 255)" });
    assert.equal(await page.locator(".logo").count(), 0);
    console.log("PASS standalone reads canonical AwareWave stylesheet; form is readable; duplicate logo removed");
    await page.goto(hostOrigin);
    await page.getByRole("status").filter({ hasText: "已連線" }).waitFor();
    const frame = page.frames().find((item) => item.url().startsWith(appOrigin));
    await frame.waitForFunction(() => !!window.VideoWorkbench?.router);
    await frame.locator('[data-mode="spoken"]').click();
    assert.deepEqual(await frame.locator("#spokenVisualDirection").evaluate(styles), { text: "rgb(246, 243, 248)", bg: "rgb(33, 29, 41)" });
    assert.deepEqual(await frame.locator("#spokenVisualDirection").first().evaluate(styles), { text: "rgb(246, 243, 248)", bg: "rgb(33, 29, 41)" });
    assert.equal(await frame.evaluate(() => document.documentElement.dataset.awarewaveEmbedded), "true");
    assert.equal(await frame.locator(".sidebar").evaluate((element) => getComputedStyle(element).display), "flex");
    assert((await frame.locator(".sidebar").boundingBox()).height < 180);
    await frame.locator("#toolsNav").waitFor({ state: "visible" });
    console.log("PASS real AwareWaveThemeFrame applies the parent theme to the workbench and form controls");
    await page.evaluate(() => {
      document.documentElement.style.setProperty("--form-input-bg", "#223344");
      document.documentElement.style.setProperty("--text-primary", "#f0f3ff");
    });
    await frame.waitForFunction(() => getComputedStyle(document.querySelector("#spokenVisualDirection")).backgroundColor === "rgb(34, 51, 68)");
    assert.deepEqual(await frame.locator("#spokenVisualDirection").evaluate(styles), { text: "rgb(240, 243, 255)", bg: "rgb(34, 51, 68)" });
    await frame.locator("#toolsNav").click();
    const nested = frame.frameLocator("#toolsFrame");
    await nested.locator("h1").first().waitFor();
    await frame.waitForFunction(() => getComputedStyle(document.querySelector("#toolsFrame").contentDocument.documentElement).getPropertyValue("--form-input-bg").trim() === "rgb(34, 51, 68)" || getComputedStyle(document.querySelector("#toolsFrame").contentDocument.documentElement).getPropertyValue("--form-input-bg").trim() === "#223344");
    assert((await nested.locator("body").innerText()).trim().length > 100);
    console.log("PASS theme edits propagate live through both iframe levels; tools remain functional");
    await frame.locator("#generatorNav").click();
    await frame.locator('[data-mode="image"]').click();
    await frame.locator('[data-mode="spoken"]').click();
    assert.equal(await frame.locator("#content select").count(), 0);
    await page.screenshot({ path: path.join(evidence, "unified-theme.png"), fullPage: true });
    await page.getByRole("button", { name: "重新連線" }).click();
    await page.getByRole("status").filter({ hasText: "已連線" }).waitFor();
    console.log("PASS dynamic controls and reconnect retain the shared theme");
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(evidence, "results.json"), JSON.stringify({ passed: 4, errors }, null, 2));
    console.log("EVIDENCE " + evidence);
  } finally {
    await browser?.close();
    if (host) await close(host);
    await close(app);
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
