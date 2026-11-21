/**
 * POST /api/internal/video/cleanup
 * Delete videos older than N days (default 30). Protected by x-ops-sync-key.
 * Designed to be called by a weekly cron. Lives under /api/internal (the middleware matcher skips it, product doors
 * refuse it in nginx) so no door serves it -- it acts on every organization's videos.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { deleteMediaAsset } from "@/lib/content/media-asset-delete";

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

  const body: unknown = await req.json().catch(() => null);
  const days = Math.max(1, Number(body && typeof body === "object" ? (body as { days?: unknown }).days : undefined) || 30);
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();

  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "db unavailable" }, { status: 503 });

  const { data: old, error } = await supabase
    .from("media_assets")
    .select("id, object_key, organization_id, metadata")
    .eq("mime_type", "video/mp4")
    .lt("created_at", cutoff)
    .limit(50);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!old || old.length === 0) return NextResponse.json({ ok: true, deleted: 0 });

  // Age alone never deletes: a video a release or a WordPress page still needs is kept, and rows go only after their R2
  // objects (media-asset-delete.ts). A video's other-ratio rows go with it, so they are skipped when met later.
  let deleted = 0;
  const gone = new Set<string>();
  const kept: { id: string; reason: string }[] = [];
  for (const asset of old) {
    if (gone.has(asset.id)) continue;
    const r = await deleteMediaAsset(supabase, asset);
    if ("code" in r) { kept.push({ id: asset.id, reason: r.code }); continue; }
    for (const id of r.deletedIds) gone.add(id);
    deleted += r.deletedIds.length;
  }

  return NextResponse.json({ ok: true, deleted, kept, cutoff });
}
