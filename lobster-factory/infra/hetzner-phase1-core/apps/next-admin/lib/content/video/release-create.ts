import type { SupabaseClient } from "@supabase/supabase-js";
import { loadAuthoritativeReleaseEvidence } from "./release-evidence";

export type ReleaseCreated =
  | { ok: true; release: Record<string, unknown> }
  | { ok: false; status: number; body: Record<string, unknown> };

/** Promote a candidate to a durable Release after the same fail-closed QA gate as preflight (the route and the project auto-advance job share it). */
export async function createApprovedRelease(
  db: SupabaseClient,
  p: { organizationId: string; candidateAssetId: string; candidateChecksum: string; releaseJson?: unknown },
): Promise<ReleaseCreated> {
  const evidence = await loadAuthoritativeReleaseEvidence(db, p);
  if (evidence.ok === false) return { ok: false, status: evidence.status, body: { ok: false, error: evidence.error } };
  if (!evidence.gate.ok) return { ok: false, status: 409, body: { ok: false, code: evidence.gate.code, message: evidence.gate.message, reportIds: evidence.gate.reportIds } };
  const release = await db.from("media_releases").insert({ organization_id: p.organizationId, candidate_asset_id: p.candidateAssetId, candidate_checksum: p.candidateChecksum, status: "release_approved", qa_report_ids: evidence.gate.reportIds, release_json: p.releaseJson ?? {}, approved_at: new Date().toISOString() }).select("id, organization_id, candidate_asset_id, status, qa_report_ids, created_at, approved_at").single();
  if (release.error) return { ok: false, status: 500, body: { ok: false, error: release.error.message } };
  return { ok: true, release: release.data as Record<string, unknown> };
}
