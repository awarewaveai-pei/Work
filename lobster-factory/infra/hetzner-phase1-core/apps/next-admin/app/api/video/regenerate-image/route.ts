/**
 * POST /api/video/regenerate-image
 *
 * 草稿審核時單張圖「重新生成」：重跑單一場景的素材（Flux AI 圖 或 Pexels），回新 URL。
 * 重用 prepareScenes 的同一個 buildSceneAsset（單一 SSOT，不重複生圖邏輯）。
 * 成功後 best-effort 刪掉舊的 R2 暫存圖（oldImageUrl 為 designs/ 物件時）→ 防 R2 累積孤兒。
 *
 * Body: { imagePrompt, imageModel?, visualStyle?, brollKeyword?, visual?, oldImageUrl? }
 * Success: { ok: true, imageUrl, r2Key }
 * Failure: { ok: false, error }
 */

import { signOrigin } from "@/lib/content/video/asset-origin";
import { NextRequest, NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { effectiveOrgId, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { thenRun, withFeature } from "@/lib/entitlements/grant";

interface RegenBody {
  imagePrompt?: string;
  imageModel?: string;
  visualStyle?: string;
  brollKeyword?: string;
  visual?: "custom" | "broll";
  oldImageUrl?: string;
  /** draft 主格式（"16x9"|"9x16"|"4x5"）→ 重生圖的比例/取向與預覽一致。省略 = 16:9。 */
  format?: string;
  /** false = 舊圖還被別的比例使用（例如上傳的素材），只拿來排除、不要刪。省略 = 刪。 */
  deleteOld?: boolean;
  /** VideoPipeline wizard 帶入的租戶（同 render-draft）；未帶 = 預設租戶。 */
  organizationId?: string;
}

export async function POST(req: NextRequest): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: RegenBody;
  try {
    body = (await req.json()) as RegenBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Request body must be valid JSON" }, { status: 400 });
  }

  const imagePrompt = (body.imagePrompt ?? "").trim();
  if (!imagePrompt) {
    return NextResponse.json({ ok: false, error: "imagePrompt 為必填" }, { status: 400 });
  }

  const { buildSceneAsset, FORMAT_SPEC, resolveOrgId: resolveDefaultOrgId } = await import("@/lib/content/blocks/video-pipeline");
  // The draft's org pays for the new image, resolved as render-draft resolves it (ADR 017 §0 代操).
  let orgId: string | null;
  try { orgId = effectiveOrgId(req, body.organizationId ?? resolveDefaultOrgId()); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  // 依 draft 主格式決定重生圖的比例/取向（與預覽一致）；未知/省略 → 16:9。
  const spec = (body.format && FORMAT_SPEC[body.format]) || FORMAT_SPEC["16x9"];
  const run = async (): Promise<Response> => {
    const result = await buildSceneAsset(
      {
        id: 0,
        image_prompt: imagePrompt,
        broll_keyword: typeof body.brollKeyword === "string" ? body.brollKeyword : "",
        visual: body.visual === "broll" ? "broll" : "custom",
      },
      {
        imageModel: body.imageModel,
        visualStyle: body.visualStyle,
        aspectRatio: spec.aspectRatio,
        orientation: spec.orientation,
        framing: spec.framing,
        excludeAssets: typeof body.oldImageUrl === "string" && body.oldImageUrl ? [body.oldImageUrl] : undefined,
      },
    );

    if (!result.ok) {
      const err = result as { ok: false; status: number; error: string };
      return NextResponse.json({ ok: false, error: err.error }, { status: err.status });
    }

    // 新圖成功後才清舊圖（避免新圖失敗卻已刪舊圖 → 兩頭空）。只刪 designs/ 格式的 R2 暫存物件。
    if (typeof body.oldImageUrl === "string" && body.deleteOld !== false) {
      try {
        const path = new URL(body.oldImageUrl).pathname.replace(/^\//, "");
        if (/^designs\/\d{4}-\d{2}\/[0-9a-f-]+\.\w+$/i.test(path)) {
          const { deleteDesignObject } = await import("@/lib/storage/r2");
          await deleteDesignObject(path);
        }
      } catch {
        /* best-effort：清不掉舊圖不影響新圖回傳 */
      }
    }

    // 註：此處不驗 imageUrl host —— buildSceneAsset 只會回 R2 designs / Pexels / Vimeo URL，且
    // 送渲染時 render-draft 會再用 ALLOWED_HOSTS 把關（host 正確性的單一守門點在那）。
    const origin = result.origin ? signOrigin(result.asset, result.origin) : null;
    return NextResponse.json({ ok: true, imageUrl: result.asset, r2Key: result.r2Key ?? null, ...(origin ? { origin } : {}) });
  };
  // Billed to the draft's org (ADR 017 §0 代操); buildSceneAsset's image call inherits it.
  return withFeature("video.image", thenRun, { org: () => orgId })(req, run);
}
