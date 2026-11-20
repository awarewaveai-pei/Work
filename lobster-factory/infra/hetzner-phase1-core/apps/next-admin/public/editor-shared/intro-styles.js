// Card R2: the intro (片頭) templates and styles, one definition for the workbench and the main system. The workbench reads
// it through backend/remotion.cjs (its title-template catalog and /capabilities introStyles: the editor's style picker);
// the main system imports it (the site setting 「自動影片的片頭樣式」 and the topic video's intro). Previews are files beside
// this one (intro-styles/<id>.jpg, made once by remotion-service scripts/render-intro-previews.mjs), never rendered live.
//
// INTRO_TEMPLATES: one field table per remotion-service template (every id must exist in remotion-service src/app.ts
// TEMPLATE_MAP; video-workbench tests/remotion-template.cjs reads it). field.key = the composition prop name.
//   type "text" (default): max chars, required, multiline | "number": integer min..max | "color": #rrggbb
//   type "image"/"audio": sent as a data: URI (the render service fetches nothing itself). Optional unless required.
// seconds = the length range; a template whose scenes start at fixed times (pan, photo) cannot go below its natural length.
// autoSeconds = an automatic video's intro length (the shortest that still shows the whole title; only automatic ones).
const logo = { key: "logoUrl", label: "Logo", type: "image" },
  music = { key: "audioUrl", label: "背景音樂", type: "audio" },
  scene = (n) => [
    { key: "imageUrl" + n, label: "場景 " + n + " 圖片", type: "image", required: true },
    { key: "text" + n, label: "場景 " + n + " 文字", max: 20, required: true },
  ];
export const INTRO_TEMPLATES = [
  {
    id: "scale-bg-text-slideup",
    label: "背景放大＋標題上滑",
    seconds: { min: 3, def: 5, max: 30 },
    autoSeconds: 5, // its title slides in from 3.8 s
    fields: [{ key: "imageUrl", label: "背景圖", type: "image", required: true }, { key: "text", label: "標題", max: 80, required: true }, logo, music],
  },
  {
    id: "circle-mask-text-slideup-reveal",
    label: "圓形揭露＋品牌標語",
    seconds: { min: 10, def: 20, max: 30 },
    autoSeconds: 10,
    fields: [
      { key: "imageUrl", label: "背景圖", type: "image", required: true },
      { key: "headline", label: "主標題", max: 80, required: true },
      { key: "brand", label: "品牌名稱", max: 40 },
      { key: "tagline", label: "標語", max: 80 },
      logo,
      music,
    ],
  },
  {
    id: "pan-slide-text-left-3scenes",
    label: "三場景平移＋文字",
    seconds: { min: 20, def: 20, max: 30 },
    fields: [...scene(1), ...scene(2), ...scene(3), logo, music],
  },
  {
    id: "product-review-typewriter",
    label: "產品評論打字機",
    seconds: { min: 8, def: 10, max: 30 },
    fields: [
      { key: "backgroundImageUrl", label: "背景圖片", type: "image", required: true },
      { key: "productImageUrl", label: "產品圖片", type: "image", required: true },
      { key: "profileImageUrl", label: "評論人大頭照", type: "image" },
      { key: "reviewerName", label: "評論人姓名", max: 20, required: true },
      { key: "reviewDate", label: "日期", max: 20, required: true },
      { key: "reviewText", label: "評論內容", max: 80, required: true, multiline: true },
      { key: "starCount", label: "星星數（1–5）", type: "number", min: 1, max: 5 },
      logo,
      music,
    ],
  },
  {
    id: "photo-highlights-slides-zoom",
    label: "相片精選幻燈片",
    seconds: { min: 22, def: 22, max: 30 },
    fields: [
      ...[1, 2, 3].flatMap((n) => [
        { key: "imageUrl" + n, label: "相片 " + n, type: "image", required: true },
        { key: "text" + n, label: "相片 " + n + " 說明", max: 20, required: true },
      ]),
      logo,
      { key: "backgroundColor", label: "主題色（#rrggbb）", type: "color" },
      music,
    ],
  },  // Last, so the templates' old order (and the editor's old default, the first) is unchanged.
  {
    // The video's cover as a short opener (remotion-service compositions/Cover.tsx, animated in; its last frame is the
    // cover still). In the editor the picture is the video's cover, not a library pick (scripts/editor-panes/text.js).
    id: "cover-opener",
    label: "封面開場",
    cover: true,
    seconds: { min: 2, def: 2, max: 5 },
    autoSeconds: 2,
    fields: [{ key: "backgroundUrl", label: "封面畫格", type: "image", required: true }, { key: "title", label: "標題", max: 80, required: true }],
  },
];

const isMedia = (f) => f.type === "image" || f.type === "audio";
/** What an automatic video fills a template with: its one required picture and its one required text; null = the template
 *  needs more than a title and one background picture (only a person can fill it: manual only). */
export function autoFill(template) {
  const required = (template?.fields || []).filter((f) => f.required);
  const image = required.filter((f) => f.type === "image"), text = required.filter((f) => !f.type || f.type === "text");
  return image.length === 1 && text.length === 1 && required.length === 2 ? { imageKey: image[0].key, textKey: text[0].key } : null;
}

// kind = the source kind (card R2 item 8): "none" = no intro | "cover" = the cover opener | "title" = the render service's
// title card (video-service, plain text on black; no template render) | "template" = a remotion-service template. Card R3
// adds "still" (a ready picture, e.g. a banner-tool card): it would take the cover opener's road -- the picture made into
// a short video by remotion-service, then joined as an intro file with a transition -- and every caller already treats a
// kind it does not know as "cannot make it" (lib/content/video/intro-opener.ts). auto = an automatic video can make it
// from the video's title and one picture alone. preview = the file beside this one.
const styleOf = (t) => ({ id: t.id, label: t.label, kind: t.cover ? "cover" : "template", auto: !!autoFill(t), preview: "intro-styles/" + t.id + ".jpg" });
export const INTRO_STYLES = [
  { id: "none", label: "不加片頭", kind: "none", auto: true, preview: null },
  ...INTRO_TEMPLATES.filter((t) => t.cover).map(styleOf),
  { id: "title-card", label: "標題字卡", kind: "title", auto: true, preview: "intro-styles/title-card.jpg" },
  ...INTRO_TEMPLATES.filter((t) => !t.cover).map(styleOf),
];

/** A site's stored intro styles as they are used: known, automatic, not "none", each once, in the stored order. Old data
 *  (no field), anything else = [] = no intro. */
export function autoIntroStyles(ids) {
  if (!Array.isArray(ids)) return [];
  const ok = new Set(INTRO_STYLES.filter((s) => s.auto && s.kind !== "none").map((s) => s.id));
  return [...new Set(ids.filter((id) => typeof id === "string" && ok.has(id)))];
}

/** The style of a site's next video: the stored styles in turn by how many videos the site has made (made % n), so the same
 *  count always gives the same style; null = no intro. */
export function introStyleFor(ids, made) {
  const list = autoIntroStyles(ids);
  if (!list.length) return null;
  const n = Number.isSafeInteger(made) && made > 0 ? made : 0;
  return INTRO_STYLES.find((s) => s.id === list[n % list.length]) || null;
}
