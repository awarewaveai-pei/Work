// Runs the real dist/render-worker.js with @remotion/renderer replaced. FAKE_RENDER_MODE picks the failure:
//   unhandled -- rejects from a callback nobody awaits, like render-media.js:336 onFrameBuffer did on 2026-11-16
//   sigkill   -- the worker is killed from outside (OOM killer)
//   hang      -- never finishes
//   ok        -- writes the output; fails if the container limits were not passed to Remotion
const Module = require("module");
const fs = require("fs");
const mode = process.env.FAKE_RENDER_MODE;

const fake = {
  makeCancelSignal: () => ({ cancelSignal: () => {}, cancel: () => {} }), // "hang" ignores cancel -> grace SIGKILL
  selectComposition: async () => ({ id: "X", durationInFrames: 30, fps: 30, width: 1920, height: 1080 }),
  renderMedia: async (opts) => {
    opts.onProgress({ progress: 0.4 });
    if (mode === "unhandled") {
      Promise.reject(new Error("FFmpeg already quit while trying to pipe frame 79 to it. Stderr: ffmpeg version n7.1"));
      return new Promise(() => {});
    }
    if (mode === "sigkill") process.kill(process.pid, "SIGKILL");
    if (mode === "hang") return new Promise(() => {});
    const args = opts.ffmpegOverride({ type: "stitcher", args: ["-i", "in", "-y", opts.outputLocation] });
    if (args.join(" ") !== `-i in -y -threads 2 ${opts.outputLocation}`) throw new Error("ffmpeg args not limited: " + args.join(" "));
    if (opts.disallowParallelEncoding !== true) throw new Error("parallel encoding not disabled");
    fs.writeFileSync(opts.outputLocation, "mp4");
  },
};

const load = Module._load;
Module._load = function (request, ...rest) {
  if (request === "@remotion/renderer") return fake;
  return load.call(this, request, ...rest);
};
require("../../dist/render-worker.js");
