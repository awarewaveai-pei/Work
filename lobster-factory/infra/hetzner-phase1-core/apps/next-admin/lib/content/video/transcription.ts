/**
 * Video transcription engines: the self-hosted Whisper worker ("host", free) and OpenAI whisper-1 ("openai", paid,
 * per minute). One job row (media_transcription_jobs) per request; both engines end in completeTranscriptionJob, so
 * the SRT/VTT artifacts and caption QA are identical whichever ran. An OpenAI failure falls back to the host worker
 * with the same job id and callback secret (meeting-service pattern: the paid path is optional, never a dead end).
 */
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { POST as importTranscript } from "@/app/api/video/transcription/import/route";
import { persistAutomaticCaptionQa } from "./caption-qa-persistence";
import { TRANSCRIBE_RATES } from "@/lib/ai/cost-model";
import { logImageCost } from "@/lib/ai/log-ai-call";
import type { getSupabaseWriteClient } from "@/lib/supabase-server";

type Db = NonNullable<ReturnType<typeof getSupabaseWriteClient>>;
export type TranscribeEngine = "host" | "openai";

export const OPENAI_TRANSCRIBE_MODEL = "whisper-1";
/** OpenAI's upload limit for /v1/audio/transcriptions. */
export const OPENAI_TRANSCRIBE_MAX_BYTES = 25 * 1024 * 1024;
/** Host worker speed, audio seconds per wall second: ks-aw-01 CPU int8 large-v3, 8 threads, 2026-10-29 (1.13x
 *  transcribe-only; a 28.6s clip took 51.6s with first model load). turbo ran 1.86x but misheard words. */
export const HOST_REALTIME_FACTOR = 1.0;
const ZH_HANT_PROMPT = "以下是繁體中文的影片旁白，請以臺灣用語的繁體中文輸出。";

export function openAiTranscribeUsd(durationSec: number): number {
  return (Math.max(0, durationSec) / 60) * TRANSCRIBE_RATES[OPENAI_TRANSCRIBE_MODEL].usdPerMin;
}

/** client_config.audioExternalAiAllowed: false = this client's audio never leaves our servers. Default allowed. */
export function externalAudioAllowed(metadata: unknown): boolean {
  const m = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};
  const c = m.client_config && typeof m.client_config === "object" ? (m.client_config as Record<string, unknown>) : {};
  return c.audioExternalAiAllowed !== false;
}

/** Worker URL may be https, or plain http to a single-label docker service name on lobster-net. */
export function workerBaseUrl(value: string | undefined): string | null {
  const raw = (value ?? "").trim().replace(/\/+$/, "");
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol === "https:") return raw;
    if (url.protocol === "http:" && /^[a-z0-9-]+$/i.test(url.hostname)) return raw;
  } catch { /* fall through */ }
  return null;
}

export function hostWorkerConfig(env: NodeJS.ProcessEnv = process.env) {
  const url = workerBaseUrl(env.MEDIA_TRANSCRIBE_WORKER_URL);
  const token = (env.MEDIA_TRANSCRIBE_WORKER_TOKEN ?? "").trim();
  const callbackBase = workerBaseUrl(env.MEDIA_TRANSCRIBE_CALLBACK_BASE_URL);
  const model = (env.MEDIA_TRANSCRIBE_MODEL ?? "large-v3").trim();
  return url && token && callbackBase && /^[A-Za-z0-9._-]{1,64}$/.test(model) ? { url, token, callbackBase, model } : null;
}

export async function hostWorkerHealthy(): Promise<boolean> {
  const cfg = hostWorkerConfig();
  if (!cfg) return false;
  try { return (await fetch(`${cfg.url}/health`, { signal: AbortSignal.timeout(3000), cache: "no-store" })).ok; } catch { return false; }
}

