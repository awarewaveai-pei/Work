import { NextRequest, NextResponse } from "next/server";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { deleteMediaAsset } from "@/lib/content/media-asset-delete";
import { readOpsRole } from "@/lib/ops-role";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Require operator+ role for this irreversible destructive operation
  const role = readOpsRole(req);
  if (role === "viewer") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (!id) return NextResponse.json({ ok: false, error: "missing id" }, { status: 400 });

  // No env-based org filter here. It used to read POD_DESIGNS_DEFAULT_ORG_ID and was called
  // "supplementary only" — true only while EVERY video row was written under that same default
  // org. Once rows carry their real tenant (2026-08-25), that filter turns into a hard blocker:
  // a client's own video no longer matches, .single() 404s, and assertOrgAccess never even runs,
  // so the owner can never delete their own video. The real tenant barrier is assertOrgAccess()
  // below — same shape as app/api/tools/designs/route.ts, which the UI actually uses.
  // (2026-08-25 critic M3)
  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "db unavailable" }, { status: 503 });

  // Fetch with org + mime_type scoping (mirrors history/route.ts pattern)
  let query = supabase
    .from("media_assets")
    .select("id, object_key, object_url, metadata, organization_id")
    .eq("id", id)
    .eq("mime_type", "video/mp4");
  const { data: asset, error: fetchErr } = await query.single();

  if (fetchErr || !asset) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }
  try { assertOrgAccess(req, (asset as Record<string, unknown>).organization_id as string | null); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }

  if (!asset.object_url) {
    return NextResponse.json({ ok: false, error: "asset_has_no_url" }, { status: 422 });
  }

  // Takes the per-ratio rows too; refused while a release or a WordPress post/page still needs it (media-asset-delete.ts).
  const del = await deleteMediaAsset(supabase, asset);
  if ("code" in del) return NextResponse.json({ ok: false, error: del.message, code: del.code, references: del.references }, { status: del.status });
  return NextResponse.json({ ok: true, id, deleted_ids: del.deletedIds });
}
