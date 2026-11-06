// Cards FC.2 / EC.2 acceptance (docs/engine-route-plan-20261106.md §9): the engine frame ("專業剪輯" FilmCraft, "專業特效"
// EffectCraft), each against a fake engine page that speaks its ?host=parent bridge (prefix = engine name). Four checks per
// engine: card hidden without engine files; frame reacts to ready/dirty/save and ignores another window, another origin and the
// other engine's prefix; a save lands in tools.engine.projects (editor list untouched) and reopen sends it back; F6 -> sidebar.
// Headless with WebGPU hidden, so the frame shows its GPU warning first and the test takes "仍然開啟".
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { isolatedServer } = require("./isolated-server.cjs");

const ENGINES = [
  { tool: "edit-pro", engine: "filmcraft", other: "effectcraft", ext: "fcproj", fallback: "edit" },
  { tool: "fx-pro", engine: "effectcraft", other: "filmcraft", ext: "ecproj", fallback: "compose" },
];
const FAKE_ENGINE = `<!doctype html><meta charset="utf-8"><button id="inside">engine</button><script>
  window.post = (msg) => { const t = msg.bytes ? [msg.bytes] : []; parent.postMessage(msg, location.origin, t); };
  window.received = []; addEventListener("message", (e) => { if (e.source === parent) received.push({ type: e.data.type, name: e.data.name, size: e.data.bytes && e.data.bytes.byteLength }); });
</script>`;
// Another window on the same origin, and the engine frame navigated to another origin: both post engine messages.
const other = (engine, ext) => `<!doctype html><script>const b = new TextEncoder().encode('{"x":1}').buffer;
  parent.postMessage({ type: "${engine}:dirty", dirty: true }, "*"); parent.postMessage({ type: "${engine}:save", name: "other.${ext}", saveAs: true, bytes: b }, "*", [b]);</script>`;