export async function dispatchToHost(job: { jobId: string; sourceUrl: string; checksum: string; callbackSecret: string }): Promise<boolean> {
  const cfg = hostWorkerConfig();
  if (!cfg) return false;
  try {
    const res = await fetch(`${cfg.url}/v1/jobs`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.token}`, "content-type": "application/json" },
      body: JSON.stringify({ job_id: job.jobId, source_url: job.sourceUrl, source_checksum_sha256: job.checksum, callback_url: `${cfg.callbackBase}/api/internal/video/transcription-complete`, callback_secret: job.callbackSecret, model: cfg.model }),
      signal: AbortSignal.timeout(30_000),
    });
    return res.ok;
  } catch { return false; }
}

type OpenAiSegment = { id?: number; start?: number; end?: number; text?: string; avg_logprob?: number; no_speech_prob?: number };

/** whisper-1 verbose_json -> the worker's transcript shape. Segments are clamped to be ordered and inside the
 *  duration, because the import route rejects overlap and overrun outright. */
export function openAiToTranscript(body: { language?: string; duration?: number; segments?: OpenAiSegment[] }) {
  const duration = typeof body.duration === "number" ? body.duration : 0;
  let prevEnd = 0;
  const segments = [];
  for (const [i, s] of (body.segments ?? []).entries()) {
    const text = (s.text ?? "").trim();
    const start = Math.max(prevEnd, Number(s.start ?? 0));
    const end = Math.min(duration, Number(s.end ?? 0));
    if (!text || !(end > start)) continue;
    segments.push({ id: s.id ?? i, start, end, text, avg_logprob: s.avg_logprob, no_speech_prob: s.no_speech_prob });
    prevEnd = end;
  }
  return { model: OPENAI_TRANSCRIBE_MODEL, backend: "openai", language: body.language ?? "und", audio_duration_sec: duration, segments };
}

/** A dispatched job past this age is lost (server or worker restarted mid-job): /status marks it failed so the page
 *  never polls forever. Host covers ~3h of audio at the measured speed. */
export const JOB_DEADLINE_MS: Record<TranscribeEngine, number> = { openai: 15 * 60_000, host: 3 * 60 * 60_000 };

export async function transcribeWithOpenAi(sourceUrl: string, expectedSha256: string, apiKey: string) {
  const src = await fetch(sourceUrl, { signal: AbortSignal.timeout(120_000) });
  if (!src.ok) throw new Error(`source_http_${src.status}`);
  const bytes = await src.arrayBuffer();
  if (bytes.byteLength > OPENAI_TRANSCRIBE_MAX_BYTES) throw new Error("source_over_25mb");
  // Same check as the host worker: captions are stored under this checksum, so they must be of these exact bytes.
  if (createHash("sha256").update(Buffer.from(bytes)).digest("hex") !== expectedSha256.toLowerCase()) throw new Error("source_checksum_mismatch");
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: src.headers.get("content-type") ?? "video/mp4" }), "source.mp4");
  form.append("model", OPENAI_TRANSCRIBE_MODEL);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  form.append("prompt", ZH_HANT_PROMPT);
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form, signal: AbortSignal.timeout(300_000) });
  if (!res.ok) throw new Error(`openai_http_${res.status}`);
  return openAiToTranscript(await res.json());
}

type JobRow = { id: string; organization_id: string; source_asset_id: string; source_checksum_sha256: string; result_json?: unknown };

/** Shared end of both engines: import -> caption QA -> job completed. Keeps any routing notes already on the row. */
export async function completeTranscriptionJob(db: Db, job: JobRow, transcript: unknown, baseUrl: string): Promise<{ ok: true; artifacts: unknown } | { ok: false }> {
  const importRequest = new NextRequest(new URL("/api/video/transcription/import", baseUrl), { method: "POST", headers: { "content-type": "application/json", "x-ops-claims-role": "operator", "x-ops-user-kind": "staff" }, body: JSON.stringify({ sourceAssetId: job.source_asset_id, transcript }) });
  const imported = await importTranscript(importRequest);
  const prior = job.result_json && typeof job.result_json === "object" ? (job.result_json as Record<string, unknown>) : {};
  if (!imported.ok) {
    await db.from("media_transcription_jobs").update({ status: "failed", error_code: "transcript_import_failed", result_json: { ...prior, importStatus: imported.status }, completed_at: new Date().toISOString() }).eq("id", job.id).eq("status", "dispatched");
    return { ok: false };
  }
  const result = await imported.json() as Record<string, unknown>;
  await persistAutomaticCaptionQa({ organizationId: job.organization_id, candidateAssetId: job.source_asset_id, candidateChecksum: job.source_checksum_sha256, transcript });
  await db.from("media_transcription_jobs").update({ status: "completed", result_json: { ...prior, ...result }, completed_at: new Date().toISOString() }).eq("id", job.id).eq("status", "dispatched");
  return { ok: true, artifacts: result.artifacts };
}

/** Runs after the dispatch response: OpenAI, then the host worker if OpenAI fails. Never throws. */
export async function runOpenAiJob(db: Db, job: JobRow & { sourceUrl: string; callbackSecret: string }, apiKey: string, baseUrl: string): Promise<void> {
  try {
    const transcript = await transcribeWithOpenAi(job.sourceUrl, job.source_checksum_sha256, apiKey);
    const costUsd = Number(openAiTranscribeUsd(transcript.audio_duration_sec).toFixed(6));
    void logImageCost({ route: "/api/video/transcription/dispatch", model: OPENAI_TRANSCRIBE_MODEL, vendor: "OpenAI", costUsd, jobId: job.id, tool: "video-transcribe", kind: "video", organizationId: job.organization_id });
    await db.from("media_transcription_jobs").update({ result_json: { engine: "openai", costUsd } }).eq("id", job.id).eq("status", "dispatched");
    await completeTranscriptionJob(db, { ...job, result_json: { engine: "openai", costUsd } }, transcript, baseUrl);
  } catch (error) {
    const openAiError = error instanceof Error ? error.message.slice(0, 200) : "unknown";
    const cfg = hostWorkerConfig();
    const note = { engine: "host", fallbackFrom: "openai", openAiError };
    if (cfg && await dispatchToHost({ jobId: job.id, sourceUrl: job.sourceUrl, checksum: job.source_checksum_sha256, callbackSecret: job.callbackSecret })) {
      await db.from("media_transcription_jobs").update({ model: cfg.model, result_json: note }).eq("id", job.id).eq("status", "dispatched");
      return;
    }
    await db.from("media_transcription_jobs").update({ status: "failed", error_code: "openai_failed_no_fallback", result_json: note, completed_at: new Date().toISOString() }).eq("id", job.id).eq("status", "dispatched");
  }
}
