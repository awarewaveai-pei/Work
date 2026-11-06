// Card P1 (docs/creative-suite-plan-20261102.md §4 P1): Remotion title templates through the /generations queue.
// The remote service is a fake fetchImpl; no real network. Checks config gating, request shape and auth header,
// poll -> download -> media store -> verification, error text without the token, cancel, catalog ids, UI pane.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { spawnSync } = require("node:child_process"),
  ffmpeg = require("ffmpeg-static"),
  { chromium } = require("playwright");
const { isolatedServer } = require("./isolated-server.cjs");
const remotion = require("../backend/remotion.cjs");

const TOKEN = "tok-remotion-SECRET-7731",
  SERVICE = "https://remotion.test",
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-remotion-"));
function make(name, args) {
  const file = path.join(dir, name);
  const r = spawnSync(ffmpeg, ["-y", "-hide_banner", ...args, file], { windowsHide: true, timeout: 120000 });
  assert.equal(r.status, 0, String(r.stderr));
  return file;
}
// Shaped like a real remotion-service file: 150 video frames plus a silent AAC track padded past them (5.0x s).
const mp4 = fs.readFileSync(make("title.mp4", ["-f", "lavfi", "-i", "color=c=navy:s=1920x1080:r=30:d=5", "-f", "lavfi", "-t", "5.056", "-i", "anullsrc=r=48000:cl=stereo", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac"]));
const png = fs.readFileSync(make("bg.png", ["-f", "lavfi", "-i", "testsrc2=size=320x180", "-frames:v", "1"]));

let passed = 0;
const pass = (label) => {
  passed++;
  console.log("PASS " + label);
};
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
// Fake remotion-service: statuses = what successive GET /status answers return (last one repeats).
function fakeService(statuses) {
  const calls = [];
  let polls = 0;
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (url === SERVICE + "/render") return reply({ jobId: "remote-1" });
    if (url === SERVICE + "/status/remote-1") return reply(statuses[Math.min(polls++, statuses.length - 1)]);
    if (url === "https://r2.test/out.mp4") return new Response(mp4, { status: 200, headers: { "Content-Type": "video/mp4", "Content-Length": String(mp4.length) } });
    throw Error("unexpected fetch " + url);
  };
  return { calls, fetchImpl };
}
async function api(base, route, method = "GET", body) {
  const r = await fetch(base + "/api/vw" + route, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body && JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
}
async function upload(base) {
  const r = await api(base, "/uploads", "POST", { name: "背景.png", data: "data:image/png;base64," + png.toString("base64") });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body;
}
const titleInput = (image) => ({
  type: "video", operation: "remotion-template", prompt: "片頭",
  settings: { templateId: "scale-bg-text-slideup", fields: { text: "歡迎收看" }, ratio: "16:9", fps: 30 },
  references: { image: { url: image.url, id: image.id } },
});
async function wait(base, id, done = ["succeeded", "failed", "cancelled"]) {
  for (let i = 0; i < 400; i++) {
    const job = (await api(base, "/generations/" + id)).body;
    if (done.includes(job.status)) return job;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("job timed out");
}
const configured = { REMOTION_SERVICE_URL: SERVICE, MEDIA_RENDER_AUTH_TOKEN: TOKEN };

(async () => {
  // (e) catalog ids exist in the service's TEMPLATE_MAP (one source of truth for ids).
  const serverTs = fs.readFileSync(path.join(__dirname, "../../remotion-service/src/server.ts"), "utf8"),
    map = /const TEMPLATE_MAP[^{]*\{([\s\S]*?)\};/.exec(serverTs)[1],
    ids = [...map.matchAll(/^\s*"([\w-]+)"\s*:/gm)].map((m) => m[1]);
  assert.ok(ids.length >= 5, map);
  for (const t of remotion.catalog) assert.ok(ids.includes(t.id), t.id + " not in TEMPLATE_MAP");
  pass("片頭模板 id 全部存在於 remotion-service TEMPLATE_MAP：" + remotion.catalog.map((t) => t.id).join("、"));

  // (a) not configured.
  {
    const { base, dataDir } = await isolatedServer("vw-remotion-off-");
    const caps = (await api(base, "/capabilities")).body;
    assert.equal(caps.remotion, false);
    const image = await upload(base);
    const r = await api(base, "/generations", "POST", titleInput(image));
    assert.equal(r.status, 503, JSON.stringify(r.body));
    assert.equal(r.body.error.message, "片頭模板服務未設定");
    const ledger = JSON.parse(fs.readFileSync(path.join(dataDir, "jobs.json"), "utf8"));
    assert.equal(ledger.filter((j) => j.input?.operation === "remotion-template").length, 0);
    pass("未設定：capabilities.remotion=false，任務 503 拒絕且不入帳");
  }

  // (b) configured: request shape, auth header, poll, download, ingest, verification, origin.
  {
    const fake = fakeService([{ status: "pending", progress: 0 }, { status: "rendering", progress: 40 }, { status: "done", progress: 100, url: "https://r2.test/out.mp4" }]);
    const { base, dataDir } = await isolatedServer("vw-remotion-on-", { fetchImpl: fake.fetchImpl, env: configured });
    assert.equal((await api(base, "/capabilities")).body.remotion, true);
    const image = await upload(base);
    const created = await api(base, "/generations", "POST", titleInput(image));
    assert.equal(created.status, 202, JSON.stringify(created.body));
    const job = await wait(base, created.body.id);
    assert.equal(job.status, "succeeded", job.error);
    const render = fake.calls.find((c) => c.url === SERVICE + "/render"),
      sent = JSON.parse(render.init.body);
    assert.equal(render.init.method, "POST");
    assert.equal(render.init.headers["X-Render-Token"], TOKEN);
    assert.equal(sent.templateId, "scale-bg-text-slideup");
    assert.equal(sent.outputFormat, "16x9");
    assert.equal(sent.fps, 30);
    assert.equal(sent.durationInFrames, 150);
    assert.equal(sent.props.text, "歡迎收看");
    assert.equal(sent.props.imageUrl, "data:image/png;base64," + png.toString("base64"));
    const polls = fake.calls.filter((c) => c.url === SERVICE + "/status/remote-1");
    assert.equal(polls.length, 3);
    assert.ok(polls.every((c) => c.init.headers["X-Render-Token"] === TOKEN));
    assert.match(job.result.url, /^\/media\/[a-f0-9]{64}\/original\.mp4$/);
    assert.ok(fs.existsSync(path.join(dataDir, job.result.url.slice(1))));
    assert.deepEqual(job.result.verification, { ok: true, findings: [] });
    const streams = spawnSync(require("../backend/media-inspect.cjs").ffprobePath(), ["-v", "error", "-show_entries", "stream=codec_type", "-of", "csv=p=0", path.join(dataDir, job.result.url.slice(1))], { encoding: "utf8" }).stdout.trim();
    assert.equal(streams, "video", "the padded silent audio track is dropped");
    assert.deepEqual(job.result.origin, { kind: "render", engine: "remotion", templateId: "scale-bg-text-slideup", jobId: job.id, remotionJobId: "remote-1", parentAssetId: image.id, costUsd: 0 });
    assert.equal(job.remotionJobId, "remote-1");
    assert.equal(job.providerId, undefined);
    pass("已設定：POST /render 帶 templateId/props/outputFormat/fps 與 X-Render-Token；pending→rendering→done；下載入素材庫、驗證通過、origin engine=remotion＋parentAssetId");
  }

  // (c) remote error: failed, 繁中, token absent from job JSON and the ledger on disk.
  {
    const fake = fakeService([{ status: "rendering" }, { status: "error", error: "Render failed " + TOKEN }]);
    const { base, dataDir } = await isolatedServer("vw-remotion-err-", { fetchImpl: fake.fetchImpl, env: configured });
    const image = await upload(base);
    const created = await api(base, "/generations", "POST", titleInput(image));
    const job = await wait(base, created.body.id);
    assert.equal(job.status, "failed");
    assert.match(job.error, /^片頭模板渲染失敗：/);
    assert.ok(!JSON.stringify(job).includes(TOKEN), JSON.stringify(job));
    assert.ok(!fs.readFileSync(path.join(dataDir, "jobs.json"), "utf8").includes(TOKEN));
    assert.equal(job.result, undefined);
    pass("遠端錯誤：任務失敗、訊息繁中、token 不出現在任務 JSON 與帳冊");
  }

  // (d) cancel while rendering: cancelled, no asset.
  {
    const fake = fakeService([{ status: "rendering", progress: 10 }]);
    const { base, dataDir } = await isolatedServer("vw-remotion-cancel-", { fetchImpl: fake.fetchImpl, env: configured });
    const image = await upload(base);
    const created = await api(base, "/generations", "POST", titleInput(image));
    for (let i = 0; i < 100 && !fake.calls.some((c) => c.url.includes("/status/")); i++) await new Promise((r) => setTimeout(r, 100));
    const cancelled = await api(base, "/generations/" + created.body.id + "/cancel", "POST", {});
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
    await new Promise((r) => setTimeout(r, 2500));
    const job = (await api(base, "/generations/" + created.body.id)).body;
    assert.equal(job.status, "cancelled");
    assert.equal(job.result, undefined);
    assert.ok(!fake.calls.some((c) => c.url === "https://r2.test/out.mp4"));
    assert.deepEqual(fs.readdirSync(path.join(dataDir, "media")).filter((f) => /^[a-f0-9]{64}$/.test(f)), []);
    pass("渲染中取消：任務 cancelled、沒有下載、沒有資產");
  }

  // (f) UI: 片頭 pane has no <select>; the button is disabled with the reason when the service is not configured.
  {
    const { base } = await isolatedServer("vw-remotion-ui-");
    const browser = await chromium.launch({ channel: "msedge", headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/*", (r) => (r.request().url().startsWith(base + "/") ? r.continue() : r.abort()));
      await page.goto(base + "/pages/tools.html#edit");
      await page.getByRole("button", { name: "新建剪輯專案", exact: true }).click();
      await page.getByRole("button", { name: "建立專案", exact: true }).click();
      await page.waitForSelector("[data-ed-stage]");
      await page.locator('[data-ed-pane="文字"]').click();
      assert.equal(await page.locator(".editor-library select").count(), 0);
      assert.equal(await page.locator(".editor-library button", { hasText: "背景放大＋標題上滑" }).count(), 1);
      const generate = page.getByRole("button", { name: "產生片頭（免費）", exact: true });
      assert.ok(await generate.isDisabled());
      assert.equal(await page.locator("[data-ed-title-blocked]").textContent(), "片頭模板服務未設定");
      assert.deepEqual(errors, []);
      pass("UI：片頭面板沒有下拉選單；服務未設定時按鈕停用並顯示「片頭模板服務未設定」");
    } finally {
      await browser.close();
    }
  }
  console.log(passed + " passed");
})().catch((error) => {
  console.error("FAIL", error);
  process.exit(1);
});
