// Card P1 acceptance (docs/creative-suite-plan-20261102.md §4 P1): upload -> new project -> clip, trim, text ->
// save -> reload -> reopen (frame-exact) -> export 720p -> the export is a library asset with origin render,
// parentAssetId and projectId, and its file passes verifyOutput. A pre-M3 project still opens and exports.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { spawnSync } = require("node:child_process"),
  ffmpeg = require("ffmpeg-static"),
  { chromium } = require("playwright");
const { isolatedServer } = require("./isolated-server.cjs"),
  { verifyOutput } = require("../backend/media-inspect.cjs");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-p1-loop-"));
function make(name, args) {
  const file = path.join(dir, name);
  const r = spawnSync(ffmpeg, ["-y", "-hide_banner", ...args, file], { windowsHide: true, timeout: 60000 });
  assert.equal(r.status, 0, String(r.stderr));
  return file;
}
const video = make("p1-clip.mp4", ["-f", "lavfi", "-i", "testsrc2=size=320x180:rate=30:duration=3", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=3",
  "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest"]);
const image = make("p1-logo.png", ["-f", "lavfi", "-i", "color=c=orange:s=160x90", "-frames:v", "1"]);

let passed = 0;
const pass = (label) => {
  passed++;
  console.log("PASS " + label);
};
async function uploadThroughPane(page, pane, button, file) {
  await page.locator('[data-ed-pane="' + pane + '"]').click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: button, exact: true }).click();
  await (await chooser).setFiles(file);
}
async function waitExportAsset(page) {
  for (let i = 0; i < 1200; i++) {
    const found = await page.evaluate(async () => {
      const job = (await SeedStar.generations.list()).filter((j) => j.input?.operation === "editor-export").at(-1);
      if (!job?.id) return null;
      const asset = (await SeedStar.assets.list()).find((a) => a.id === "job-" + job.id);
      return asset ? { asset, jobId: job.id } : null;
    });
    if (found) return found;
    await page.waitForTimeout(250);
  }
  throw Error("export asset never reached the library");
}
async function exportProject(page) {
  await page.getByRole("button", { name: "匯出影片", exact: true }).click();
  await page.locator("[data-ed-quality]").selectOption("720p");
  await page.locator("[data-ed-export]").click();
  return waitExportAsset(page);
}

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const { base, dataDir } = await isolatedServer("vw-p1-loop-");
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*", (r) => (r.request().url().startsWith(base + "/") ? r.continue() : r.abort()));
    await page.goto(base + "/pages/tools.html#edit");
    await page.getByRole("button", { name: "新增專案", exact: true }).click();
    await page.getByLabel("專案標題").fill("P1 迴圈");
    await page.getByLabel("影片比例").selectOption("16:9");
    await page.getByRole("button", { name: "建立專案", exact: true }).click();
    await page.waitForSelector("[data-ed-stage]");

    await uploadThroughPane(page, "素材", "上傳素材", video);
    await page.waitForSelector('[data-ed-lane="V1"] [data-ed-clip]', { timeout: 60000 });
    await page.getByLabel("片段長度（秒）").fill("2");
    await page.getByLabel("片段長度（秒）").press("Tab");
    await page.getByLabel("素材起點（秒）").fill("0.5");
    await page.getByLabel("素材起點（秒）").press("Tab");
    await uploadThroughPane(page, "貼圖", "上傳透明 PNG", image);
    await page.waitForSelector('[data-ed-lane="V2"] [data-ed-clip]', { timeout: 60000 });
    await page.locator('[data-ed-pane="文字"]').click();
    await page.getByRole("button", { name: "主標題", exact: true }).click();
    await page.getByLabel("文字內容").fill("P1 LOOP");
    await page.getByLabel("文字內容").press("Tab");
    const before = await page.evaluate(async () => {
      await ed.queue;
      return edNative(edProject());
    });
    const v1 = before.clips.find((c) => c.track === "V1");
    assert.equal(v1.sourceStartFrame, 15);
    assert.equal(v1.durationFrames, 60);
    assert.ok(before.clips.some((c) => c.kind === "text" && c.text === "P1 LOOP"));
    assert.ok(before.clips.some((c) => c.track === "V2" && c.kind === "image"));
    pass("建專案：上傳影片與圖片、加片段、裁切（起點 15 格、長度 60 格）、加文字");

    await page.reload();
    await page.getByRole("button", { name: "P1 迴圈 · 16:9", exact: true }).click();
    await page.waitForSelector("[data-ed-stage]");
    const after = await page.evaluate(() => edNative(edProject()));
    // Load-time normalization may add default style fields (edNormalizeProject); the edits themselves must match.
    const edits = (p) => ({
      id: p.id, title: p.title, ratio: p.ratio, timebase: p.timebase,
      clips: p.clips.map((c) => ({ id: c.id, track: c.track, kind: c.kind, startFrame: c.startFrame, durationFrames: c.durationFrames, sourceStartFrame: c.sourceStartFrame, text: c.text, fontSize: c.kind === "text" ? c.fontSize : null, asset: c.asset && { id: c.asset.id, url: c.asset.url } })),
    });
    assert.deepEqual(edits(after), edits(before));
    pass("保存→重新整理→重開：專案逐格一致");

    const { asset, jobId } = await exportProject(page);
    assert.equal(asset.origin.kind, "render");
    assert.equal(asset.origin.engine, "workbench-editor");
    assert.equal(asset.origin.jobId, jobId);
    assert.equal(asset.origin.parentAssetId, v1.asset.id);
    assert.equal(asset.origin.projectId, before.id);
    assert.ok(Number.isInteger(asset.origin.projectRevision));
    assert.deepEqual([...asset.origin.sourceAssetIds].sort(), [...new Set(before.clips.filter((c) => c.asset?.id).map((c) => c.asset.id))].sort());
    assert.match(asset.url, /^\/media\/[a-f0-9]{64}\/original\.mp4$/);
    const totalFrames = Math.max(...before.clips.map((c) => c.startFrame + c.durationFrames)),
      verification = await verifyOutput(path.join(dataDir, asset.url.slice(1)), { duration: totalFrames / 30, fps: 30, width: 1280, height: 720, audio: true });
    assert.ok(verification.ok, JSON.stringify(verification.findings));
    pass("匯出 720p：成果入素材庫，origin render＋parentAssetId＝片段素材＋projectId；檔案通過 verifyOutput");
    assert.deepEqual(errors, []);

    // Old editor still usable: a pre-M3 (seconds-only) project opens and exports unchanged.
    const old = await isolatedServer("vw-p1-legacy-");
    const up = await fetch(old.base + "/api/seedstar/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "舊片段.mp4", data: "data:video/mp4;base64," + fs.readFileSync(video).toString("base64") }),
    }).then((r) => r.json());
    const legacy = [{ id: "legacy-project", title: "舊專案", ratio: "16:9", clips: [{ id: "old-clip", kind: "video", track: "V1", asset: { url: up.url, name: "舊片段" }, start: 0, duration: 2, sourceStart: 0.5, speed: 1 }], assets: [], tracks: {}, markers: [] }];
    const put = await fetch(old.base + "/api/seedstar/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 1, revision: 0, characters: [], projects: [], assets: [], jobs: [], selection: {}, preferences: { "tools.editor.projects": legacy } }),
    });
    assert.equal(put.status, 200);
    const page2 = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page2.on("pageerror", (e) => errors.push(e.message));
    await page2.route("**/*", (r) => (r.request().url().startsWith(old.base + "/") ? r.continue() : r.abort()));
    await page2.goto(old.base + "/pages/tools.html#edit");
    await page2.getByRole("button", { name: "舊專案 · 16:9", exact: true }).click();
    await page2.waitForSelector('[data-ed-lane="V1"] [data-ed-clip]').catch(async (e) => { console.log(errors, await page2.locator("body").innerText().then(t=>t.slice(0,1500))); throw e; });
    const exported = await exportProject(page2);
    assert.equal(exported.asset.origin.kind, "render");
    assert.equal(exported.asset.origin.projectId, "legacy-project");
    const legacyCheck = await verifyOutput(path.join(old.dataDir, exported.asset.url.slice(1)), { duration: 2, fps: 30, width: 1280, height: 720 });
    assert.ok(legacyCheck.ok, JSON.stringify(legacyCheck.findings));
    assert.deepEqual(errors, []);
    pass("舊格式（M3 前）專案：可開啟、可匯出，輸出通過驗證");
  } finally {
    await browser.close();
  }
  console.log(passed + " passed");
})().catch((error) => {
  console.error("FAIL", error);
  process.exit(1);
});
