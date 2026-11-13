// 破框貼文動畫 (tool "breakout"): the rules the page (scripts/tools-breakout.js) and the server (backend/api.cjs jobInput)
// share, so the model list, the length and the prompt cannot drift between what the button shows and what runs.
// Models come from /capabilities videoModels (backend/generation-policy.cjs), never a second list here.
(function (root) {
  // Operator rule: no Chinese-origin AI models anywhere. Matched on every name a row carries (id, label, vendor, slug),
  // so a future row (e.g. a Replicate Kling slug) is dropped here even if it accepts a first frame.
  const CHINESE_ORIGIN =
    /seedance|bytedance|doubao|kling|kuaishou|hailuo|minimax|\bwan[-_ .]?\d|wanx|alibaba|qwen|tongyi|hunyuan|tencent|vidu|shengshu|pixverse|cogvideo|zhipu|baidu|ernie|stepfun|step-video|skyreels|kunlun/i;
  const chineseOrigin = (m) => CHINESE_ORIGIN.test([m?.id, m?.label, m?.vendor, m?.provider, m?.model].join(" "));
  // The post must stay the first frame: only rows whose image input IS the first frame (generation-policy firstFrame).
  const eligible = (models) => (Array.isArray(models) ? models : []).filter((m) => m && m.firstFrame === true && !chineseOrigin(m));
  // 5 s like the reference; a model without 5 s runs its shortest length above 5 (the button says which).
  const seconds = (m) => {
    const d = (m?.durations || []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    return d.includes(5) ? 5 : d.find((s) => s > 5) ?? d.at(-1);
  };
  // The price of one breakout run from the server's published rate (/capabilities usdPerSec, the rate the charge uses);
  // null = unknown. Model buttons are listed cheapest first by it, so a price change reorders them by itself.
  const usd = (m) => (Number.isFinite(m?.usdPerSec) ? m.usdPerSec * seconds(m) : null);
  const byPrice = (models) => [...models].sort((a, b) => (usd(a) ?? Infinity) - (usd(b) ?? Infinity));
  const LAYOUTS = Object.freeze({ burst: "從圖片衝出", float: "浮動貼文卡" });
  // Every output is cut from the model's 9:16 (no first-frame model makes another portrait ratio): its centred box.
  const OUTPUT_RATIOS = Object.freeze(["9:16", "4:5", "1:1"]);
  // Height of an output of width w, even for H.264: 9:16 -> 1280 at 720, 4:5 -> 900, 1:1 -> 720.
  const outputHeight = (ratio, w = 720) => {
    const [a, b] = String(ratio).split(":").map(Number);
    return Math.round((w * b) / a / 2) * 2;
  };
  // 鎖定貼文文字: at most this many rows of the post are watched (scripts/tools-breakout.js lockBoxes).
  const LOCK_MAX_BOXES = 24;
  const SUBJECT_MAX = 200;
  // Sent with every run, whatever the subject text says (tests/breakout.cjs).
  const STILL =
    "Keep the social post interface completely still and unchanged: the header, account name, avatar, icons, like bar, counts and caption text never move, never change, never redraw, and no new text, logo or watermark appears. Static camera, one continuous shot, no cuts.";
  function prompt(subject, settings = {}) {
    const what = Array.from(String(subject || "").replace(/\s+/g, " ").trim()).slice(0, SUBJECT_MAX).join(""); // whole characters
    if (!what) throw Error("請描述衝出畫面的主角");
    const action =
      settings.layout === "float"
        ? `The first frame is a full-screen photo with a social media post card floating still in the middle of it. The subject is: ${what}. It may already be in the photo, or it appears from within the photo's scene. Only this subject moves: it first passes behind the card, then comes around and crosses in front of it toward the viewer.`
        : `The first frame is a social media post. The subject is: ${what}. It may already be in the post photo, or it emerges from inside the photo. Only this subject moves: it comes alive and bursts out of the photo frame, breaking past the photo's edges and moving in front of the like bar and the caption text below it, as if leaping out of the screen.`;
    return action + " " + STILL;
  }
  const api = { chineseOrigin, eligible, seconds, usd, byPrice, prompt, STILL, LAYOUTS, OUTPUT_RATIOS, outputHeight, LOCK_MAX_BOXES, SUBJECT_MAX, MODEL_RATIO: "9:16" };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.VideoWorkbenchBreakout = api;
})(typeof window !== "undefined" ? window : globalThis);
