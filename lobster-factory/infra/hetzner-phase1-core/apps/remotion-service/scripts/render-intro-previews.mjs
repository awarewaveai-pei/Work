// Card R2: the intro style previews (next-admin public/editor-shared/intro-styles/<id>.jpg), made once on a laptop and
// shipped as files -- never rendered on a page. One frame per template at 16:9 with a fixed demo title and demo pictures.
//   node scripts/render-intro-previews.mjs <out dir> <browser exe> <picture.jpg> [<picture 2> <picture 3>]
// (browser = a local Chrome/Edge; the service's GL renderer, dist/render-job.js RENDER_GL -- npm run build first). The title card (video-service's own black card) is not a
// remotion template: its preview is a frame of pipeline._render_intro_scene, made with the service's code.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import renderJob from "../dist/render-job.js";
const { RENDER_GL } = renderJob;
if (!RENDER_GL) throw new Error("dist/render-job.js has no RENDER_GL: npm run build first");

const [outDir, browserExecutable, ...pictureFiles] = process.argv.slice(2);
if (!outDir || !browserExecutable || !pictureFiles.length) throw new Error("usage: <out dir> <browser exe> <picture.jpg> [more]");
const here = path.dirname(fileURLToPath(import.meta.url));
const { INTRO_TEMPLATES } = await import(new URL("../../next-admin/public/editor-shared/intro-styles.js", import.meta.url));
const TEMPLATE_MAP = { "cover-opener": "CoverOpener", "still-opener": "StillOpener", "scale-bg-text-slideup": "ScaleBGTextSlideUp", "circle-mask-text-slideup-reveal": "CircleMaskTextSlideUpReveal",
  "pan-slide-text-left-3scenes": "PanSlideTextLeft3Scenes", "product-review-typewriter": "ProductReviewTypewriter", "photo-highlights-slides-zoom": "PhotoHighlightsSlidesZoom" };
const pictures = pictureFiles.map((f) => "data:image/jpeg;base64," + fs.readFileSync(f).toString("base64"));
const DEMO = { title: "示範標題 Demo Title", text: "示範標題 Demo Title", headline: "示範標題 Demo Title", brand: "AwareWave", tagline: "一句品牌標語",
  reviewerName: "王小明", reviewDate: "2026.11.20", reviewText: "很好用，推薦給大家。", text1: "第一幕", text2: "第二幕", text3: "第三幕", starCount: 5 };
// where each template shows its title: the opener's last frame (= the cover), the others at this share of their length
const AT = { "cover-opener": 1, "still-opener": 1, "scale-bg-text-slideup": 0.95, "circle-mask-text-slideup-reveal": 0.35, "pan-slide-text-left-3scenes": 0.2,
  "product-review-typewriter": 0.8, "photo-highlights-slides-zoom": 0.2 };

fs.mkdirSync(outDir, { recursive: true });
const serveUrl = await bundle({ entryPoint: path.join(here, "../src/index.ts") });
for (const t of INTRO_TEMPLATES) {
  let image = 0;
  const props = {};
  for (const f of t.fields) {
    if (f.type === "audio") continue;
    if (f.type === "image") { if (f.required) props[f.key] = pictures[image++ % pictures.length]; continue; }
    if (DEMO[f.key] !== undefined) props[f.key] = DEMO[f.key];
  }
  const fps = 30, durationInFrames = t.seconds.def * fps;
  const inputProps = { ...props, durationInFrames, fps, width: 1920, height: 1080 };
  const composition = await selectComposition({ serveUrl, id: TEMPLATE_MAP[t.id], inputProps, browserExecutable, chromiumOptions: { gl: RENDER_GL } });
  const started = Date.now();
  await renderStill({ composition, serveUrl, inputProps, frame: Math.min(durationInFrames - 1, Math.round((durationInFrames - 1) * AT[t.id])),
    output: path.join(outDir, t.id + ".jpg"), imageFormat: "jpeg", jpegQuality: 80, scale: 1 / 3, overwrite: true, browserExecutable, chromiumOptions: { gl: RENDER_GL } });
  console.log(`${t.id}.jpg ${Date.now() - started} ms`);
}
