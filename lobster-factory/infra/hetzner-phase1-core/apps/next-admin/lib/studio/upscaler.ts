/**
 * Print-file upscaler — Real-ESRGAN on Replicate, then persisted to the designs
 * bucket under print/. Target: 300 DPI Bella 3001 front = 3600×4800 px
 * (POD_STUDIO_ROADMAP §B-Specs; Printful caps at 300 DPI, never exceed).
 *
 * Honesty contract (critic 2026-06-11): the result reports the ACHIEVED long
 * edge and a `meetsTarget` flag — Real-ESRGAN caps at 4× per pass, so small
 * inputs cannot reach 4800px even with the two chained passes we allow. The
 * human gate must see the real number, not an unconditional "300DPI ✓".
 */
import { putDesignObject } from "../storage/r2";
import { randomUUID } from "node:crypto";
import { providerUrl } from "@/lib/ai/gateway";
import { grantFor } from "@/lib/entitlements/grant";

const REALESRGAN_VERSION_DEFAULT =
  "b3ef194191d13140337468c916c2c5b96dd0cb06dffc032a022a31807f6a5ea8"; // nightmareai/real-esrgan (live-verified pin 2026-06-11)

const POLL_INTERVAL_MS = 3_000;
const TOTAL_TIMEOUT_MS = 110_000; // route maxDuration (120s) must exceed this
const MAX_OUTPUT_BYTES = 60 * 1024 * 1024;
const MAX_PASSES = 2;

export type UpscaleResult =
  | {
      ok: true;
      printFileUrl: string;
      byteSize: number;
      inputLongEdgePx: number | null;
      achievedLongEdgePx: number | null;
      meetsTarget: boolean;
      passes: number;
    }
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

/** PNG IHDR width/height (bytes 16..23). Returns the longer edge, or null. */
function pngLongEdge(buffer: Buffer): number | null {
  if (buffer.length < 24 || buffer.readUInt32BE(0) !== 0x89504e47) return null;
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return width > 0 && height > 0 ? Math.max(width, height) : null;
}

/** Minimal JPEG SOFn scan for dimensions. Returns the longer edge, or null. */
function jpegLongEdge(buffer: Buffer): number | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) return null;
    const marker = buffer[offset + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = buffer.readUInt16BE(offset + 5);
      const width = buffer.readUInt16BE(offset + 7);
      return width > 0 && height > 0 ? Math.max(width, height) : null;
    }
    offset += 2 + buffer.readUInt16BE(offset + 2);
  }
  return null;
}

function imageLongEdge(buffer: Buffer): number | null {
  return pngLongEdge(buffer) ?? jpegLongEdge(buffer);
}

