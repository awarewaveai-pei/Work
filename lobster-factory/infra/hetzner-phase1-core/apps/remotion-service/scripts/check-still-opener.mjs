// Card R3: a banner card (still-opener) is never cut. For each card x each video shape, the opener's last frame is
// rendered by the StillOpener composition with the picture prepared as next-admin intro-opener.ts does (sharp fit "inside"
// the format size); the area where the whole card must sit (fitted, centred) is compared with the card (PSNR). A card of
// another shape must still be there in full, over the blurred copy. Card R5: and the cover opener's last frame is the
// cover thumbnail itself (the Cover still, same picture and title). Needs a browser, so it runs on a laptop, not in npm test:
//   node scripts/check-still-opener.mjs <browser exe> <card.png> [<card 2> ...]     (exit 1 = a card was cut or changed)
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import renderJob from "../dist/render-job.js";   // RENDER_GL: the renderer production uses (npm run build first)
const { RENDER_GL } = renderJob;
if (!RENDER_GL) throw new Error("dist/render-job.js has no RENDER_GL: npm run build first");

const [browserExecutable, ...cards] = process.argv.slice(2);
if (!browserExecutable || !cards.length) throw new Error("usage: <browser exe> <card.png> [more]");
const here = path.dirname(fileURLToPath(import.meta.url));
const sharp = createRequire(path.join(here, "../../next-admin/package.json"))("sharp");
const FORMATS = { "16x9": [1920, 1080], "9x16": [1080, 1920], "4x5": [1080, 1350] };
const MIN_PSNR = 35;
const raw = async (img, w, h) => (await sharp(img).resize(w, h, { fit: "fill" }).removeAlpha().raw().toBuffer());

const serveUrl = await bundle({ entryPoint: path.join(here, "../src/index.ts") });
let failed = 0;
for (const card of cards) {
  for (const [format, [W, H]] of Object.entries(FORMATS)) {
    const picture = await sharp(fs.readFileSync(card)).resize(W, H, { fit: "inside" }).jpeg({ quality: 82 }).toBuffer();
    const { width: pw, height: ph } = await sharp(picture).metadata();
    const inputProps = { backgroundUrl: "data:image/jpeg;base64," + picture.toString("base64"), durationInFrames: 60, fps: 30, width: W, height: H };
    const composition = await selectComposition({ serveUrl, id: "StillOpener", inputProps, browserExecutable, chromiumOptions: { gl: RENDER_GL } });
    const out = path.join(os.tmpdir(), `still-opener-check-${format}.png`);
    await renderStill({ composition, serveUrl, inputProps, frame: 59, output: out, imageFormat: "png", overwrite: true, browserExecutable, chromiumOptions: { gl: RENDER_GL } });
    const s = Math.min(W / pw, H / ph), w = Math.round(pw * s), h = Math.round(ph * s), left = Math.round((W - w) / 2), top = Math.round((H - h) / 2);   // a half-pixel margin: the browser rounds up
    const a = await raw(await sharp(out).extract({ left, top, width: w, height: h }).toBuffer(), w, h), b = await raw(picture, w, h);
    let se = 0;
    for (let i = 0; i < a.length; i++) se += (a[i] - b[i]) ** 2;
    const psnr = se ? 10 * Math.log10((255 * 255) / (se / a.length)) : 99;
    const ok = psnr >= MIN_PSNR;
    if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"} ${path.basename(card)} in ${format}: card ${w}x${h} at ${left},${top}, PSNR ${psnr.toFixed(1)} dB (>= ${MIN_PSNR})`);
  }
}
// the cover opener ends on the thumbnail: its last frame vs the one-frame Cover, whole frame, each shape
for (const [format, [W, H]] of Object.entries(FORMATS)) {
  const picture = await sharp(fs.readFileSync(cards[0])).resize(W, H, { fit: "cover" }).jpeg({ quality: 82 }).toBuffer();
  const frames = {};
  for (const [id, n] of [["Cover", 1], ["CoverOpener", 60]]) {
    const inputProps = { backgroundUrl: "data:image/jpeg;base64," + picture.toString("base64"), title: "為什麼你總是睡不好", durationInFrames: n, fps: 30, width: W, height: H };
    const composition = await selectComposition({ serveUrl, id, inputProps, browserExecutable, chromiumOptions: { gl: RENDER_GL } });
    frames[id] = path.join(os.tmpdir(), `cover-check-${id}-${format}.png`);
    await renderStill({ composition, serveUrl, inputProps, frame: n - 1, output: frames[id], imageFormat: "png", overwrite: true, browserExecutable, chromiumOptions: { gl: RENDER_GL } });
  }
  const a = await raw(fs.readFileSync(frames.CoverOpener), W, H), b = await raw(fs.readFileSync(frames.Cover), W, H);
  let se = 0;
  for (let i = 0; i < a.length; i++) se += (a[i] - b[i]) ** 2;
  const psnr = se ? 10 * Math.log10((255 * 255) / (se / a.length)) : 99, ok = psnr >= MIN_PSNR;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} cover opener's last frame = the cover thumbnail in ${format}: PSNR ${psnr >= 99 ? "identical" : psnr.toFixed(1) + " dB"} (>= ${MIN_PSNR})`);
}
process.exit(failed ? 1 : 0);
