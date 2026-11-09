import { grantFor } from "@/lib/entitlements/grant";
import { runReplicate, type ReplicateImageResult } from "./replicate-run";
/**
 * Studio object-removal (inpaint) behind a provider-neutral seam.
 *
 * Implementation: Replicate `bria/eraser` — SOTA object removal trained on LICENSED data
 * (Getty/Envato/Freepik), so it is commercially safe for print-on-demand (no IP/NSFW risk).
 * The user paints a mask over the unwanted region; the model erases it and fills the
 * background cleanly. Mask convention: WHITE (255) = remove, BLACK (0) = keep.
 *
 * Version-pinned for reproducibility with an env override (INPAINT_VERSION); the call itself is
 * runReplicate (replicate-run.ts). `image` and `mask` are `format: uri` inputs → base64 data URLs work directly.
 */

const ERASER_VERSION_DEFAULT = "2757d1ac2f1291af219f5f10e8ecba15e92e7c05253e2841295f3ba6bff6adc4"; // bria/eraser (pinned 2026-06-14)

export type InpaintResult = ReplicateImageResult;

/**
 * Remove the masked region of an image and fill the background.
 * @param imageDataUrl base64 data URL of the source image
 * @param maskDataUrl  base64 data URL of the binary mask (WHITE = remove)
 */
export async function removeObject(imageDataUrl: string, maskDataUrl: string): Promise<InpaintResult> {
  const grant = await grantFor("studio.inpaint");
  return runReplicate(grant, {
    version: process.env.INPAINT_VERSION ?? ERASER_VERSION_DEFAULT,
    input: { image: imageDataUrl, mask: maskDataUrl, preserve_alpha: false },
    failCode: "inpaint_failed",
  });
}
