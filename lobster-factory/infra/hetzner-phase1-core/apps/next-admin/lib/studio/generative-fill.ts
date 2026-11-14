/**
 * Studio generative fill + outpaint behind a provider-neutral seam (the genfill route's Replicate models; the OpenAI mask
 * edit, openai-26-edit, goes through lib/tarot/image-gen.ts instead -- the route branches).
 *
 * Models (public/editor-shared/image-models.js EDIT_TOOLS; versions pinned here = lib/ai/cost-model.ts MEDIA_MODELS):
 *   - flux-fill-pro      生成填色 {image, mask, prompt} and 擴圖 {image, prompt, outpaint:<preset>} (mask ignored; the model
 *                        returns the extended canvas resampled to ≤ ~1440 px)
 *   - ideogram-4-5-edit[-low]  生成填色 at Ideogram's own quality tier (low $0.03 / medium $0.06); its mask is the
 *                        INVERSE convention (black = edit), inverted here
 *   - bria-expand        擴圖 at the exact canvas of the preset (outpaintFrame), up to 5000 px a side; no resampling
 * Mask convention everywhere outside this file: WHITE = fill / regenerate, BLACK = preserve (the inpaint mask painter and the
 * dock blocks produce that). `image`/`mask` are `format: uri` inputs → base64 data URLs work directly.
 * Env overrides: GENFILL_VERSION (flux-fill-pro only, as before).
 */

import sharp from "sharp";
import { OUTPAINT_PRESETS, outpaintFrame, type OutpaintPreset } from "./outpaint-presets";
import type { EditTool } from "./model-options";
import { runReplicate, type ReplicateImageResult } from "./replicate-run";
import { grantFor } from "@/lib/entitlements/grant";
import { CONTEXT_FILL_PROMPT } from "./fill-prompt";

// Re-export so existing server-side imports (the route) keep resolving from this module.
export { OUTPAINT_PRESETS, CONTEXT_FILL_PROMPT };
export type { OutpaintPreset };



/** The genfill route's Replicate models. Pinned 2026-06-15 (flux) / 2026-11-09 (the rest). */
const VERSIONS = {
  "flux-fill-pro": "41c767bcbfffe54ef8f05eb4d0100f9314790f7fc43a7b88d73ec06839deddb9", // black-forest-labs/flux-fill-pro
  "ideogram-4-5-edit": "64d91a9b8a91a4e41d10fde3aa54ea4f68e7c5213d417139935178a5f4672c85", // ideogram-ai/ideogram-4-5-precise-edit
  "ideogram-4-5-edit-low": "64d91a9b8a91a4e41d10fde3aa54ea4f68e7c5213d417139935178a5f4672c85", // same model, quality "low"
  "bria-expand": "e153045f0c4163bd76788ab927faef5123db349294d4695dac07af828786e5b9", // bria/expand-image
} as const satisfies Partial<Record<EditTool, string>>;
export type FillTool = keyof typeof VERSIONS;
export const BRIA_EXPAND_MAX_SIDE = 5000; // replicate.com/bria/expand-image canvas_size limit

export type GenerativeFillResult = ReplicateImageResult;

export interface GenerativeFillInput {
  /** Default flux-fill-pro (the /tools/canvas editor sends none). */
  model?: FillTool;
  image: string; // base64 data URL of the source image
  /** What to generate; empty → CONTEXT_FILL_PROMPT. */
  prompt?: string;
  mask?: string; // base64 data URL; WHITE = fill (ignored when outpaint is set)
  outpaint?: OutpaintPreset; // when set, extend the canvas instead of mask-filling
}

export function isFillTool(v: unknown): v is FillTool {
  return typeof v === "string" && Object.hasOwn(VERSIONS, v);
}

function dataUrlBuffer(dataUrl: string): Buffer | null {
  const m = /^data:image\/[a-z+]+;base64,(.+)$/i.exec(dataUrl);
  return m ? Buffer.from(m[1], "base64") : null;
}
const pngDataUrl = (buf: Buffer) => `data:image/png;base64,${buf.toString("base64")}`;

/** Pixel size of a data-URL image (the route needs it for the OpenAI branch's aspect ratio); null when undecodable. */
export async function imageSize(dataUrl: string): Promise<{ width: number; height: number } | null> {
  const buf = dataUrlBuffer(dataUrl);
  if (!buf) return null;
  try {
    const { width, height } = await sharp(buf).metadata();
    return width && height ? { width, height } : null;
  } catch {
    return null;
  }
}

/** WHITE = change mask → the model's black = edit convention. */
async function invertMask(maskDataUrl: string): Promise<string | null> {
  const buf = dataUrlBuffer(maskDataUrl);
  if (!buf) return null;
  return pngDataUrl(await sharp(buf).removeAlpha().negate().png().toBuffer());
}

