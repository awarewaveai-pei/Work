/**
 * GET /api/video/history?limit=20
 *
 * 回傳最近生成的影片列表（media_assets，mime_type=video/mp4）。
 * 給 /tools/video 的歷史紀錄面板用。
 *
 * ⚠️ 必須用 service-role client（getSupabaseWriteClient）：
 *    media_assets 有 RLS，anon key 不帶 Clerk JWT → user_has_org_access = false
 *    → 每次靜默回 []（等同 designs route 的文件說明 line 342-344）。
 */
import { NextRequest, NextResponse } from "next/server";

export interface VideoHistoryItem {
  id: string;
  title: string;
  created_at: string;
  object_url: string;
  formats: Record<string, string>;
  sceneCount: number;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const limit = Math.min(
    50,
    Math.max(1, parseInt(new URL(req.url).searchParams.get("limit") ?? "20", 10) || 20),
  );

  // service-role client → 繞過 RLS（server-side only，不外洩到瀏覽器）
  const { getSupabaseWriteClient, getSupabaseReadClient } = await import("@/lib/supabase-server");
  const supabase = getSupabaseWriteClient() ?? getSupabaseReadClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  }

  // 限縮在預設 org（與 recordVideoAsset 使用相同 org）— 避免多租戶交叉洩漏
  const { resolveOrgId } = await import("@/lib/content/blocks/video-pipeline");
  const orgId = resolveOrgId();

  let query = supabase
    .from("media_assets")
    .select("id, object_url, metadata, created_at")
    .eq("mime_type", "video/mp4")
    .eq("storage_backend", "r2")
    .eq("is_current", true)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (orgId) {
    query = query.eq("organization_id", orgId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const items: VideoHistoryItem[] = (data ?? []).map((row) => {
    const meta = (row.metadata ?? {}) as { title?: string; formats?: Record<string, string>; sceneCount?: number };
    return {
      id: row.id as string,
      title: meta.title ?? "未命名影片",
      created_at: row.created_at as string,
      object_url: row.object_url as string,
      formats: meta.formats ?? {},
      sceneCount: meta.sceneCount ?? 0,
    };
  });

  return NextResponse.json({ ok: true, items });
}
