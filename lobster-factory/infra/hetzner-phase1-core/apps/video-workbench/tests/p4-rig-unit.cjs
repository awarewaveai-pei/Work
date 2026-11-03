// Card P4 rig math (shared/rig.js), node only: FK chain positions; 2-bone IK reaches a reachable target within
// 0.5 px and the bend toggle flips the elbow; FABRIK on 4 bones; joint limits clamp; unreachable target = chain
// straight toward it; MLS rigid = identity with unmoved pins and exact pin targets when moved; auto weights sum to
// 1; LBS with one bone = that bone's rigid transform.
const assert = require("node:assert/strict");
const Rig = require("../shared/rig.js");

let passed = 0;
const pass = (label) => {
  passed++;
  console.log("PASS " + label);
};
const near = (a, b, tol, msg) => assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol, `${msg}: ${a} vs ${b}`);
const bone = (id, parent, x, y, angle, length, extra = {}) => ({ id, name: id, parent, x, y, angle, length, ...extra });

// FK: three bones along +x (lengths 100, 80, 60). Rotating the root 90° carries both children; rotating the middle
// 90° on top bends only the last two.
{
  const rig = { bones: [bone("a", null, 0, 0, 0, 100), bone("b", "a", 100, 0, 0, 80), bone("c", "b", 180, 0, 0, 60)] };
  let s = Rig.solve(rig, { rot: { a: 90 } });
  near([s.posed.get("b").x, s.posed.get("b").y], [0, 100], 1e-9, "b head after root 90");
  near([s.posed.get("c").x, s.posed.get("c").y], [0, 180], 1e-9, "c head after root 90");
  near(s.posed.get("c").tail, [0, 240], 1e-9, "c tail after root 90");
  s = Rig.solve(rig, { rot: { a: 90, b: 90 } });
  near([s.posed.get("c").x, s.posed.get("c").y], [-80, 100], 1e-9, "c head after a 90 + b 90");
  near(s.posed.get("c").tail, [-140, 100], 1e-9, "c tail after a 90 + b 90");
  assert.equal(s.posed.get("c").angle, 180);
  // A bone whose head is offset from its parent's tail keeps that offset rigidly.
  const off = { bones: [bone("a", null, 0, 0, 0, 100), bone("b", "a", 50, 20, 0, 40)] };
  s = Rig.solve(off, { rot: { a: 90 } });
  near([s.posed.get("b").x, s.posed.get("b").y], [-20, 50], 1e-9, "offset child head");
  pass("FK：轉動根骨，子骨頭尾位置照父骨旋轉；中間骨再轉只帶動後段；不在父骨尾端的子骨保持相對位置");
}

// 2-bone IK: upper 140 + fore 120 from (0, 0).
{
  const arm = { bones: [bone("u", null, 0, 0, 0, 140), bone("f", "u", 140, 0, 0, 120)], chains: [{ id: "k", name: "手臂", bones: ["u", "f"], bend: 1 }] };
  const target = [150, -150];
  for (const bend of [1, -1]) {
    arm.chains[0].bend = bend;
    const s = Rig.solve(arm, { ik: { k: target } });
    near(s.posed.get("f").tail, target, 0.5, "end reaches target, bend " + bend);
    near([s.posed.get("f").x, s.posed.get("f").y], [0, 0], 140 + 1e-6, "elbow within upper length");
    assert.ok(Math.abs(Math.hypot(s.posed.get("f").x, s.posed.get("f").y) - 140) < 1e-6, "upper arm keeps its length");
  }
  arm.chains[0].bend = 1;
  const e1 = Rig.solve(arm, { ik: { k: target } }).posed.get("f");
  arm.chains[0].bend = -1;
  const e2 = Rig.solve(arm, { ik: { k: target } }).posed.get("f");
  // The two elbows sit on opposite sides of the shoulder->target line.
  const side = (p) => Math.sign(target[0] * p[1] - target[1] * p[0]);
  assert.notEqual(side([e1.x, e1.y]), side([e2.x, e2.y]), "bend toggle flips the elbow side");
  // Law of cosines, independently: elbow angle from the shoulder->target line.
  const d = Math.hypot(...target), alpha = Math.acos((140 ** 2 + d ** 2 - 120 ** 2) / (2 * 140 * d)), phi = Math.atan2(target[1], target[0]);
  near([e1.x, e1.y], [140 * Math.cos(phi + alpha), 140 * Math.sin(phi + alpha)], 1e-6, "bend 1 elbow = law of cosines");
  near([e2.x, e2.y], [140 * Math.cos(phi - alpha), 140 * Math.sin(phi - alpha)], 1e-6, "bend -1 elbow = law of cosines");
  pass("兩節 IK：可到達目標 0.5 px 內到達；手肘向內／向外切換後手肘在目標線兩側，位置＝餘弦定理");
}

