import { createHash } from "node:crypto";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { automaticQaIssuance } from "./qa-issuance";

type WorkerSegment = { start?: unknown; end?: unknown; text?: unknown; no_speech_prob?: unknown };

/** Persist deterministic transcript integrity evidence for the exact source checksum. */
export async function persistAutomaticCaptionQa(params: { organizationId: string; candidateAssetId: string; candidateChecksum: string; transcript: unknown }) {
  if (process.env.MEDIA_PRODUCTION_PERSISTENCE_ENABLED !== "true") return null;
  if (!/^[0-9a-f]{64}$/i.test(params.candidateChecksum) || !params.transcript || typeof params.transcript !== "object") return null;
  const raw = params.transcript as { segments?: unknown; audio_duration_sec?: unknown };
  const segments = Array.isArray(raw.segments) ? raw.segments as WorkerSegment[] : [];
  let previousEnd = 0; const violations: string[] = [];
  for (const [index, segment] of segments.entries()) {
    if (typeof segment.start !== "number" || typeof segment.end !== "number" || segment.start < previousEnd || segment.end <= segment.start || typeof segment.text !== "string" || !segment.text.trim()) violations.push(`segment_${index}_invalid`);
    previousEnd = typeof segment.end === "number" ? segment.end : previousEnd;
  }
  if (!segments.length) violations.push("segments_missing");
  if (typeof raw.audio_duration_sec !== "number" || raw.audio_duration_sec <= previousEnd) violations.push("duration_invalid");
  const reportJson = { detector: { id: "video.qa.caption", version: "1.0.0" }, issuance: automaticQaIssuance("video.qa.caption"), segmentCount: segments.length, violations };
  const reportSha256 = createHash("sha256").update(JSON.stringify(reportJson)).digest("hex");
  const db = getSupabaseWriteClient(); if (!db) return null;
  const existing = await db.from("media_qa_reports").select("id, status").eq("organization_id", params.organizationId).eq("candidate_asset_id", params.candidateAssetId).eq("candidate_checksum", params.candidateChecksum).eq("qa_kind", "caption").eq("report_sha256", reportSha256).maybeSingle();
  if (existing.data) return existing.data;
  const inserted = await db.from("media_qa_reports").insert({ organization_id: params.organizationId, candidate_asset_id: params.candidateAssetId, candidate_checksum: params.candidateChecksum, qa_kind: "caption", capability_id: "video.qa.caption", capability_version: "1.0.0", profile_id: "whisper-transcript-integrity", profile_version: "1.0.0", status: violations.length ? "failed" : "passed", report_json: reportJson, report_sha256: reportSha256 }).select("id, status").single();
  return inserted.data ?? null;
}
