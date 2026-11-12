import { providerUrl } from "@/lib/ai/gateway";
import type { Grant } from "@/lib/entitlements/can";

/**
 * One Replicate prediction, start → poll → download, for the studio editing tools (bg-remover.ts, inpaint.ts,
 * generative-fill.ts). The three used to carry the same 60 lines each; the error codes below are theirs, unchanged,
 * because the panels and tests match on them. Callers log the cost (lib/ai/__tests__/ai-cost-logged.test.ts CALLERS_LOG).
 */

const POLL_INTERVAL_MS = 2_000;
/** Route maxDuration is 60s — leave headroom. Also the longest run a per-second hold must cover (remove-bg). */
export const DEFAULT_TIMEOUT_MS = 55_000;
const MAX_OUTPUT_BYTES = 20 * 1024 * 1024;

export type ReplicateImageResult =
  /** image = data URL of the output; predictSec = Replicate metrics.predict_time (run-time-billed models charge by it). */
  | { ok: true; image: string; predictSec?: number }
  | { ok: false; error: string };

export interface ReplicateRun {
  /** Pinned version id (lib/ai/cost-model.ts MEDIA_MODELS `version`). */
  version: string;
  input: Record<string, unknown>;
  timeoutMs?: number;
  /** Error code when the prediction ends failed/canceled without a message, e.g. "inpaint_failed". */
  failCode: string;
}

interface PredictionResponse {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string | string[];
  error?: string | null;
  metrics?: { predict_time?: number };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function runReplicate(grant: Grant, run: ReplicateRun): Promise<ReplicateImageResult> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return { ok: false, error: "missing_replicate" };
  const timeoutMs = run.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  // One controller for the whole operation so the deadline aborts in-flight requests too.
  const controller = new AbortController();
  const killer = setTimeout(() => controller.abort(), timeoutMs);
  const timedOut = (fallback: string) => (controller.signal.aborted ? "generation_timeout" : fallback);
  try {
    let res: Response;
    try {
      res = await fetch(providerUrl(grant, "replicate", "/v1/predictions"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ version: run.version, input: run.input }),
        signal: controller.signal,
      });
    } catch {
      return { ok: false, error: timedOut("replicate_network_error") };
    }
    if (res.status === 429) return { ok: false, error: "replicate_429" };
    if (!res.ok) return { ok: false, error: `replicate_${res.status}` };

    let prediction: PredictionResponse;
    try {
      prediction = (await res.json()) as PredictionResponse;
    } catch {
      return { ok: false, error: "replicate_bad_json" };
    }
    const deadline = Date.now() + timeoutMs;
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
        return { ok: false, error: timedOut("replicate_poll_network_error") };
      }
    }
    if (prediction.status !== "succeeded") {
      return { ok: false, error: prediction.error ? String(prediction.error).slice(0, 200) : run.failCode };
    }

    const out = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
    if (!out) return { ok: false, error: "no_output" };
    // Replicate proxies outputs through replicate.delivery; sync mode may return a data URI.
    const predictSec = prediction.metrics?.predict_time;
    if (out.startsWith("data:image/")) return { ok: true, image: out, predictSec };
    if (!/^https:\/\/replicate\.delivery\//.test(out)) return { ok: false, error: "output_url_not_allowed" };
    try {
      const dl = await fetch(out, { signal: controller.signal });
      if (!dl.ok) return { ok: false, error: `fetch_output_failed_${dl.status}` };
      const ab = await dl.arrayBuffer();
      if (ab.byteLength > MAX_OUTPUT_BYTES) return { ok: false, error: "output_too_large" };
      const type = dl.headers.get("content-type");
      const mime = type?.startsWith("image/") ? type : "image/png";
      return { ok: true, image: `data:${mime};base64,${Buffer.from(ab).toString("base64")}`, predictSec };
    } catch {
      return { ok: false, error: timedOut("fetch_output_network_error") };
    }
  } finally {
    clearTimeout(killer);
  }
}
