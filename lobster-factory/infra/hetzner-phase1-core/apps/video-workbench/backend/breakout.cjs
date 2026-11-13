// 破框貼文動畫 (tool "breakout") on the server: the page renders the post to a PNG (scripts/tools-breakout.js) and sends
// it as the first frame of a normal video job; this checks that job and builds its prompt from shared/breakout-rules.js.
// No video model makes 1:1 (all 16:9 / 9:16), so a 1:1 post is drawn centred in a 9:16 frame and the finished video is
// cropped to its middle square (squareArgs).
const rules = require("../shared/breakout-rules.js");
const generationPolicy = require("./generation-policy.cjs");

/** Throws a user-facing error unless input is a valid breakout job; returns the prompt the model is sent. */
function prepare(input, env) {
  const s = input.settings || {};
  if (!Object.hasOwn(rules.LAYOUTS, s.layout)) throw Error("請選擇貼文版面");
  if (!rules.OUTPUT_RATIOS.includes(s.outputRatio)) throw Error("輸出比例只支援 9:16 或 1:1");
  if (s.ratio !== rules.MODEL_RATIO) throw Error("破框貼文動畫以 9:16 生成");
  const vm = generationPolicy.videoModels(env).find((m) => m.id === s.model);
  if (!vm || !rules.eligible([vm]).length) throw Error("這個影片模型不能保留貼文當第一格畫面，請換一個模型");
  // The length the job runs and is charged for is read like api.cjs does (top-level duration first), not settings alone.
  if (Number(input.duration || s.duration || 8) !== rules.seconds(vm)) throw Error(vm.label + " 的破框影片長度是 " + rules.seconds(vm) + " 秒");
  // Nothing may be appended after the stay-still instruction (api.cjs adds cartoonStyle after the prompt).
  if (input.cartoonStyle !== undefined) throw Error("破框貼文動畫不接受風格附加文字");
  const frames = input.references?.firstFrame;
  if (!Array.isArray(frames) || frames.length !== 1 || !frames[0]?.url) throw Error("缺少貼文第一格畫面");
  return rules.prompt(input.prompt, s);
}

/** ffmpeg arguments: the centred square of a 9:16 video, same codec family as every other output. */
function squareArgs(src, dst) {
  return ["-y", "-hide_banner", "-i", src, "-vf", "crop=in_w:in_w:0:(in_h-in_w)/2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-c:a", "copy", "-movflags", "+faststart", dst];
}

module.exports = { prepare, squareArgs };
