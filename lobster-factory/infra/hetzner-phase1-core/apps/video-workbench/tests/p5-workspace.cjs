// Card P5 acceptance in the browser (isolated servers, Edge headless, WebGPU off, real Blender): 匯入 GLB -> save
// scene -> reload intact; camera/light edits persist; pose a bone + save; retarget (BVH) and render jobs through the
// /generations queue -> assets with origin -> 放到剪輯時間軸 keeps alpha; cancel a render mid-way -> no asset, the
// Blender process is gone; Meshy with a fake provider: request shape, polling, GLB asset, credits; missing key ->
// button disabled; 指定角度截圖 -> PNG reference with origin; no <select> in the workspace.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { spawnSync } = require("node:child_process");
const blender = require("../backend/blender.cjs");
if (!blender.capability(process.env).available) {
  console.log("SKIP: Blender 未安裝（node scripts/vendor-blender.cjs）");
  process.exit(0);
}
const { chromium } = require("playwright");
const { isolatedServer } = require("./isolated-server.cjs");
const { inspectMedia } = require("../backend/media-inspect.cjs");

let passed = 0;
const pass = (label) => {
  passed++;
  console.log("PASS " + label);
};
const work = fs.mkdtempSync(path.join(os.tmpdir(), "vw-p5-ws-"));
const BVH = ["HIERARCHY", "ROOT Hips", "{", " OFFSET 0 30 0", " CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation", " JOINT Chest", " {", "  OFFSET 0 60 0", "  CHANNELS 3 Zrotation Xrotation Yrotation", "  JOINT LeftArm", "  {", "   OFFSET 20 50 0", "   CHANNELS 3 Zrotation Xrotation Yrotation", "   JOINT LeftForeArm", "   {", "    OFFSET 42 0 0", "    CHANNELS 3 Zrotation Xrotation Yrotation", "    End Site", "    {", "     OFFSET 43 0 0", "    }", "   }", "  }", " }", "}", "MOTION", "Frames: 24", "Frame Time: 0.041667",
  ...Array.from({ length: 24 }, (_, f) => `0 30 0 0 0 0 0 0 0 ${(60 * f / 23).toFixed(2)} 0 0 ${(45 * f / 23).toFixed(2)} 0 0`)].join("\n") + "\n";
const status = (page, re, timeout = 240000) =>
  page.waitForFunction((src) => new RegExp(src).test(document.querySelector("[data-t3-status]")?.textContent || ""), re.source, { timeout }).catch(async (e) => {
    throw Error(`status never matched ${re}: "${await page.locator("[data-t3-status]").textContent().catch(() => "")}"`, { cause: e });
  });
const ready = (page) => page.waitForSelector('[data-t3-ready="1"] canvas', { timeout: 60000 });
const scenes = (page) => page.evaluate(() => VideoWorkbench.scenes3d.list());
async function open(page, base, title) {
  await page.goto(base + "/pages/tools.html?r=" + Math.random() + "#3d");
  await page.getByRole("button", { name: new RegExp("^" + title + " · 第 \\d+ 版$") }).click();
  await ready(page);
}
async function upload(page, button, file) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: button, exact: true }).first().click();
  await (await chooser).setFiles(file);
}
async function setField(page, label, value) {
  const input = page.getByLabel(label, { exact: true });
  await input.fill(String(value));
  await input.press("Enter");
  await input.dispatchEvent("change");
}

