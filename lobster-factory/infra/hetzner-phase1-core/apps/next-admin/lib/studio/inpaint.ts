import { providerUrl } from "@/lib/ai/gateway";
import { grantFor } from "@/lib/entitlements/grant";
/**
 * Studio object-removal (inpaint) behind a provider-neutral seam.
 *
 * Implementation: Replicate `bria/eraser` — SOTA object removal trained on LICENSED data
 * (Getty/Envato/Freepik), so it is commercially safe for print-on-demand (no IP/NSFW risk).
 * The user paints a mask over the unwanted region; the model erases it and fills the
 * background cleanly. Mask convention: WHITE (255) = remove, BLACK (0) = keep.
 *
 * Version-pinned for reproducibility with an env override (INPAINT_VERSION). Reuses the same
 * REPLICATE_API_TOKEN + the exact poll/fetch shape as bg-remover.ts — no new vendor, no new
 * pattern. `image` and `mask` are `format: uri` inputs → base64 data URLs work directly.
 */

const ERASER_VERSION_DEFAULT = "2757d1ac2f1291af219f5f10e8ecba15e92e7c05253e2841295f3ba6bff6adc4"; // bria/eraser (pinned 2026-06-14)

const POLL_INTERVAL_MS = 2_000;
const TIMEOUT_MS = 55_000; // route maxDuration is 60s — leave headroom
const MAX_OUTPUT_BYTES = 20 * 1024 * 1024;

export type InpaintResult =
  | { ok: true; image: string } // data URL of the cleaned image
  | { ok: false; error: string };

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
 * Remove the masked region of an image and fill the background.
 * @param imageDataUrl base64 data URL of the source image
 * @param maskDataUrl  base64 data URL of the binary mask (WHITE = remove)
 */
export async function removeObject(imageDataUrl: string, maskDataUrl: string): Promise<InpaintResult> {
  const grant = await grantFor("studio.inpaint");
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return { ok: false, error: "missing_replicate" };
  const version = process.env.INPAINT_VERSION ?? ERASER_VERSION_DEFAULT;

  const controller = new AbortController();
  const killer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetch(providerUrl(grant, "replicate", "/v1/predictions"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          version,
          input: { image: imageDataUrl, mask: maskDataUrl, preserve_alpha: false },
        }),
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
      return { ok: false, error: prediction.error ? String(prediction.error).slice(0, 200) : "inpaint_failed" };
    }

    const out = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
    if (!out) return { ok: false, error: "no_output" };
    // Replicate proxies outputs through replicate.delivery; sync mode may return a data URI.
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
