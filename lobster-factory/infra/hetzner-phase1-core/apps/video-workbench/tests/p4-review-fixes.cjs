// Card P4 review fixes (Codex 2026-11-03, agency-os/reports/oracle/2026-11-03-partialreview-e3cbe88a.md):
// #1 a pose image exported into a character that already has 4 references is actually sent by image generation
//    (the server builds the request: fake fetchImpl captures the reference files); the limit is one backend
//    constant published in /capabilities.
// #2 a mesh built at 100 px still covers the whole part after the part is resized to 200 px (browser render);
//    pixel meshes saved before the fix are migrated to part-normalised ones on load.
// #3 on a skinned mesh, a pin that follows another bone follows it: rotating that bone moves the pinned region.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { spawnSync } = require("node:child_process"),
  ffmpeg = require("ffmpeg-static"),
  { chromium } = require("playwright");
const { createServer } = require("../server.cjs"),
  { MAX_SENT_REFERENCES } = require("../backend/api.cjs"),
  { isolatedServer } = require("./isolated-server.cjs"),
  Rig = require("../shared/rig.js");

let passed = 0;
const pass = (label) => {
  passed++;
  console.log("PASS " + label);
};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vw-p4-fixes-"));
function png(colour) {
  const file = path.join(tmp, colour.replace("#", "") + ".png");
  const r = spawnSync(ffmpeg, ["-y", "-v", "error", "-f", "lavfi", "-i", `color=c=${colour}:s=8x8`, "-frames:v", "1", file], { windowsHide: true });
  assert.equal(r.status, 0, String(r.stderr));
  return fs.readFileSync(file);
}

