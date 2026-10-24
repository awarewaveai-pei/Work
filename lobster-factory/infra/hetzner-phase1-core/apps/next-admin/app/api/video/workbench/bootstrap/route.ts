import { NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "@/lib/ops-role";
import { effectiveOrgId, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { getSupabaseWriteClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Human-facing bootstrap: names/IDs are resolved once, then projects carry tenant context. */
export async function GET(req: Request): Promise<Response> {
  if (!canCreateAiImageJob(resolveOpsRole(req).role)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const db = getSupabaseWriteClient(); if (!db) return NextResponse.json({ ok: false, error: "db unavailable" }, { status: 503 });
  // A customer sees only its own organization (no binding = 403); staff see every active one.
  let own: string | null;
  try { own = effectiveOrgId(req, null); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  let query = db.from("organizations").select("id, name, slug").eq("status", "active").order("name").limit(200);
  if (own) query = query.eq("id", own);
  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, organizations: data ?? [] });
}
