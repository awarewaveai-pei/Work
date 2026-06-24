import { NextRequest, NextResponse } from "next/server";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { deleteVideoObjects } from "@/lib/storage/r2";
import { videoObjectKey, resolveOrgId } from "@/lib/content/blocks/video-pipeline";
import { readOpsRole } from "@/lib/ops-role";

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

  const orgId = resolveOrgId();
  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "db unavailable" }, { status: 503 });

  // Fetch with org + mime_type scoping (mirrors history/route.ts pattern)
  let query = supabase
    .from("media_assets")
    .select("id, object_url, metadata")
    .eq("id", id)
    .eq("mime_type", "video/mp4");
  if (orgId) query = query.eq("organization_id", orgId);
  const { data: asset, error: fetchErr } = await query.single();

  if (fetchErr || !asset) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }

  // Delete all format variants from the video bucket using prefix LIST (immune to format drift).
  // Videos are in R2_VIDEO_BUCKET ("lobster-videos"), not the designs bucket.
  const r2Result = await deleteVideoObjects(videoObjectKey(asset.object_url));
  const r2Errors = r2Result.ok ? 0 : 1;

  // Delete DB record
  const { error: dbErr } = await supabase.from("media_assets").delete().eq("id", id);
  if (dbErr) {
    return NextResponse.json({ ok: false, error: dbErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    id,
    r2_deleted: r2Result.ok ? 1 : 0,
    r2_errors: r2Errors,
  });
}
