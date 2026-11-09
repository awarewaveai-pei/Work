import { grantFor } from "@/lib/entitlements/grant";
import { runReplicate, type ReplicateImageResult } from "./replicate-run";
/**
 * Studio BgRemover — background removal behind a provider-neutral seam.
 *
 * Implementation: Replicate `851-labs/background-remover` (24.9M runs,
 * rgba/transparent PNG output), version-pinned for reproducibility with an env
 * override (BG_REMOVER_VERSION) so upgrades are a config change, not a deploy.
 * The call itself is runReplicate (replicate-run.ts) — no new vendor, no new pattern.
 */

const BG_REMOVER_VERSION_DEFAULT = "a029dff38972b5fda4ec5d75d7d1cd25aeff621d2cf4946a41055d7db66b80bc"; // 851-labs/background-remover (pinned 2026-06-11)

export type BgRemoveResult = ReplicateImageResult; // ok: image/png with alpha

/** Remove the background of an image (base64 data URL in, transparent PNG data URL out). */
export async function removeBackground(imageDataUrl: string): Promise<BgRemoveResult> {
  const grant = await grantFor("studio.remove-bg");
  return runReplicate(grant, {
    version: process.env.BG_REMOVER_VERSION ?? BG_REMOVER_VERSION_DEFAULT,
    input: { image: imageDataUrl, format: "png", background_type: "rgba" },
    failCode: "bg_remove_failed",
  });
}
