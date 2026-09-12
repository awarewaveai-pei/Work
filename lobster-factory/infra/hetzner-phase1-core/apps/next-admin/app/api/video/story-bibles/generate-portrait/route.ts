/**
 * POST /api/video/story-bibles/generate-portrait
 *
 * 為 Story Bible 角色自動生成一張定裝照（首次登場、尚無 referenceAssetIds 時）：
 * Flux 生圖 → R2 → 註冊為 media_assets（asset_domain: "ai_generated"）→ 回 assetId + imageUrl，
 * 供呼叫端（ScriptForge）寫回 Bible 該角色的 referenceAssetIds、存新草稿版本。
 * 重用 buildSceneAsset（video-pipeline.ts 既有生圖+R2 邏輯，單一 SSOT，不重複實作）。
 *
 * Body: { organizationId, name, role?, description? }
 * Success: { ok: true, assetId, imageUrl }
 * Failure: { ok: false, error }
 */

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { getSupabaseWriteClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

interface GeneratePortraitBody {
  organizationId?: string;
  name?: string;
  role?: string;
  /** 從 Story Bible continuity.prohibitions 篩出的、提到這個角色名字的外觀鎖定句（選填）——
   * 2026-09-12 真實測試發現：name+role 兩者對圖片模型都是性別中性/無外觀線索的字串（"小雨"、
   * "主角"），flux-schnell 沒有任何依據時會賭一個性別，賭錯了操作者的角色卡明明寫了「短髮、
   * 米色針織外套」卻完全沒被用到。有這句就塞進 prompt，讓外觀鎖定規則真的影響生成結果。 */
  description?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { role: opsRole } = resolveOpsRole(req);
  if (!canCreateAiImageJob(opsRole)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: GeneratePortraitBody;
  try {
    body = (await req.json()) as GeneratePortraitBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Request body must be valid JSON" }, { status: 400 });
  }

  const organizationId = body.organizationId?.trim() ?? "";
  const name = body.name?.trim() ?? "";
  if (!organizationId) return NextResponse.json({ ok: false, error: "organizationId 為必填" }, { status: 400 });
  if (!name) return NextResponse.json({ ok: false, error: "name 為必填" }, { status: 400 });
  try { assertOrgAccess(req, organizationId); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e) as NextResponse; throw e; }

  const role = body.role?.trim();
  const description = body.description?.trim();
  const prompt = `Character reference portrait, head and shoulders studio photo, neutral background, ${name}${role ? `, ${role}` : ""}${description ? `. ${description}` : ""}, consistent identity for reuse across scenes`;

  const { buildSceneAsset } = await import("@/lib/content/blocks/video-pipeline");
  const result = await buildSceneAsset(
    { id: 0, image_prompt: prompt, broll_keyword: "", visual: "custom" },
    // 首次定裝照沒有參考圖可帶（就是要生出這張參考圖），純文字生圖用最便宜的 flux-schnell（$0.003/張）
    // 即可，不需要 flux-dev（$0.025/張）— 操作者要求「盡量用最便宜的模型」。
    { imageModel: "flux-schnell", aspectRatio: "4:5", framing: "Portrait studio photography, sharp focus on face." },
  );
  if (!result.ok) {
    const err = result as { ok: false; status: number; error: string };
    return NextResponse.json({ ok: false, error: `定裝照生成失敗：${err.error}` }, { status: err.status });
  }
  if (!result.bytes || !result.mime) {
    return NextResponse.json({ ok: false, error: "定裝照生成成功但缺 buffer（非預期路徑）" }, { status: 502 });
  }

  const db = getSupabaseWriteClient();
  if (!db) return NextResponse.json({ ok: false, error: "db unavailable" }, { status: 503 });
  const asset = await db.from("media_assets").insert({
    organization_id: organizationId,
    storage_backend: "r2",
    asset_domain: "ai_generated",
    object_key: result.r2Key ?? null,
    object_url: result.asset,
    mime_type: result.mime,
    byte_size: result.bytes.byteLength,
    checksum_sha256: createHash("sha256").update(result.bytes).digest("hex"),
    metadata: { source: "story_bible_auto_portrait", character_name: name, character_role: role ?? "", character_description: description ?? "" },
  }).select("id").single();
  if (asset.error || !asset.data) {
    if (result.r2Key) {
      try { const { deleteDesignObject } = await import("@/lib/storage/r2"); await deleteDesignObject(result.r2Key); } catch { /* best effort cleanup */ }
    }
    return NextResponse.json({ ok: false, error: "asset registration failed" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, assetId: asset.data.id, imageUrl: result.asset });
}
