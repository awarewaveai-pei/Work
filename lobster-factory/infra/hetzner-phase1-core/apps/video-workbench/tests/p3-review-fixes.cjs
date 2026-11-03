// Card P3 Codex review fixes (agency-os/reports/oracle/2026-11-03-partialreview-f1bf54fd.md):
// #1 output draws each layer's ORIGINAL (a 1440p source keeps its detail; a non-decodable original blocks output);
// #2 frames are batched by size, a too-large frame / session fails clearly; #3 idle sessions are dropped;
// #4 「更新片段」 updates the clip that started it even if the selection changes meanwhile;
// #5 a layer whose media is missing aborts the output and cancels the server session; #6 取消輸出 shows and works.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { spawnSync } = require("node:child_process"),
  ffmpeg = require("ffmpeg-static"),
  { chromium } = require("playwright");
const { isolatedServer } = require("./isolated-server.cjs"),
  { createCompositorRenders } = require("../backend/compositor-render.cjs");

let passed = 0;
const pass = (label) => {
  passed++;
  console.log("PASS " + label);
};
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-p3-fixes-"));
function make(name, args) {
  const file = path.join(dir, name);
  const r = spawnSync(ffmpeg, ["-y", "-hide_banner", ...args, file], { windowsHide: true, timeout: 120000 });
  assert.equal(r.status, 0, String(r.stderr));
  return file;
}
const sessionDirs = (dataDir) => (fs.existsSync(path.join(dataDir, "compositor")) ? fs.readdirSync(path.join(dataDir, "compositor")) : []);
const PNG1 = "data:image/png;base64," + Buffer.from(spawnSync(ffmpeg, ["-v", "error", "-f", "lavfi", "-i", "color=c=red@0.5:s=16x16,format=rgba", "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-"], { windowsHide: true }).stdout).toString("base64");

