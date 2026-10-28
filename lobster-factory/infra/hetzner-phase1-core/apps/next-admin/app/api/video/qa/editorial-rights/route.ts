import { NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "@/lib/ops-role";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { persistEditorialRightsQa } from "@/lib/content/video/editorial-rights-persist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Run deterministic editorial and rights checks and persist both immutable
 * reports. All release-relevant evidence is derived from server-owned asset
 * metadata; callers cannot supply a script or rights decision in this request.
 */
export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (process.env.MEDIA_PRODUCTION_PERSISTENCE_ENABLED !== "true") return NextResponse.json({ ok: false, error: "qa_persistence_disabled" }, { status: 503 });

  let body: Record<string, unknown>;
  try { body = await req.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const organizationId = typeof body.organizationId === "string" ? body.organizationId.trim() : "";
  const candidateAssetId = typeof body.candidateAssetId === "string" ? body.candidateAssetId.trim() : "";
  const candidateChecksum = typeof body.candidateChecksum === "string" ? body.candidateChecksum.trim() : "";
  if (!UUID.test(organizationId) || !UUID.test(candidateAssetId) || candidateChecksum.length < 16 || candidateChecksum.length > 128) {
    return NextResponse.json({ ok: false, error: "organizationId/candidateAssetId/candidateChecksum invalid" }, { status: 400 });
  }
  try { assertOrgAccess(req, organizationId); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  if (body.editorial !== undefined || body.rightsAssets !== undefined) {
    return NextResponse.json({ ok: false, error: "client_supplied_qa_evidence_not_accepted" }, { status: 400 });
  }

  const db = getSupabaseWriteClient();
  if (!db) return NextResponse.json({ ok: false, error: "db unavailable" }, { status: 503 });
  const result = await persistEditorialRightsQa(db, { organizationId, candidateAssetId, candidateChecksum });
  if (result.ok === false) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, candidateAssetId, reports: result.persisted, results: result.reports }, { status: 201 });
}