// FABRIK, 4 bones of 50 from (0, 0) along +x; target inside reach.
{
  const rig = {
    bones: [bone("a", null, 0, 0, 0, 50), bone("b", "a", 50, 0, 0, 50), bone("c", "b", 100, 0, 0, 50), bone("d", "c", 150, 0, 0, 50)],
    chains: [{ id: "k", name: "尾巴", bones: ["a", "b", "c", "d"] }],
  };
  const t = [120, 90], s = Rig.solve(rig, { ik: { k: t } });
  near(s.posed.get("d").tail, t, 0.5, "FABRIK end reaches target");
  for (const id of ["a", "b", "c", "d"]) {
    const p = s.posed.get(id);
    assert.ok(Math.abs(Math.hypot(p.tail[0] - p.x, p.tail[1] - p.y) - 50) < 1e-9, "bone " + id + " keeps length 50");
  }
  near([s.posed.get("a").x, s.posed.get("a").y], [0, 0], 1e-9, "root stays");
  const again = Rig.solve(rig, { ik: { k: t } });
  assert.deepEqual([...again.posed.values()].map((p) => p.tail), [...s.posed.values()].map((p) => p.tail), "deterministic");
  pass("FABRIK 4 節：末端 0.5 px 內到達，骨長不變，根部不動，重算結果相同");
}

// Joint limits: FK input clamped; after IK the solved rotation is clamped too.
{
  const rig = { bones: [bone("a", null, 0, 0, 0, 100), bone("b", "a", 100, 0, 0, 100, { min: -30, max: 30 })], chains: [{ id: "k", name: "k", bones: ["a", "b"], bend: 1 }] };
  assert.equal(Rig.solve(rig, { rot: { b: 80 } }).rot.b, 30);
  assert.equal(Rig.solve(rig, { rot: { b: -80 } }).rot.b, -30);
  const s = Rig.solve(rig, { ik: { k: [60, 40] } });
  assert.ok(s.rot.b >= -30 && s.rot.b <= 30, "IK result respects the limit: " + s.rot.b);
  assert.ok(Math.abs(Math.abs(s.rot.b) - 30) < 1e-9, "a target needing a sharper bend stops at the limit");
  pass("關節限制：FK 輸入與 IK 解算結果都被夾在 −30°～30°");
}

// Unreachable: straight toward the target (2-bone analytic and FABRIK alike).
{
  const two = { bones: [bone("u", null, 0, 0, 0, 100), bone("f", "u", 100, 0, 0, 100)], chains: [{ id: "k", name: "k", bones: ["u", "f"], bend: 1 }] };
  const t = [0, 500], s = Rig.solve(two, { ik: { k: t } });
  near(s.posed.get("f").tail, [0, 200], 1e-9, "2-bone straight toward unreachable target");
  near([s.posed.get("f").x, s.posed.get("f").y], [0, 100], 1e-9, "elbow on the line");
  const four = { bones: [0, 1, 2, 3].map((i) => bone("b" + i, i ? "b" + (i - 1) : null, i * 30, 0, 0, 30)), chains: [{ id: "k", name: "k", bones: ["b0", "b1", "b2", "b3"] }] };
  const f = Rig.solve(four, { ik: { k: [-300, -400] } });
  near(f.posed.get("b3").tail, [-72, -96], 1e-9, "FABRIK straight toward unreachable target (|dir| = 120)");
  pass("碰不到的目標：整條鏈伸直指向目標（兩節與 FABRIK 相同）");
}

