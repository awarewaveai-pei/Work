/**
 * Print-file upscaler — Real-ESRGAN on Replicate, then persisted to the designs
 * bucket under print/. Target: 300 DPI Bella 3001 front = 3600×4800 px
 * (POD_STUDIO_ROADMAP §B-Specs; Printful caps at 300 DPI, never exceed).
 * Same hardening pattern as bg-remover: one AbortController, every fetch guarded.
 */
import { putDesignObject } from "../storage/r2";
import { randomUUID } from "node:crypto";

const REALESRGAN_VERSION_DEFAULT =
  "b3ef194191d13140337468c916c2c5b96dd0cb06dffc032a022a31807f6a5ea8"; // nightmareai/real-esrgan (live-verified pin 2026-06-11)

const POLL_INTERVAL_MS = 3_000;
const TIMEOUT_MS = 110_000; // upscales are slower than generation; route maxDuration must exceed
const MAX_OUTPUT_BYTES = 60 * 1024 * 1024;

export type UpscaleResult =
  | { ok: true; printFileUrl: string; byteSize: number; scaleUsed: number }
  | { ok: false; error: string };

interface PredictionResponse {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string | string[];
  error?: string | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Upscale a design (data URL or our R2 public URL) toward targetLongEdge px and
 * store the result as a print file in the designs bucket. scale is clamped to
 * Real-ESRGAN's useful 2–4 range; small inputs may need a second pass later.
 */
export async function upscaleToPrintFile(
  imageUrl: string,
  currentLongEdgePx: number | null,
  targetLongEdge = 4800,
): Promise<UpscaleResult> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return { ok: false, error: "missing_replicate" };
  const version = process.env.REALESRGAN_VERSION ?? REALESRGAN_VERSION_DEFAULT;

  const known = currentLongEdgePx && currentLongEdgePx > 0 ? currentLongEdgePx : 2048;
  const scale = Math.max(2, Math.min(4, Math.ceil(targetLongEdge / known)));

  const controller = new AbortController();
  const killer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetch("https://api.replicate.com/v1/predictions", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ version, input: { image: imageUrl, scale, face_enhance: false } }),
        signal: controller.signal,
      });
    } catch {
      return { ok: false, error: controller.signal.aborted ? "upscale_timeout" : "replicate_network_error" };
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
      if (Date.now() > deadline) return { ok: false, error: "upscale_timeout" };
      await sleep(POLL_INTERVAL_MS);
      try {
        const poll = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!poll.ok) return { ok: false, error: `replicate_poll_${poll.status}` };
        prediction = (await poll.json()) as PredictionResponse;
      } catch {
        return { ok: false, error: controller.signal.aborted ? "upscale_timeout" : "replicate_poll_network_error" };
      }
    }
    if (prediction.status !== "succeeded") {
      return { ok: false, error: prediction.error ? String(prediction.error).slice(0, 200) : "upscale_failed" };
    }

    const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
    if (!outputUrl || !/^https:\/\/replicate\.delivery\//.test(outputUrl)) {
      return { ok: false, error: "output_url_not_allowed" };
    }
    let buffer: Buffer;
    try {
      const dl = await fetch(outputUrl, { signal: controller.signal });
      if (!dl.ok) return { ok: false, error: `fetch_output_failed_${dl.status}` };
      const ab = await dl.arrayBuffer();
      if (ab.byteLength > MAX_OUTPUT_BYTES) return { ok: false, error: "output_too_large" };
      buffer = Buffer.from(ab);
    } catch {
      return { ok: false, error: controller.signal.aborted ? "upscale_timeout" : "fetch_output_network_error" };
    }

    const now = new Date();
    const key = `print/${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.png`;
    const put = await putDesignObject(key, buffer, "image/png");
    if (!put.ok) {
      return { ok: false, error: (put as { ok: false; error: string }).error };
    }
    return { ok: true, printFileUrl: put.publicUrl, byteSize: put.byteSize, scaleUsed: scale };
  } finally {
    clearTimeout(killer);
  }
}
