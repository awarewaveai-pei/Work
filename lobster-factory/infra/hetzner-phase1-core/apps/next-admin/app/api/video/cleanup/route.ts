/**
 * POST /api/video/cleanup
 * Delete videos older than N days (default 30). Protected by x-ops-sync-key.
 * Designed to be called by a weekly cron.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseWriteClient } from "../../../../lib/supabase-server";
import { deleteDesignObject } from "../../../../lib/storage/r2";
import { videoObjectKey } from "../../../../lib/content/blocks/video-pipeline";

export async function POST(req: NextRequest) {
  const authKey = req.headers.get("x-ops-sync-key");
  if (authKey !== process.env.OPS_SYNC_KEY) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const days = Number(body.days ?? 30);
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

  let deleted = 0;
  for (const asset of old) {
    const formats: Record<string, string> = asset.metadata?.formats ?? {};
    const urls = [asset.object_url, ...Object.values(formats)].filter(Boolean);
    for (const url of urls) {
      try { await deleteDesignObject(videoObjectKey(url)); } catch { /* best-effort */ }
    }
    await supabase.from("media_assets").delete().eq("id", asset.id);
    deleted++;
  }

  return NextResponse.json({ ok: true, deleted, cutoff });
}
