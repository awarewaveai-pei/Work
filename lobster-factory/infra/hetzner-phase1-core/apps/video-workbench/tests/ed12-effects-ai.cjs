// Card ED.12 (docs/editor-parity-spec-20261106.md §1.3 特效): the 驗收閘 only. 畫質增強 and 從這裡重新生成 show their price
// before the click; after 畫質增強 every edit field of the clip is unchanged (only the asset moves); 從這裡重新生成 sends
// the playhead frame + the clip's prompt and the part after the cut plays the new video with the clip's edits; a failed
// send leaves the clip as it was. Real Edge, isolated data folder, a fake Replicate: no paid API is called.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { spawnSync } = require("node:child_process"),
  { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright"),
  crypto = require("node:crypto"),
  ffmpeg = require("ffmpeg-static");
const pass = (m) => console.log("PASS " + m);
const mp4 = (file, color, size, seconds) => {
  const r = spawnSync(ffmpeg, ["-y", "-hide_banner", "-f", "lavfi", "-i", `color=c=${color}:s=${size}:r=30:d=${seconds}`, "-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "ultrafast", "-c:a", "aac", "-shortest", file], { encoding: "utf8", windowsHide: true });
  assert.equal(r.status, 0, r.stderr);
};
(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vw-ed12-")),
    dataDir = path.join(root, "data"),
    generated = path.join(dataDir, "generated"),
    src = crypto.randomUUID() + ".mp4";
  fs.mkdirSync(generated, { recursive: true });
  mp4(path.join(generated, src), "blue", "640x360", 4);
  mp4(path.join(root, "out.mp4"), "red", "1280x720", 4);
  const out = fs.readFileSync(path.join(root, "out.mp4"));
  // Fake Replicate: `fail` makes the next poll fail; every create body is kept to check what was sent.
  let fail = false;
  const created = [];
  const fetchImpl = async (url, init = {}) => {
    if (/^https:\/\/api\.replicate\.com\/v1\/models\/.+\/predictions$/.test(url)) {
      created.push(JSON.parse(init.body));
      return Response.json({ id: "pred-" + created.length, status: "starting" });
    }
    const poll = /^https:\/\/api\.replicate\.com\/v1\/predictions\/(pred-\d+)$/.exec(url);
    if (poll) return Response.json(fail ? { id: poll[1], status: "failed", error: "供應商失敗（測試）" } : { id: poll[1], status: "succeeded", output: "https://replicate.delivery/x/out.mp4" });
    if (url === "https://replicate.delivery/x/out.mp4") return new Response(out);
    throw Error("未預期的網路請求：" + url);
  };
  const server = require("../server.cjs").createServer({ dataDir, env: { REPLICATE_API_TOKEN: "ed12-test-never-sent" }, fetchImpl });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port,
    browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*", (r) => (r.request().url().startsWith(base + "/") ? r.continue() : r.abort()));
    await page.goto(base + "/pages/tools.html#edit");
    await page.getByRole("button", { name: "新建剪輯專案", exact: true }).waitFor();
    // One 3 s clip with edits on every axis the card names: trim, speed, effects, keyframes, transition.
    await page.evaluate(async (src) => {
      await edCreate("ED12", "16:9");
      await edAdd({ id: "ed12-src", name: "海面", url: "/generated/" + src, type: "video/mp4", origin: { kind: "ai_generated", model: "veo", provider: "test", prompt: "藍色海面，鏡頭緩慢推進" } });
      const p = edProject(),
        c = p.clips[0];
      edCheckpoint();
      edTime(p, c, { sourceStart: 0.5, duration: 3 });
      Object.assign(c, { speed: 1, filter: "暖色", filterStrength: 0.6, grain: 0.2, lightLeak: 0.3, opacity: 0.9, transition: "溶解", transitionFrames: 12, transformKeys: [{ frame: 0, x: 0, y: 0, scale: 1, rotation: 0 }, { frame: 60, x: 10, y: 5, scale: 1.2, rotation: 0 }] });
      edValidate(c);
      ed.selected = c.id;
      await edCommit(p);
    }, src);
    await page.locator('[data-ed-pane="特效"]').click();
    const pane = page.locator(".ed-fx"),
      clips = () => page.evaluate(() => structuredClone(edProject().clips).sort((a, b) => a.startFrame - b.startFrame)),
      select = () => page.evaluate(() => { ed.selected = edProject().clips[0].id; ed.time = 2; edRedraw(); }),
      closeJobs = () => page.evaluate(() => document.querySelectorAll(".job-view").forEach((x) => x.remove())),
      editFields = ({ asset, previousAssetIds, ...rest }) => rest;
    await select();

    // 1. Both buttons say their price before any click; the clip's own prompt is filled in.
    assert.equal(await pane.locator('[data-ed-action="fx-enhance"]').innerText(), "畫質增強 · 免費（本機處理）");
    await page.waitForFunction(() => /NT\$/.test(document.querySelector('[data-ed-action="fx-regen"]')?.textContent || ""));
    const want = await page.evaluate(() => {
      const caps = VideoWorkbench.capabilities,
        vm = VideoWorkbenchVideoModels.list(caps).find((m) => m.available !== false);
      return "從這裡重新生成 · " + VideoWorkbenchMoney(VideoWorkbenchVideoModels.usd(vm, vm.durations.find((d) => d >= 1 - 0.01)), caps);
    });
    assert.equal(await pane.locator('[data-ed-action="fx-regen"]').innerText(), want);
    assert.equal(await pane.locator('[data-ed-fx="prompt"]').inputValue(), "藍色海面，鏡頭緩慢推進");
    pass("畫質增強與重新生成在送出前都顯示價格；提示詞帶入原提示詞");

    // 2. A failed generation changes nothing on the timeline.
    const before = await clips();
    fail = true;
    await pane.locator('[data-ed-action="fx-regen"]').click();
    await page.waitForFunction(() => /failed/.test(document.querySelector(".job-view")?.textContent || ""), null, { timeout: 90000 });
    assert.deepEqual(await clips(), before);
    await closeJobs();
    pass("送出失敗：片段一格不動");

    // 3. 從這裡重新生成: the playhead frame + prompt go out; the clip splits at 2 s, the part after plays the new video.
    fail = false;
    await select();
    await pane.locator('[data-ed-action="fx-regen"]').click();
    await page.waitForFunction(() => edProject().clips.some((c) => c.previousAssetIds?.length), null, { timeout: 90000 });
    const sent = JSON.stringify(created.at(-1));
    assert.ok(sent.includes("藍色海面，鏡頭緩慢推進"), "提示詞沒有送出");
    assert.ok(sent.includes("data:image/png;base64,"), "首幀圖片沒有送出");
    const [head, tail] = await clips();
    assert.equal(head.asset.id, "ed12-src");
    assert.equal(head.startFrame + head.durationFrames, 60);
    assert.equal(tail.startFrame, 60);
    assert.equal(tail.durationFrames, before[0].durationFrames - 60);
    assert.equal(tail.sourceStartFrame, 0);
    assert.notEqual(tail.asset.id, "ed12-src");
    assert.deepEqual(tail.previousAssetIds, ["ed12-src"]);
    for (const k of ["speed", "filter", "filterStrength", "grain", "lightLeak", "opacity", "volume", "fadeIn", "fadeOut"]) assert.deepEqual(tail[k], before[0][k], "後段的 " + k + " 變了");
    assert.deepEqual(tail.transformKeys, [{ frame: 0, x: 10, y: 5, scale: 1.2, rotation: 0 }]);
    assert.equal(head.transition, "溶解");
    await page.evaluate(() => edAction("undo"));
    assert.deepEqual(await clips(), before);
    await closeJobs();
    pass("重新生成：首幀與提示詞送出；切點後換新片、剪輯設定保留；一次復原回到原狀");

    // 3b. A result whose automatic swap was lost (reload, closed panel) is found again and swapped by hand; the failed
    // job of step 2 is not offered.
    await page.reload();
    await page.getByRole("button", { name: "ED12 · 16:9", exact: true }).click();
    await page.waitForSelector("[data-ed-stage]");
    await page.locator('[data-ed-pane="特效"]').click();
    await select();
    const reloaded = await clips(); // the reload normalizes default fields; the swap and its undo compare with this
    await pane.locator('[data-ed-action="fx-results"]').click();
    const rows = pane.locator(".ed-fx-results li");
    assert.equal(await rows.count(), 1);
    await rows.getByRole("button", { name: "替換", exact: true }).click();
    await page.waitForFunction(() => edProject().clips.some((c) => c.previousAssetIds?.length), null, { timeout: 30000 });
    const [, again] = await clips();
    assert.equal(again.asset.id, tail.asset.id);
    assert.equal(again.startFrame, 60);
    assert.equal(await rows.count(), 0);
    await page.evaluate(() => edAction("undo"));
    assert.deepEqual(await clips(), reloaded);
    pass("找回已完成的結果：重新載入後仍可替換；失敗的任務不列出");

    // 4. 畫質增強: a same-length 2K file replaces the asset; every edit field is unchanged.
    await select();
    await pane.locator('[data-ed-action="fx-quality:2K"]').click();
    await pane.locator('[data-ed-action="fx-enhance"]').click();
    await page.waitForFunction(() => edProject().clips[0].asset.id !== "ed12-src", null, { timeout: 90000 });
    const [up] = await clips();
    assert.deepEqual(editFields(up), editFields(reloaded[0]));
    assert.deepEqual(up.previousAssetIds, ["ed12-src"]);
    assert.equal(up.asset.height, 1440);
    pass("畫質增強：換成 2K 檔，剪輯設定逐欄不變");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
