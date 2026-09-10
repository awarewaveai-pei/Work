import { NextRequest, NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "@/lib/ops-role";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { loadAuthoritativeReleaseEvidence } from "@/lib/content/video/release-evidence";

/** Release preflight: validates evidence only; it never creates a Release or publishes media. */
export async function POST(req: NextRequest): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = await req.json() as Record<string, unknown>; } catch { return NextResponse.json({ ok: false, error: "無效 JSON" }, { status: 400 }); }
  const organizationId = typeof body.organizationId === "string" ? body.organizationId : undefined;
  const candidateAssetId = typeof body.candidateAssetId === "string" ? body.candidateAssetId : undefined;
  const candidateChecksum = typeof body.candidateChecksum === "string" ? body.candidateChecksum : undefined;
  if (!organizationId || !candidateAssetId || !candidateChecksum) return NextResponse.json({ ok: false, error: "organizationId、candidate 與 checksum 為必填" }, { status: 400 });
  try { assertOrgAccess(req, organizationId); } catch (error) { if (error instanceof OrgAccessError) return toOrgAccessResponse(error); throw error; }
  const db = getSupabaseWriteClient();
  if (!db) return NextResponse.json({ ok: false, error: "db unavailable" }, { status: 503 });
  const evidence = await loadAuthoritativeReleaseEvidence(db, { organizationId, candidateAssetId, candidateChecksum });
  if (evidence.ok === false) return NextResponse.json({ ok: false, error: evidence.error }, { status: evidence.status });
  return NextResponse.json({ ok: evidence.gate.ok, code: evidence.gate.code, message: evidence.gate.message, reportIds: evidence.gate.reportIds, releaseCreatable: evidence.gate.ok });
}
