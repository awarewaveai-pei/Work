import { NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "@/lib/ops-role";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { getSupabaseWriteClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Tenant-scoped QA evidence picker. Only immutable report summaries leave the API. */
export async function GET(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const organizationId = url.searchParams.get("organizationId")?.trim() ?? "";
  const candidateAssetId = url.searchParams.get("candidateAssetId")?.trim() ?? "";
  if (!organizationId) return NextResponse.json({ ok: false, error: "organizationId required" }, { status: 400 });
  try { assertOrgAccess(req, organizationId); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  const db = getSupabaseWriteClient();
  if (!db) return NextResponse.json({ ok: false, error: "db unavailable" }, { status: 503 });
  let query = db.from("media_qa_reports")
    .select("id, organization_id, candidate_asset_id, candidate_checksum, qa_kind, capability_id, capability_version, profile_id, profile_version, status, report_sha256, created_at")
    .eq("organization_id", organizationId)
    .in("status", ["passed", "warned"])
    .order("created_at", { ascending: false })
    .limit(500);
  if (candidateAssetId) query = query.eq("candidate_asset_id", candidateAssetId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const items = (data ?? []).map((row) => ({
    id: row.id,
    kind: row.qa_kind,
    status: row.status,
    candidateAssetId: row.candidate_asset_id,
    candidateChecksum: row.candidate_checksum,
    profileId: row.profile_id,
    profileVersion: row.profile_version,
    capabilityId: row.capability_id,
    capabilityVersion: row.capability_version,
    reportSha256: row.report_sha256,
    createdAt: row.created_at,
  }));
  return NextResponse.json({ ok: true, items });
}

