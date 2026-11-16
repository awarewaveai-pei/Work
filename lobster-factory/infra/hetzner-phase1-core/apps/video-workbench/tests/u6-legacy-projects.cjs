// Plan U6 / §1.6: the projects page lists the main system's projects the workbench did not make (source other than video_workbench) next to the
// workbench's own projects, read only, and a card opens that project in the shell's 審片與發布 frame. A row the workbench
// made (source video_workbench) is left out by the main system (excludeSource=video_workbench, asserted here); a 選題 row, which has a source_ref of its own, is listed. The main system is faked: the capabilities answer and /api/video/projects.
const assert = require("node:assert/strict"),
  { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright"),
  { isolatedServer } = require("./isolated-server.cjs");
let asked = null;
const ORG = "39ad4149-5044-4077-8d9a-b6b916de0e21", OLD = "c5f04233-3a6c-4846-83a4-b50ed1b52979";

(async () => {
  const { base } = await isolatedServer("vw-u6-");
  const browser = await chromium.launch({ channel: "msedge", headless: true }), errors = [];
  try {
    const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    p.setDefaultTimeout(20000);
    p.on("pageerror", (e) => errors.push(e.message));
    await p.route("**/*", async (r) => {
      const url = new URL(r.request().url());
      if (url.pathname === "/api/vw/capabilities") {
        const real = await r.fetch();
        return r.fulfill({ response: real, json: { ...(await real.json()), mainSystem: { organizationId: ORG, externalAudioAllowed: true } } });
      }
      if (url.pathname === "/api/video/projects") {
        asked = url.searchParams.get("excludeSource");
        return r.fulfill({ json: { ok: true, items: [
          { id: OLD, title: "舊的宣傳片", source: "manual", source_ref: null, updated_at: "2026-10-01T00:00:00Z" },
          { id: "5f0c1d7e-2a43-4b8e-9c1d-3e4f5a6b7c8d", title: "選題的影片", source: "content_topic", source_ref: "topic-7", updated_at: "2026-10-15T00:00:00Z" },
        ] } });
      }
      if (url.pathname === "/review-release") return r.fulfill({ contentType: "text/html", body: "<!doctype html><title>review</title>" });
      return url.origin === base ? r.continue() : r.abort();
    });
    await p.goto(base);
    await p.waitForFunction(() => window.VideoWorkbench?.router);
    await p.evaluate(() => VideoWorkbench.navigate("projects"));
    const home = p.frameLocator("#projectsFrame");
    const card = home.locator('[data-action="openLegacy"]');
    await card.first().waitFor();
    assert.equal(await card.count(), 2, "工作台沒做的專案都列出來，含帶 source_ref 的選題");
    assert.match(await card.first().innerText(), /舊的宣傳片[\s\S]*手動/);
    assert.match(await card.nth(1).innerText(), /選題的影片[\s\S]*選題/);
    assert.equal(asked, "video_workbench", "由主系統排除工作台自己的列（清單上限算在舊專案上）");
    await card.first().click();
    await p.waitForFunction(() => document.querySelector("#review-releaseFrame")?.src.includes("/review-release?"));
    const src = new URL(await p.locator("#review-releaseFrame").getAttribute("src"), base);
    assert.deepEqual([src.searchParams.get("organizationId"), src.searchParams.get("project"), src.searchParams.get("section")], [ORG, OLD, "qa"]);
    assert.equal(await p.locator("#review-releaseArea").isVisible(), true);
    assert.equal(await p.locator("#projectsArea").isVisible(), false, "面板在殼內取代專案頁");
    // The door's old /release link comes back as /?open=review-release&...: the shell opens the panel with the rest of the query.
    await p.goto(base + "/?open=review-release&organizationId=" + ORG + "&asset=" + OLD + "&section=release");
    await p.waitForFunction(() => document.querySelector("#review-releaseFrame")?.src.includes("section=release"));
    const door = new URL(await p.locator("#review-releaseFrame").getAttribute("src"), base);
    assert.deepEqual([door.pathname, door.searchParams.get("asset"), door.searchParams.has("open")], ["/review-release", OLD, false]);
    assert.deepEqual(errors, []);
    console.log("PASS 舊專案出現在專案頁（唯讀、不重複），點開在殼內開審片與發布");
  } finally {
    await browser.close();
  }
})().catch((e) => (console.error(e), process.exit(1)));
