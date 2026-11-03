// Card P5.0 gate (docs/p5-gate-20261103.md): Blender background engine + pinned three.js viewer. Real Blender
// (scripts/vendor-blender.cjs or BLENDER_PATH); without it this prints SKIP and exits 0.
// (a) GLB import -> export round trip keeps armature, bone names/hierarchy and skin weights (JSON dumps compared)
// (b) procedural character: capsule body + 2-bone arm, bones, automatic weights, IK pose, GLB
// (c) a generated BVH retargeted by bone-name map, baked, exported; per-frame world rotation deltas match the source
// (d) Eevee RGBA PNG sequence with camera + light -> alpha MOV (P3 path) -> verifyOutput + alpha; over a background
//     the transparent area shows the background (overlay track behaviour)
// (e) three.js viewer (WebGLRenderer, Edge headless with WebGPU off) loads the GLB, orbit + zoom, light move, screenshot
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { spawnSync } = require("node:child_process"),
  ffmpeg = require("ffmpeg-static");
const blender = require("../backend/blender.cjs");

if (!blender.capability(process.env).available) {
  console.log("SKIP: Blender 未安裝（node scripts/vendor-blender.cjs）");
  process.exit(0);
}
const { chromium } = require("playwright");
const { isolatedServer } = require("./isolated-server.cjs");
const { createMediaStore } = require("../backend/media-store.cjs");
const { assembleAlphaMov } = require("../backend/compositor-render.cjs");
const { inspectMedia } = require("../backend/media-inspect.cjs");

