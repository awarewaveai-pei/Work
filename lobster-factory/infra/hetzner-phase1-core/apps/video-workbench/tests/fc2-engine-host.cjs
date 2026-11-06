// Card FC.2 acceptance (docs/engine-route-plan-20261106.md §9 FC.2): the "專業剪輯" frame, against a fake engine page that
// speaks the ?host=parent bridge. Four checks only: card hidden without engine files; frame reacts to ready/dirty/save and
// ignores another window and another origin; a save lands in tools.engine.projects (editor list untouched); F6 -> sidebar.
// Headless with WebGPU hidden, so the frame shows its GPU warning first and the test takes "仍然開啟".
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { isolatedServer } = require("./isolated-server.cjs");

const FAKE_ENGINE = `<!doctype html><meta charset="utf-8"><button id="inside">engine</button><script>
  window.post = (msg) => { const t = msg.bytes ? [msg.bytes] : []; parent.postMessage(msg, location.origin, t); };
  window.received = []; addEventListener("message", (e) => { if (e.source === parent) received.push({ type: e.data.type, name: e.data.name, size: e.data.bytes && e.data.bytes.byteLength }); });
</script>`;
// Another window on the same origin, and the engine frame navigated to another origin: both post engine messages.
const OTHER = `<!doctype html><script>const b = new TextEncoder().encode('{"x":1}').buffer;
  parent.postMessage({ type: "filmcraft:dirty", dirty: true }, "*"); parent.postMessage({ type: "filmcraft:save", name: "other.fcproj", saveAs: true, bytes: b }, "*", [b]);</script>`;

(async () => {
  const { base } = await isolatedServer("vw-fc2-");
  const foreign = base.replace("127.0.0.1", "localhost");
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--disable-features=WebGPU,WebGPUService", "--disable-webgpu"] });
  const context = async (engineMissing) => {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
    await ctx.addInitScript(() => { try { Object.defineProperty(Navigator.prototype, "gpu", { get: () => undefined, configurable: true }); } catch {} });
    await ctx.route((url) => url.pathname === "/engines/filmcraft/web/index.html", (route) => {
      const u = new URL(route.request().url());
      if (engineMissing) return route.fulfill({ status: 404, body: "" });
      if (u.search === "?host=parent") return route.fulfill({ contentType: "text/html", body: FAKE_ENGINE });
      return route.fulfill({ contentType: "text/html", body: "" }); // engine "installed" without the real build (clean checkout)
    });
    await ctx.route((url) => /fc2-(other|evil)\.html$/.test(url.pathname), (route) => route.fulfill({ contentType: "text/html", body: OTHER }));
    const page = await ctx.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base + "/");
    await page.click("#toolsNav");
    const tools = await (await page.waitForSelector("#toolsFrame")).contentFrame();
    await tools.waitForFunction(() => typeof eng === "object" && eng.available !== null && document.querySelector(".tool-card"));
    return { ctx, page, tools, errors };
  };
  try {
    // 1. No engine files -> no card.
    {
      const { ctx, tools, errors } = await context(true);
      assert.equal(await tools.locator('[data-act="open:edit-pro"]').count(), 0, "引擎檔不存在時不應顯示專業剪輯");
      assert(await tools.locator('[data-act="open:edit"]').count(), "一般剪輯仍在");
      assert.deepEqual(errors, []);
      await ctx.close();
      console.log("PASS no engine files -> no 專業剪輯 card");
    }
    const { ctx, page, tools, errors } = await context(false);
    await tools.click('[data-act="open:edit-pro"]');
    await tools.waitForSelector('[data-engine-act="force"]');
    assert(await tools.locator('[data-act="open:edit"]').count(), "提醒畫面要有「改用一般剪輯」");
    await tools.click('[data-engine-act="force"]');
    const engineFrame = async () => {
      const handle = await tools.waitForSelector("#engine-host iframe");
      const frame = await handle.contentFrame();
      await frame.waitForFunction(() => typeof window.post === "function");
      return frame;
    };
    let engine = await engineFrame();
    const status = () => tools.locator("[data-engine-status]").textContent();
    const projects = (key) => tools.evaluate((k) => VideoWorkbench.preferences.get(k, []), key);
    const editorBefore = (await projects("tools.editor.projects")).length;

    // 2. ready / dirty / save are heard; another window and another origin are not.
    await engine.evaluate(() => post({ type: "filmcraft:ready", version: "1", appVersion: "9.9.9-test" }));
    await tools.waitForFunction(() => eng.ready === true);
    await engine.evaluate(() => post({ type: "filmcraft:dirty", dirty: true }));
    await tools.waitForFunction(() => document.querySelector("[data-engine-status]").textContent === "尚未存檔");
    await engine.evaluate(() => post({ type: "filmcraft:save", name: "片頭.fcproj", saveAs: true, bytes: new TextEncoder().encode('{"fcproj":1,"big":12345678901234567890}').buffer }));
    await engine.evaluate(() => post({ type: "filmcraft:dirty", dirty: false }));
    // "已存檔" only once the workbench store has the project (not when the engine alone says so).
    await tools.waitForFunction(() => document.querySelector("[data-engine-status]").textContent === "已存檔：片頭");
    assert.equal((await projects("tools.engine.projects")).length, 1);
    await tools.evaluate(() => { const f = document.createElement("iframe"); f.src = "/fc2-other.html"; f.id = "fc2-other"; document.body.append(f); });
    await tools.evaluate(() => window.postMessage({ type: "filmcraft:dirty", dirty: true }, location.origin));
    await page.waitForTimeout(800);
    assert.equal(await status(), "已存檔：片頭", "別的視窗送來的 dirty 不應被採用");
    await engine.evaluate((url) => { location.href = url; }, foreign + "/fc2-evil.html");
    await page.waitForTimeout(1500);
    assert.equal(await status(), "已存檔：片頭", "別的 origin 送來的 dirty 不應被採用");
    assert.equal((await projects("tools.engine.projects")).length, 1, "別的視窗或別的 origin 送來的存檔不應被收");
    console.log("PASS frame hears ready/dirty/save from the engine only (not another window, not another origin)");

    // 3. The save is a filmcraft envelope; the editor's own list did not change.
    const [row] = await projects("tools.engine.projects");
    assert.equal(row.engine, "filmcraft");
    assert.equal(row.engineVersion, "9.9.9-test");
    assert.equal(row.native.fcproj, '{"fcproj":1,"big":12345678901234567890}', "專案原文照存（大整數不被改寫）");
    assert.equal(row.title, "片頭");
    assert.equal((await projects("tools.editor.projects")).length, editorBefore, "自製剪輯的專案數不變");
    // Reopen hands the stored project back to a fresh engine document.
    await tools.click(`[data-engine-act="open:${row.id}"]`);
    engine = await engineFrame();
    await engine.evaluate(() => post({ type: "filmcraft:ready", version: "1", appVersion: "9.9.9-test" }));
    await engine.waitForFunction(() => received.some((r) => r.type === "filmcraft:open" && r.name === "片頭.fcproj"));
    console.log("PASS save -> tools.engine.projects (engine filmcraft), editor projects unchanged, reopen sends it back");

    // 4. F6 inside the engine -> focus on the sidebar of the workbench shell.
    await engine.click("#inside");
    await page.keyboard.press("F6");
    assert(await page.evaluate(() => !!document.activeElement?.closest(".sidebar")), "F6 後焦點應在側欄");
    console.log("PASS F6 in the engine gives focus back to the sidebar");
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
