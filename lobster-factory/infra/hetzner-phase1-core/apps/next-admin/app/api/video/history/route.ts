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
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { effectiveOrgId, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";

export interface VideoHistoryItem {
  id: string;
  title: string;
  created_at: string;
  object_url: string;
  formats: Record<string, string>;
  sceneCount: number;
  selectedFormats?: string[];
  formatCount?: number;
  outputMeta?: Record<string, unknown>;
  source?: string;
  imageModel?: string;
}

export async function GET(req: NextRequest): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const limit = Math.min(
    50,
    Math.max(1, parseInt(new URL(req.url).searchParams.get("limit") ?? "20", 10) || 20),
  );

  // service-role client → 繞過 RLS（server-side only，不外洩到瀏覽器）。
  // 若 write client 不可用，fallback 到 read client（anon）但 RLS 會把結果擋空；
  // 此時在 response 加 warning 欄位，讓呼叫方知道結果不可信而非靜默回空陣列。
  const { getSupabaseWriteClient, getSupabaseReadClient } = await import("@/lib/supabase-server");
  const writeClient = getSupabaseWriteClient();
  const supabase = writeClient ?? getSupabaseReadClient();
  const usingReadClient = !writeClient;
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  }

  // effectiveOrgId：client 強制綁自己的 org；staff 可不過濾（看全部）
  let orgFilter: string | null;
  try { orgFilter = effectiveOrgId(req, null); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }

  let query = supabase
    .from("media_assets")
    .select("id, object_url, metadata, created_at")
    .eq("mime_type", "video/mp4")
    .eq("storage_backend", "r2")
    .eq("is_current", true)
    .is("metadata->>variantOf", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (orgFilter) {
    query = query.eq("organization_id", orgFilter);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const items: VideoHistoryItem[] = (data ?? []).map((row) => {
    const meta = (row.metadata ?? {}) as {
      title?: string;
      formats?: Record<string, string>;
      sceneCount?: number;
      selectedFormats?: string[];
      formatCount?: number;
      outputMeta?: Record<string, unknown>;
      source?: string;
      imageModel?: string;
    };
    return {
      id: row.id as string,
      title: meta.title ?? "未命名影片",
      created_at: row.created_at as string,
      object_url: row.object_url as string,
      formats: meta.formats ?? {},
      sceneCount: meta.sceneCount ?? 0,
      selectedFormats: meta.selectedFormats,
      formatCount: meta.formatCount,
      outputMeta: meta.outputMeta,
      source: meta.source,
      imageModel: meta.imageModel,
    };
  });

  return NextResponse.json({
    ok: true,
    items,
    ...(usingReadClient ? { warning: "service-role client unavailable; read-only client used — RLS may have filtered results" } : {}),
  });
}
