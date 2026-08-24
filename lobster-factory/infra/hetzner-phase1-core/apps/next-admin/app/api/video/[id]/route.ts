import { NextRequest, NextResponse } from "next/server";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { deleteVideoObjects } from "@/lib/storage/r2";
import { videoObjectKey } from "@/lib/content/blocks/video-pipeline";
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
    .select("id, object_url, metadata, organization_id")
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

  // Delete all format variants from the video bucket using prefix LIST (immune to format drift).
  // Videos are in R2_VIDEO_BUCKET ("lobster-videos"), not the designs bucket.
  // On R2 failure: abort — don't delete the DB row, let the caller retry (mirrors designs/route.ts).
  const r2Result = await deleteVideoObjects(videoObjectKey(asset.object_url));
  if (!r2Result.ok) {
    const err = (r2Result as { ok: false; error: string }).error;
    console.error("[video/id] R2 delete failed:", err);
    return NextResponse.json({ ok: false, error: err }, { status: 502 });
  }

  // Delete DB record only after R2 succeeds (prevents orphan → reconcile re-insert loop).
  const { error: dbErr } = await supabase.from("media_assets").delete().eq("id", id);
  if (dbErr) {
    return NextResponse.json({ ok: false, error: dbErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    id,
    r2_deleted: r2Result.deleted,
  });
}