(async () => {
  // #1 -----------------------------------------------------------------------------------------------------
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-p4-fixes-srv-")),
      result = png("#000000"),
      sent = [];
    const server = createServer({
      dataDir: dir,
      env: { OPENAI_API_KEY: "test-only" },
      fetchImpl: async (url, options) => {
        if (url.endsWith("/images/edits") || url.endsWith("/images/generations")) {
          const files = options.body instanceof FormData ? options.body.getAll("image[]") : [];
          sent.push(await Promise.all(files.map(async (f) => Buffer.from(await f.arrayBuffer()))));
          return Response.json({ data: [{ b64_json: result.toString("base64") }] });
        }
        throw Error("未預期的網路請求：" + url);
      },
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const base = "http://127.0.0.1:" + server.address().port,
      call = async (route, data, method = "POST") => {
        const r = await fetch(base + "/api/seedstar" + route, { method, headers: { "Content-Type": "application/json" }, ...(data ? { body: JSON.stringify(data) } : {}) });
        const v = await r.json();
        assert(r.ok, JSON.stringify(v));
        return v;
      };
    try {
      const caps = await call("/capabilities", undefined, "GET");
      assert.equal(MAX_SENT_REFERENCES, 4);
      assert.equal(caps.maxSentReferences, MAX_SENT_REFERENCES, "/capabilities publishes the backend constant");
      const colours = ["#ff0000", "#00ff00", "#0000ff", "#ffff00"],
        refs = [];
      for (const c of colours) refs.push((await call("/uploads", { data: "data:image/png;base64," + png(c).toString("base64"), name: c })).url);
      const poseBytes = png("#ff00ff"),
        pose = await call("/rig/pose-stills", { data: "data:image/png;base64," + poseBytes.toString("base64"), characterId: "c1", rigId: "r1", rigVersion: 1, poseId: "p1" });
      assert.deepEqual(pose.origin, { kind: "render", engine: "workbench-rig", characterId: "c1", rigId: "r1", rigVersion: 1, poseId: "p1" });
      const withPose = Rig.poseReferences(refs, pose.url);
      assert.equal(withPose.length, 5);
      assert.equal(withPose[0], refs[0], "main reference stays first");
      assert.equal(withPose[1], pose.url, "pose goes right after the main reference");
      const poll = async (job) => {
        for (let i = 0; i < 200; i++) {
          const v = await call("/generations/" + job.id, undefined, "GET");
          if (["succeeded", "failed", "cancelled"].includes(v.status)) return v;
          await new Promise((r) => setTimeout(r, 30));
        }
        throw Error("任務逾時");
      };
      const job = await poll(await call("/generations", { type: "image", prompt: "角色擺姿勢", character: { references: withPose } }));
      assert.equal(job.status, "succeeded", JSON.stringify(job.error || job));
      const files = sent.at(-1);
      assert.equal(files.length, MAX_SENT_REFERENCES);
      assert.ok(files.some((b) => b.equals(poseBytes)), "the generation request carries the pose image");
      // The old placement (appended as the 5th) is exactly what the limit drops: the invariant the fix closes.
      const job2 = await poll(await call("/generations", { type: "image", prompt: "角色擺姿勢", character: { references: [...refs, pose.url] } }));
      assert.equal(job2.status, "succeeded");
      assert.ok(!sent.at(-1).some((b) => b.equals(poseBytes)), "appended at the end it would not be sent");
      // Full (8): a chosen reference is replaced and the pose still lands at index 1; no choice = not added.
      const eight = [...refs, ...refs.map((u) => u + "?b")];
      const replaced = Rig.poseReferences(eight, pose.url, { replace: 6 });
      assert.equal(replaced.length, 8);
      assert.equal(replaced[1], pose.url);
      assert.equal(Rig.poseReferences(eight, pose.url), null);
      pass("#1 角色已有 4 張參考圖：匯出姿勢圖插在主圖後（第 2 張），伺服器組出的生成請求確實帶上姿勢圖；上限＝後端常數 4，/capabilities 公布；放到第 5 張時會被丟掉");
    } finally {
      server.close();
    }
  }

  // #3 -----------------------------------------------------------------------------------------------------
  {
    const rig = {
      bones: [
        { id: "A", name: "A", parent: null, x: 0, y: 0, angle: 0, length: 100 },
        { id: "B", name: "B", parent: null, x: 0, y: 200, angle: 0, length: 100 },
      ],
      chains: [],
    };
    const part = { id: "P", x: 0, y: 0, width: 100, height: 100, bone: null };
    const built = Rig.buildMesh(100, 100, "coarse", () => true),
      mesh = { id: "M", partId: "P", ...built, skin: true, weights: built.vertices.map(() => ({ A: 1 })), pins: [{ id: "N", x: 1, y: 1, bone: "B" }, { id: "O", x: 0, y: 0, bone: null }] };
    const rest = Rig.restVerts(mesh, part),
      corner = rest.findIndex(([x, y]) => x === 100 && y === 100),
      origin = rest.findIndex(([x, y]) => x === 0 && y === 0);
    const still = Rig.deformMesh(rig, mesh, part, Rig.solve(rig, {}), {});
    still.forEach((v, i) => assert.ok(Math.hypot(v[0] - rest[i][0], v[1] - rest[i][1]) < 1e-9, "unrotated bones = rest"));
    const turned = Rig.deformMesh(rig, mesh, part, Rig.solve(rig, { rot: { B: 90 } }), {});
    // B rotates 90° about (0, 200): the pinned corner (100, 100) goes to (100, 300).
    assert.ok(Math.hypot(turned[corner][0] - 100, turned[corner][1] - 300) < 1e-6, "pinned corner follows bone B: " + turned[corner]);
    assert.ok(Math.hypot(turned[origin][0], turned[origin][1]) < 1e-6, "the unfollowing pin keeps its corner on the skin");
    const mid = rest.findIndex(([x, y]) => x === 75 && y === 75), mid2 = rest.findIndex(([x, y]) => x === 25 && y === 25);
    assert.ok(Math.hypot(turned[mid][0] - 75, turned[mid][1] - 75) > Math.hypot(turned[mid2][0] - 25, turned[mid2][1] - 25), "the region near the following pin moves most");
    // Rotating A (the skin bone) still skins the mesh; the pin keeps the corner on B.
    const skinned = Rig.deformMesh(rig, mesh, part, Rig.solve(rig, { rot: { A: 90 } }), {});
    assert.ok(Math.hypot(skinned[corner][0] - 100, skinned[corner][1] - 100) < 1e-6, "corner held by its pin on B");
    assert.ok(Math.hypot(skinned[origin][0], skinned[origin][1]) < 1e-6, "A's head stays put");
    pass("#3 蒙皮網格＋跟隨另一根骨骼的控制釘：轉動那根骨骼，釘住的角跟著移到 (100,300)，離釘越近移動越多；轉蒙皮骨骼時該釘仍把角留在 B 上；骨骼不動＝原樣");
  }

  // #2 -----------------------------------------------------------------------------------------------------
  {
    const legacy = { space: undefined, vertices: [[0, 0], [100, 0], [100, 50], [0, 50]], triangles: [[0, 1, 2], [0, 2, 3]], pins: [{ id: "n", x: 50, y: 25, bone: null }] },
      unit = Rig.unitMesh(legacy, { width: 100, height: 50 });
    assert.deepEqual(unit.vertices, [[0, 0], [1, 0], [1, 1], [0, 1]]);
    assert.deepEqual(unit.pins[0], { id: "n", x: 0.5, y: 0.5, bone: null });
    assert.equal(legacy.vertices[1][0], 100, "migration copies, never edits the stored mesh");

    const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--disable-features=WebGPU"] });
    try {
      const { base } = await isolatedServer("vw-p4-fixes-ui-");
      const page = await browser.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/*", (r) => (r.request().url().startsWith(base + "/") ? r.continue() : r.abort()));
      await page.goto(base + "/pages/tools.html#rig");
      await page.waitForFunction(() => window.Rig && typeof rgNormalize === "function");
      const out = await page.evaluate(() => {
        const img = Object.assign(document.createElement("canvas"), { width: 100, height: 50 });
        img.getContext("2d").fillStyle = "#ff0000";
        img.getContext("2d").fillRect(0, 0, 100, 50);
        const part = { id: "P", name: "布", x: 10, y: 5, width: 100, height: 50, bone: null };
        const mesh = { id: "M", partId: "P", ...Rig.buildMesh(100, 50, "medium", () => true), skin: false, pins: [] };
        const rig = { parts: [part], bones: [], chains: [], meshes: [mesh] };
        part.width = 200; // resized after the mesh was built
        const c = Object.assign(document.createElement("canvas"), { width: 260, height: 70 }),
          x = c.getContext("2d");
        Rig.draw(x, rig, { rot: {}, ik: {}, pins: {} }, () => img);
        const row = x.getImageData(0, 30, 260, 1).data,
          alpha = (px) => row[px * 4 + 3];
        // A rig whose mesh was saved in pixels at 100 px is migrated by the workspace on load.
        const loaded = rgNormalize({ parts: [{ ...part, width: 100 }], meshes: [{ id: "L", partId: "P", vertices: [[0, 0], [100, 50]], triangles: [], pins: [{ id: "n", x: 100, y: 50 }] }] });
        return { covered: [12, 60, 110, 160, 205].map(alpha), outside: [5, 215].map(alpha), loaded: loaded.meshes[0] };
      });
      assert.ok(out.covered.every((a) => a > 200), "the resized part is drawn across its full 200 px: " + out.covered);
      assert.deepEqual(out.outside, [0, 0]);
      assert.equal(out.loaded.space, "unit");
      assert.deepEqual(out.loaded.vertices, [[0, 0], [1, 1]]);
      assert.deepEqual([out.loaded.pins[0].x, out.loaded.pins[0].y], [1, 1]);
      assert.deepEqual(errors, []);
      pass("#2 網格在 100 px 建立、部件改成 200 px 後，畫面整條 200 px 都有貼圖（不再被裁掉）；舊的像素網格載入時轉成相對部件的座標");
    } finally {
      await browser.close();
    }
  }
  console.log(passed + " passed");
})().catch((error) => {
  console.error("FAIL", error);
  process.exit(1);
});
