/**
 * The paid half of video transcription: OpenAI whisper-1, asked as video.transcribe (ADR 017). Only the dispatch route
 * imports this file, so routes that merely read jobs never reach a paid ask.
 */
import { createHash } from "node:crypto";
import { logImageCost } from "@/lib/ai/log-ai-call";
import { providerUrl } from "@/lib/ai/gateway";
import { grantFor } from "@/lib/entitlements/grant";
import type { getSupabaseWriteClient } from "@/lib/supabase-server";
import { completeTranscriptionJob, dispatchToHost, hostWorkerConfig, OPENAI_TRANSCRIBE_MAX_BYTES, OPENAI_TRANSCRIBE_MODEL, openAiTranscribeUsd, ZH_HANT_PROMPT, type JobRow } from "./transcription";

type Db = NonNullable<ReturnType<typeof getSupabaseWriteClient>>;
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

export async function transcribeWithOpenAi(sourceUrl: string, expectedSha256: string, apiKey: string, endpoint: string) {
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
  const res = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form, signal: AbortSignal.timeout(300_000) });
  if (!res.ok) throw new Error(`openai_http_${res.status}`);
  return openAiToTranscript(await res.json());
}

/** Runs after the dispatch response, inside the route's video.transcribe grant scope (ADR 017): OpenAI, then the host
 *  worker if OpenAI fails or the grant is refused. Never throws. */
export async function runOpenAiJob(db: Db, job: JobRow & { sourceUrl: string; callbackSecret: string }, apiKey: string, baseUrl: string): Promise<void> {
  try {
    const grant = await grantFor("video.transcribe");
    const transcript = await transcribeWithOpenAi(job.sourceUrl, job.source_checksum_sha256, apiKey, providerUrl(grant, "openai", "/v1/audio/transcriptions"));
    const costUsd = Number(openAiTranscribeUsd(transcript.audio_duration_sec).toFixed(6));
    void logImageCost({ route: "/api/video/transcription/dispatch", model: OPENAI_TRANSCRIBE_MODEL, vendor: "OpenAI", costUsd, jobId: job.id, tool: "video-transcribe", kind: "video", grant });
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
