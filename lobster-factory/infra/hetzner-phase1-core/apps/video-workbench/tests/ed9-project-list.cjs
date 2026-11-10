// Card ED.9 (spec §1.1): the editor's project list. Real browser, isolated data dir; includes a bare pre-M3 project (old data).
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const pass = (m) => console.log("PASS " + m);
(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-ed9-")),
    server = require("../server.cjs").createServer({ dataDir, env: {} });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port,
    browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*", (r) => (r.request().url().startsWith(base + "/") ? r.continue() : r.abort()));
    const list = () => page.goto(base + "/pages/tools.html#edit").then(() => page.reload());

    await page.goto(base + "/pages/tools.html#edit");
    await page.waitForSelector("[data-ed-action=new], .editor-list-empty");
    assert.match(await page.locator(".editor-list-empty").innerText(), /先放一個鏡頭，故事就開始。/);
    assert.equal(await page.getByRole("button", { name: "新建剪輯專案", exact: true }).count(), 1);
    pass("空狀態：文案＋新建");

    // old data: a bare (pre-envelope) project with a still-image clip, saved before the list opens
    await page.evaluate(() =>
      VideoWorkbench.preferences.set("tools.editor.projects", [
        { id: "old-1", title: "舊專案甲", ratio: "9:16", clips: [{ id: "c1", kind: "image", track: "V1", start: 0, duration: 4, asset: { id: "a", url: "/none.png", name: "x.png", type: "image/png" } }], assets: [] },
      ]),
    );
    await page.reload();
    await page.waitForSelector(".editor-list-card");
    await page.getByRole("button", { name: "新建剪輯專案", exact: true }).click();
    await page.getByLabel("專案名稱").fill("新片乙");
    await page.getByRole("button", { name: "建立專案", exact: true }).click();
    await page.waitForSelector("[data-ed-stage]");
    await page.getByRole("button", { name: /回到這一集/ }).click().catch(() => {});
    await list();
    await page.waitForSelector(".editor-list-card");
    assert.equal(await page.locator(".editor-list-card").count(), 2);
    assert.equal(await page.locator("[data-ed-list-count]").textContent(), "2 / 2 個剪輯專案");
    const old = page.locator('[data-ed-list-card="old-1"]');
    assert.match(await old.innerText(), /9:16/);
    assert.match(await old.innerText(), /草稿/);
    assert.match(await old.innerText(), /00:04\.00/);
    assert.match(await old.innerText(), /開啟編輯器 →/);
    assert.match(await old.innerText(), /更新於 —/);
    assert.equal(await old.locator("img").count(), 1);
    const mine = page.locator(".editor-list-card", { hasText: "新片乙" });
    assert.match(await mine.locator(".editor-list-home").innerText(), /屬於 .+ › 第 \d+ 集/);
    pass("舊專案一筆不少；卡片欄位；屬於 專案 › 第 N 集");

    // updatedAt: a content change stamps it and bumps the revision; a save with no change moves neither; it survives a reload
    const meta = (id) => page.evaluate((i) => { const p = ed.projects.find((x) => x.id === i); return { at: p.updatedAt || null, rev: p.revision }; }, id);
    const mineId = await mine.getAttribute("data-ed-list-card");
    const before = await meta(mineId);
    assert.equal(before.at, null);
    await page.evaluate((i) => { ed.projects.find((x) => x.id === i).title = "新片乙2"; return edSave(); }, mineId);
    const changed = await meta(mineId);
    assert(changed.at && changed.rev === before.rev + 1);
    await new Promise((r) => setTimeout(r, 30));
    await page.evaluate(() => edSave());
    assert.deepEqual(await meta(mineId), changed);
    await list();
    await page.waitForSelector(".editor-list-card");
    assert.deepEqual(await meta(mineId), changed);
    await page.evaluate(() => edSave());
    assert.deepEqual(await meta(mineId), changed);
    assert.doesNotMatch(await page.locator('[data-ed-list-card="' + mineId + '"]').innerText(), /更新於 —/);
    pass("updatedAt：改內容才蓋時間、revision +1；只存檔不變；重整後仍不變");

    await page.getByLabel("搜尋專案").fill("新片");
    assert.equal(await page.locator(".editor-list-card").count(), 1);
    assert.equal(await page.locator("[data-ed-list-count]").textContent(), "1 / 2 個剪輯專案");
    await page.getByLabel("搜尋專案").fill("不存在");
    assert.equal(await page.locator(".editor-list-card").count(), 0);
    await page.getByLabel("搜尋專案").fill("");
    assert.equal(await page.locator(".editor-list-card").count(), 2);
    pass("搜尋專案與計數");

    await old.getByRole("button", { name: "重新命名" }).click();
    await page.locator("dialog[open] [data-ed-list-title]").fill("舊專案改名");
    await page.getByRole("button", { name: "儲存", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-ed-list-card="old-1"] .editor-list-name')?.textContent === "舊專案改名");
    await page.waitForFunction(() => ed.save.pending === 0);
    await list();
    await page.waitForSelector(".editor-list-card");
    assert.equal(await page.locator('[data-ed-list-card="old-1"] .editor-list-name').textContent(), "舊專案改名");
    pass("重新命名後重新整理仍在");

    await page.locator('[data-ed-list-card="old-1"]').getByRole("button", { name: "刪除" }).click();
    await page.locator("dialog[open] [data-ed-list-no]").click();
    assert.equal(await page.locator(".editor-list-card").count(), 2);
    await page.locator('[data-ed-list-card="old-1"]').getByRole("button", { name: "刪除" }).click();
    await page.locator("dialog[open]").getByRole("button", { name: "刪除", exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll(".editor-list-card").length === 1);
    await page.waitForFunction(() => ed.save.pending === 0);
    const keys = await page.evaluate(() => fetch("/api/vw/state").then((r) => r.text()));
    assert.match(keys, /tools\.editor\.projects\.deleted-/);
    assert.match(keys, /舊專案改名/);
    await list();
    await page.waitForSelector(".editor-list-card");
    assert.equal(await page.locator(".editor-list-card").count(), 1);
    assert.equal(await page.locator('[data-ed-list-card="old-1"]').count(), 0);
    pass("刪除先確認（取消不動）；確認後備份整份清單");

    await page.locator(".editor-list-open").click();
    await page.waitForSelector("[data-ed-stage]");
    pass("開啟編輯器");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
