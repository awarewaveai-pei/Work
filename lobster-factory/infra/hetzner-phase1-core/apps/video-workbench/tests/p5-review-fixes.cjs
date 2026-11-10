// Card P5 review fixes (Codex 2026-11-03, agency-os/reports/oracle/2026-11-03-partialreview-90a002b9.md):
// #1 retarget on an unsaved pose edit: the saved scene points to the retargeted model (completion resolves the
//    scene by the job's sceneId + sceneRevision, not an object captured before t3Ensure() cloned the doc).
// #2 a running job whose server deadline (job.deadlineAt) is past 10 min is still reconciled after 11 min.
// #3 the reconciled asset keeps the result's media fields: previewUrl, thumbUrl, video/quicktime for a .mov.
// #4 Meshy reuse key = image + every option sent: texture on (cancelled) then off -> two remote tasks.
// Generations are mocked at the page route (#1-#3) or with a fake Meshy fetchImpl (#4); no paid call, no Blender.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  { chromium } = require("playwright");
const { isolatedServer } = require("./isolated-server.cjs");

let passed = 0;
const pass = (label) => {
  passed++;
  console.log("PASS " + label);
};
const json = (body, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });

(async () => {
  // #4 -----------------------------------------------------------------------------------------------------
  {
    const posts = [];
    let next = 0;
    const fetchImpl = async (url, init = {}) => {
      if (url === "https://api.meshy.ai/openapi/v1/image-to-3d" && init.method === "POST") {
        const { image_url, ...options } = JSON.parse(init.body);
        posts.push(options);
        return new Response(JSON.stringify({ result: "task-" + ++next }), { status: 202 });
      }
      if (/^https:\/\/api\.meshy\.ai\/openapi\/v1\/image-to-3d\/task-\d+$/.test(url))
        return new Response(JSON.stringify({ status: "IN_PROGRESS", progress: 10 }), { status: 200 });
      throw Error("unexpected provider call " + url);
    };
    const { base } = await isolatedServer("vw-p5-fix-meshy-", { fetchImpl, env: { MESHY_API_KEY: "meshy-test-only", VW_3D_POLL_MS: "50" } });
    const call = async (route, data, method = "POST") => {
      const r = await fetch(base + "/api/vw" + route, { method, headers: { "Content-Type": "application/json" }, ...(data ? { body: JSON.stringify(data) } : {}) });
      const v = await r.json();
      assert(r.ok, JSON.stringify(v));
      return v;
    };
    const data = "data:image/png;base64," + fs.readFileSync(path.join(__dirname, "..", "assets", "test-image-1.png")).toString("base64");
    const image = await call("/uploads", { name: "cup.png", data });
    const meshyJob = (texture) => call("/generations", { type: "model", operation: "image-to-3d", prompt: "圖片轉 3D", references: { image: { url: image.url, id: "img" } }, settings: { method: "meshy", texture } });
    const until = async (id, ok) => {
      for (let i = 0; i < 200; i++) {
        const v = await call("/generations/" + id, undefined, "GET");
        if (ok(v)) return v;
        await new Promise((r) => setTimeout(r, 25));
      }
      throw Error("job never reached the expected state: " + id);
    };
    const a = await meshyJob(true);
    assert.equal(Date.parse(a.deadlineAt) - Date.parse(a.createdAt), 1200000, "Meshy job publishes its server deadline");
    await until(a.id, (v) => v.vendorTaskId === "task-1");
    await call("/generations/" + a.id + "/cancel");
    const b = await meshyJob(false);
    assert.equal((await until(b.id, (v) => v.vendorTaskId)).vendorTaskId, "task-2", "texture off must not reuse the textured task");
    await call("/generations/" + b.id + "/cancel");
    const c = await meshyJob(true);
    assert.equal((await until(c.id, (v) => v.vendorTaskId)).vendorTaskId, "task-1", "same image + same options still resumes");
    await call("/generations/" + c.id + "/cancel");
    assert.deepEqual(posts.map((p) => p.should_texture), [true, false]);
    pass("Meshy 重用鍵＝圖片＋送出的所有選項：含貼圖（取消）→ 不含貼圖 = 兩個遠端任務（should_texture true／false）；同選項再送 → 沿用 task-1；任務帶 deadlineAt");
  }

  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--disable-features=WebGPU"] });
  try {
    // #1 ---------------------------------------------------------------------------------------------------
    {
      const { base } = await isolatedServer("vw-p5-fix-retarget-");
      const page = await browser.newPage();
      await page.route("**/*", (r) => (r.request().url().startsWith(base + "/") ? r.continue() : r.abort()));
      let posted;
      await page.route(base + "/api/vw/generations", async (r) => {
        if (r.request().method() !== "POST") return r.continue();
        posted = JSON.parse(r.request().postData());
        await r.fulfill(json({ id: "rt1", type: "model", input: posted, status: "queued", progress: 0, createdAt: new Date().toISOString(), deadlineAt: new Date(Date.now() + 1860000).toISOString() }, 202));
      });
      await page.route(base + "/api/vw/generations/rt1", (r) =>
        r.fulfill(json({ id: "rt1", type: "model", input: posted, status: "succeeded", progress: 100, result: { url: "/media/retargeted/original.glb", kind: "model", type: "model/gltf-binary", retarget: { bones: ["Hips"], frames: 24 }, origin: { kind: "render", engine: "blender", operation: "retarget" } } })),
      );
      // Not the 3D tab: only the t3 state machine runs, no viewer (the mocked GLB urls do not exist).
      await page.goto(base + "/pages/tools.html#edit");
      await page.waitForFunction(() => typeof t3 !== "undefined" && typeof VideoWorkbench !== "undefined" && VideoWorkbench.scenes3d);
      const saved = await page.evaluate(async () => {
        t3.list = await VideoWorkbench.scenes3d.list();
        t3.doc = t3New();
        t3.doc.title = "重定向測試";
        t3.doc.objects.push({ id: "o1", asset: { id: "char", url: "/media/char/original.glb", name: "char.glb" }, position: [0, 0, 0], rotationY: 0, scale: 1, pose: {}, ik: [] });
        t3.obj = "o1";
        await t3Save(); // revision 1
        t3Obj().pose = { Hips: [0, 0.3, 0] }; // the unsaved pose edit
        t3Touch();
        t3.motion = { id: "wave", url: "/media/wave/original.bvh", name: "wave.bvh" };
        t3.boneMapText = "";
        await t3Retarget();
        return (await VideoWorkbench.scenes3d.list()).find((s) => s.id === t3.doc.id);
      });
      assert.equal(posted.settings.sceneRevision, 2, "the pose edit was saved before the job (t3Ensure)");
      assert.equal(saved.revision, 3);
      assert.equal(saved.objects[0].asset.id, "job-rt1");
      assert.equal(saved.objects[0].asset.url, "/media/retargeted/original.glb");
      assert.equal(saved.objects[0].sourceAssetId, "char");
      assert.deepEqual(saved.objects[0].pose, {});
      assert.deepEqual(saved.history[0].objects[0].pose, { Hips: [0, 0.3, 0] }, "revision 2 (the pose edit) is in history");
      pass("未儲存的姿勢 → 套用動作：先存第 2 版送出任務，完成後第 3 版場景指向重定向模型（job-rt1，sourceAssetId=char）");
      await page.close();
    }

    // #2 + #3 ----------------------------------------------------------------------------------------------
    {
      const { base } = await isolatedServer("vw-p5-fix-reconcile-");
      const page = await browser.newPage();
      await page.clock.install();
      await page.route("**/*", (r) => (r.request().url().startsWith(base + "/") ? r.continue() : r.abort()));
      const input = { type: "video", operation: "blender-render", prompt: "3D 渲染", references: {}, settings: {} };
      let job,
        done = false,
        gets = 0;
      await page.route(base + "/api/vw/generations", async (r) => {
        if (r.request().method() !== "POST") return r.continue();
        const now = await page.evaluate(() => Date.now());
        job = { id: "rd1", type: "video", input, status: "running", progress: 5, createdAt: new Date(now).toISOString(), deadlineAt: new Date(now + 1860000).toISOString() };
        await r.fulfill(json(job, 202));
      });
      await page.route(base + "/api/vw/generations/rd1", (r) => {
        gets++;
        r.fulfill(
          json(
            done
              ? { ...job, status: "succeeded", progress: 100, result: { url: "/media/abc/original.mov", previewUrl: "/media/abc/preview.webm", thumbUrl: "/media/abc/thumb.jpg", kind: "video", width: 640, height: 360, duration: 2, frames: 48, origin: { kind: "render", engine: "blender" } } }
              : job,
          ),
        );
      });
      await page.goto(base + "/pages/tools.html#edit");
      await page.waitForFunction(() => typeof VideoWorkbench !== "undefined" && VideoWorkbench.generations);
      await page.evaluate(() => VideoWorkbench.generations.create({ type: "video", operation: "blender-render", prompt: "3D 渲染", references: {}, settings: {} }));
      await page.reload(); // reload during the render: only reconcileJobs can bring the asset back
      await page.waitForFunction(() => typeof VideoWorkbench !== "undefined" && VideoWorkbench.generations);
      // One reconcile round = a 5 s fake timer + a real request; wait for the request before the next 5 s.
      const round = async () => {
        const seen = gets;
        await page.clock.runFor(5000);
        for (let i = 0; i < 200 && gets === seen; i++) await new Promise((r) => setTimeout(r, 10));
        return gets > seen;
      };
      for (let i = 0; i < 11 * 12; i++) assert(await round(), `round ${i}: reconcileJobs stopped watching`); // 11 min > the old 10 min window
      done = true;
      assert(await round(), "still watching after 11 min (server deadline 31 min)");
      const asset = await page.waitForFunction(() => VideoWorkbench.assets.list().then((l) => l.find((a) => a.id === "job-rd1"))).then((h) => h.jsonValue());
      pass("重載後的追蹤時限＝伺服器 deadlineAt：11 分鐘後仍在追蹤並補建素材");
      assert.equal(asset.type, "video/quicktime");
      assert.equal(asset.previewUrl, "/media/abc/preview.webm");
      assert.equal(asset.thumbUrl, "/media/abc/thumb.jpg");
      assert.deepEqual([asset.width, asset.height, asset.duration, asset.frames, asset.kind, asset.origin.engine], [640, 360, 2, 48, "video", "blender"]);
      pass("補建素材保留成果的媒體欄位：previewUrl／thumbUrl／寬高時長影格／origin，.mov → video/quicktime");
      await page.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`p5-review-fixes: ${passed} passed`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
