// Card S4b.3, real run (Blender 4.5.9, no vendor): a free humanoid made here (tests/fixtures/mannequin.py: no skeleton,
// one remeshed mesh) -> job blender-autorig with the CMU walk -> GLB with the Rigify metarig skeleton, every vertex
// weighted, the walk baked in; then the saved rig is corrected (left elbow moved) and run again from the same unrigged
// mesh -> the skeleton follows the corrected joint. Needs runtime/blender (node scripts/vendor-blender.cjs).
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { spawnSync } = require("node:child_process");
const { isolatedServer } = require("./isolated-server.cjs");
const blender = require("../backend/blender.cjs");

let passed = 0;
const pass = (label) => (passed++, console.log("PASS " + label));

(async () => {
  const exe = blender.blenderPath();
  assert.ok(exe, "Blender not installed: node scripts/vendor-blender.cjs");
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "vw-s4b-rig-"));
  const model = path.join(work, "mannequin.glb");
  const made = spawnSync(exe, ["-b", "--factory-startup", "--python", path.join(__dirname, "fixtures", "mannequin.py"), "--", model], { encoding: "utf8" });
  assert.match(made.stdout, /MANNEQUIN \d+/, made.stderr);

  const { base, dataDir } = await isolatedServer("vw-s4b-rig-");
  const call = async (route, data, method = "POST") => {
    const r = await fetch(base + "/api/vw" + route, { method, headers: { "Content-Type": "application/json" }, ...(data ? { body: JSON.stringify(data) } : {}) });
    const v = await r.json();
    assert(r.ok, JSON.stringify(v));
    return v;
  };
  const finished = async (id) => {
    for (let i = 0; i < 1200; i++) {
      const v = await call("/generations/" + id, undefined, "GET");
      if (["succeeded", "failed", "cancelled"].includes(v.status)) return v;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw Error("autorig did not finish");
  };
  const inspect = async (url, frames) => {
    const dir = fs.mkdtempSync(path.join(work, "inspect-"));
    fs.copyFileSync(path.join(dataDir, url.slice(1)), path.join(dir, "in.glb"));
    return blender.runBlender({ script: "inspect_model.py", workdir: dir, args: { inPath: path.join(dir, "in.glb"), frames } });
  };
  const caps = await call("/capabilities", undefined, "GET");
  assert.ok(caps.blender.motions.some((m) => m.id === "cmu-02_01" && m.label === "走路"));

  const mesh = await call("/uploads", { name: "mannequin.glb", data: "data:model/gltf-binary;base64," + fs.readFileSync(model).toString("base64"), rightsConfirmed: true });
  const job1 = await finished((await call("/generations", { type: "model", operation: "blender-autorig", prompt: "自動人形骨架", references: { character: { url: mesh.url, id: "mesh-1" } }, settings: { motion: "cmu-02_01" } })).id);
  assert.equal(job1.status, "succeeded", job1.error);
  const rig = job1.result.rig;
  assert.deepEqual([rig.sourceAssetId, rig.sourceUrl, rig.turn, rig.motion, Object.keys(rig.landmarks).length, rig.bones.length], ["mesh-1", mesh.url, 0, "cmu-02_01", 15, 23]);
  assert.ok(rig.frames[1] - rig.frames[0] > 50, "120 fps CMU walk resampled to 24 fps: " + rig.frames);
  const d1 = await inspect(job1.result.url, [rig.frames[0], 30]);
  const body = d1.meshes.find((m) => m.vertices > 1000);
  assert.deepEqual(body.armature, ["Rig"]);
  // (The glTF importer adds an "Icosphere" bone display shape on import; it is not in the file.)
  assert.deepEqual(d1.meshes.filter((m) => m.name !== "Icosphere").map((m) => m.name), [body.name], "only the body mesh is exported");
  // weighted = [vertices weighted by bone heat, vertices given their nearest bones]: autorig.py leaves none without a weight.
  assert.ok(rig.weighted[0] >= 0.95 * (rig.weighted[0] + rig.weighted[1]), "bone heat solved the mesh: " + rig.weighted);
  assert.ok(Object.values(body.weights).every((w) => Object.keys(w).every((g) => rig.bones.includes(g))), "weights only on rig bones");
  assert.ok(d1.actions.length === 1, "one baked action: " + d1.actions);
  const pose = d1.poses["30"].Rig;
  const thigh = (s) => pose["thigh." + s].tail;
  // common.dump positions are Blender axes: [0] left(+)/right, [1] forward (-) / back, [2] up.
  assert.ok(Math.abs(thigh("L")[1] - thigh("R")[1]) > 0.1, "mid-walk the knees are apart front-to-back: " + JSON.stringify([thigh("L"), thigh("R")]));
  assert.ok(thigh("L")[0] > 0 && thigh("R")[0] < 0, "legs do not cross");
  pass(`自動綁骨＋走路：Rigify metarig 23 根骨、15 個關節點、權重涵蓋網格、CMU 120 fps → 24 fps 共 ${rig.frames[1] - rig.frames[0] + 1} 格；第 30 格雙膝前後分開、雙腿不交叉`);

  // Saved rig corrected and run again (what 重新綁骨 sends): same unrigged mesh, the edited joint is used as given.
  const marks = { ...rig.landmarks, "elbow.L": rig.landmarks["elbow.L"].map((v, i) => (i === 1 ? v + 0.1 : v)) };
  const job2 = await finished((await call("/generations", { type: "model", operation: "blender-autorig", prompt: "自動人形骨架", references: { character: { url: rig.sourceUrl, id: rig.sourceAssetId } }, settings: { turn: rig.turn, landmarks: marks } })).id);
  assert.equal(job2.status, "succeeded", job2.error);
  job2.result.rig.landmarks["elbow.L"].forEach((v, i) => assert.ok(Math.abs(v - marks["elbow.L"][i]) < 1e-4, "corrected joint kept"));
  const d2 = await inspect(job2.result.url, []);
  const head = (d, n) => d.armatures[0].bones.find((b) => b.name === n).head;
  assert.ok(Math.abs(head(d2, "forearm.L")[2] - marks["elbow.L"][1]) < 0.002, "forearm starts at the corrected elbow (Blender z = glTF y): " + head(d2, "forearm.L"));
  assert.equal(d2.actions.length, 0, "no motion picked -> rig only");
  pass("修正左手肘關節點後重新綁骨：從同一個原始網格重跑，forearm.L 起點＝修正值，不套動作時無動畫");
  console.log(`s4b-autorig: ${passed} passed`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