// MLS rigid.
{
  const P = [[0, 0], [100, 0], [100, 100], [0, 100]];
  for (const v of [[50, 50], [10, 80], [130, -20]]) near(Rig.mlsRigid(v, P, P), v, 1e-9, "unmoved pins = identity at " + v);
  const Q = [[0, 0], [100, 0], [140, 110], [10, 100]];
  P.forEach((p, i) => near(Rig.mlsRigid(p, P, Q), Q[i], 1e-12, "pin " + i + " lands on its target"));
  const moved = Rig.mlsRigid([50, 50], P, Q);
  assert.ok(Math.hypot(moved[0] - 50, moved[1] - 50) > 1, "interior point moves with the pins");
  // Pure rotation of all pins = rigid rotation everywhere.
  const R = P.map(([x, y]) => [-y, x]);
  near(Rig.mlsRigid([30, 70], P, R), [-70, 30], 1e-9, "rotated pins rotate the point rigidly");
  near(Rig.mlsRigid([5, 5], [[0, 0]], [[7, -3]]), [12, 2], 1e-12, "one pin = translation");
  pass("MLS 剛性：控制釘不動＝原樣；移動後釘點準確落在目標；整組旋轉＝剛體旋轉；單釘＝平移");
}

// Auto weights and LBS.
{
  const rig = { bones: [bone("a", null, 0, 0, 0, 100), bone("b", "a", 100, 0, 90, 100), bone("c", null, 300, 300, 0, 50)] };
  const verts = [[0, 0], [50, 10], [100, 50], [320, 290], [200, 200]];
  const W = Rig.autoWeights(verts, rig);
  W.forEach((w, i) => {
    const sum = Object.values(w).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-12, "vertex " + i + " weights sum to 1: " + sum);
    assert.ok(Object.keys(w).length <= 2, "at most 2 bones");
  });
  assert.ok(W[3].c > 0.9, "vertex beside bone c belongs mostly to c");
  // Brush keeps the sum at 1.
  const mesh = { vertices: verts.map((v) => v.slice()), triangles: [[0, 1, 2], [2, 3, 4]], weights: null };
  Rig.paintWeights(mesh, verts, rig, { x: 50, y: 10, radius: 80, bone: "b", strength: 0.8, mode: "add" });
  Rig.paintWeights(mesh, verts, rig, { x: 100, y: 50, radius: 80, bone: "a", strength: 0.5, mode: "subtract" });
  Rig.paintWeights(mesh, verts, rig, { x: 100, y: 50, radius: 200, bone: "a", strength: 1, mode: "smooth" });
  mesh.weights.forEach((w, i) => assert.ok(Math.abs(Object.values(w).reduce((a, b) => a + b, 0) - 1) < 1e-9, "painted vertex " + i + " sums to 1"));
  assert.ok(mesh.weights[1].b > W[1].b, "add raised bone b's weight");
  // One bone, weight 1: LBS = that bone's rigid motion.
  const one = { bones: [bone("a", null, 10, 20, 0, 100)] };
  const s = Rig.solve(one, { rot: { a: 37 } });
  for (const v of [[10, 20], [60, 25], [-30, 80]]) near(Rig.lbs(v, { a: 1 }, s), Rig.apply(s.m("a"), v), 1e-12, "LBS one bone at " + v);
  const r = (37 * Math.PI) / 180;
  near(Rig.lbs([110, 20], { a: 1 }, s), [10 + 100 * Math.cos(r), 20 + 100 * Math.sin(r)], 1e-9, "tail of the bone");
  pass("自動權重：每點總和＝1、最多兩根骨；筆刷加／減／平滑後總和仍＝1；單骨 LBS＝剛體變換");
}

// Mesh grid drops empty cells.
{
  const m = Rig.buildMesh(100, 100, "coarse", (x0, y0) => !(x0 >= 50 && y0 >= 50));
  assert.equal(m.triangles.length, 2 * 12, "coarse = 4x4 cells; the empty bottom-right quadrant (4 cells) is dropped");
  assert.ok(!m.vertices.some(([x, y]) => x > 0.75 && y > 0.75), "no vertex only the dropped cells used (unit space)");
  assert.equal(m.space, "unit");
  pass("建立網格：粗＝4×4 格，完全透明的格子被丟掉");
}
console.log(passed + " passed");
