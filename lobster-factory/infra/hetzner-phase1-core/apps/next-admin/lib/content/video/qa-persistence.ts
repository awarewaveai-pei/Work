import { createHash } from "node:crypto";
import type { RenderOutputMeta, RenderOutputs } from "./render-client";
import { getSupabaseWriteClient } from "@/lib/supabase-server";

type PersistedQaStatus = "passed" | "warned" | "failed";

/**
 * Persist the worker's technical evidence once a render is finalized.
 *
 * This is deliberately server-only: callers already passed the tenant guard
 * and the candidate asset was created by recordVideoAsset.  The report is
 * immutable and keyed by its content hash, so repeated status requests cannot
 * create duplicate evidence for the same output.
 */
export async function persistAutomaticTechnicalQa(params: {
  organizationId: string;
  candidateAssetId: string;
  candidateChecksum?: string;
  outputs: RenderOutputs;
  outputMeta?: RenderOutputMeta;
}): Promise<{ id: string; status: PersistedQaStatus } | null> {
  if (process.env.MEDIA_PRODUCTION_PERSISTENCE_ENABLED !== "true") return null;
  const checksum = params.candidateChecksum?.trim();
  if (!checksum || checksum.length < 16 || checksum.length > 128) return null;
  const db = getSupabaseWriteClient();
  if (!db) return null;

  const reports = Object.fromEntries(
    Object.entries(params.outputMeta ?? {}).map(([format, meta]) => [format, {
      width: meta.width,
      height: meta.height,
      byteSize: meta.byteSize,
      checksumSha256: meta.checksumSha256,
      technicalQa: meta.technical_qa,
      signalQa: meta.signal_qa,
    }]),
  );
  const failed = Object.values(params.outputMeta ?? {}).some((meta) =>
    meta.technical_qa?.status === "failed" || meta.signal_qa?.status === "failed",
  );
  const warned = !failed && Object.values(params.outputMeta ?? {}).some((meta) =>
    meta.technical_qa?.status === "warned" || meta.signal_qa?.status === "warned",
  );
  const status: PersistedQaStatus = failed ? "failed" : warned ? "warned" : "passed";
  const reportJson = {
    source: "video-service",
    detector: { id: "media.qa.render", version: "1.0.0" },
    outputs: params.outputs,
    formats: reports,
  };
  const reportSha256 = createHash("sha256").update(JSON.stringify(reportJson)).digest("hex");
  const existing = await db
    .from("media_qa_reports")
    .select("id, status")
    .eq("organization_id", params.organizationId)
    .eq("candidate_asset_id", params.candidateAssetId)
    .eq("candidate_checksum", checksum)
    .eq("qa_kind", "technical")
    .eq("report_sha256", reportSha256)
    .maybeSingle();
  if (existing.data) return { id: String(existing.data.id), status: existing.data.status as PersistedQaStatus };
  if (existing.error) console.warn("[video-qa] existing report lookup failed:", existing.error.message);

  const inserted = await db.from("media_qa_reports").insert({
    organization_id: params.organizationId,
    candidate_asset_id: params.candidateAssetId,
    candidate_checksum: checksum,
    qa_kind: "technical",
    capability_id: "video.qa.render",
    capability_version: "1.0.0",
    profile_id: "video-output-default",
    profile_version: "1.0.0",
    status,
    report_json: reportJson,
    report_sha256: reportSha256,
  }).select("id, status").single();
  if (inserted.error || !inserted.data) {
    console.warn("[video-qa] automatic report insert failed:", inserted.error?.message ?? "empty response");
    return null;
  }
  return { id: String(inserted.data.id), status };
}

