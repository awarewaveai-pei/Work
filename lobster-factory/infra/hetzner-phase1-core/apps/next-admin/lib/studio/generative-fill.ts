/**
 * Studio generative fill + outpaint behind a provider-neutral seam.
 *
 * Implementation: Replicate `black-forest-labs/flux-fill-pro` — the PRO (proprietary, hosted)
 * FLUX Fill model. Unlike flux-fill-dev (non-commercial licence), pro is commercially usable
 * through Replicate's hosted terms, so it is safe for print-on-demand output.
 *
 * One model serves two features (same poll/fetch shape as inpaint.ts / bg-remover.ts):
 *   - 生成填色 generative fill — pass {image, mask, prompt}; mask convention WHITE = fill /
 *     regenerate, BLACK = preserve (identical orientation to the inpaint mask painter, so the
 *     same red-stroke → white-on-black extraction in CanvasEditor feeds both).
 *   - 擴圖 outpaint — pass {image, prompt, outpaint:"<preset>"}; the model extends the canvas in
 *     the chosen direction. When `outpaint` is set the mask is ignored (per the model schema).
 *
 * Version-pinned for reproducibility with an env override (GENFILL_VERSION). Reuses the same
 * REPLICATE_API_TOKEN. `image`/`mask` are `format: uri` inputs → base64 data URLs work directly.
 */

import { OUTPAINT_PRESETS, type OutpaintPreset } from "./outpaint-presets";
import { providerUrl } from "@/lib/ai/gateway";
import { grantFor } from "@/lib/entitlements/grant";

// Re-export so existing server-side imports (the route) keep resolving from this module.
export { OUTPAINT_PRESETS };
export type { OutpaintPreset };

const FLUX_FILL_PRO_VERSION_DEFAULT =
  "41c767bcbfffe54ef8f05eb4d0100f9314790f7fc43a7b88d73ec06839deddb9"; // black-forest-labs/flux-fill-pro (pinned 2026-06-15)

const POLL_INTERVAL_MS = 2_000;
const TIMEOUT_MS = 55_000; // route maxDuration is 60s — leave headroom
const MAX_OUTPUT_BYTES = 20 * 1024 * 1024;

export type GenerativeFillResult =
  | { ok: true; image: string } // data URL of the generated image
  | { ok: false; error: string };

export interface GenerativeFillInput {
  image: string; // base64 data URL of the source image
  prompt: string; // what to generate in the filled / extended region
  mask?: string; // base64 data URL; WHITE = fill (ignored when outpaint is set)
  outpaint?: OutpaintPreset; // when set, extend the canvas instead of mask-filling
}

interface PredictionResponse {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string | string[];
  error?: string | null;
  urls?: { get?: string };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Generate content into a masked region (生成填色) or extend the canvas (擴圖).
 * Exactly one of {mask, outpaint} steers the behaviour; if both are present the model
 * ignores the mask (outpaint wins, per its schema).
 */
export async function generativeFill(args: GenerativeFillInput): Promise<GenerativeFillResult> {
  const grant = await grantFor("studio.fill");
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return { ok: false, error: "missing_replicate" };
  if (!args.prompt || args.prompt.trim().length < 2) return { ok: false, error: "prompt_required" };
  if (!args.mask && !args.outpaint) return { ok: false, error: "mask_or_outpaint_required" };
  const version = process.env.GENFILL_VERSION ?? FLUX_FILL_PRO_VERSION_DEFAULT;

  // PNG keeps the masked-fill edges clean.
  // safety_tolerance 5 = most permissive; avoids false-positive NSFW blocks on dark/gothic artwork.
  const input: Record<string, unknown> = {
    image: args.image,
    prompt: args.prompt.trim().slice(0, 1000),
    output_format: "png",
    safety_tolerance: 5,
  };
  if (args.outpaint) input.outpaint = args.outpaint;
  else if (args.mask) input.mask = args.mask;

  const controller = new AbortController();
  const killer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetch(providerUrl(grant, "replicate", "/v1/predictions"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ version, input }),
        signal: controller.signal,
      });
    } catch {
      return { ok: false, error: controller.signal.aborted ? "generation_timeout" : "replicate_network_error" };
    }
    if (res.status === 429) return { ok: false, error: "replicate_429" };
    if (!res.ok) return { ok: false, error: `replicate_${res.status}` };

    let prediction: PredictionResponse;
    try {
      prediction = (await res.json()) as PredictionResponse;
    } catch {
      return { ok: false, error: "replicate_bad_json" };
    }
    const deadline = Date.now() + TIMEOUT_MS;
    while (prediction.status === "starting" || prediction.status === "processing") {
      if (Date.now() > deadline) return { ok: false, error: "generation_timeout" };
      await sleep(POLL_INTERVAL_MS);
      try {
        const poll = await fetch(providerUrl(grant, "replicate", `/v1/predictions/${prediction.id}`), {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!poll.ok) return { ok: false, error: `replicate_poll_${poll.status}` };
        prediction = (await poll.json()) as PredictionResponse;
      } catch {
        return { ok: false, error: controller.signal.aborted ? "generation_timeout" : "replicate_poll_network_error" };
      }
    }
    if (prediction.status !== "succeeded") {
      return { ok: false, error: prediction.error ? String(prediction.error).slice(0, 200) : "genfill_failed" };
    }

    const out = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
    if (!out) return { ok: false, error: "no_output" };
    if (out.startsWith("data:image/")) return { ok: true, image: out };
    if (!/^https:\/\/replicate\.delivery\//.test(out)) return { ok: false, error: "output_url_not_allowed" };
    try {
      const dl = await fetch(out, { signal: controller.signal });
      if (!dl.ok) return { ok: false, error: `fetch_output_failed_${dl.status}` };
      const ab = await dl.arrayBuffer();
      if (ab.byteLength > MAX_OUTPUT_BYTES) return { ok: false, error: "output_too_large" };
      const mime = dl.headers.get("content-type")?.startsWith("image/") ? dl.headers.get("content-type")! : "image/png";
      return { ok: true, image: `data:${mime};base64,${Buffer.from(ab).toString("base64")}` };
    } catch {
      return { ok: false, error: controller.signal.aborted ? "generation_timeout" : "fetch_output_network_error" };
    }
  } finally {
    clearTimeout(killer);
  }
}