/**
 * Generate content into a masked region (生成填色) or extend the canvas (擴圖).
 * Exactly one of {mask, outpaint} steers the behaviour; if both are present the mask is ignored (outpaint wins).
 */
export async function generativeFill(args: GenerativeFillInput): Promise<GenerativeFillResult> {
  const grant = await grantFor("studio.fill");
  const model: FillTool = args.model ?? "flux-fill-pro";
  if (!args.mask && !args.outpaint) return { ok: false, error: "mask_or_outpaint_required" };
  const prompt = (args.prompt?.trim() || CONTEXT_FILL_PROMPT).slice(0, 1000);

  if (args.outpaint) {
    if (model === "bria-expand") return expandBria(grant, args.image, prompt, args.outpaint);
    if (model !== "flux-fill-pro") return { ok: false, error: "model_cannot_outpaint" };
    // PNG keeps edges clean; safety_tolerance 5 = most permissive (no false-positive NSFW blocks on dark/gothic artwork).
    return runReplicate(grant, {
      version: process.env.GENFILL_VERSION ?? VERSIONS["flux-fill-pro"],
      input: { image: args.image, prompt, outpaint: args.outpaint, output_format: "png", safety_tolerance: 5 },
      failCode: "genfill_failed",
    });
  }

  const mask = args.mask!;
  switch (model) {
    case "flux-fill-pro":
      return runReplicate(grant, {
        version: process.env.GENFILL_VERSION ?? VERSIONS["flux-fill-pro"],
        input: { image: args.image, mask, prompt, output_format: "png", safety_tolerance: 5 },
        failCode: "genfill_failed",
      });
    case "ideogram-4-5-edit":
    case "ideogram-4-5-edit-low": {
      const inverted = await invertMask(mask);
      if (!inverted) return { ok: false, error: "invalid_mask" };
      return runReplicate(grant, {
        version: VERSIONS[model],
        input: { image: args.image, mask: inverted, prompt, quality: model.endsWith("-low") ? "low" : "medium", num_images: 1 },
        failCode: "genfill_failed",
      });
    }
    default:
      return { ok: false, error: "model_cannot_fill" };
  }
}

/** bria/expand-image: the preset's canvas (outpaintFrame) sent explicitly, so the result IS the frame (no resampling, the source
 *  pixels land where the frame says). A frame over BRIA_EXPAND_MAX_SIDE shrinks the source first (whole frame scaled). */
/** The three pixel sizes the OpenAI images API returns (lib/tarot/image-gen.ts sizeMap); an outpaint has to land inside
 *  one of them exactly, so the box is chosen here rather than inferred from the canvas's own ratio. */
const OPENAI_BOXES = [
  { ratio: "1:1" as const, w: 1024, h: 1024 },
  { ratio: "3:2" as const, w: 1536, h: 1024 },
  { ratio: "2:3" as const, w: 1024, h: 1536 },
];

export interface OutpaintCanvas {
  /** The source letterboxed into the chosen OpenAI box, transparent everywhere it may paint. */
  image: string;
  /** OUR convention, WHITE = change (lib/tarot/image-gen.ts openaiMask inverts it): white over the new margin only. */
  mask: string;
  /** The box to ask the API for. */
  aspectRatio: "1:1" | "3:2" | "2:3";
  /** Where the preset's canvas sits inside the returned box, and the size it has to come back as. */
  crop: { left: number; top: number; width: number; height: number };
  out: { width: number; height: number };
}

/** For an outpaint on a model with no `outpaint` input of its own (the OpenAI edit models): the source placed on the
 *  preset's extended canvas, letterboxed into one of the three sizes the API can return, with the mask that lets it
 *  paint the new margin only. The letterbox is why this is not just "send the canvas": the API ignores the requested
 *  geometry and answers in a fixed size, so a 2:1 canvas would come back 3:2 and could not be put back in place
 *  (Codex review 2026-11-14). The caller crops `crop` out of the answer and resizes it to `out`.
 *  Measured 2026-11-09: gpt-image-2.6 given a canvas and a margin mask left the card untouched and continued the background. */
