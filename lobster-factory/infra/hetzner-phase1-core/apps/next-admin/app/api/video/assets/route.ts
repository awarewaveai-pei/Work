import { NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "@/lib/ops-role";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { getSupabaseWriteClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Tenant-scoped candidate picker for Release and footage workflows. */
export async function GET(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const organizationId = new URL(req.url).searchParams.get("organizationId")?.trim() ?? "";
  if (!organizationId) return NextResponse.json({ ok: false, error: "organizationId required" }, { status: 400 });
  try { assertOrgAccess(req, organizationId); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  const db = getSupabaseWriteClient();
  if (!db) return NextResponse.json({ ok: false, error: "db unavailable" }, { status: 503 });
  // projectId narrows to one project's videos; the org filter stays, so another tenant's project id returns nothing.
  const projectId = new URL(req.url).searchParams.get("projectId")?.trim() ?? "";
  let q = db.from("media_assets")
    .select("id, organization_id, asset_domain, object_url, object_key, mime_type, byte_size, checksum_sha256, metadata, created_at")
    .eq("organization_id", organizationId)
    .eq("is_current", true)
    .in("asset_domain", ["ai_generated", "real_footage"])
    .in("mime_type", ["video/mp4", "video/quicktime", "video/webm"]);
  if (projectId) q = q.eq("media_project_id", projectId);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(200);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, items: data ?? [] });
}

