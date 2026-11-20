// Card R5: how long a 2 s 1080p opener takes, by phase, through production's own render code (dist/render-job.js --
// what render-worker.ts runs). Both openers on one picture: still-opener (a banner card) and cover-opener (titled).
// Run where it matters -- inside the remotion-service image with the production limits, e.g.
//   docker run --rm --cpus=2 --memory=1g --shm-size=64m -v /tmp/r5:/r5 lobster-remotion-service:local \
//     node scripts/profile-opener.mjs /r5/picture.jpg
// Env as the service: REMOTION_CHROME_EXECUTABLE_PATH (unset = Remotion's headless shell).
// Prints one line per opener: bundle (once), browser start, composition, first frame, all frames, whole render (ms).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const { runRenderJob } = require("../dist/render-job.js");
const { TEMPLATE_MAP } = require("../dist/app.js");
const picture = process.argv[2];
if (!picture) throw new Error("usage: node scripts/profile-opener.mjs <picture.jpg>");
const backgroundUrl = "data:image/jpeg;base64," + fs.readFileSync(picture).toString("base64");
let t = Date.now();
const serveUrl = await bundle({ entryPoint: path.join(here, "../src/index.ts"), outDir: path.join(os.tmpdir(), "profile-opener-bundle") });
console.log(`bundle ${Date.now() - t} ms (the service does this once per process)`);
for (const [templateId, props] of [["still-opener", { backgroundUrl }], ["cover-opener", { backgroundUrl, title: "為什麼你總是睡不好" }]]) {
  const [width, height, fps, frames] = [1920, 1080, 30, 60];
  t = Date.now();
  const timings = await runRenderJob({
    compositionId: TEMPLATE_MAP[templateId], inputProps: { ...props, durationInFrames: frames, fps, width, height }, fps, width, height,
    totalFrames: frames, maxFrames: frames, isDataDriven: false, serveUrl, outFile: path.join(os.tmpdir(), `profile-${templateId}.mp4`),
    encoderThreads: null, allowParallelEncoding: undefined,
  });
  console.log(`${templateId}: total ${Date.now() - t} ms ${JSON.stringify(timings)}`);
}