(async () => {
  const b = path.join(work, "b");
  fs.mkdirSync(b);
  await blender.runBlender({ script: "build_character.py", workdir: b, args: { outPath: path.join(b, "char.glb"), target: [0.75, 1.85, 0.1] } });
  const charGlb = path.join(work, "hero.glb"), motion = path.join(work, "wave.bvh");
  fs.copyFileSync(path.join(b, "char.glb"), charGlb);
  fs.writeFileSync(motion, BVH);

  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--disable-features=WebGPU"] });
  try {
    const { base, dataDir } = await isolatedServer("vw-p5-ws-");
    const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } }), errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*", (r) => (r.request().url().startsWith(base + "/") ? r.continue() : r.abort()));

    // An editor project to place the render on (same UI path as the P3 round trip).
    await page.goto(base + "/pages/tools.html#edit");
    await page.getByRole("button", { name: "新建剪輯專案", exact: true }).click();
    await page.getByLabel("專案名稱").fill("P5 3D");
    await page.getByRole("radio", { name: /^16:9 / }).check();
    await page.getByRole("button", { name: "建立專案", exact: true }).click();
    await page.waitForFunction(() => typeof ed !== "undefined" && ed.projects.some((p) => p.title === "P5 3D"));

    // 1) import GLB -> save -> reload intact
    await page.goto(base + "/pages/tools.html#3d");
    assert.equal(await page.locator('[data-tool-flow="3d"]').count(), 1);
    await page.getByRole("button", { name: "新增場景", exact: true }).click();
    await upload(page, "匯入 GLB 模型", charGlb);
    await status(page, /已匯入「hero\.glb」/);
    await ready(page);
    await setField(page, "場景名稱", "揮手測試");
    await page.getByRole("button", { name: /^儲存/ }).click();
    await page.waitForSelector("[data-t3-revision]:has-text('第 1 版')");
    const model = (await page.evaluate(() => VideoWorkbench.assets.list())).find((a) => a.name === "hero.glb");
    assert.equal(model.kind, "model");
    assert.match(model.url, /^\/media\/[a-f0-9]{64}\/original\.glb$/);
    await open(page, base, "揮手測試");
    let s = (await scenes(page)).find((x) => x.title === "揮手測試");
    assert.equal(s.revision, 1);
    assert.deepEqual(s.objects.map((o) => o.asset.url), [model.url]);
    assert.equal(await page.locator('[data-tool-flow="3d"] select').count(), 0, "no <select>");
    assert.ok(await page.getByRole("button", { name: "upper_arm.L", exact: true }).isVisible(), "skeleton bones listed");
    pass("匯入 GLB → 存場景 → 重新整理後場景與模型（媒體庫 GLB）完整；骨骼清單顯示；無 <select>");

    // 2) camera and light edits persist
    await setField(page, "視角（度）", 35);
    await setField(page, "燈光 1 強度", 3.5);
    await page.getByLabel("燈光 1 顏色").evaluate((el) => {
      el.value = "#ffcc88";
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await ready(page);
    await page.getByRole("button", { name: "點光", exact: true }).click();
    await page.getByRole("button", { name: "新增燈光", exact: true }).click();
    await page.getByRole("button", { name: "地面陰影", exact: true }).click();
    await ready(page);
    await page.getByRole("button", { name: "記錄鏡頭關鍵影格", exact: true }).click();
    await setField(page, "目前影格", 23);
    await ready(page);
    const box = await page.locator("[data-t3-stage] canvas").boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 10, { steps: 6 });
    await page.mouse.up();
    await page.getByRole("button", { name: "記錄鏡頭關鍵影格", exact: true }).click();
    await page.getByRole("button", { name: /^儲存/ }).click();
    await page.waitForSelector("[data-t3-revision]:has-text('第 2 版')");
    await open(page, base, "揮手測試");
    s = (await scenes(page)).find((x) => x.title === "揮手測試");
    assert.equal(s.camera.fov, 35);
    assert.deepEqual(s.lights.map((l) => [l.type, l.intensity, l.color]), [["point", 3.5, "#ffcc88"], ["point", 3, "#ffffff"]]);
    assert.equal(s.ground, true);
    assert.deepEqual(s.camera.keys.map((k) => k.frame).sort((a, b) => a - b), [0, 23]);
    assert.ok(Math.hypot(...s.camera.keys[0].position.map((v, i) => v - s.camera.keys[1].position[i])) > 0.3, "the two camera keys differ");
    assert.equal(s.history.length, 1);
    pass("鏡頭（視角、兩個關鍵影格）與燈光（類型、強度、顏色、第二盞）、地面陰影：儲存後重新整理仍在，版本歷史 1 筆");

    // 3) pose a bone (FK) + save
    await page.getByRole("button", { name: "upper_arm.L", exact: true }).click();
    const before = await page.evaluate(() => t3.viewer.boneWorld(t3.obj, "forearm.L"));
    await page.getByRole("button", { name: "Z +15°", exact: true }).click();
    await page.getByRole("button", { name: "Z +15°", exact: true }).click();
    await ready(page);
    const after = await page.evaluate(() => t3.viewer.boneWorld(t3.obj, "forearm.L"));
    assert.ok(Math.hypot(...before.map((v, i) => v - after[i])) > 0.05, "FK rotation moved the elbow in the viewer");
    await page.getByRole("button", { name: /^儲存/ }).click();
    await page.waitForSelector("[data-t3-revision]:has-text('第 3 版')");
    await open(page, base, "揮手測試");
    s = (await scenes(page)).find((x) => x.title === "揮手測試");
    assert.deepEqual(s.objects[0].pose, { "upper_arm.L": [0, 0, 30] });
    const reopened = await page.evaluate(() => t3.viewer.boneWorld(t3.obj, "forearm.L"));
    assert.ok(Math.hypot(...after.map((v, i) => v - reopened[i])) < 1e-3, "the saved pose is applied again after reload");
    pass("骨架擺姿：選 upper_arm.L、Z +15° 兩次 → 檢視器手肘移動；儲存重開姿勢仍在（第 3 版）");

    // 4) retarget job (real Blender)
    await upload(page, "匯入動作（BVH／GLB）", motion);
    await status(page, /已匯入「wave\.bvh」/);
    await page.getByLabel("骨骼對照").fill("Hips=root\nChest=spine\nLeftArm=upper_arm.L\nLeftForeArm=forearm.L");
    await page.getByLabel("骨骼對照").dispatchEvent("change");
    await page.getByRole("button", { name: "套用動作（Blender 重定向）", exact: true }).click();
    await status(page, /已套用動作（4 根骨骼）/);
    const retargeted = (await page.evaluate(() => VideoWorkbench.assets.list())).filter((a) => a.origin?.operation === "retarget").at(-1);
    assert.equal(retargeted.kind, "model");
    assert.match(retargeted.url, /original\.glb$/);
    assert.deepEqual({ kind: retargeted.origin.kind, engine: retargeted.origin.engine, parent: retargeted.origin.parentAssetId }, { kind: "render", engine: "blender-4.5.9", parent: model.id });
    assert.equal(retargeted.origin.sceneRevision, 3);
    s = (await scenes(page)).find((x) => x.title === "揮手測試");
    assert.equal(s.objects[0].asset.url, retargeted.url);
    assert.equal(s.objects[0].sourceAssetId, model.id);
    const anim = await page.evaluate(() => t3.bones.get(t3.obj).animations.length);
    assert.equal(anim, 1, "the viewer loaded the retargeted animation");
    pass("動作重定向（Blender 任務經 /generations 佇列）：BVH → 4 骨重定向 GLB 資產，origin render／blender-4.5.9／parentAssetId；場景改用新模型並保留來源");

    // 5) render job -> alpha MOV -> 放到剪輯時間軸 keeps alpha
    await setField(page, "寬", 320);
    await setField(page, "高", 180);
    await setField(page, "長度（格）", 24);
    await page.getByRole("button", { name: "放到「P5 3D · P5 3D」", exact: true }).click();
    await status(page, /已放到「P5 3D」的 V2 軌（第 0 格起）/);
    const rendered = (await page.evaluate(() => VideoWorkbench.assets.list())).filter((a) => a.origin?.engine === "blender-4.5.9" && a.kind === "video").at(-1);
    s = (await scenes(page)).find((x) => x.title === "揮手測試");
    assert.deepEqual({ sceneId: rendered.origin.sceneId, rev: rendered.origin.sceneRevision, parent: rendered.origin.parentAssetId }, { sceneId: s.id, rev: s.revision, parent: retargeted.id });
    assert.equal(rendered.verification.ok, true);
    const probe = await inspectMedia(path.join(dataDir, rendered.url.slice(1)));
    assert.match(probe.probe.pixFmt, /^rgba/);
    assert.equal(probe.width, 320);
    assert.match(rendered.previewUrl, /proxy\.webm$/);
    const clip = await page.evaluate(() => structuredClone(ed.projects.find((p) => p.title === "P5 3D").clips.find((c) => c.track === "V2")));
    assert.equal(clip.asset.url, rendered.url);
    assert.equal(clip.durationFrames, 30, "1 s of a 30 fps project");
    pass("Blender 渲染（24 格 320×180）→ 透明 MOV 資產（rgba、驗證通過、VP9+alpha 預覽）origin 記場景 id／版本 → 放到「P5 3D」V2 疊加軌");

    // 6) cancel a render mid-way: no asset, Blender process tree gone, job dir removed
    await setField(page, "長度（格）", 600);
    const known = (await page.evaluate(() => VideoWorkbench.assets.list())).length;
    await page.getByRole("button", { name: "Blender 渲染（透明 MOV）", exact: true }).click();
    await page.waitForFunction(() => t3.job && t3.job.progress > 0, null, { timeout: 120000 });
    const jobId = await page.evaluate(() => t3.job.id);
    const pid = (await (await fetch(base + "/api/vw/generations/" + jobId)).json()).blenderPid;
    assert.ok(Number.isInteger(pid));
    await page.getByRole("button", { name: "取消", exact: true }).click();
    await status(page, /Blender 渲染已取消/);
    const job = await (await fetch(base + "/api/vw/generations/" + jobId)).json();
    assert.equal(job.status, "cancelled");
    assert.ok(!job.result);
    assert.equal((await page.evaluate(() => VideoWorkbench.assets.list())).length, known, "no new asset");
    await new Promise((r) => setTimeout(r, 1500));
    const tasks = spawnSync("tasklist", ["/FI", `PID eq ${pid}`, "/NH"], { encoding: "utf8", windowsHide: true }).stdout;
    assert.doesNotMatch(tasks, /blender/i, "Blender process still running: " + tasks);
    assert.equal(fs.existsSync(path.join(dataDir, "blender", jobId)), false, "job directory removed");
    pass("渲染中途取消：任務 cancelled、無成果資產、Blender 程序（pid " + pid + "）已結束、任務暫存目錄已刪");

    // 7) no vendor keys: the paid ways are disabled and say why; Meshy (card S4b: disabled) is not offered at all
    // Price text from the page's own formatter (shared/models.js VideoWorkbenchMoney) and capabilities, not a copy.
    const spar3d = await page.evaluate(() => VideoWorkbenchMoney(VideoWorkbench.capabilities.imageTo3d.methods.find((m) => m.id === "stability-spar3d").usd));
    assert.match(spar3d, /^NT\$\d/);
    const disabled = page.getByRole("button", { name: "Stability SPAR3D · " + spar3d + "（金鑰未設定）", exact: true });
    assert.equal(await disabled.isDisabled(), true);
    assert.equal(await page.locator('[data-t3-action="i3-method:meshy"]').count(), 0);
    assert.deepEqual(errors, []);
    pass("沒有金鑰：付費方式停用並顯示「（金鑰未設定）」；沒有 MESHY_API_KEY 時不列 Meshy");
  } finally {
    await browser.close().catch(() => {});
  }

  // 8) Meshy with a fake provider
  const calls = [];
  const glb = fs.readFileSync(charGlb);
  const reply = (status, body) => new Response(typeof body === "string" || body instanceof Uint8Array ? body : JSON.stringify(body), { status });
  let polls = 0;
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || "GET", auth: init.headers?.Authorization, body: init.body ? JSON.parse(init.body) : null });
    if (url === "https://api.meshy.ai/openapi/v1/image-to-3d" && init.method === "POST") return reply(202, { result: "task-123" });
    if (url === "https://api.meshy.ai/openapi/v1/image-to-3d/task-123")
      return reply(200, ++polls < 3 ? { id: "task-123", status: polls === 1 ? "PENDING" : "IN_PROGRESS", progress: polls * 30 } : { id: "task-123", status: "SUCCEEDED", progress: 100, ai_model: "meshy-7.1", consumed_credits: 30, model_urls: { glb: "https://assets.meshy.ai/task-123/model.glb" } });
    if (url === "https://assets.meshy.ai/task-123/model.glb") return reply(200, new Uint8Array(glb));
    throw Error("unexpected provider call " + url);
  };
  const browser2 = await chromium.launch({ channel: "msedge", headless: true, args: ["--disable-features=WebGPU"] });
  try {
    const { base } = await isolatedServer("vw-p5-meshy-", { fetchImpl, env: { MESHY_API_KEY: "meshy-test-only", VW_3D_POLL_MS: "50" } });
    const page = await browser2.newPage({ viewport: { width: 1500, height: 1100 } }), errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*", (r) => (r.request().url().startsWith(base + "/") ? r.continue() : r.abort()));
    await page.goto(base + "/pages/tools.html#3d");
    await page.evaluate(async () => {
      const blob = await (await fetch("/assets/test-image-1.png")).blob();
      const data = await new Promise((r) => {
        const f = new FileReader();
        f.onload = () => r(f.result);
        f.readAsDataURL(blob);
      });
      const stored = await VideoWorkbench.request("/uploads", { name: "杯子.png", data });
      await VideoWorkbench.assets.save({ ...stored, createdAt: new Date().toISOString() });
    });
    await page.goto(base + "/pages/tools.html?m=1#3d");
    await page.getByRole("button", { name: "圖片：杯子.png", exact: true }).click();
    await page.getByRole("button", { name: "Meshy · 約 30 點額度", exact: true }).click();
    await page.getByRole("button", { name: "產生 3D 模型（約 30 點額度）", exact: true }).click();
    await status(page, /已產生 3D 模型.*（Meshy，約 30 點額度）/);
    const post = calls.find((c) => c.method === "POST");
    assert.equal(post.auth, "Bearer meshy-test-only");
    assert.match(post.body.image_url, /^data:image\/png;base64,/);
    assert.deepEqual({ ai_model: post.body.ai_model, should_texture: post.body.should_texture, target_formats: post.body.target_formats }, { ai_model: "latest", should_texture: true, target_formats: ["glb"] });
    assert.ok(calls.filter((c) => c.url.endsWith("/task-123")).length >= 3, "polled until SUCCEEDED");
    const made = (await page.evaluate(() => VideoWorkbench.assets.list())).filter((a) => a.origin?.provider === "Meshy").at(-1);
    const image = (await page.evaluate(() => VideoWorkbench.assets.list())).find((a) => a.name === "杯子.png");
    assert.deepEqual({ kind: made.origin.kind, model: made.origin.model, credits: made.origin.credits, parent: made.origin.parentAssetId }, { kind: "ai_generated", model: "meshy-7.1", credits: 30, parent: image.id });
    assert.match(made.url, /original\.glb$/);
    await ready(page);
    await page.getByRole("button", { name: "指定角度截圖", exact: true }).click();
    await status(page, /已存成參考圖/);
    const shot = (await page.evaluate(() => VideoWorkbench.assets.list())).filter((a) => a.origin?.engine === "workbench-3d-viewer").at(-1);
    assert.equal(shot.kind, "image");
    assert.equal(shot.origin.parentAssetId, made.id);
    assert.match(shot.url, /^\/generated\/[a-f0-9-]+\.png$/);
    assert.deepEqual(errors, []);
    pass("Meshy（假供應商）：Bearer 金鑰、data: URI 圖片、latest＋貼圖＋glb；輪詢到 SUCCEEDED → GLB 資產 origin ai_generated／meshy-7.1／30 點 → 進檢視器 → 指定角度截圖成參考圖");
  } finally {
    await browser2.close().catch(() => {});
  }
  fs.rmSync(work, { recursive: true, force: true });
  console.log(passed + " passed");
})().catch((error) => {
  console.error("FAIL", error);
  process.exit(1);
});