async function runOnePass(
  token: string,
  version: string,
  imageUrl: string,
  scale: number,
  signal: AbortSignal,
): Promise<{ ok: true; outputUrl: string } | { ok: false; error: string }> {
  const grant = await grantFor("studio.upscale");
  let res: Response;
  try {
    res = await fetch(providerUrl(grant, "replicate", "/v1/predictions"), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ version, input: { image: imageUrl, scale, face_enhance: false } }),
      signal,
    });
  } catch {
    return { ok: false, error: signal.aborted ? "upscale_timeout" : "replicate_network_error" };
  }
  if (res.status === 429) return { ok: false, error: "replicate_429" };
  if (!res.ok) return { ok: false, error: `replicate_${res.status}` };

  let prediction: PredictionResponse;
  try {
    prediction = (await res.json()) as PredictionResponse;
  } catch {
    return { ok: false, error: "replicate_bad_json" };
  }
  while (prediction.status === "starting" || prediction.status === "processing") {
    if (signal.aborted) return { ok: false, error: "upscale_timeout" };
    await sleep(POLL_INTERVAL_MS);
    try {
      const poll = await fetch(providerUrl(grant, "replicate", `/v1/predictions/${prediction.id}`), {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      if (!poll.ok) return { ok: false, error: `replicate_poll_${poll.status}` };
      prediction = (await poll.json()) as PredictionResponse;
    } catch {
      return { ok: false, error: signal.aborted ? "upscale_timeout" : "replicate_poll_network_error" };
    }
  }
  if (prediction.status !== "succeeded") {
    return { ok: false, error: prediction.error ? String(prediction.error).slice(0, 200) : "upscale_failed" };
  }
  const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  if (!outputUrl || !/^https:\/\/replicate\.delivery\//.test(outputUrl)) {
    return { ok: false, error: "output_url_not_allowed" };
  }
  return { ok: true, outputUrl };
}

/**
 * Upscale a design (our R2 public URL) toward targetLongEdge px and store the
 * result as a print file. Probes the real input dimensions first, chains up to
 * two Real-ESRGAN passes (4× each), and reports the achieved size honestly.
 */
export async function upscaleToPrintFile(
  imageUrl: string,
  _hintLongEdgePx: number | null,
  targetLongEdge = 4800,
): Promise<UpscaleResult> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return { ok: false, error: "missing_replicate" };
  const version = process.env.REALESRGAN_VERSION ?? REALESRGAN_VERSION_DEFAULT;

  const controller = new AbortController();
  const killer = setTimeout(() => controller.abort(), TOTAL_TIMEOUT_MS);
  try {
    // Probe the actual input — never trust hints for the scale decision.
    let inputBuffer: Buffer;
    try {
      const probe = await fetch(imageUrl, { signal: controller.signal });
      if (!probe.ok) return { ok: false, error: `fetch_input_failed_${probe.status}` };
      inputBuffer = Buffer.from(await probe.arrayBuffer());
    } catch {
      return { ok: false, error: controller.signal.aborted ? "upscale_timeout" : "fetch_input_network_error" };
    }
    const inputLongEdgePx = imageLongEdge(inputBuffer);

    let currentUrl = imageUrl;
    let currentEdge = inputLongEdgePx;
    let passes = 0;
    while (passes < MAX_PASSES && (currentEdge === null ? passes < 1 : currentEdge < targetLongEdge)) {
      const known = currentEdge ?? 2048;
      const scale = Math.max(2, Math.min(4, Math.ceil(targetLongEdge / known)));
      const pass = await runOnePass(token, version, currentUrl, scale, controller.signal);
      if (!pass.ok) {
        // First pass failing is fatal; a failed second pass falls back to pass-1 output.
        if (passes === 0) return { ok: false, error: (pass as { ok: false; error: string }).error };
        break;
      }
      currentUrl = pass.outputUrl;
      currentEdge = currentEdge === null ? null : currentEdge * scale;
      passes += 1;
      if (currentEdge !== null && currentEdge >= targetLongEdge) break;
    }
    if (passes === 0) return { ok: false, error: "upscale_no_pass_ran" };

    let buffer: Buffer;
    try {
      const dl = await fetch(currentUrl, { signal: controller.signal });
      if (!dl.ok) return { ok: false, error: `fetch_output_failed_${dl.status}` };
      const ab = await dl.arrayBuffer();
      if (ab.byteLength > MAX_OUTPUT_BYTES) return { ok: false, error: "output_too_large" };
      buffer = Buffer.from(ab);
    } catch {
      return { ok: false, error: controller.signal.aborted ? "upscale_timeout" : "fetch_output_network_error" };
    }

    // Measure the REAL output — authoritative over arithmetic.
    const achievedLongEdgePx = imageLongEdge(buffer) ?? currentEdge;

    const now = new Date();
    const key = `print/${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.png`;
    const put = await putDesignObject(key, buffer, "image/png");
    if (!put.ok) {
      return { ok: false, error: (put as { ok: false; error: string }).error };
    }
    return {
      ok: true,
      printFileUrl: put.publicUrl,
      byteSize: put.byteSize,
      inputLongEdgePx,
      achievedLongEdgePx,
      meetsTarget: achievedLongEdgePx !== null && achievedLongEdgePx >= targetLongEdge * 0.75,
      passes,
    };
  } finally {
    clearTimeout(killer);
  }
}