let passed = 0;
const pass = (label) => {
  passed++;
  console.log("PASS " + label);
};
const work = fs.mkdtempSync(path.join(os.tmpdir(), "vw-p5-gate-"));
const job = (name) => {
  const dir = path.join(work, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};
const dist = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
const angle = (q1, q2) => {
  // The dumps round to 4 decimals: normalise first, or two equal quaternions read as ~1.5 deg apart.
  const n = (q) => Math.hypot(...q);
  const dot = Math.abs(q1.reduce((s, v, i) => s + v * q2[i], 0)) / (n(q1) * n(q2));
  return (2 * Math.acos(Math.min(1, dot)) * 180) / Math.PI;
};
// Motion in BVH: different bone names and rest offsets from the character; arm raises 0->60 deg, elbow 0->45 deg.
function bvh(frames) {
  const lines = ["HIERARCHY", "ROOT Hips", "{", " OFFSET 0 30 0", " CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation", " JOINT Chest", " {", "  OFFSET 0 60 0", "  CHANNELS 3 Zrotation Xrotation Yrotation",
    "  JOINT LeftArm", "  {", "   OFFSET 20 50 0", "   CHANNELS 3 Zrotation Xrotation Yrotation", "   JOINT LeftForeArm", "   {", "    OFFSET 42 0 0", "    CHANNELS 3 Zrotation Xrotation Yrotation", "    End Site", "    {", "     OFFSET 43 0 0", "    }", "   }", "  }", " }", "}",
    "MOTION", "Frames: " + frames, "Frame Time: 0.041667"];
  for (let f = 0; f < frames; f++) {
    const t = f / (frames - 1);
    lines.push(`0 30 0 0 0 0 0 ${(10 * Math.sin(t * Math.PI)).toFixed(3)} 0 ${(60 * t).toFixed(3)} 0 0 ${(45 * t).toFixed(3)} 0 0`);
  }
  return lines.join("\n") + "\n";
}

(async () => {
  // (b) build the test character
  const bDir = job("b");
  const target = [0.75, 1.85, 0.1];
  const built = await blender.runBlender({ script: "build_character.py", workdir: bDir, args: { outPath: path.join(bDir, "char.glb"), target } });
  assert.ok(dist(built.hand, built.target) < 0.01, "IK reaches its target in Blender: " + JSON.stringify(built));
  for (const g of ["root", "spine", "upper_arm.L", "forearm.L"]) assert.ok(built.weights[g] > 20, "automatic weights for " + g + ": " + JSON.stringify(built.weights));
  const charGlb = path.join(work, "char.glb");
  fs.copyFileSync(path.join(bDir, "char.glb"), charGlb);

  // (a) round trip: dump(char.glb) vs dump(char.glb -> import -> export)
  const aDir = job("a");
  fs.copyFileSync(charGlb, path.join(aDir, "in.glb"));
  const first = await blender.runBlender({ script: "inspect_model.py", workdir: aDir, args: { inPath: path.join(aDir, "in.glb"), outPath: path.join(aDir, "out.glb"), frames: [1] } });
  const a2 = job("a2");
  fs.copyFileSync(path.join(aDir, "out.glb"), path.join(a2, "in.glb"));
  const second = await blender.runBlender({ script: "inspect_model.py", workdir: a2, args: { inPath: path.join(a2, "in.glb"), frames: [1] } });
  assert.equal(first.armatures.length, 1);
  assert.deepEqual(second.armatures[0].bones.map((b) => [b.name, b.parent]), first.armatures[0].bones.map((b) => [b.name, b.parent]));
  assert.deepEqual(first.armatures[0].bones.map((b) => b.name), ["forearm.L", "hand_ik.L", "root", "spine", "upper_arm.L"]);
  first.armatures[0].bones.forEach((b, i) => assert.ok(dist(b.head, second.armatures[0].bones[i].head) < 1e-3, "bone head " + b.name));
  const w1 = first.meshes[0].weights, w2 = second.meshes[0].weights;
  assert.ok(Object.keys(w1).length > 400, "weighted vertices: " + Object.keys(w1).length);
  // Same vertex positions (within 2 mm: positions are rounded to 1 mm in the dump) with the same influences.
  assert.equal(Object.keys(w2).length, Object.keys(w1).length, "same number of weighted vertices");
  const pos = (k) => k.split(",").map(Number), second2 = Object.entries(w2).map(([k, w]) => [pos(k), w]);
  for (const [k, w] of Object.entries(w1)) {
    const match = second2.find(([p]) => dist(p, pos(k)) < 0.002);
    assert.ok(match, "vertex at " + k + " survives");
    assert.deepEqual(Object.keys(match[1]), Object.keys(w), "influences at " + k);
    for (const g of Object.keys(w)) assert.ok(Math.abs(w[g] - match[1][g]) <= 0.02, `weight ${g} at ${k}: ${w[g]} vs ${match[1][g]}`);
  }
  assert.deepEqual(first.meshes[0].armature.length, 1);
  pass(`(a) GLB 進出：骨架、${first.armatures[0].bones.length} 根骨骼名稱與父子、${Object.keys(w1).length} 個頂點權重一致`);
  // (b) on the re-imported GLB: the pose survived, the weights are sensible (tip -> forearm, feet -> root)
  const tail = first.poses["1"][first.armatures[0].name]["forearm.L"].tail;
  assert.ok(dist(tail, built.target) < 0.03, `IK pose survives GLB: hand ${tail} target ${built.target}`);
  const at = (pred) => Object.entries(w1).filter(([k]) => pred(k.split(",").map(Number))).map(([, w]) => w);
  assert.ok(at(([x]) => x > 1.0).every((w) => (w["forearm.L"] || 0) >= 0.9), "arm tip weighted to the forearm");
  assert.ok(at(([, , z]) => z < 0.3).every((w) => (w.root || 0) >= 0.9), "feet weighted to the root");
  pass("(b) 程序建角：膠囊身體＋兩節手臂，自動權重（手尖→前臂、腳→root），IK 擺姿烘進 GLB（手到目標 < 3 cm）");

  // (c) retarget a BVH by bone-name map
  const cDir = job("c");
  fs.copyFileSync(charGlb, path.join(cDir, "character.glb"));
  fs.writeFileSync(path.join(cDir, "motion.bvh"), bvh(24));
  const boneMap = { Hips: "root", Chest: "spine", LeftArm: "upper_arm.L", LeftForeArm: "forearm.L" };
  const progress = [];
  const rt = await blender.runBlender({ script: "retarget.py", workdir: cDir, args: { characterPath: path.join(cDir, "character.glb"), motionPath: path.join(cDir, "motion.bvh"), boneMap, outPath: path.join(cDir, "out.glb") }, onProgress: (d, t) => progress.push(d + "/" + t) });
  assert.deepEqual(rt.frames, [1, 24]);
  assert.equal(progress.at(-1), "24/24");
  const c2 = job("c2");
  fs.copyFileSync(path.join(cDir, "out.glb"), path.join(c2, "in.glb"));
  const frames = Array.from({ length: 24 }, (_, i) => i + 1);
  const moved = await blender.runBlender({ script: "inspect_model.py", workdir: c2, args: { inPath: path.join(c2, "in.glb"), frames } });
  assert.deepEqual(moved.frameRange, [1, 24]);
  assert.ok(moved.actions.length >= 1);
  let worst = 0;
  for (const f of frames)
    for (const bone of Object.values(boneMap)) {
      const e = angle(moved.poses[f][moved.armatures[0].name][bone].delta, rt.source[f][bone]);
      worst = Math.max(worst, e);
    }
  assert.ok(worst < 1.5, "retargeted rotation differs from the source by " + worst.toFixed(2) + " deg");
  assert.ok(angle(rt.source["24"]["upper_arm.L"], [1, 0, 0, 0]) > 55, "the source motion actually moves");
  pass(`(c) BVH 動作依骨骼名稱對照重定向、烘焙、匯出：24 格 × 4 骨世界旋轉與來源差 ≤ ${worst.toFixed(2)}°`);

  // (d) render RGBA PNG -> alpha MOV -> verify -> composite over a background
  const dDir = job("d");
  fs.copyFileSync(path.join(cDir, "out.glb"), path.join(dDir, "model.glb"));
  const t0 = Date.now();
  const rendered = await blender.runBlender({
    script: "render.py", workdir: dDir,
    args: {
      framesDir: path.join(dDir, "frames"), width: 320, height: 180, frameCount: 24, fps: { num: 24, den: 1 },
      objects: [{ modelPath: path.join(dDir, "model.glb"), position: [0, 0, 0], rotationY: 0, scale: 1 }],
      camera: { fov: 40, keys: [{ frame: 0, position: [0.4, 1.2, 4.2], target: [0.4, 1.1, 0] }, { frame: 23, position: [1.4, 1.4, 3.8], target: [0.4, 1.1, 0] }] },
      lights: [{ type: "sun", position: [2, 4, 3], intensity: 2, color: "#ffffff" }],
      ground: false,
    },
  });
  const renderMs = Date.now() - t0;
  assert.equal(rendered.frames, 24);
  assert.match(rendered.engine, /EEVEE/);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-p5-gate-data-"));
  const mediaStore = createMediaStore({ dataDir });
  const mov = await assembleAlphaMov({ dir: path.join(dDir, "frames"), frames: 24, fps: { num: 24, den: 1 }, width: 320, height: 180, mediaStore });
  assert.equal(mov.verification.ok, true);
  assert.match(mov.previewUrl, /proxy\.webm$/, "alpha source gets the VP9+alpha preview like P3");
  const file = mediaStore.fileFor(mov.url);
  assert.match((await inspectMedia(file)).probe.pixFmt, /^rgba/);
  const raw = spawnSync(ffmpeg, ["-v", "error", "-i", file, "-vf", "select=eq(n\\,12)", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { maxBuffer: 1 << 24, windowsHide: true }).stdout;
  let clear = 0, solid = 0;
  for (let i = 3; i < raw.length; i += 4) raw[i] === 0 ? clear++ : raw[i] === 255 && solid++;
  assert.ok(clear > 320 * 180 * 0.5 && solid > 500, `alpha: ${clear} transparent, ${solid} opaque pixels`);
  // Over a red background (the editor's overlay track does the same overlay): corner = red, character area != red.
  const over = spawnSync(ffmpeg, ["-v", "error", "-f", "lavfi", "-i", "color=c=red:s=320x180:d=1", "-i", file, "-filter_complex", "[0:v][1:v]overlay=0:0,format=rgb24", "-frames:v", "1", "-f", "rawvideo", "-"], { maxBuffer: 1 << 24, windowsHide: true }).stdout;
  assert.ok(over[0] > 240 && over[1] < 20 && over[2] < 20, "transparent corner shows the red background: " + [...over.subarray(0, 3)]);
  let notRed = 0;
  for (let i = 0; i < over.length; i += 3) if (!(over[i] > 200 && over[i + 1] < 40 && over[i + 2] < 40)) notRed++;
  assert.ok(notRed > 500, "the character covers part of the background: " + notRed);
  pass(`(d) Eevee 透明 PNG 序列（24 格 320×180，${(renderMs / 1000).toFixed(1)} 秒）→ alpha MOV（${mov.verification.ok ? "驗證通過" : ""}，rgba）→ 疊在底圖上透明處露出底圖`);

  // (e) viewer in headless Edge
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--disable-features=WebGPU"] });
  try {
    const { base } = await isolatedServer("vw-p5-gate-");
    const up = await fetch(base + "/api/vw/uploads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "gate.glb", data: "data:model/gltf-binary;base64," + fs.readFileSync(path.join(cDir, "out.glb")).toString("base64") }) });
    assert.equal(up.status, 201);
    const asset = await up.json();
    assert.match(asset.url, /^\/media\/[a-f0-9]{64}\/original\.glb$/);
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } }), errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.route("**/*", (r) => (r.request().url().startsWith(base + "/") ? r.continue() : r.abort()));
    await page.route(base + "/__p5_gate.html", (r) => r.fulfill({ contentType: "text/html", body: `<!doctype html><script type="importmap">{"imports":{"three":"/vendor/three/0.186.0/build/three.module.js"}}</script><canvas id="c" width="640" height="360"></canvas><script type="module">import { createViewer } from "/scripts/viewer3d.mjs"; window.viewer = createViewer(document.getElementById("c")); window.ready = true;</script>` }));
    await page.goto(base + "/__p5_gate.html");
    await page.waitForFunction(() => window.ready, null, { timeout: 15000 }).catch((e) => {
      throw Error("viewer did not start: " + errors.join(" | "), { cause: e });
    });
    const info = await page.evaluate(async (url) => {
      const v = window.viewer;
      const loaded = await v.load("m", url);
      v.setLights([{ type: "point", position: [2, 3, 2], intensity: 3, color: "#ffffff" }]);
      v.setCamera({ position: [0.5, 1.3, 4], target: [0.4, 1.1, 0], fov: 40 });
      return { loaded, webgl: v.renderer.isWebGLRenderer === true, webgl2: v.renderer.getContext() instanceof WebGL2RenderingContext };
    }, asset.url);
    assert.equal(info.webgl, true);
    assert.equal(info.webgl2, true, "WebGL 2 context (no WebGPU renderer)");
    assert.deepEqual(info.loaded.bones.map((b) => b.name).sort(), ["forearm.L", "hand_ik.L", "root", "spine", "upper_arm.L"]);
    assert.equal(info.loaded.animations.length, 1);
    const cam0 = await page.evaluate(() => viewer.getCamera());
    const box = await page.locator("#c").boundingBox();
    await page.mouse.move(box.x + 300, box.y + 180);
    await page.mouse.down();
    await page.mouse.move(box.x + 420, box.y + 200, { steps: 8 });
    await page.mouse.up();
    const cam1 = await page.evaluate(() => viewer.getCamera());
    assert.ok(dist(cam0.position, cam1.position) > 0.3, "orbit drag moved the camera");
    const r0 = dist(cam1.position, cam1.target);
    await page.mouse.move(box.x + 320, box.y + 180);
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(100);
    const cam2 = await page.evaluate(() => viewer.getCamera());
    assert.ok(dist(cam2.position, cam2.target) < r0 - 0.1, `wheel zoomed in: ${r0} -> ${dist(cam2.position, cam2.target)}`);
    const shots = await page.evaluate(() => {
      const count = (url) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            const c = document.createElement("canvas");
            c.width = img.width;
            c.height = img.height;
            const g = c.getContext("2d");
            g.drawImage(img, 0, 0);
            const d = g.getImageData(0, 0, c.width, c.height).data;
            let lit = 0, sum = 0;
            for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0 && d[i] + d[i + 1] + d[i + 2] > 60) (lit++, (sum += d[i] + d[i + 1] + d[i + 2]));
            resolve({ lit, sum, width: img.width, height: img.height });
          };
          img.src = url;
        });
      viewer.setCamera({ position: [0.5, 1.3, 4], target: [0.4, 1.1, 0] });
      const a = viewer.screenshot();
      viewer.setLights([{ type: "point", position: [-3, 0.2, -2], intensity: 3, color: "#ff3300" }]);
      const b = viewer.screenshot();
      return Promise.all([count(a), count(b)]).then(([x, y]) => ({ x, y, a: a.length }));
    });
    assert.equal(shots.x.width, 640);
    assert.ok(shots.x.lit > 2000, "screenshot shows the lit model: " + JSON.stringify(shots.x));
    assert.notEqual(shots.x.sum, shots.y.sum, "moving/changing the light changes the image");
    // Viewer FK pose -> poseDeltas -> Blender render: the posed elbow lands where the viewer drew it; Blender IK
    // (chain 1 = the upper arm turns) brings the elbow to its target.
    const posed = await page.evaluate(() => {
      viewer.setPose("m", { "upper_arm.L": [0, 0, 30], "forearm.L": [0, 20, 0] });
      return { deltas: viewer.poseDeltas("m"), elbow: viewer.boneWorld("m", "forearm.L"), shoulder: viewer.boneWorld("m", "upper_arm.L") };
    });
    assert.deepEqual(Object.keys(posed.deltas).sort(), ["forearm.L", "upper_arm.L"]);
    const reach = Math.hypot(...[0.42, 0.04, 0].map((v) => v)), dir = [0.5, 0.6, 0.2], len = Math.hypot(...dir);
    const ikTarget = posed.shoulder.map((v, i) => v + (dir[i] / len) * reach);
    const eDir = job("e");
    fs.copyFileSync(path.join(cDir, "out.glb"), path.join(eDir, "model.glb"));
    const scene = (pose, ik) => ({ framesDir: path.join(eDir, "frames"), width: 64, height: 36, frameCount: 1, fps: { num: 24, den: 1 }, objects: [{ modelPath: path.join(eDir, "model.glb"), position: [0, 0, 0], rotationY: 0, scale: 1, pose, ik }], camera: { fov: 40, keys: [{ frame: 0, position: [0.4, 1.2, 4.2], target: [0.4, 1.1, 0] }] }, lights: [], ground: false });
    const fk = await blender.runBlender({ script: "render.py", workdir: eDir, args: scene(posed.deltas, []) });
    assert.ok(dist(fk.heads[0]["forearm.L"], posed.elbow) < 0.01, `viewer elbow ${posed.elbow} vs Blender ${fk.heads[0]["forearm.L"]}`);
    const ik = await blender.runBlender({ script: "render.py", workdir: eDir, args: scene({}, [{ bone: "forearm.L", chain: 1, target: ikTarget }]) });
    assert.ok(dist(ik.heads[0]["forearm.L"], ikTarget) < 0.02, `IK elbow ${ik.heads[0]["forearm.L"]} vs target ${ikTarget}`);
    assert.deepEqual(errors, []);
    pass(`(e) three.js 0.186.0 WebGLRenderer（WebGPU 關閉）載入 GLB（5 根骨骼、1 段動作），拖曳旋轉鏡頭、滾輪縮放、移動燈光，截圖 640×360；檢視器 FK 姿勢經 Blender 渲染手肘差 < 1 cm，Blender IK 手肘到目標 < 2 cm`);
  } finally {
    await browser.close();
  }
  fs.rmSync(work, { recursive: true, force: true });
  console.log(passed + " passed");
})().catch((error) => {
  console.error("FAIL", error);
  process.exit(1);
});
