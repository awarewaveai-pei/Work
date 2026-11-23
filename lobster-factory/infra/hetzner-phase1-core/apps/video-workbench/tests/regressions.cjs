const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright"),
  assert = require("node:assert/strict");
let b;
(async () => {
  const { base } = await require("./isolated-server.cjs").isolatedServer("vw-regressions-");
  b = await chromium.launch({ channel: "msedge" });
  const p = await b.newPage();
  p.setDefaultTimeout(8000);
  await p.goto(base);
  await p.waitForFunction(() => VideoWorkbench?.models);
  const checks = await p.evaluate(() => {
    const M = VideoWorkbench.models;
    let x = M.project({
      id: "p",
      assets: [
        { id: "v", kind: "video", url: "/v.mp4", references: ["old"] },
        { id: "c", kind: "character", references: ["old"] },
      ],
      episodes: [],
    });
    let ui = M.legacyProject(x);
    ui.assets.character[0].refs = [];
    let result = M.project(ui);
    return {
      video: result.assets.some((a) => a.kind === "video"),
      refs: result.assets.find((a) => a.kind === "character").references,
    };
  });
  assert(checks.video);
  assert.deepEqual(checks.refs, []);
  console.log("PASS 未顯示素材保留及參考圖刪除投影");
  await p.evaluate(() =>
    VideoWorkbench.characters.save({
      id: "edit",
      name: "原名",
      references: [],
      tags: [],
      inLibrary: true,
      image: "/assets/test-image-1.png",
    }),
  );
  await p.locator("#charactersNav").click();
  let f = p.frameLocator("#charactersFrame");
  await f.locator("#gallery article").first().waitFor();
  await f.locator("[data-tab=mine]").click();
  await f.locator("[data-act=edit]").first().click();
  await f.locator("#charName").fill("跨頁修改");
  await p.locator("#toolsNav").click();
  let tools = p.frameLocator("#toolsFrame");
  await tools.locator('[data-act^="favorite:"]').first().click();
  await p.locator("#charactersNav").click();
  await f.locator("#save").click();
  await p.waitForFunction(async () =>
    (await VideoWorkbench.characters.list()).some((x) => x.name === "跨頁修改"),
  );
  console.log("PASS 跨頁快照後仍按ID保存角色");
  await p.locator("#toolsNav").click();
  const lib = await tools
    .locator('[data-act^="open:"]')
    .evaluateAll((nodes) => nodes.map((x) => x.dataset.act));
  // Video-only tools filter their library by clip length, so open each tool's library until one
  // that takes images lists the character (tool order is not part of the contract).
  let listed = false;
  for (const act of lib) {
    await tools.locator(`[data-act="${act}"]`).click();
    // A tool whose scripts are not loaded yet first shows a "載入中…" frame (scripts/tools-0.js render) without its buttons;
    // counting library buttons before it is replaced skipped the image tools (region, breakout) at random.
    await tools.locator("#app p[role=status]", { hasText: "載入中" }).waitFor({ state: "detached" });
    if (await tools.locator('[data-act^="library:"]').count()) {
      await tools.locator('[data-act^="library:"]').first().click();
      await tools.locator(".asset-workspace").waitFor();
      listed = /跨頁修改/.test(await tools.locator(".asset-workspace").innerText());
      await tools.locator("[data-picker-close]").first().click();
    }
    if (listed) break;
    await tools.locator("[data-act=home]").first().click();
  }
  assert(listed, "no tool library lists the edited character");
  console.log("PASS 角色素材可在工具庫選取");
  await b.close();
})().catch(async (e) => {
  console.error(e);
  process.exitCode = 1;
  await b?.close().catch(() => {}); // an open browser keeps the process alive after a failure
});
