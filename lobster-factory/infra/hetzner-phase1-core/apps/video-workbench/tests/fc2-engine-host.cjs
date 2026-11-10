// Cards FC.2 / EC.2 acceptance (docs/engine-route-plan-20261106.md §9): the engine frame ("專業剪輯" FilmCraft, "專業特效"
// EffectCraft), each against a fake engine page that speaks its ?host=parent bridge (prefix = engine name). Four checks per
// engine: card hidden without engine files; frame reacts to ready/dirty/save and ignores another window, another origin and the
// other engine's prefix; a save lands in tools.engine.projects (editor list untouched) and reopen sends it back; F6 -> the bar.
// Since 2026-11-10 the card opens the engine in its own tab (tools.html?full#<tool>); the workbench never mounts it, a save
// that clashes with the workbench tab is redone without reloading the engine tab, and FilmCraft is switched to English.
// Headless with WebGPU hidden, so the tab shows its GPU warning first and the test takes "仍然開啟".
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { isolatedServer } = require("./isolated-server.cjs");

const ENGINES = [
  { tool: "edit-pro", engine: "filmcraft", other: "effectcraft", ext: "fcproj", fallback: "edit" },
  { tool: "fx-pro", engine: "effectcraft", other: "filmcraft", ext: "ecproj", fallback: "compose" },
];
const FAKE_ENGINE = `<!doctype html><meta charset="utf-8"><button id="inside">engine</button><script>
  window.post = (msg) => { const t = msg.bytes ? [msg.bytes] : []; parent.postMessage(msg, location.origin, t); };
  window.execs = []; window.filmcraft = window.effectcraft = { execute: async (c) => { execs.push(c); return {}; } };
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
    // 0. tools-0.js (which declares `tool`) loads after tools-engine-host.js (tools-boot.js): a click or a closing page in
    // between must not throw "tool is not defined".
    {
      const ctx = await browser.newContext();
      let release;
      const held = new Promise((r) => (release = r));
      await ctx.route((url) => url.pathname.endsWith("/scripts/tools-0.js"), async (route) => (await held, route.continue()));
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (err) => errors.push(err.message));
      await page.goto(base + "/pages/tools.html");
      await page.waitForFunction(() => typeof engineFor === "function" && typeof render === "undefined");
      await page.evaluate(() => {
        document.body.click();
        window.dispatchEvent(new Event("beforeunload", { cancelable: true }));
      });
      release();
      await page.waitForFunction(() => typeof render === "function");
      assert.deepEqual(errors, [], "tools-0 載入前的點擊／關頁不應拋錯");
      await ctx.close();
      console.log("PASS before tools-0 loads: a click and beforeunload do not throw");
    }
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
      const [full] = await Promise.all([ctx.waitForEvent("page"), tools.click(`[data-act="open:${e.tool}"]`)]);
      full.setDefaultTimeout(15000);
      full.on("pageerror", (err) => errors.push(err.message));
      await full.waitForURL((u) => u.pathname.endsWith("/pages/tools.html") && u.search === "?full" && u.hash === "#" + e.tool); // 卡片要開獨立分頁
      assert.equal(await tools.locator("#engine-host iframe").count(), 0, "工作台裡不再嵌引擎");
      await full.waitForSelector('[data-engine-act="force"]');
      assert.equal(await full.title(), (e.tool === "edit-pro" ? "專業剪輯" : "專業特效") + " · AwareWave");
      const warning = await full.locator(".engine-warn").textContent();
      assert(!warning.includes("沒有可用的獨立顯示卡"), "提醒不可宣稱電腦沒有獨立顯示卡");
      assert(warning.includes("高效能"), "提醒要說怎麼改用獨立顯示卡");
      assert(await full.locator(`#engine-host [data-act="open:${e.fallback}"]`).count(), "提醒畫面要有改用自製工具的按鈕");
      await full.click('[data-engine-act="force"]');
      const engineFrame = async () => {
        const handle = await full.waitForSelector("#engine-host iframe");
        const frame = await handle.contentFrame();
        await frame.waitForFunction(() => typeof window.post === "function");
        return frame;
      };
      const box = await (await full.waitForSelector("#engine-host iframe")).boundingBox();
      assert.equal(await full.locator(".engine-bar b").first().textContent(), e.tool === "edit-pro" ? "專業剪輯" : "專業特效", "上方那一列要有工具名稱");
      assert(box.height > 950 * 0.75, "引擎要佔滿視窗：高 " + box.height);
      let engine = await engineFrame();
      const status = () => full.locator("[data-engine-status]").textContent();
      const projects = async (key, engineName) => (await full.evaluate((k) => VideoWorkbench.preferences.get(k, []), key)).filter((r) => !engineName || r.engine === engineName);
      const editorBefore = (await projects("tools.editor.projects")).length;
      const post = (msg) => engine.evaluate((m) => post({ ...m, ...(m.text ? { bytes: new TextEncoder().encode(m.text).buffer, text: undefined } : {}) }), msg);

      // 2. ready / dirty / save are heard; another window, another origin and the other engine's prefix are not.
      await post({ type: e.engine + ":ready", version: "1", appVersion: "9.9.9-test" });
      await full.waitForFunction(() => eng.ready === true);
      if (e.engine === "filmcraft") await engine.waitForFunction(() => execs.includes("app.language.english"));
      else assert.deepEqual(await engine.evaluate(() => execs), [], "EffectCraft 有繁中，不切語言");
      await post({ type: e.other + ":dirty", dirty: true });
      await full.waitForTimeout(300);
      assert.notEqual(await status(), "尚未存檔", "別的引擎前綴不應被採用");
      await post({ type: e.engine + ":dirty", dirty: true });
      await full.waitForFunction(() => document.querySelector("[data-engine-status]").textContent === "尚未存檔");
      await post({ type: e.engine + ":save", name: `片頭.${e.ext}`, saveAs: true, text: '{"proj":1,"big":12345678901234567890}' });
      await post({ type: e.engine + ":dirty", dirty: false });
      // "已存檔" only once the workbench store has the project (not when the engine alone says so).
      await full.waitForFunction(() => document.querySelector("[data-engine-status]").textContent === "已存檔：片頭");
      assert.equal((await projects("tools.engine.projects", e.engine)).length, 1);
      await full.evaluate(() => { const f = document.createElement("iframe"); f.src = "/fc2-other.html"; document.body.append(f); });
      await full.evaluate((p) => window.postMessage({ type: p + ":dirty", dirty: true }, location.origin), e.engine);
      await full.waitForTimeout(800);
      assert.equal(await status(), "已存檔：片頭", "別的視窗送來的 dirty 不應被採用");
      await engine.evaluate((url) => { location.href = url; }, foreign + "/fc2-evil.html");
      await full.waitForTimeout(1500);
      assert.equal(await status(), "已存檔：片頭", "別的 origin 送來的 dirty 不應被採用");
      assert.equal((await projects("tools.engine.projects", e.engine)).length, 1, "別的視窗或別的 origin 送來的存檔不應被收");
      console.log(`PASS ${e.engine}: frame hears ready/dirty/save from its engine only (not another window, origin or prefix)`);

      // 3. The save is an envelope of this engine; the editor's own list did not change; reopen sends it back.
      const [row] = await projects("tools.engine.projects", e.engine);
      assert.equal(row.engineVersion, "9.9.9-test");
      assert.equal(row.native[e.ext], '{"proj":1,"big":12345678901234567890}', "專案原文照存（大整數不被改寫）");
      assert.equal(row.title, "片頭");
      assert.equal((await projects("tools.editor.projects")).length, editorBefore, "自製剪輯的專案數不變");
      await full.click(".engine-bar summary"); // the saved list sits folded under the bar
      await full.click(`[data-engine-act="open:${row.id}"]`);
      engine = await engineFrame();
      await post({ type: e.engine + ":ready", version: "1", appVersion: "9.9.9-test" });
      await engine.waitForFunction(([t, n]) => received.some((r) => r.type === t && r.name === n), [e.engine + ":open", `片頭.${e.ext}`]);
      console.log(`PASS ${e.engine}: save -> tools.engine.projects, editor projects unchanged, reopen sends it back`);

      // 4. F6 inside the engine -> focus on the bar above it.
      await engine.click("#inside");
      await full.keyboard.press("F6");
      assert(await full.evaluate(() => !!document.activeElement?.closest(".engine-bar")), "F6 後焦點應在上方那一列");
      console.log(`PASS ${e.engine}: F6 in the engine gives focus back to the bar`);

      // 5. The workbench tab saves first; the engine tab's next save is redone on that state, without a reload.
      await full.evaluate(() => (window.notReloaded = true));
      // The workbench tab is behind the engine tab's earlier saves; reloaded, it holds the current state and saves first.
      await page.reload();
      await page.click("#toolsNav");
      const shell = await (await page.waitForSelector("#toolsFrame")).contentFrame();
      await shell.waitForFunction(() => typeof engineAvailable === "object" && Object.keys(engineAvailable).length === 2 && document.querySelector(".tool-card"));
      await shell.evaluate(() => VideoWorkbench.preferences.set("test.otherTab", 1));
      await post({ type: e.engine + ":save", name: `片頭.${e.ext}`, saveAs: false, text: '{"proj":2}' });
      await full.waitForFunction(() => document.querySelector("[data-engine-status]").textContent === "已存檔：片頭");
      assert.equal(await full.evaluate(() => window.notReloaded), true, "引擎分頁不可被重新整理");
      assert.equal(await full.evaluate(() => VideoWorkbench.preferences.get("test.otherTab")), 1, "另一個分頁的資料要保留");
      const [after] = await projects("tools.engine.projects", e.engine);
      assert.equal(after.native[e.ext], '{"proj":2}', "撞到另一個分頁後的存檔要重做成功");
      // Clicking the card again refocuses the same tab instead of opening (and reloading) another.
      await shell.click(`[data-act="open:${e.tool}"]`);
      await shell.waitForTimeout(500);
      assert.equal(ctx.pages().length, 2, "第二次按卡片不開第二個分頁");
      assert.equal(await full.evaluate(() => window.notReloaded), true, "第二次按卡片不可重新載入引擎分頁");
      console.log(`PASS ${e.engine}: save clash with the workbench tab is redone in place; card refocuses the one tab`);

      // 6. Any one-item write of the engine tab that loses to the workbench tab is redone, not dropped (a render's asset).
      const workbench = async () => {
        await page.reload();
        await page.click("#toolsNav");
        const f = await (await page.waitForSelector("#toolsFrame")).contentFrame();
        await f.waitForFunction(() => typeof engineAvailable === "object" && Object.keys(engineAvailable).length === 2);
        return f;
      };
      await (await workbench()).evaluate(() => VideoWorkbench.preferences.set("test.otherTab", 2));
      const clashAsset = { id: "fc2-clash-" + e.engine, kind: "video", type: "video/mp4", name: "clash.mp4", url: "/generated/00000000-0000-4000-8000-000000000001.mp4" };
      await full.evaluate((a) => VideoWorkbench.assets.save(a), clashAsset);
      const shell2 = await workbench();
      assert((await shell2.evaluate(() => VideoWorkbench.assets.list())).some((x) => x.id === clashAsset.id), "撞到另一個分頁後，素材要重做寫入");
      assert.equal(await shell2.evaluate(() => VideoWorkbench.preferences.get("test.otherTab")), 2, "另一個分頁的資料要保留");
      assert.equal(await full.evaluate(() => window.notReloaded), true, "引擎分頁不可被重新整理");
      console.log(`PASS ${e.engine}: an asset write that clashes with the workbench tab is redone, not dropped`);

      // 7. An episode's saved project opened inside the workbench (tools-0.js acceptAsset -> engineOpenProject) opens in the
      // engine's own tab with that project; the workbench never mounts the engine. A saved FilmCraft file is an episode's edit
      // (shared/episode-spine.js adopt: project-ed-<id> / ep-ed-<id>): while the engine check is still running acceptAsset
      // cannot open it, and the tab button then opens that file; its render is a cut of that episode.
      const link = { projectId: "project-ed-" + row.id, episodeId: "ep-ed-" + row.id };
      if (e.engine === "filmcraft") {
        await shell2.evaluate(async ([t, id, l]) => {
          const known = engineAvailable.filmcraft;
          delete engineAvailable.filmcraft;
          await VideoWorkbench.tools.acceptAsset({ tool: t, link: l, edit: { engine: "filmcraft", projectId: id } });
          engineAvailable.filmcraft = known;
          render();
        }, [e.tool, row.id, link]);
        assert(!full.url().includes("project="), "引擎還在確認時，acceptAsset 不會開專案");
        await shell2.click('[data-engine-act="tab"]');
      } else await shell2.evaluate(([t, id]) => VideoWorkbench.tools.acceptAsset({ tool: t, edit: { projectId: id } }), [e.tool, row.id]);
      await full.waitForURL((u) => u.search === "?full&project=" + encodeURIComponent(row.id) && u.hash === "#" + e.tool);
      assert.equal(await shell2.locator("#engine-host iframe").count(), 0, "工作台裡不可嵌入引擎");
      assert.equal(ctx.pages().length, 2, "開專案用同一個引擎分頁");
      await full.click('[data-engine-act="force"]');
      engine = await engineFrame();
      await post({ type: e.engine + ":ready", version: "1", appVersion: "9.9.9-test" });
      await engine.waitForFunction(([t, n]) => received.some((r) => r.type === t && r.name === n), [e.engine + ":open", `片頭.${e.ext}`]);
      if (e.engine === "filmcraft")
        // This tab's tool draft may name another episode (the workbench tab moved on before this tab reloaded).
        assert.deepEqual(await full.evaluate(() => ((toolLink = { projectId: "other-project", episodeId: "other-episode" }), engineRenderLink())), { ...link, tool: "edit-pro", step: "export", target: "output" }, "成片歸屬＝擁有這個檔案的那一集");
      console.log(`PASS ${e.engine}: opening a saved project from the workbench opens it in the engine tab` + (e.engine === "filmcraft" ? " (also once the engine check ends); its render belongs to the file's episode" : ""));

      // 8. A render on its way back counts as unsaved work: leaving the engine tab asks first.
      const leaveAsks = () => full.evaluate(() => { const ev = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(ev); return ev.defaultPrevented; });
      assert.equal(await leaveAsks(), false);
      await full.evaluate(() => engineRenders.set("fc2-pending", {}));
      assert.equal(await leaveAsks(), true, "輸出中離開要先問");
      await full.evaluate(() => engineRenders.delete("fc2-pending"));
      // ...and while it is being sent to the server, until the server has answered.
      let answer;
      const held = new Promise((r) => (answer = r));
      await ctx.route("**/api/vw/engine/renders", async (route) => (await held, route.fulfill({ status: 400, contentType: "application/json", body: '{"error":{"message":"fc2"}}' })));
      await full.evaluate(() => {
        engineRenders.set("fc2-upload", { engine: eng.cfg.engine, sources: [], cues: [], video: new ArrayBuffer(8), srt: null, timer: null });
        window.fc2Upload = engineSubmitRender("fc2-upload");
      });
      assert.equal(await leaveAsks(), true, "成片上傳中離開要先問");
      answer();
      await full.evaluate(() => window.fc2Upload);
      assert.equal(await leaveAsks(), false, "上傳結束後不再攔");
      await ctx.unroute("**/api/vw/engine/renders");
      console.log(`PASS ${e.engine}: a render on its way back or being sent makes leaving the engine tab ask first`);
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
