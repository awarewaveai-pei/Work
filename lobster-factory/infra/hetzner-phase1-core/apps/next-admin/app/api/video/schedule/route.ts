import { NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "@/lib/ops-role";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { getSupabaseWriteClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
// Read the existing queue; this endpoint never starts work or changes publishing consent.
export async function GET(req: Request): Promise<Response> {
  if (!canCreateAiImageJob(resolveOpsRole(req).role)) return new NextResponse("forbidden", { status: 403 });
  const org = new URL(req.url).searchParams.get("organizationId") || "";
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(org)) return NextResponse.json({ error: "organizationId required" }, { status: 400 });
  try { assertOrgAccess(req, org); } catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  const db = getSupabaseWriteClient();
  if (!db) return NextResponse.json({ error: "無法讀取排程" }, { status: 503 });
  const { data, error } = await db.from("content_topics").select("id,title,status,scheduled_for,last_error,formats,site_id,version")
    .eq("organization_id", org).order("updated_at", { ascending: false }).limit(200);
  if (error) return NextResponse.json({ error: "無法讀取排程，請重試" }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}
