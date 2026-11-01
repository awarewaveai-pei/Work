const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright"),
  assert = require("node:assert/strict");
(async () => {
  const b = await chromium.launch({ channel: "msedge" }),
    p = await b.newPage();
  p.setDefaultTimeout(8000);
  await p.goto("http://127.0.0.1:4178");
  await p.waitForFunction(() => SeedStar?.models);
  const checks = await p.evaluate(() => {
    const M = SeedStar.models;
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
    SeedStar.characters.save({
      id: "edit",
      name: "原名",
      references: [],
      tags: [],
      inLibrary: true,
      image: "/assets/image-1.webp",
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
    (await SeedStar.characters.list()).some((x) => x.name === "跨頁修改"),
  );
  console.log("PASS 跨頁快照後仍按ID保存角色");
  await p.locator("#toolsNav").click();
  const lib = await tools
    .locator('[data-act^="open:"]')
    .evaluateAll((nodes) => nodes.map((x) => x.dataset.act));
  for (const act of lib) {
    await tools.locator(`[data-act="${act}"]`).click();
    if (await tools.locator('[data-act^="library:"]').count()) break;
    await tools.locator("[data-act=home]").first().click();
  }
  await tools.locator('[data-act^="library:"]').first().click();
  await tools.locator(".asset-workspace").waitFor();
  assert.match(await tools.locator(".asset-workspace").innerText(), /跨頁修改/);
  console.log("PASS 角色素材可在工具庫選取");
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