export async function outpaintCanvas(image: string, preset: OutpaintPreset): Promise<OutpaintCanvas | null> {
  const buf = dataUrlBuffer(image);
  if (!buf) return null;
  const { width: w = 0, height: h = 0 } = await sharp(buf).metadata();
  const f = outpaintFrame(preset, w, h);
  if (!w || !h || !f) return null;
  const W = Math.round(f.W), H = Math.round(f.H), x = Math.round(f.x), y = Math.round(f.y);
  if (W <= w && H <= h) return null; // 補成正方形 on a square image adds no margin: nothing for the model to paint

  // The box that wastes the least area once the canvas is fitted inside it without distortion.
  const fits = OPENAI_BOXES.map((b) => {
    const k = Math.min(b.w / W, b.h / H);
    return { ...b, k, used: (W * k * H * k) / (b.w * b.h) };
  }).sort((a, b) => b.used - a.used);
  const box = fits[0];

  const cw = Math.max(1, Math.round(W * box.k)), ch = Math.max(1, Math.round(H * box.k));
  const ox = Math.floor((box.w - cw) / 2), oy = Math.floor((box.h - ch) / 2);
  const sw = Math.max(1, Math.round(w * box.k)), sh = Math.max(1, Math.round(h * box.k));
  const sx = ox + Math.round(x * box.k), sy = oy + Math.round(y * box.k);

  const plate = (r: number, g: number, b: number, alpha: number, width: number, height: number) =>
    sharp({ create: { width, height, channels: 4, background: { r, g, b, alpha } } }).png().toBuffer();
  const scaled = await sharp(buf).resize(sw, sh, { fit: "fill" }).png().toBuffer();
  const canvas = await sharp(await plate(0, 0, 0, 0, box.w, box.h)).composite([{ input: scaled, left: sx, top: sy }]).png().toBuffer();
  // Black = keep. White only over the preset's new margin: the letterbox bars stay black because they are cropped away.
  const mask = await sharp(await plate(0, 0, 0, 1, box.w, box.h)).composite([
    { input: await plate(255, 255, 255, 1, cw, ch), left: ox, top: oy },
    { input: await plate(0, 0, 0, 1, sw, sh), left: sx, top: sy },
  ]).png().toBuffer();

  return {
    image: `data:image/png;base64,${canvas.toString("base64")}`,
    mask: `data:image/png;base64,${mask.toString("base64")}`,
    aspectRatio: box.ratio,
    crop: { left: ox, top: oy, width: cw, height: ch },
    out: { width: W, height: H },
  };
}

/** The model's answer cut back to the preset's canvas at its real size, so the editor can place it like any outpaint. */
export async function cropOutpaintResult(image: string, c: OutpaintCanvas): Promise<string | null> {
  const buf = dataUrlBuffer(image);
  if (!buf) return null;
  const { width = 0, height = 0 } = await sharp(buf).metadata();
  if (!width || !height) return null;
  // The API answers at the requested box; if it ever answers at another scale, the crop follows that scale.
  const kx = width / (c.crop.left * 2 + c.crop.width), ky = height / (c.crop.top * 2 + c.crop.height);
  const out = await sharp(buf)
    .extract({
      left: Math.min(width - 1, Math.round(c.crop.left * kx)),
      top: Math.min(height - 1, Math.round(c.crop.top * ky)),
      width: Math.max(1, Math.min(width - Math.round(c.crop.left * kx), Math.round(c.crop.width * kx))),
      height: Math.max(1, Math.min(height - Math.round(c.crop.top * ky), Math.round(c.crop.height * ky))),
    })
    .resize(c.out.width, c.out.height, { fit: "fill" })
    .png()
    .toBuffer();
  return `data:image/png;base64,${out.toString("base64")}`;
}

async function expandBria(grant: Awaited<ReturnType<typeof grantFor>>, image: string, prompt: string, preset: OutpaintPreset): Promise<GenerativeFillResult> {
  const buf = dataUrlBuffer(image);
  if (!buf) return { ok: false, error: "invalid_image" };
  let src = sharp(buf);
  let { width: w = 0, height: h = 0 } = await src.metadata();
  if (!w || !h) return { ok: false, error: "invalid_image" };
  let frame = outpaintFrame(preset, w, h)!;
  const k = BRIA_EXPAND_MAX_SIDE / Math.max(frame.W, frame.H);
  let input = image;
  if (k < 1) {
    w = Math.max(1, Math.floor(w * k));
    h = Math.max(1, Math.floor(h * k));
    src = src.resize(w, h);
    input = pngDataUrl(await src.png().toBuffer());
    frame = outpaintFrame(preset, w, h)!;
  }
  return runReplicate(grant, {
    version: VERSIONS["bria-expand"],
    input: {
      image: input,
      prompt,
      aspect_ratio: "none",
      canvas_size: [Math.round(frame.W), Math.round(frame.H)],
      original_image_size: [w, h],
      original_image_location: [Math.round(frame.x), Math.round(frame.y)],
      preserve_alpha: true,
    },
    failCode: "genfill_failed",
  });
}
