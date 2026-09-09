import { NextResponse } from "next/server";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Dashboard read model: latest snapshots plus aggregate metrics for one tenant. */
export async function GET(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });
  const url = new URL(req.url);
  const organizationId = url.searchParams.get("organizationId")?.trim() ?? "";
  const releaseId = url.searchParams.get("releaseId")?.trim() ?? "";
  if (!organizationId) return NextResponse.json({ ok: false, error: "organizationId required" }, { status: 400 });
  try { assertOrgAccess(req, organizationId); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  const db = getSupabaseWriteClient();
  if (!db) return new NextResponse("db unavailable", { status: 503 });

  let query = db
    .from("media_outcome_snapshots")
    .select("id, release_id, delivery_attempt_id, event_id, platform, external_post_id, maturity, observed_at, metrics, created_at")
    .eq("organization_id", organizationId)
    .order("observed_at", { ascending: false })
    .limit(500);
  if (releaseId) query = query.eq("release_id", releaseId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const totals: Record<string, number> = {};
  for (const row of data ?? []) {
    for (const [key, value] of Object.entries((row.metrics ?? {}) as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isFinite(value)) totals[key] = (totals[key] ?? 0) + value;
    }
  }
  return NextResponse.json({ ok: true, organizationId, releaseId: releaseId || null, count: data?.length ?? 0, totals, snapshots: data ?? [] });
}
