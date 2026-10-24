import { NextResponse } from "next/server";
import { canApproveMedia, resolveOpsRole } from "@/lib/ops-role";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { getSupabaseWriteClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!canApproveMedia(resolveOpsRole(req))) return NextResponse.json({ ok: false, error: "owner_or_admin_required" }, { status: 403 });
  const { id } = await params;
  const db = getSupabaseWriteClient(); if (!db) return NextResponse.json({ ok: false, error: "db unavailable" }, { status: 503 });
  const current = await db.from("media_story_bible_revisions").select("id, organization_id, series_id, revision, status").eq("id", id).maybeSingle();
  if (current.error) return NextResponse.json({ ok: false, error: current.error.message }, { status: 500 });
  if (!current.data) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  try { assertOrgAccess(req, current.data.organization_id); } catch (error) { if (error instanceof OrgAccessError) return toOrgAccessResponse(error); throw error; }
  if (current.data.status !== "draft") return NextResponse.json({ ok: false, error: "only_draft_can_be_approved" }, { status: 409 });
  const approved = await db.rpc("approve_media_story_bible_revision", { p_id: id }).single();
  if (approved.error) return NextResponse.json({ ok: false, error: approved.error.message }, { status: 500 });
  if (!approved.data) return NextResponse.json({ ok: false, error: "approval_conflict" }, { status: 409 });
  return NextResponse.json({ ok: true, item: approved.data, next: "approved Bible may be used to build Timeline production packages" });
}
