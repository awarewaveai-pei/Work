// P6 H5: a 3D render's time is bounded before it starts (backend/blender-jobs.cjs renderBudgetMs). The job and Blender
// time limits scale with frames x pixels; a render over the cap is refused at request time, never cut off midway.
const assert = require("node:assert/strict"),
  os = require("node:os"),
  fs = require("node:fs"),
  path = require("node:path");
const { createBlenderJobs } = require("../backend/blender-jobs.cjs");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-blender-budget-"));
try {
  const jobs = createBlenderJobs({ dataDir, mediaStore: { fileFor: () => path.join(dataDir, "model.glb") }, env: { BLENDER_PATH: process.execPath } });
  const scene = { id: "s1", revision: 1, objects: [{ asset: { id: "m", url: "/media/" + "a".repeat(64) + "/original.glb" }, position: [0, 0, 0], rotationY: 0, scale: 1 }], camera: { fov: 40, keys: [{ frame: 0, position: [0, 1, 4], target: [0, 1, 0] }] }, lights: [] };
  const input = (width, height, frames) => ({ type: "video", operation: "blender-render", settings: { scene, width, height, frames, fps: { num: 30, den: 1 } } });
  const short = jobs.timeoutMs(input(1920, 1080, 150)), long = jobs.timeoutMs(input(1920, 1080, 300));
  assert(short >= 150 * 12000, "5 s 1080p 的時限要大於實測（12 s／格）");
  assert(long > short, "時限隨格數增加");
  assert(jobs.timeoutMs(input(1280, 720, 150)) < short, "時限隨解析度降低");
  assert.throws(() => jobs.request(input(1920, 1080, 1200)), /太長/, "超過上限在送出時拒絕");
  assert.equal(jobs.request(input(1280, 720, 150)).type, "video");
  // One 3D job at a time: a second claim is refused until the first is released (time limits never include queue wait).
  const first = jobs.claim();
  assert(first && jobs.claim() === null, "第二支 3D 工作在第一支完成前不得排入");
  first();
  const again = jobs.claim();
  assert(again, "釋放後可再送出");
  again();
  console.log("PASS blender-budget：時限隨格數×解析度、超長送出即拒、一次一支");
} finally {
  fs.rmSync(dataDir, { recursive: true, force: true });
}
