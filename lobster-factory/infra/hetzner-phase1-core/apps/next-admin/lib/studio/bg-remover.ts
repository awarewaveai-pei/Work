import { providerUrl } from "@/lib/ai/gateway";
import { grantFor } from "@/lib/entitlements/grant";
/**
 * Studio BgRemover — background removal behind a provider-neutral seam.
 *
 * Implementation: Replicate `851-labs/background-remover` (24.9M runs,
 * rgba/transparent PNG output), version-pinned for reproducibility with an env
 * override (BG_REMOVER_VERSION) so upgrades are a config change, not a deploy.
 * Reuses the same REPLICATE_API_TOKEN as the generation engine — no new vendor.
 */

const BG_REMOVER_VERSION_DEFAULT = "a029dff38972b5fda4ec5d75d7d1cd25aeff621d2cf4946a41055d7db66b80bc"; // 851-labs/background-remover (pinned 2026-06-11)

const POLL_INTERVAL_MS = 2_000;
const TIMEOUT_MS = 55_000; // route maxDuration is 60s — leave headroom
const MAX_OUTPUT_BYTES = 20 * 1024 * 1024;

export type BgRemoveResult =
  | { ok: true; image: string } // data URL, image/png with alpha
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

/** Remove the background of an image (base64 data URL in, transparent PNG data URL out). */
export async function removeBackground(imageDataUrl: string): Promise<BgRemoveResult> {
  const grant = await grantFor("studio.remove-bg");
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return { ok: false, error: "missing_replicate" };
  const version = process.env.BG_REMOVER_VERSION ?? BG_REMOVER_VERSION_DEFAULT;

  // One controller for the whole operation so the deadline aborts in-flight
  // requests too (loop-top checks alone cannot cancel a hung fetch).
  const controller = new AbortController();
  const killer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetch(providerUrl(grant, "replicate", "/v1/predictions"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          version,
          input: { image: imageDataUrl, format: "png", background_type: "rgba" },
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
      return { ok: false, error: prediction.error ? String(prediction.error).slice(0, 200) : "bg_remove_failed" };
    }

    const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
    if (!outputUrl || !/^https:\/\/replicate\.delivery\//.test(outputUrl)) {
      return { ok: false, error: "output_url_not_allowed" };
    }
    try {
      const dl = await fetch(outputUrl, { signal: controller.signal });
      if (!dl.ok) return { ok: false, error: `fetch_output_failed_${dl.status}` };
      const ab = await dl.arrayBuffer();
      if (ab.byteLength > MAX_OUTPUT_BYTES) return { ok: false, error: "output_too_large" };
      return { ok: true, image: `data:image/png;base64,${Buffer.from(ab).toString("base64")}` };
    } catch {
      return { ok: false, error: controller.signal.aborted ? "generation_timeout" : "fetch_output_network_error" };
    }
  } finally {
    clearTimeout(killer);
  }
}
