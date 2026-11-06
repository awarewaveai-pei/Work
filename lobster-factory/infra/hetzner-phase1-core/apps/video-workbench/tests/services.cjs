const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
process.env.EVIDENCE_DIR ||= fs.mkdtempSync(
  require("node:path").join(require("node:os").tmpdir(), "vw-services-"),
);
(async () => {
  const { base } = await require("./isolated-server.cjs").isolatedServer("vw-services-");
  const b = await chromium.launch({ channel: "msedge" }),
    p = await b.newPage();
  let db = {
      version: 1,
      characters: [],
      projects: [],
      assets: [],
      jobs: [],
      preferences: {},
      selection: {},
    },
    requests = [],
    job = { id: "remote-job", type: "image", status: "queued", progress: 0 },
    fail = false;
  await p.route("**/config.js", (r) =>
    r.fulfill({
      contentType: "text/javascript",
      body: `window.VW_CONFIG={mode:'http',apiBaseUrl:'/api/vw',timeoutMs:1000}`,
    }),
  );
  await p.route("**/api/vw/**", async (r) => {
    const req = r.request(),
      url = new URL(req.url()).pathname;
    requests.push({
      method: req.method(),
      url,
      body: req.postData() ? req.postDataJSON() : null,
    });
    if (url.endsWith("/state")) {
      if (req.method() === "PUT") db = req.postDataJSON();
      return r.fulfill({ json: db });
    }
    // Without a capabilities answer the generator correctly reports the service as not configured.
    if (url.endsWith("/capabilities"))
      return r.fulfill({ json: { image: true, video: true, audio: true, models: { image: "host-image", video: "host-video", audio: "host-audio" } } });
    if (fail) return r.fulfill({ status: 503, json: { error: "unavailable" } });
    if (url.endsWith("/uploads")) {
      await new Promise((ok) => setTimeout(ok, 2500));
      return r.fulfill({ status: 201, json: { id: "up1", url: "/assets/test-image-1.png", kind: "video", type: "video/mp4", name: "slow.mp4" } });
    }
    if (url.endsWith("/cancel")) {
      job = { ...job, status: "cancelled" };
      return r.fulfill({ json: job });
    }
    return r.fulfill({ json: job });
  });
  await p.goto(base);
  await p.waitForFunction(() => window.VideoWorkbench?.showJob);
  await p.evaluate(async () => {
    await VideoWorkbench.ready;
    await VideoWorkbench.characters.save({ id: "c1", name: "API 角色" });
    await VideoWorkbench.assets.save({
      id: "a1",
      name: "API 素材",
      kind: "image",
      url: "/assets/test-image-1.png",
    });
  });
  assert.equal(db.characters[0].name, "API 角色");
  assert.equal(db.assets[0].id, "a1");
  console.log("PASS HTTP 資料保存");
  await p.locator("[data-mode=image]").click();
  await p.evaluate(() =>
    VideoWorkbench.generator.import({
      target: "image",
      title: "Reference",
      image: "/assets/test-image-1.png",
      imagePrompt: "Reference test",
    }),
  );
  await p.locator("#send").click();
  await p.locator(".job-view").waitFor();
  assert.equal(
    requests.find((r) => r.method === "POST" && r.url.endsWith("/generations"))
      .body.references.images[0].url,
    "/assets/test-image-1.png",
  );
  assert.match(await p.locator(".job-view").innerText(), /queued/);
  await p.locator(".job-view button").filter({ hasText: "取消任務" }).click();
  await p.waitForFunction(() =>
    document.querySelector(".job-view").textContent.includes("cancelled"),
  );
  assert(requests.some((r) => r.url.endsWith("/cancel")));
  await p.locator(".job-view button").filter({ hasText: "關閉" }).click();
  console.log("PASS HTTP 任務建立與取消");
  job = { id: "remote-2", type: "image", status: "queued", progress: 0 };
  await p.locator("#send").click();
  await p.locator(".job-view").waitFor();
  job = {
    ...job,
    status: "succeeded",
    progress: 100,
    result: { url: "/assets/test-image-1.png" },
  };
  await p.locator(".job-view img").waitFor({ timeout: 5000 });
  assert(
    requests.some(
      (r) => r.method === "GET" && r.url.endsWith("/generations/remote-2"),
    ),
  );
  await p.locator(".job-view button").filter({ hasText: "關閉" }).click();
  console.log("PASS 任務狀態從後端更新");
  fail = true;
  await p.locator("#send").click();
  await p.locator("#service-error").waitFor();
  assert.match(await p.locator("#service-error").innerText(), /503/);
  assert.equal(await p.locator(".job-view").count(), 0);
  console.log("PASS HTTP 錯誤不會偽裝成功");
  const sanitized = await p.evaluate(() =>
    VideoWorkbench.sanitize(
      '<img src="javascript:alert(1)" onerror="alert(1)"><svg onload="alert(1)"></svg><div style="background:url(javascript:alert(1))">x</div><iframe srcdoc="evil"></iframe>',
    ),
  );
  assert(!/onerror|onload|javascript|srcdoc|<svg|<iframe/.test(sanitized));
  console.log("PASS 注入內容與不安全網址移除");
  // Upload slower than timeoutMs (1000), sent from a child frame: neither the page RPC nor the fetch may give up
  // while the upload is still moving (prod 499s, 2026-11-06).
  fail = false;
  await p.evaluate(() => VideoWorkbench.navigate("tools"));
  await p.waitForFunction(() => document.getElementById("toolsFrame").contentWindow?.VideoWorkbench?.uploadAsset, null, { timeout: 30000 });
  const child = p.frames().find((f) => f.url().includes("pages/tools.html"));
  const up = await child.evaluate(async () => {
    const file = new File([new Uint8Array(200000)], "slow.mp4", { type: "video/mp4" });
    return (await VideoWorkbench.uploadAsset(file)).id;
  });
  assert.equal(up, "up1");
  console.log("PASS 慢速上傳不會頁面通訊逾時");
  fs.writeFileSync(
    process.env.EVIDENCE_DIR + "/services.json",
    JSON.stringify({ passed: 6, requests }, null, 2),
  );
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