(async () => {
  const { base } = await isolatedServer("vw-fc2-");
  const foreign = base.replace("127.0.0.1", "localhost");
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--disable-features=WebGPU,WebGPUService", "--disable-webgpu"] });
  const context = async (engineMissing, e) => {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
    await ctx.addInitScript(() => { try { Object.defineProperty(Navigator.prototype, "gpu", { get: () => undefined, configurable: true }); } catch {} });
    await ctx.route((url) => /^\/engines\/(filmcraft|effectcraft)\/web\/index\.html$/.test(url.pathname), (route) => {
      const u = new URL(route.request().url());
      if (engineMissing) return route.fulfill({ status: 404, body: "" });
      if (u.searchParams.has("host")) return route.fulfill({ contentType: "text/html", body: FAKE_ENGINE });
      return route.fulfill({ contentType: "text/html", body: "" }); // engine "installed" without the real build (clean checkout)
    });
    if (e) await ctx.route((url) => /fc2-(other|evil)\.html$/.test(url.pathname), (route) => route.fulfill({ contentType: "text/html", body: other(e.engine, e.ext) }));
    const page = await ctx.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(base + "/");
    await page.click("#toolsNav");
    const tools = await (await page.waitForSelector("#toolsFrame")).contentFrame();
    await tools.waitForFunction(() => typeof engineAvailable === "object" && Object.keys(engineAvailable).length === 2 && document.querySelector(".tool-card"));
    return { ctx, page, tools, errors };
  };
  try {
    // 1. No engine files -> neither card.
    {
      const { ctx, tools, errors } = await context(true);
      for (const e of ENGINES) {
        assert.equal(await tools.locator(`[data-act="open:${e.tool}"]`).count(), 0, e.engine + " 引擎檔不存在時不應顯示");
        assert(await tools.locator(`[data-act="open:${e.fallback}"]`).count(), "自製工具仍在：" + e.fallback);
      }
      assert.deepEqual(errors, []);
      await ctx.close();
      console.log("PASS no engine files -> no 專業剪輯 / 專業特效 card");
    }
    for (const e of ENGINES) {
      const { ctx, page, tools, errors } = await context(false, e);
      await tools.click(`[data-act="open:${e.tool}"]`);
      await tools.waitForSelector('[data-engine-act="force"]');
      assert(await tools.locator(`#engine-host [data-act="open:${e.fallback}"]`).count(), "提醒畫面要有改用自製工具的按鈕");
      await tools.click('[data-engine-act="force"]');
      const engineFrame = async () => {
        const handle = await tools.waitForSelector("#engine-host iframe");
        const frame = await handle.contentFrame();
        await frame.waitForFunction(() => typeof window.post === "function");
        return frame;
      };
      let engine = await engineFrame();
      const status = () => tools.locator("[data-engine-status]").textContent();
      const projects = async (key, engineName) => (await tools.evaluate((k) => VideoWorkbench.preferences.get(k, []), key)).filter((r) => !engineName || r.engine === engineName);
      const editorBefore = (await projects("tools.editor.projects")).length;
      const post = (msg) => engine.evaluate((m) => post({ ...m, ...(m.text ? { bytes: new TextEncoder().encode(m.text).buffer, text: undefined } : {}) }), msg);

      // 2. ready / dirty / save are heard; another window, another origin and the other engine's prefix are not.
      await post({ type: e.engine + ":ready", version: "1", appVersion: "9.9.9-test" });
      await tools.waitForFunction(() => eng.ready === true);
      await post({ type: e.other + ":dirty", dirty: true });
      await page.waitForTimeout(300);
      assert.notEqual(await status(), "尚未存檔", "別的引擎前綴不應被採用");
      await post({ type: e.engine + ":dirty", dirty: true });
      await tools.waitForFunction(() => document.querySelector("[data-engine-status]").textContent === "尚未存檔");
      await post({ type: e.engine + ":save", name: `片頭.${e.ext}`, saveAs: true, text: '{"proj":1,"big":12345678901234567890}' });
      await post({ type: e.engine + ":dirty", dirty: false });
      // "已存檔" only once the workbench store has the project (not when the engine alone says so).
      await tools.waitForFunction(() => document.querySelector("[data-engine-status]").textContent === "已存檔：片頭");
      assert.equal((await projects("tools.engine.projects", e.engine)).length, 1);
      await tools.evaluate(() => { const f = document.createElement("iframe"); f.src = "/fc2-other.html"; document.body.append(f); });
      await tools.evaluate((p) => window.postMessage({ type: p + ":dirty", dirty: true }, location.origin), e.engine);
      await page.waitForTimeout(800);
      assert.equal(await status(), "已存檔：片頭", "別的視窗送來的 dirty 不應被採用");
      await engine.evaluate((url) => { location.href = url; }, foreign + "/fc2-evil.html");
      await page.waitForTimeout(1500);
      assert.equal(await status(), "已存檔：片頭", "別的 origin 送來的 dirty 不應被採用");
      assert.equal((await projects("tools.engine.projects", e.engine)).length, 1, "別的視窗或別的 origin 送來的存檔不應被收");
      console.log(`PASS ${e.engine}: frame hears ready/dirty/save from its engine only (not another window, origin or prefix)`);

      // 3. The save is an envelope of this engine; the editor's own list did not change; reopen sends it back.
      const [row] = await projects("tools.engine.projects", e.engine);
      assert.equal(row.engineVersion, "9.9.9-test");
      assert.equal(row.native[e.ext], '{"proj":1,"big":12345678901234567890}', "專案原文照存（大整數不被改寫）");
      assert.equal(row.title, "片頭");
      assert.equal((await projects("tools.editor.projects")).length, editorBefore, "自製剪輯的專案數不變");
      await tools.click(`[data-engine-act="open:${row.id}"]`);
      engine = await engineFrame();
      await post({ type: e.engine + ":ready", version: "1", appVersion: "9.9.9-test" });
      await engine.waitForFunction(([t, n]) => received.some((r) => r.type === t && r.name === n), [e.engine + ":open", `片頭.${e.ext}`]);
      console.log(`PASS ${e.engine}: save -> tools.engine.projects, editor projects unchanged, reopen sends it back`);

      // 4. F6 inside the engine -> focus on the sidebar of the workbench shell.
      await engine.click("#inside");
      await page.keyboard.press("F6");
      assert(await page.evaluate(() => !!document.activeElement?.closest(".sidebar")), "F6 後焦點應在側欄");
      console.log(`PASS ${e.engine}: F6 in the engine gives focus back to the sidebar`);
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
