// Card ED.1.4 (docs/ed3-properties-spec-20261106.md §11): 預覽畫質 720P plays a real preview720.mp4 (short side 720,
// made on first ask beside the original); 1080P plays the original / proxy. Real browser, isolated server.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { spawnSync } = require("node:child_process"),
  ffmpeg = require("ffmpeg-static"),
  { inspectMedia } = require("../backend/media-inspect.cjs"),
  { isolatedServer } = require("./isolated-server.cjs"),
  { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const pass = (m) => console.log("PASS " + m);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vw-ed14-files-"));
function make(name, size) {
  const file = path.join(tmp, name),
    r = spawnSync(ffmpeg, ["-y", "-hide_banner", "-f", "lavfi", "-i", `testsrc2=size=${size}:rate=30:duration=2`, "-f", "lavfi", "-i",
      "sine=frequency=440:sample_rate=48000:duration=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", file],
      { windowsHide: true, timeout: 60000 });
  assert.equal(r.status, 0, String(r.stderr));
  return file;
}
(async () => {
  const { base, dataDir } = await isolatedServer("vw-ed14-");
  const api = (route, body) =>
    fetch(base + "/api/vw" + route, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => {
      assert.equal(r.status, route === "/uploads" ? 201 : 200);
      return r.json();
    });
  const upload = (file) => api("/uploads", { name: path.basename(file), data: "data:video/mp4;base64," + fs.readFileSync(file).toString("base64") });
  const hd = await upload(make("hd.mp4", "1920x1080")),
    small = await upload(make("small.mp4", "640x360"));
  assert.equal(hd.previewUrl, hd.url); // H.264 1080p plays as is: no proxy, so 1080P = the original

  // Two callers at once share one job; the file lands once, no temp file left behind.
  const [a, b] = await Promise.all([api("/media/preview", { url: hd.url }), api("/media/preview", { url: hd.url })]);
  const want = hd.url.replace(/original\.mp4$/, "preview720.mp4");
  assert.equal(a.previewUrl, want);
  assert.equal(b.previewUrl, want);
  const dir = path.dirname(path.join(dataDir, hd.url.slice(1)));
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.includes(".tmp-")), []);
  const info = await inspectMedia(path.join(dir, "preview720.mp4"));
  assert.equal(info.displayHeight, 720);
  assert.equal(info.displayWidth, 1280);
  assert.equal((await fetch(base + want)).status, 200);
  assert.equal((await api("/media/preview", { url: small.url })).previewUrl, null);
  assert.equal((await api("/media/preview", { url: "/generated/x.mp4" })).previewUrl, null);
  pass("POST /media/preview：1920×1080 產生 preview720.mp4（1280×720，可下載），同時兩個請求得到同一檔、不留暫存檔；360p 與非媒體庫網址回 null");

  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*", (r) => (r.request().url().startsWith(base + "/") ? r.continue() : r.abort()));
    await page.goto(base + "/pages/tools.html#edit");
    await page.getByRole("button", { name: "新建剪輯專案", exact: true }).click();
    await page.getByLabel("專案名稱").fill("ED14 畫質");
    await page.getByRole("button", { name: "建立專案", exact: true }).click();
    await page.waitForSelector("[data-ed-stage]");
    await page.evaluate((asset) => edAdd({ ...asset, kind: "video", type: "video/mp4", name: "HD" }), hd);
    await page.waitForSelector('[data-ed-stage] video[data-ed-layer]');
    const src = () => page.evaluate(() => new URL(document.querySelector("[data-ed-stage] video[data-ed-layer]").src).pathname);
    const shot = (name) => page.screenshot({ path: path.join(tmp, name) });
    assert.equal(await src(), hd.url);
    assert.equal(await page.getByRole("button", { name: "1080P", exact: true }).getAttribute("aria-pressed"), "true");

    await page.evaluate(() => (ed.time = 1));
    await page.getByRole("button", { name: "720P", exact: true }).click();
    await page.waitForFunction((u) => document.querySelector("[data-ed-stage] video[data-ed-layer]")?.src.endsWith(u), want);
    await page.waitForFunction(() => {
      const v = document.querySelector("[data-ed-stage] video[data-ed-layer]");
      return v.videoHeight === 720 && v.readyState >= 2 && Math.abs(v.currentTime - 1) < 0.05;
    });
    assert.equal(await page.locator("[data-ed-preview-note]").textContent(), "");
    await shot("720p.png");
    pass("選 720P：舞台 <video> 播 preview720.mp4（videoHeight 720），停在同一秒");

    await page.getByRole("button", { name: "1080P", exact: true }).click();
    await page.waitForFunction((u) => new URL(document.querySelector("[data-ed-stage] video[data-ed-layer]").src).pathname === u, hd.url);
    await page.waitForFunction(() => document.querySelector("[data-ed-stage] video[data-ed-layer]").videoHeight === 1080);
    await shot("1080p.png");
    pass("選 1080P：舞台 <video> 回到原檔（videoHeight 1080）");

    await page.getByRole("button", { name: "720P", exact: true }).click();
    await page.waitForFunction(() => VideoWorkbench.preferences.get("tools.editor.layout", null).then((l) => l?.preview === "720P"));
    await page.reload();
    await page.getByRole("button", { name: "ED14 畫質 · 16:9", exact: true }).click();
    await page.waitForFunction((u) => document.querySelector("[data-ed-stage] video[data-ed-layer]")?.src.endsWith(u), want);
    assert.equal(await page.locator(".editor-transport select").count(), 0);
    assert.deepEqual(errors, []);
    pass("畫質選擇存在個人版面偏好，重開仍是 720P；播放列沒有下拉");
    console.log("EVIDENCE screenshots " + path.join(tmp, "720p.png") + " " + path.join(tmp, "1080p.png"));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error("FAIL", error);
  process.exit(1);
});
