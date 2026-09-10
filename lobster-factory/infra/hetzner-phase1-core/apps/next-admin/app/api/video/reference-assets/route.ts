import { NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "@/lib/ops-role";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { getSupabaseWriteClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export async function GET(req: Request): Promise<Response> {
  if (!canCreateAiImageJob(resolveOpsRole(req).role)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const organizationId = new URL(req.url).searchParams.get("organizationId")?.trim() ?? "";
  if (!organizationId) return NextResponse.json({ ok: false, error: "organizationId required" }, { status: 400 });
  try { assertOrgAccess(req, organizationId); } catch (error) { if (error instanceof OrgAccessError) return toOrgAccessResponse(error); throw error; }
  const db = getSupabaseWriteClient(); if (!db) return NextResponse.json({ ok: false, error: "db unavailable" }, { status: 503 });
  const { data, error } = await db.from("media_assets").select("id, asset_domain, object_url, mime_type, metadata, created_at").eq("organization_id", organizationId).eq("is_current", true).in("asset_domain", ["ai_generated", "real_footage"]).order("created_at", { ascending: false }).limit(200);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, items: data ?? [] });
}
