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

// Re-export so existing server-side imports (the route) keep resolving from this module.
export { OUTPAINT_PRESETS };
export type { OutpaintPreset };

/** What the model draws when the operator leaves the prompt empty (Photoshop's prompt-less generative fill). Worded as an
 *  instruction: gpt-image-2.6's masking is prompt-driven and "seamlessly continue the surrounding scene" made it paint the hole
 *  BLACK (3 real runs 2026-11-09, WORKLOG); this wording filled it invisibly on the same input. flux / ideogram take either. */
export const CONTEXT_FILL_PROMPT = "Remove everything inside the selected area and fill it with the background that surrounds it: continue the same colours, textures, lighting, lines and horizon from the neighbouring pixels so the edit is invisible. Do not add new objects.";

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