(async () => {
  // ---- #3 idle timeout, #2 server caps (module level, injectable clock and limits) ----
  {
    let clock = 1000;
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-p3-idle-"));
    const r = createCompositorRenders({ dataDir, mediaStore: {}, output: () => "", limits: { idleMs: 120000, frameBytes: 400, sessionBytes: 900 }, now: () => clock });
    const make4 = () => Array.from({ length: 4 }, () => r.create({ width: 16, height: 16, frames: 10, fps: { num: 30, den: 1 } }).id);
    const first = make4();
    assert.throws(() => r.create({ width: 16, height: 16, frames: 10, fps: { num: 30, den: 1 } }), /太多/);
    clock += 60000;
    r.frames(first[0], { start: 0, frames: [PNG1] }); // activity keeps this one alive
    clock += 61000;
    const fifth = r.create({ width: 16, height: 16, frames: 10, fps: { num: 30, den: 1 } });
    assert.equal(r.sessions(), 2, "the three idle sessions were dropped; the active one stays");
    assert.equal(sessionDirs(dataDir).length, 2, "their directories are removed too");
    assert.throws(() => r.frames(first[1], { start: 0, frames: [PNG1] }), (e) => e.status === 404 && /閒置逾時/.test(e.message));
    assert.deepEqual(fifth.limits, { requestBytes: 24 * 1024 * 1024, frameBytes: 400, idleMs: 120000 });
    // Per-frame cap and per-session cap.
    const big = "data:image/png;base64," + Buffer.concat([Buffer.from(PNG1.split(",")[1], "base64"), Buffer.alloc(500)]).toString("base64");
    assert.throws(() => r.frames(fifth.id, { start: 0, frames: [big] }), (e) => e.status === 413 && /單格上限/.test(e.message));
    const small = Buffer.from(PNG1.split(",")[1], "base64").length;
    const n = Math.floor(900 / small) + 1;
    assert.throws(() => {
      for (let i = 0; i < n; i++) r.frames(fifth.id, { start: i, frames: [PNG1] });
    }, (e) => e.status === 413 && /總量超過上限/.test(e.message));
    assert.equal(r.sessions(), 1, "the session over its total is dropped");
    pass("#3 閒置 120 秒的輸出工作被清掉（含目錄），有送影格的保留；#2 伺服器單格與單次工作總量上限");
  }

  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--disable-features=WebGPU"] });
  try {
    const REQUEST = 1536 * 1024;
    const A = await isolatedServer("vw-p3-fixes-a-", { env: { VW_COMPOSITOR_REQUEST_BYTES: String(REQUEST) } });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*", (r) => (r.request().url().startsWith(A.base + "/") ? r.continue() : r.abort()));
    const bodies = [];
    page.on("request", (r) => r.url().includes("/compositor/renders/") && r.url().endsWith("/frames") && bodies.push(r.postData().length));
    const status = (re) => page.waitForFunction((src) => new RegExp(src).test(document.querySelector("[data-cp-status]")?.textContent || ""), re.source, { timeout: 240000 });
    const assetCount = () => page.evaluate(async () => (await SeedStar.assets.list()).length);

    // ---- #2 client batching by size ----
    await page.goto(A.base + "/pages/tools.html#compose");
    await page.getByRole("button", { name: "新增片頭範本" }).first().click();
    await page.waitForSelector("[data-cp-canvas]");
    await page.getByRole("button", { name: "輸出透明影片" }).click();
    await status(/已輸出/);
    assert.ok(bodies.length > 1, "more than one request");
    assert.ok(Math.max(...bodies) <= Math.ceil((REQUEST * 4) / 3) + 4096, "every /frames body under the server's request size: " + Math.max(...bodies));
    pass(`#2 影格依大小分批：${bodies.length} 次送出，每次 ≤ ${(REQUEST / 1048576).toFixed(1)} MB（伺服器給的上限）`);

    // ---- #6 cancel shows and works mid-render ----
    const before = await assetCount();
    await page.getByRole("button", { name: "輸出透明影片" }).click();
    const cancel = page.locator("[data-cp-render-controls]").getByRole("button", { name: "取消輸出", exact: true });
    await cancel.waitFor();
    await page.waitForFunction(() => cp.render?.done >= 3);
    assert.equal(await page.getByRole("button", { name: "輸出透明影片" }).isDisabled(), true);
    await cancel.click();
    await status(/已取消輸出/);
    assert.equal(await assetCount(), before, "no asset from a cancelled render");
    assert.deepEqual(sessionDirs(A.dataDir), [], "server session cancelled and its frames removed");
    assert.equal(await cancel.count(), 0);
    pass("#6 輸出中出現「取消輸出」，按下後停止：沒有新素材、伺服器工作與暫存影格已刪");

    // ---- #5 a media layer without its media aborts output ----
    await page.evaluate(async () => {
      const l = Compositor.newLayer("image", { id: "Lmissing", name: "缺圖", outFrame: 90 });
      cp.doc.layers.unshift(l);
      cpTouch();
      render();
    });
    await page.getByRole("button", { name: "輸出透明影片" }).click();
    await status(/缺少素材：缺圖/);
    assert.equal(await assetCount(), before);
    assert.deepEqual(sessionDirs(A.dataDir), [], "server session cancelled");
    pass("#5 圖層缺素材：輸出中止並顯示「缺少素材：缺圖」，伺服器工作取消、不產生素材");

    // ---- #1 output uses the original, preview the proxy; a non-decodable original blocks output ----
    // A still, fine-detailed picture (no motion, so frame timing cannot blur the comparison): what a 1080p proxy loses.
    const still = make("hi.png", ["-f", "lavfi", "-i", "testsrc2=size=2560x1440:rate=1", "-frames:v", "1"]);
    const hi = make("hi.mp4", ["-loop", "1", "-framerate", "30", "-i", still, "-t", "1", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "10", "-pix_fmt", "yuv420p"]);
    const prores = make("prores.mov", ["-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:duration=1", "-c:v", "prores_ks", "-profile:v", "1"]);
    const upload = (file, name) =>
      page.evaluate(async ({ data, name }) => SeedStar.assets.save(await SeedStar.request("/uploads", { name, data })), { data: "data:video/" + (name.endsWith("mov") ? "quicktime" : "mp4") + ";base64," + fs.readFileSync(file).toString("base64"), name });
    const hiAsset = await upload(hi, "hi.mp4");
    assert.match(hiAsset.previewUrl, /proxy\.mp4$/, "1440p source gets a 1080p proxy");
    await page.evaluate(async (a) => {
      const l = Compositor.newLayer("video", { id: "Lhi", name: "高解析", outFrame: 10, url: a.url, previewUrl: a.previewUrl, assetId: a.id });
      Object.assign(l.props, { x: { value: 0 }, y: { value: 0 }, width: { value: 2560 }, height: { value: 1440 } });
      cp.doc = Compositor.normalize({ id: "Chi", title: "高解析", width: 2560, height: 1440, durationFrames: 10, layers: [l] });
      cp.layer = "Lhi";
      await cpSave();
      render();
    }, hiAsset);
    await page.getByRole("button", { name: "輸出透明影片" }).click();
    await status(/已輸出/);
    const out = await page.evaluate(async () => (await SeedStar.assets.list()).filter((a) => a.origin?.compositionId === "Chi").at(-1));
    const outFile = path.join(A.dataDir, out.url.slice(1)),
      proxyFile = path.join(A.dataDir, hiAsset.previewUrl.slice(1));
    // Detail = mean |Laplacian| of the luma at 2560x1440 (colour-matrix independent: the browser and ffmpeg may convert
    // YUV with different matrices, which would swamp a PSNR). A 1080p proxy scaled back up loses fine edges.
    const detail = (file) => {
      const r = spawnSync(ffmpeg, ["-v", "error", "-i", file, "-vf", "select=eq(n\\,5),scale=2560:1440:flags=bicubic,format=gray", "-frames:v", "1", "-f", "rawvideo", "-"], { windowsHide: true, maxBuffer: 1 << 24 });
      const g = r.stdout, W = 2560, H = 1440;
      assert.equal(g.length, W * H, String(r.stderr));
      let sum = 0;
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; sum += Math.abs(4 * g[i] - g[i - 1] - g[i + 1] - g[i - W] - g[i + W]); }
      return sum / ((W - 2) * (H - 2));
    };
    const dOut = detail(outFile), dOriginal = detail(hi), dProxy = detail(proxyFile);
    assert.ok(Math.abs(dOut - dOriginal) / dOriginal < 0.1 && dOut > dProxy * 1.15, `detail: output ${dOut}, original ${dOriginal}, proxy ${dProxy}`);
    pass(`#1 輸出用原檔：1440p 來源輸出的細節量 ${dOut.toFixed(2)}≈原檔 ${dOriginal.toFixed(2)}，高於 1080p 代理檔 ${dProxy.toFixed(2)}`);

    const proAsset = await upload(prores, "prores.mov");
    await page.evaluate(async (a) => {
      const l = Compositor.newLayer("video", { id: "Lpro", name: "ProRes 片段", outFrame: 10, url: a.url, previewUrl: a.previewUrl, assetId: a.id });
      cp.doc = Compositor.normalize({ id: "Cpro", title: "ProRes", width: 640, height: 360, durationFrames: 10, layers: [l] });
      await cpSave();
      render();
    }, proAsset);
    await page.getByRole("button", { name: "輸出透明影片" }).click();
    await status(/無法在瀏覽器解碼/);
    assert.match(await page.locator("[data-cp-status]").textContent(), /圖層「ProRes 片段」的原始素材無法在瀏覽器解碼/);
    assert.deepEqual(sessionDirs(A.dataDir), []);
    pass("#1 原檔瀏覽器無法解碼（ProRes）：擋下輸出並指出圖層名稱，不改用代理檔");

    // ---- #4 the update applies to the clip that started it ----
    const comp = await page.evaluate(async (a) => {
      const P = (url) => ({ id: crypto.randomUUID(), kind: "video", url, previewUrl: url, name: "x" });
      const old = { ...P(a.previewUrl), id: "asset-rev1", origin: { kind: "render", engine: "workbench-compositor", compositionId: "Chi", compositionRevision: 0 } };
      const project = { id: "proj4", title: "更新測試", ratio: "16:9", tracks: {}, markers: [], assets: [], clips: [
        { id: "clip-main", kind: "video", track: "V1", asset: { ...P(a.previewUrl), id: "asset-main" }, start: 0, duration: 0.3, sourceStart: 0, speed: 1 },
        { id: "clip-comp", kind: "video", track: "V2", asset: old, start: 0, duration: 0.3, sourceStart: 0, speed: 1, x: 50, y: 50, width: 100 },
      ] };
      await SeedStar.preferences.set("tools.editor.projects", [project]);
      return (await SeedStar.compositions.list()).find((c) => c.id === "Chi");
    }, hiAsset);
    assert.ok(comp.revision >= 1);
    await page.goto(A.base + "/pages/tools.html?u=1#edit");
    await page.getByRole("button", { name: "更新測試 · 16:9", exact: true }).click();
    await page.locator('[data-ed-clip="clip-comp"]').click();
    const update = page.getByRole("button", { name: "有新版本：更新片段", exact: true });
    await update.waitFor();
    // While the update waits on probing the new asset, the selection moves to the main-track clip.
    await page.evaluate(() => {
      const probe = edProbe;
      edProbe = async (asset) => {
        ed.selected = "clip-main";
        return probe(asset);
      };
    });
    await update.click();
    await page.waitForFunction(() => edProject().clips.find((c) => c.id === "clip-comp").asset.id !== "asset-rev1");
    const clips = await page.evaluate(async () => {
      await ed.queue;
      return structuredClone(edProject().clips);
    });
    const compClip = clips.find((c) => c.id === "clip-comp"), mainClip = clips.find((c) => c.id === "clip-main");
    assert.equal(compClip.asset.origin.compositionRevision, comp.revision);
    assert.deepEqual(compClip.previousAssetIds, ["asset-rev1"]);
    assert.equal(mainClip.asset.id, "asset-main", "the newly selected clip is untouched");
    assert.equal(mainClip.previousAssetIds, undefined);
    pass("#4 更新途中改選其他片段：只更新按下更新的那個合成片段，其他片段不變");
    assert.deepEqual(errors, []);

    // ---- #2 a frame over the server's per-frame cap fails with a clear message ----
    const B = await isolatedServer("vw-p3-fixes-b-", { env: { VW_COMPOSITOR_FRAME_BYTES: "20000" } });
    const page2 = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page2.route("**/*", (r) => (r.request().url().startsWith(B.base + "/") ? r.continue() : r.abort()));
    await page2.goto(B.base + "/pages/tools.html#compose");
    await page2.getByRole("button", { name: "新增片頭範本" }).first().click();
    await page2.waitForSelector("[data-cp-canvas]");
    await page2.getByRole("button", { name: "輸出透明影片" }).click();
    await page2.waitForFunction(() => /單格上限/.test(document.querySelector("[data-cp-status]")?.textContent || ""), null, { timeout: 120000 });
    assert.match(await page2.locator("[data-cp-status]").textContent(), /第 \d+ 格 PNG 約 [\d.]+ MB，超過單格上限/);
    assert.deepEqual(sessionDirs(B.dataDir), []);
    pass("#2 單格 PNG 超過上限：輸出停止並說明哪一格、多大、上限多少");
  } finally {
    await browser.close();
  }
  console.log(passed + " passed");
})().catch((error) => {
  console.error("FAIL", error);
  process.exit(1);
});
