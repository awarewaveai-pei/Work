const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright"),
  assert = require("node:assert/strict");
(async () => {
  const { base } = await require("./isolated-server.cjs").isolatedServer("vw-layouts-");
  const b = await chromium.launch({ channel: "msedge" }),
    p = await b.newPage({ viewport: { width: 1440, height: 900 } }),
    errors = [];
  p.setDefaultTimeout(8000);
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(base);
  await p.locator("#toolsNav").click();
  let f = p.frameLocator("#toolsFrame");
  await f.locator('[data-act^="open:"]').first().waitFor();
  const actions = await f
    .locator('[data-act^="open:"]')
    .evaluateAll((nodes) => nodes.map((x) => x.dataset.act));
  for (const a of actions) {
    await f.locator(`[data-act="${a}"]`).click();
    await f.locator("[data-act=home]").first().click();
  }
  console.log("PASS 全部 " + actions.length + " 個工具開啟與返回");
  await p.locator("#storyboardsNav").click();
  f = p.frameLocator("#storyboardsFrame");
  await f.locator("[data-id]").first().click();
  await f.locator(".modal:not([hidden])").waitFor();
  const shape = await p.locator("#storyboardsFrame").evaluate((el) => {
    const d = el.contentDocument,
      w = el.contentWindow,
      modal = d.querySelector(".modal:not([hidden])"),
      dialog = modal.querySelector(".dialog");
    return {
      width: dialog.getBoundingClientRect().width,
      viewport: w.innerWidth,
      body: d.body.style.overflow,
      modalOverflow: w.getComputedStyle(modal).overflowY,
    };
  });
  assert(Math.abs(shape.width - shape.viewport) < 2, JSON.stringify(shape));
  assert.equal(shape.body, "hidden");
  assert.equal(shape.modalOverflow, "auto");
  console.log("PASS 分鏡詳情全頁且只有一層捲動");
  await p.locator("#templatesNav").click();
  f = p.frameLocator("#templatesFrame");
  await f.locator("[data-id]").first().click();
  await f.locator("#back").click();
  await f.locator("[data-id]").first().waitFor();
  console.log("PASS 模板詳情開啟與返回");
  await p.setViewportSize({ width: 390, height: 844 });
  assert(await p.locator("#charactersNav").isVisible());
  await p.locator("#charactersNav").click();
  await p
    .frameLocator("#charactersFrame")
    .locator("[data-act=open]")
    .first()
    .waitFor();
  console.log("PASS 手機導覽可點擊");
  assert.deepEqual(errors, []);
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
