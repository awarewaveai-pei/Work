// Card P3 round trip (handoff P3 驗收): render a composition -> 放到剪輯時間軸 (overlay track) -> editor export keeps
// the alpha (the main-track source shows through the comp's transparent area: no black box) -> change the title ->
// re-render -> the editor offers 「有新版本：更新片段」 -> update keeps the previous asset id -> 復原 restores it;
// 「匯出構圖為參考圖」 makes a PNG asset with origin (S3b).
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { spawnSync } = require("node:child_process"),
  ffmpeg = require("ffmpeg-static"),
  { chromium } = require("playwright");
const { isolatedServer } = require("./isolated-server.cjs"),
  { inspectMedia } = require("../backend/media-inspect.cjs");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-p3-roundtrip-"));
const video = path.join(dir, "main.mp4");
{
  const r = spawnSync(ffmpeg, ["-y", "-hide_banner", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:duration=4", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", video], { windowsHide: true });
  assert.equal(r.status, 0, String(r.stderr));
}
let passed = 0;
const pass = (label) => {
  passed++;
  console.log("PASS " + label);
};
// PSNR of the top band (comp is transparent there) between export frame N and source frame N at 1280x720.
function bandPsnr(output, source, frame) {
  const pick = (n) => `select=eq(n\\,${n}),setpts=PTS-STARTPTS,scale=1280:720,setsar=1,crop=1280:150:0:0,format=gbrp`;
  const r = spawnSync(ffmpeg, ["-hide_banner", "-nostats", "-i", output, "-i", source, "-filter_complex", `[0:v]${pick(frame)}[a];[1:v]${pick(frame)}[b];[a][b]psnr`, "-frames:v", "1", "-an", "-f", "null", "-"], { windowsHide: true });
  const m = [...String(r.stderr).matchAll(/PSNR (?:\w:\S+ )+average:(inf|[\d.]+)/g)].at(-1);
  return m ? (m[1] === "inf" ? Infinity : Number(m[1])) : null;
}
function centreLuma(file, frame) {
  const r = spawnSync(ffmpeg, ["-v", "error", "-i", file, "-vf", `select=eq(n\\,${frame}),scale=1280:720,crop=200:60:540:330,format=gray`, "-frames:v", "1", "-f", "rawvideo", "-"], { windowsHide: true, maxBuffer: 1 << 24 });
  return r.stdout.reduce((a, b) => a + b, 0) / r.stdout.length;
}
async function waitStatus(page, re) {
  await page.waitForFunction((src) => new RegExp(src).test(document.querySelector("[data-cp-status]")?.textContent || ""), re.source, { timeout: 240000 });
  const text = await page.locator("[data-cp-status]").textContent();
  assert.match(text, re);
}
async function openProject(page, base) {
  await page.goto(base + "/pages/tools.html?r=" + Math.random() + "#edit");
  await page.getByRole("button", { name: "P3 迴圈 · 16:9", exact: true }).click();
  await page.waitForSelector('[data-ed-lane="V2"] [data-ed-clip]');
}
async function waitExportAsset(page, known) {
  for (let i = 0; i < 1200; i++) {
    const found = await page.evaluate(async (known) => {
      const job = (await VideoWorkbench.generations.list()).filter((j) => j.input?.operation === "editor-export" && !known.includes(j.id)).at(-1);
      return job ? (await VideoWorkbench.assets.list()).find((a) => a.id === "job-" + job.id) || null : null;
    }, known);
    if (found) return found;
    await page.waitForTimeout(250);
  }
  throw Error("export asset never reached the library");
}

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--disable-features=WebGPU"] });
  try {
    const { base, dataDir } = await isolatedServer("vw-p3-roundtrip-");
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*", (r) => (r.request().url().startsWith(base + "/") ? r.continue() : r.abort()));
    await page.goto(base + "/pages/tools.html#edit");
    await page.getByRole("button", { name: "新建剪輯專案", exact: true }).click();
    await page.getByLabel("專案名稱").fill("P3 迴圈");
    await page.getByRole("radio", { name: /^16:9 / }).check();
    await page.getByRole("button", { name: "建立專案", exact: true }).click();
    await page.locator('[data-ed-pane="素材"]').click();
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "上傳素材", exact: true }).click();
    await (await chooser).setFiles(video);
    // Card ED.4: an upload only lands in 本次上傳; a double-click adds it to the main track.
    await page.locator(".editor-library [data-ed-asset-add]").first().dblclick({ timeout: 60000 });
    await page.waitForSelector('[data-ed-lane="V1"] [data-ed-clip]', { timeout: 60000 });
    await page.evaluate(() => ed.queue);

    await page.goto(base + "/pages/tools.html?c=1#compose");
    await page.getByRole("button", { name: "新增片頭範本" }).first().click();
    await page.waitForSelector("[data-cp-canvas]");
    const compId = await page.evaluate(() => cp.doc.id);
    await page.getByRole("button", { name: "放到剪輯時間軸" }).click();
    await page.locator("dialog [data-cp-project]").first().click();
    await waitStatus(page, /已放到「P3 迴圈」的 V2 軌/);

    await openProject(page, base);
    const placed = await page.evaluate(() => structuredClone(edProject().clips.find((c) => c.track === "V2")));
    assert.equal(placed.asset.origin.engine, "workbench-compositor");
    assert.equal(placed.asset.origin.compositionId, compId);
    assert.equal(placed.durationFrames, 90);
    assert.equal(placed.width, 100);
    pass("放到剪輯時間軸：合成成品成為 V2 疊加軌全幅片段（長度 90 格），來源記錄合成 id 與版本");

    await page.getByRole("button", { name: "匯出", exact: true }).click();
    await page.locator('[data-ed-action="quality:720p"]').click();
    await page.locator("[data-ed-export]").click();
    const exported = await waitExportAsset(page, []);
    const out = path.join(dataDir, exported.url.slice(1));
    const band = bandPsnr(out, video, 45);
    assert.ok(band !== null && band >= 28, "transparent area shows the main track, PSNR " + band);
    assert.ok(Math.abs(centreLuma(out, 45) - centreLuma(video, 45)) > 10, "the title itself is composited over the centre");
    pass("剪輯匯出保留透明：合成透明區域＝主軌畫面（PSNR " + band.toFixed(1) + " dB，無黑底），中央有標題");

    // Back to the source: change the title, save, render the new revision.
    await openProject(page, base); // closes the export job panel
    await page.locator('[data-ed-lane="V2"] [data-ed-clip]').click();
    await page.getByRole("button", { name: "編輯來源合成", exact: true }).click();
    await page.waitForSelector("[data-cp-canvas]");
    await page.locator('[data-cp-action^="layer:"]', { hasText: "標題" }).first().click();
    await page.locator('[role="group"][aria-label="屬性分頁"]').getByRole("button", { name: "文字", exact: true }).click();
    await page.getByLabel("文字內容", { exact: true }).fill("第二版標題");
    await page.getByLabel("文字內容", { exact: true }).press("Tab");
    await page.getByRole("button", { name: /^儲存/ }).click();
    await page.waitForFunction(() => !cp.dirty && cp.doc.revision === 2);
    await page.getByRole("button", { name: "輸出透明影片" }).click();
    await waitStatus(page, /已輸出/);

    await openProject(page, base);
    await page.locator('[data-ed-lane="V2"] [data-ed-clip]').click();
    await page.getByRole("button", { name: "有新版本：更新片段", exact: true }).click();
    await page.waitForFunction((old) => edClip()?.asset.id !== old, placed.asset.id);
    const updated = await page.evaluate(async () => {
      await ed.queue;
      return structuredClone(edClip());
    });
    assert.equal(updated.asset.origin.compositionRevision, 2);
    assert.deepEqual(updated.previousAssetIds, [placed.asset.id]);
    assert.equal(await page.getByRole("button", { name: "有新版本：更新片段", exact: true }).count(), 0);
    await page.getByRole("button", { name: "復原", exact: true }).click();
    const undone = await page.evaluate(() => structuredClone(edProject().clips.find((c) => c.track === "V2")));
    assert.equal(undone.asset.id, placed.asset.id);
    assert.equal(undone.previousAssetIds, undefined);
    pass("改標題→重新輸出→剪輯出現「有新版本：更新片段」→更新後保留舊素材 id→復原回到舊片段");

    // S3b: the current frame becomes a PNG reference image with origin.
    await page.goto(base + "/pages/tools.html?s=1#compose");
    await page.getByRole("button", { name: /^片頭範本 · 第 2 版/ }).click();
    await page.waitForSelector("[data-cp-canvas]");
    await page.locator('input[type="number"][aria-label="目前影格"]').fill("45");
    await page.locator('input[type="number"][aria-label="目前影格"]').press("Enter");
    await page.getByRole("button", { name: "匯出構圖為參考圖" }).click();
    await waitStatus(page, /已存成參考圖/);
    const still = await page.evaluate(async () => (await VideoWorkbench.assets.list()).filter((a) => Number.isInteger(a.origin?.frame)).at(-1));
    assert.equal(still.kind, "image");
    assert.match(still.url, /^\/generated\/[a-f0-9-]+\.png$/);
    assert.deepEqual({ kind: still.origin.kind, engine: still.origin.engine, compositionId: still.origin.compositionId, compositionRevision: still.origin.compositionRevision, frame: still.origin.frame }, { kind: "render", engine: "workbench-compositor", compositionId: compId, compositionRevision: 2, frame: 45 });
    const info = await inspectMedia(path.join(dataDir, still.url.slice(1)));
    assert.equal(info.width, 1920);
    assert.match(info.probe.pixFmt, /rgba/);
    pass("匯出構圖為參考圖：PNG（含透明）素材，origin 記錄合成 id、版本與影格");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
  console.log(passed + " passed");
})().catch((error) => {
  console.error("FAIL", error);
  process.exit(1);
});
