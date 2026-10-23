/**
 * POST /api/video/cleanup
 * Delete videos older than N days (default 30). Protected by x-ops-sync-key.
 * Designed to be called by a weekly cron.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseWriteClient } from "../../../../lib/supabase-server";
import { deleteUnreferencedAsset } from "../../../../lib/content/r2-delete-guard";
import { videoObjectKey } from "../../../../lib/content/blocks/video-pipeline";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

export async function POST(req: NextRequest) {
  const authKey = req.headers.get("x-ops-sync-key");
  const expected = process.env.OPS_PROXY_SHARED_SECRET;
  if (!expected || !authKey || !timingSafeEqual(authKey, expected)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const days = Math.max(1, Number(body.days) || 30);
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();

  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "db unavailable" }, { status: 503 });

  const { data: old, error } = await supabase
    .from("media_assets")
    .select("id, object_url, metadata")
    .eq("mime_type", "video/mp4")
    .lt("created_at", cutoff)
    .limit(50);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!old || old.length === 0) return NextResponse.json({ ok: true, deleted: 0 });

  // Age alone never deletes: a video still embedded in a WordPress page is kept (r2-delete-guard.ts), and the row is
  // only removed after the R2 objects are gone, so a refusal or failure leaves the video in the gallery.
  let deleted = 0;
  const kept: { id: string; reason: string }[] = [];
  for (const asset of old) {
    const r = await deleteUnreferencedAsset(videoObjectKey(asset.object_url));
    if ("error" in r) { kept.push({ id: asset.id, reason: r.error }); continue; }
    const { error: delErr } = await supabase.from("media_assets").delete().eq("id", asset.id);
    if (delErr) { kept.push({ id: asset.id, reason: `db_delete_failed:${delErr.message}` }); continue; }
    deleted++;
  }

  return NextResponse.json({ ok: true, deleted, kept, cutoff });
}
