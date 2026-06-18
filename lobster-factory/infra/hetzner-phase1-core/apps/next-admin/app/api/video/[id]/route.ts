import { NextRequest, NextResponse } from "next/server";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { deleteDesignObject } from "@/lib/storage/r2";
import { videoObjectKey } from "@/lib/content/blocks/video-pipeline";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  if (!id) return NextResponse.json({ ok: false, error: "missing id" }, { status: 400 });

  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "db unavailable" }, { status: 503 });

  // Fetch the asset to get all format URLs
  const { data: asset, error: fetchErr } = await supabase
    .from("media_assets")
    .select("id, object_url, metadata")
    .eq("id", id)
    .single();

  if (fetchErr || !asset) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }

  // Delete all R2 objects (primary + all format variants)
  const formats: Record<string, string> = asset.metadata?.formats ?? {};
  const urlsToDelete = [asset.object_url, ...Object.values(formats)].filter(Boolean);
  const deleteErrors: string[] = [];

  for (const url of urlsToDelete) {
    try {
      const key = videoObjectKey(url);
      await deleteDesignObject(key);
    } catch (e) {
      deleteErrors.push(String(e));
    }
  }

  // Delete DB record
  const { error: dbErr } = await supabase.from("media_assets").delete().eq("id", id);
  if (dbErr) {
    return NextResponse.json({ ok: false, error: dbErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    id,
    r2_deleted: urlsToDelete.length - deleteErrors.length,
    r2_errors: deleteErrors.length,
  });
}
