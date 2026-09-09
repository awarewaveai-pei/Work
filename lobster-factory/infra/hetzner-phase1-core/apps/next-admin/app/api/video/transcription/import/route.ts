import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "@/lib/ops-role";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { toSrt, toVtt, type TimedCaptionSegment } from "@/lib/content/video/caption-formats";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BODY_BYTES = 8 * 1024 * 1024;
const MAX_SEGMENTS = 50_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CAPABILITY_ID = "media.transcribe_local";
const IMPORT_CONTRACT_VERSION = "1.0.0";

interface SourceAsset {
  id: string;
  organization_id: string;
  object_key: string;
  object_url: string | null;
  mime_type: string | null;
  checksum_sha256: string | null;
  version: number;
}

interface WhisperSegmentInput {
  id?: unknown;
  start?: unknown;
  end?: unknown;
  text?: unknown;
  avg_logprob?: unknown;
  no_speech_prob?: unknown;
}

interface WhisperTranscriptInput {
  model?: unknown;
  backend?: unknown;
  language?: unknown;
  language_probability?: unknown;
  audio_duration_sec?: unknown;
  segments?: unknown;
}

interface CanonicalSegment extends TimedCaptionSegment {
  readonly sourceSegmentId: string;
  readonly recognition: {
    readonly avgLogprob: number | null;
    readonly noSpeechProb: number | null;
  };
  readonly reviewState: "needs_review";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function optionalFiniteNumber(value: unknown, field: string): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${field} 必須是有限數字`);
  return value;
}

function optionalLabel(value: unknown, fallback: string, field: string): string {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string" || !value.trim() || value.length > 128) {
    throw new Error(`${field} 必須是 1–128 字元字串`);
  }
  return value.trim();
}

function normalizeTranscript(raw: unknown, organizationId: string, source: SourceAsset) {
  if (!isRecord(raw)) throw new Error("transcript 必須是物件");
  const input = raw as WhisperTranscriptInput;
  const durationSec = optionalFiniteNumber(input.audio_duration_sec, "audio_duration_sec");
  if (durationSec === null || durationSec <= 0) throw new Error("audio_duration_sec 必須大於 0");
  const sourceDurationMs = Math.round(durationSec * 1000);
  if (!Number.isSafeInteger(sourceDurationMs) || sourceDurationMs <= 0) throw new Error("audio_duration_sec 超出支援範圍");

  if (!Array.isArray(input.segments) || input.segments.length === 0) throw new Error("segments 必須是非空陣列");
  if (input.segments.length > MAX_SEGMENTS) throw new Error(`segments 不可超過 ${MAX_SEGMENTS} 段`);

  let previousEndMs = 0;
  const segments: CanonicalSegment[] = input.segments.map((value, index) => {
    if (!isRecord(value)) throw new Error(`segment ${index} 必須是物件`);
    const segment = value as WhisperSegmentInput;
    const start = optionalFiniteNumber(segment.start, `segment ${index}.start`);
    const end = optionalFiniteNumber(segment.end, `segment ${index}.end`);
    if (start === null || end === null || start < 0 || end <= start) throw new Error(`segment ${index} 時間範圍無效`);
    const startMs = Math.round(start * 1000);
    const endMs = Math.round(end * 1000);
    if (endMs <= startMs || startMs < previousEndMs || endMs > sourceDurationMs) {
      throw new Error(`segment ${index} 時序無效或超出來源長度`);
    }
    if (typeof segment.text !== "string") throw new Error(`segment ${index}.text 必須是字串`);
    const text = segment.text.trim().replace(/\s+/g, " ");
    if (!text) throw new Error(`segment ${index}.text 不可為空`);
    const noSpeechProb = optionalFiniteNumber(segment.no_speech_prob, `segment ${index}.no_speech_prob`);
    if (noSpeechProb !== null && (noSpeechProb < 0 || noSpeechProb > 1)) {
      throw new Error(`segment ${index}.no_speech_prob 必須介於 0 與 1`);
    }
    const avgLogprob = optionalFiniteNumber(segment.avg_logprob, `segment ${index}.avg_logprob`);
    previousEndMs = endMs;
    return {
      id: `seg_${String(index + 1).padStart(6, "0")}`,
      sourceSegmentId: segment.id === undefined || segment.id === null ? String(index) : String(segment.id),
      startMs,
      endMs,
      text,
      recognition: { avgLogprob, noSpeechProb },
      reviewState: "needs_review" as const,
    };
  });

  const languageProbability = optionalFiniteNumber(input.language_probability, "language_probability");
  if (languageProbability !== null && (languageProbability < 0 || languageProbability > 1)) {
    throw new Error("language_probability 必須介於 0 與 1");
  }
  const transcriptId = `tr_${randomUUID()}`;
  return {
    schemaVersion: "1.0.0",
    transcriptId,
    revision: 1,
    organizationId,
    sourceAsset: {
      id: source.id,
      version: source.version,
      objectKey: source.object_key,
      checksumSha256: source.checksum_sha256,
    },
    sourceDurationMs,
    language: {
      code: optionalLabel(input.language, "und", "language"),
      probability: languageProbability,
    },
    engine: {
      capabilityId: CAPABILITY_ID,
      implementationVersion: IMPORT_CONTRACT_VERSION,
      model: optionalLabel(input.model, "unknown", "model"),
      backend: optionalLabel(input.backend, "unknown", "backend"),
    },
    state: "needs_review" as const,
    segments,
  };
}

function artifactKey(sourceAssetId: string, transcriptId: string, extension: "json" | "srt" | "vtt"): string {
  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return `captions/${month}/${sourceAssetId}/${transcriptId}.${extension}`;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "逐字稿請求超過 8MB 上限" }, { status: 413 });
  }

  let body: Record<string, unknown>;
  try {
    const raw = await req.json();
    if (!isRecord(raw)) throw new Error();
    body = raw;
  } catch {
    return NextResponse.json({ ok: false, error: "無效 JSON" }, { status: 400 });
  }

  const sourceAssetId = typeof body.sourceAssetId === "string" ? body.sourceAssetId.trim() : "";
  if (!UUID_RE.test(sourceAssetId)) {
    return NextResponse.json({ ok: false, error: "sourceAssetId 必須是 UUID" }, { status: 400 });
  }

  const { getSupabaseWriteClient } = await import("@/lib/supabase-server");
  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "媒體資料庫未設定" }, { status: 503 });

  const { data: sourceData, error: sourceError } = await supabase
    .from("media_assets")
    .select("id, organization_id, object_key, object_url, mime_type, checksum_sha256, version")
    .eq("id", sourceAssetId)
    .maybeSingle();
  if (sourceError) return NextResponse.json({ ok: false, error: "讀取來源影片失敗" }, { status: 502 });
  if (!sourceData) return NextResponse.json({ ok: false, error: "source_asset_not_found" }, { status: 404 });
  const source = sourceData as SourceAsset;
  try { assertOrgAccess(req, source.organization_id); }
  catch (error) { if (error instanceof OrgAccessError) return toOrgAccessResponse(error) as NextResponse; throw error; }
  if (!source.mime_type?.startsWith("video/") && !source.mime_type?.startsWith("audio/")) {
    return NextResponse.json({ ok: false, error: "來源資產沒有可轉錄的影音 MIME" }, { status: 422 });
  }

  let transcript: ReturnType<typeof normalizeTranscript>;
  try { transcript = normalizeTranscript(body.transcript, source.organization_id, source); }
  catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "逐字稿格式無效" },
      { status: 422 },
    );
  }

  const captionSegments: TimedCaptionSegment[] = transcript.segments.map(({ id, startMs, endMs, text }) => ({ id, startMs, endMs, text }));
  const transcriptBuffer = Buffer.from(JSON.stringify(transcript), "utf8");
  const srtBuffer = Buffer.from(toSrt(captionSegments), "utf8");
  const vttBuffer = Buffer.from(toVtt(captionSegments), "utf8");
  const pending = [
    { kind: "transcript" as const, format: "json" as const, contentType: "application/json; charset=utf-8", buffer: transcriptBuffer },
    { kind: "caption" as const, format: "srt" as const, contentType: "application/x-subrip; charset=utf-8", buffer: srtBuffer },
    { kind: "caption" as const, format: "vtt" as const, contentType: "text/vtt; charset=utf-8", buffer: vttBuffer },
  ];

  const { deleteDesignObject, putDesignObject } = await import("@/lib/storage/r2");
  const uploaded: Array<(typeof pending)[number] & { objectKey: string; publicUrl: string; byteSize: number; checksumSha256: string }> = [];
  for (const artifact of pending) {
    const objectKey = artifactKey(sourceAssetId, transcript.transcriptId, artifact.format);
    const put = await putDesignObject(objectKey, artifact.buffer, artifact.contentType);
    if (!put.ok) {
      await Promise.all(uploaded.map((item) => deleteDesignObject(item.objectKey)));
      return NextResponse.json({ ok: false, error: `字幕產物上傳失敗：${"error" in put ? put.error : "unknown"}` }, { status: 502 });
    }
    uploaded.push({ ...artifact, ...put });
  }

  const rows = uploaded.map((artifact) => ({
    organization_id: source.organization_id,
    storage_backend: "r2",
    asset_domain: "ai_generated",
    object_key: artifact.objectKey,
    object_url: artifact.publicUrl,
    mime_type: artifact.format === "json" ? "application/json" : artifact.contentType.split(";")[0],
    byte_size: artifact.byteSize,
    checksum_sha256: artifact.checksumSha256,
    version: 1,
    is_current: true,
    metadata: {
      mediaKind: artifact.kind,
      format: artifact.format,
      state: "needs_review",
      transcriptId: transcript.transcriptId,
      transcriptRevision: transcript.revision,
      transcriptDocumentSha256: uploaded[0].checksumSha256,
      sourceAssetId: source.id,
      sourceAssetVersion: source.version,
      sourceAssetChecksumSha256: source.checksum_sha256,
      sourceIdentityIncomplete: !source.checksum_sha256,
      capabilityId: CAPABILITY_ID,
      capabilityVersion: IMPORT_CONTRACT_VERSION,
      model: transcript.engine.model,
      backend: transcript.engine.backend,
      language: transcript.language,
      sourceDurationMs: transcript.sourceDurationMs,
      segmentCount: transcript.segments.length,
    },
  }));

  const { data: inserted, error: insertError } = await supabase
    .from("media_assets")
    .insert(rows)
    .select("id, object_url, mime_type, checksum_sha256, metadata");
  if (insertError || !Array.isArray(inserted) || inserted.length !== rows.length) {
    await Promise.all(uploaded.map((item) => deleteDesignObject(item.objectKey)));
    return NextResponse.json({ ok: false, error: "字幕產物登記失敗" }, { status: 502 });
  }

  const findArtifact = (format: "json" | "srt" | "vtt") => inserted.find((row) => {
    const metadata = row.metadata as Record<string, unknown> | null;
    return metadata?.format === format;
  });
  return NextResponse.json({
    ok: true,
    reviewState: "needs_review",
    transcriptId: transcript.transcriptId,
    sourceAssetId: source.id,
    sourceIdentityComplete: Boolean(source.checksum_sha256),
    artifacts: {
      transcript: findArtifact("json"),
      srt: findArtifact("srt"),
      vtt: findArtifact("vtt"),
    },
  }, { status: 201 });
}
