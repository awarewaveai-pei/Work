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
  // First-frame models make 9:16 or 16:9 only. A landscape output runs at 16:9; every other output is cut from the
  // model's 9:16 (its centred box).
  const OUTPUT_RATIOS = Object.freeze(["9:16", "4:5", "1:1", "16:9"]);
  const parts = (ratio) => String(ratio).split(":").map(Number);
  const modelRatio = (ratio) => {
    const [a, b] = parts(ratio);
    return a > b ? "16:9" : "9:16";
  };
  // Height of an output of width w, even for H.264: 9:16 -> 1280 at 720, 4:5 -> 900, 1:1 -> 720, 16:9 -> 720 at 1280.
  const outputHeight = (ratio, w) => {
    const [a, b] = parts(ratio);
    return Math.round((w * b) / a / 2) * 2;
  };
  // The canvas size a ratio is drawn at (the page) = the model's 720p frame for 9:16 / 16:9.
  const outputSize = (ratio) => {
    const w = modelRatio(ratio) === "16:9" ? 1280 : 720;
    return [w, outputHeight(ratio, w)];
  };
  // Grapheme clusters: what a reader sees as one character (👍🏽, a flag, a ZWJ family) stays whole. Every cut of user
  // text (the page's wrap and "…", the subject cap here) goes through this; code points would split such emoji.
  const segmenter = typeof Intl !== "undefined" && typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
  const graphemes = (text) => {
    const s = String(text ?? "");
    return segmenter ? Array.from(segmenter.segment(s), (g) => g.segment) : Array.from(s);
  };
  // 鎖定貼文文字: at most this many rows of the post are watched (scripts/tools-breakout.js lockBoxes).
  const LOCK_MAX_BOXES = 24;
  const SUBJECT_MAX = 200;
  // The prompt = SHOT + the layout's scene (with the subject) + STILL; STILL is always last, whatever the subject text
  // says (tests/breakout.cjs). Written from the reference product's working prompt (2026-11-14): a locked screen
  // recording, a live 3D scene only in the photo, the interface as a flat printed layer hidden only where the subject
  // passes in front of it, a still first second then a sudden breakout. Generic words only: no platform is named.
  // PROMPT_MAX: Runway's API takes at most 1000 characters of prompt. Counted in UTF-16 units (the strictest count an API
  // may use; one emoji can be several), the subject is cut by whole graphemes until the whole prompt fits.
  const PROMPT_MAX = 1000;
  const SHOT = "Locked-off screen recording of one social media post, framed as the first frame throughout; no camera move, zoom, scroll or cut.";
  const LOOK = "Realistic scale and perspective, lighting matching the photo; debris or motion blur only at the photo edge.";
  const STILL =
    "The interface (header, icons, likes, caption, navigation) is a flat printed layer frozen pixel for pixel from the first frame: same words, numbers and icons, no new text or logo, hidden only where the subject passes in front. Still for one second, then a sudden fast breakout, then a slow push toward the viewer.";
  const SCENE = {
    burst: (what) => `Only the photo is a live 3D scene: the subject — ${what} — (in the photo or emerging from it) bursts out through the photo's border in full 3D toward the viewer, covering part of the interface below.`,
    float: (what) => `Only the picture behind the still, floating post card is a live 3D scene: the subject — ${what} — (in the picture or appearing from it) passes behind the card, then in front of it toward the viewer in full 3D, covering part of it.`,
  };
  function prompt(subject, settings = {}) {
    const scene = SCENE[settings.layout] || SCENE.burst,
      text = (what) => [SHOT, scene(what), LOOK, STILL].join(" "),
      parts = graphemes(String(subject || "").replace(/\s+/g, " ").trim()).slice(0, SUBJECT_MAX);
    while (parts.length && text(parts.join("")).length > PROMPT_MAX) parts.pop();
    if (!parts.length) throw Error("請描述衝出畫面的主角");
    return text(parts.join(""));
  }
  const api = { chineseOrigin, eligible, seconds, usd, byPrice, prompt, STILL, PROMPT_MAX, LAYOUTS, OUTPUT_RATIOS, modelRatio, outputHeight, outputSize, graphemes, LOCK_MAX_BOXES, SUBJECT_MAX };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.VideoWorkbenchBreakout = api;
})(typeof window !== "undefined" ? window : globalThis);
