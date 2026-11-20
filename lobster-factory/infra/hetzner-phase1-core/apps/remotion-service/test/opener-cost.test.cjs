// Card R5: a 2 s opener took 160 s on the production host. Two per-render costs are closed here and guarded:
// - a CSS blur on a full-frame layer is redrawn for every frame (software GL; ~45% of a frame on a laptop): the openers'
//   composition must make its blurred backdrop once (useBackdrop: a small canvas) and give frames only a finished image;
// - every job started Chromium twice (selectComposition, then renderMedia/renderStill): one browser per job;
// - the GL renderer: swangle (SwiftShader) cost 53-70 s per 2 s opener on ks-aw-01, ANGLE 17-18 s (render-job.ts RENDER_GL).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

test("the openers' blur is made once, never a CSS filter on a frame's layer", () => {
  const cover = read("src/compositions/Cover.tsx");
  // style={{ filter: ... }} / backdropFilter in JSX = recomputed per frame; ctx.filter (the canvas, once) is the allowed form
  assert.doesNotMatch(cover, /\b(filter|backdropFilter|WebkitBackdropFilter)\s*:\s*[`"'][^`"']*blur\(/, "a CSS blur in a style is redrawn on every frame");
  assert.match(cover, /ctx\.filter = `blur\(/, "the backdrop is blurred once on a canvas");
  assert.match(cover, /delayRender\("blurred backdrop"\)/, "frames wait for the one backdrop instead of drawing their own");
});

test("every render uses the production-measured GL renderer (ANGLE), from one setting", () => {
  const job = read("src/render-job.ts");
  assert.equal(require("../dist/render-job.js").RENDER_GL, "angle", "swangle made a 2 s opener 53-70 s on ks-aw-01; angle 17-18 s");
  assert.match(job, /const chromiumOptions = \{ headless: true, gl: RENDER_GL \}/, "the job's browser takes RENDER_GL");
  const sources = ["src", "scripts"].flatMap((dir) => fs.readdirSync(path.join(__dirname, "..", dir), { recursive: true }).map((f) => path.join(dir, String(f))))
    .filter((f) => /\.(ts|tsx|mjs|cjs|js)$/.test(f));
  const literal = sources.filter((f) => /gl:\s*["'`]/.test(read(f))).map((f) => f.replace(/\\/g, "/"));
  assert.deepEqual(literal, [], "a GL renderer named anywhere but RENDER_GL");
});

test("a job opens one browser and every Remotion step uses it", () => {
  const job = read("src/render-job.ts"), worker = read("src/render-worker.ts");
  assert.equal((job.match(/openBrowser\(/g) || []).length, 1);
  for (const step of ["selectComposition", "renderStill", "renderMedia"]) {
    const call = job.slice(job.indexOf(`await ${step}(`)), args = call.slice(0, call.indexOf("});") + 3);
    assert.match(args, /puppeteerInstance: browser/, `${step} must reuse the job's browser`);
  }
  assert.match(worker, /runRenderJob\(/, "the worker renders through render-job.ts (what profile-opener.mjs times)");
  assert.doesNotMatch(worker, /selectComposition|renderMedia\(|renderStill\(/, "no second render path in the worker");
});
