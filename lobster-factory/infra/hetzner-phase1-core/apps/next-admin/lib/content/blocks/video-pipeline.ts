/**
 * video-pipeline.ts — `video/pipeline` 積木（headless 影片生成「prepare」入口）。
 *
 * 為何只做 prepare（不等渲染、不記錄）：此 Next.js 部署不可靠地執行回應後的長背景工作
 * （void async / after() 都被切）。故拆成三段、各放在「會持久的地方」：
 *   1. prepare（本 run）：Claude 腳本 + Flux 圖（並行）+ 提交 EU → 即回 euJobId 等 handle。
 *      全程 <100s（並行壓低），由 /api/video/generate **同步**呼叫 → 無背景工作。
 *   2. render：EU video-service 自己的背景 thread（持久、已驗）。
 *   3. finalize：/api/video/status 每輪輪詢 EU，完成那刻才 recordVideoAsset + 清 R2 暫存
 *      （也在快速請求內）→ 匯出 recordVideoAsset / cleanupVideoInputKeys / resolveOrgId 供其用。
 */
import { register, type BlockCtx } from "./registry";
import { generateVideoScript } from "../video/video-script-core";
import { fetchBrollUrl } from "../video/pexels";
import {
  parseImageDataUrl,
  buildDesignKey,
  putDesignObject,
  deleteDesignObject,
  isR2Configured,
} from "../../storage/r2";
import { submitRender, type RenderOutputs } from "../video/render-client";
import { generateTarotImage } from "../../tarot/image-gen";
import { getSupabaseWriteClient } from "../../supabase-server";

/** POD_DESIGNS_DEFAULT_ORG_ID（designs route 同規約）；ctx.organizationId 優先。 */
export function resolveOrgId(ctxOrgId?: string): string | null {
  const v = ctxOrgId ?? process.env.POD_DESIGNS_DEFAULT_ORG_ID ?? null;
  if (!v) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v) ? v : null;
}

/** 渲染完成後記一筆 media_assets（asset_domain=ai_generated + mime video/mp4，靠 mime 與圖片區分）。
 *  best-effort：失敗只記 warn，不影響主結果。由 /status 在 EU 回 done 時呼叫。 */
/** 由 primaryUrl 推導 media_assets.object_key（存與查共用此單一邏輯 → idempotent，不會因編碼不一致重複）。 */
export function videoObjectKey(primaryUrl: string): string {
  try {
    return new URL(primaryUrl).pathname.replace(/^\//, "") || primaryUrl;
  } catch {
    return primaryUrl;
  }
}

export async function recordVideoAsset(params: {
  organizationId: string;
  primaryUrl: string;
  outputs: RenderOutputs;
  title: string;
  sceneCount: number;
}): Promise<void> {
  const supabase = getSupabaseWriteClient();
  if (!supabase) return;
  const objectKey = videoObjectKey(params.primaryUrl);
  const { error } = await supabase.from("media_assets").insert({
    organization_id: params.organizationId,
    storage_backend: "r2",
    asset_domain: "ai_generated",
    object_key: objectKey,
    object_url: params.primaryUrl,
    mime_type: "video/mp4",
    byte_size: 0,
    is_current: true,
    metadata: { title: params.title, formats: params.outputs, sceneCount: params.sceneCount },
  });
  if (error) console.warn("[video-pipeline] media_assets insert failed (best-effort):", error.message);
}

/** 刪除本輪上傳的 Flux 暫存物件（render 消費完後清，防 R2 累積）。永不拋。 */
export async function cleanupVideoInputKeys(keys: string[]): Promise<void> {
  for (const key of keys) {
    try {
      await deleteDesignObject(key);
    } catch {
      /* ignore */
    }
  }
}

/** prepare 成功回傳：pending handle（渲染尚未完成，交由 /status 輪詢 EU 收尾）。 */
export interface VideoPipelinePending {
  ok: true;
  pending: true;
  euJobId: string;
  r2Keys: string[];
  title: string;
  sceneCount: number;
}
type VideoPipelineResult = VideoPipelinePending | { ok: false; status: number; error: string };

type AssetResult =
  | { ok: true; asset: string; r2Key?: string }
  | { ok: false; status: number; error: string };

/** 草稿生成結果：腳本 + 圖片 URL，不含渲染（供 /api/video/draft 使用）。 */
export interface PreparedScenes {
  ok: true;
  scenes: import("../video/video-script-core").VideoScene[];
  assets: string[];
  r2Keys: string[];
  title: string;
}

/** 步驟 1+2：生腳本 + 生圖；不提交 EU 渲染。可獨立呼叫供草稿預覽。 */
export async function prepareScenes(
  input: {
    topic?: string;
    articleTitle?: string;
    articleContent?: string;
    language?: string;
    /** 已解析的英文風格 prompt（前端 resolveStylePrompt 後傳入）。空 = 用 cinematic 預設。 */
    visualStyle?: string;
    /** 深層接力：前製腳本已寫好的場景（台詞+畫面）→ 跳過 Claude 重生，直接用這些。 */
    providedScenes?: { narration: string; imagePrompt: string }[];
    onProgress?: (step: string) => void;
  },
  anthropicKey: string,
): Promise<PreparedScenes | { ok: false; status: number; error: string }> {
  let scenes: import("../video/video-script-core").VideoScene[];
  let title: string;
  if (input.providedScenes && input.providedScenes.length > 0) {
    // 深層接力：直接用前製腳本場景（台詞→旁白、畫面→生圖提示），跳過 Claude 重生 → 影片貼合腳本。
    input.onProgress?.("使用前製腳本場景，生成素材…");
    scenes = input.providedScenes.map((s, i) => ({
      id: i + 1,
      narration: (s.narration || "").trim(),
      image_prompt: (s.imagePrompt || "").trim() || (s.narration || "").trim(),
      broll_keyword: "",
      visual: "custom" as const,
    }));
    title = (input.articleTitle || input.topic || "影片").trim();
  } else {
    input.onProgress?.("腳本生成中（Claude）…");
    const scriptResult = await generateVideoScript(
      {
        topic: input.topic,
        articleTitle: input.articleTitle,
        articleContent: input.articleContent,
        language: input.language,
      },
      anthropicKey,
    );
    if (!scriptResult.ok) return scriptResult as { ok: false; status: number; error: string };
    scenes = scriptResult.scenes;
    title = scriptResult.title;
  }

  input.onProgress?.(`素材生成中（${scenes.length} 場景並行）…`);
  const pexelsKey = process.env.PEXELS_API_KEY as string | undefined;
  const buildAsset = async (scene: (typeof scenes)[number]): Promise<AssetResult> => {
    if (scene.visual === "broll" && pexelsKey) {
      const brollUrl = await fetchBrollUrl(scene.broll_keyword, pexelsKey);
      if (brollUrl) return { ok: true, asset: brollUrl };
    }
    if (!isR2Configured()) return { ok: false, status: 503, error: "R2 未設定（跨機影片素材需 R2 暫存 Flux 圖）" };
    // 風格前綴：使用者選了風格 → 用該風格（已含材質/光線/色盤），補 16:9 框景；
    // 否則用 cinematic 預設。風格 prompt 在前、scene 主體在後（與 tarot 同慣例）。
    const stylePrefix = input.visualStyle?.trim()
      ? `${input.visualStyle.trim()} Wide 16:9 cinematic framing.`
      : "Cinematic wide-angle 16:9, realistic photography, dramatic natural lighting, rich color grade.";
    const styledPrompt = `${stylePrefix} ${scene.image_prompt}`;
    const img = await generateTarotImage({ model: "flux-schnell", prompt: styledPrompt, aspectRatio: "16:9" });
    if (img.ok === false) return { ok: false, status: 502, error: `場景 ${scene.id} 圖片生成失敗：${img.error}` };
    const parsed = parseImageDataUrl(img.image);
    const key = parsed ? buildDesignKey(parsed.mime) : null;
    if (!parsed || !key) return { ok: false, status: 502, error: `場景 ${scene.id} 圖片格式無法解析` };
    const put = await putDesignObject(key, parsed.buffer, parsed.mime);
    if (!put.ok) return { ok: false, status: 502, error: `場景 ${scene.id} 圖片上傳 R2 失敗：${"error" in put ? put.error : "r2_put_failed"}` };
    return { ok: true, asset: put.publicUrl, r2Key: key };
  };

  const results = await Promise.all(scenes.map(buildAsset));
  const r2Keys = results.flatMap((r) => (r.ok && r.r2Key ? [r.r2Key] : []));
  const failed = results.find((r): r is { ok: false; status: number; error: string } => !r.ok);
  if (failed) {
    await cleanupVideoInputKeys(r2Keys);
    return failed;
  }
  const assets = results.map((r) => (r as { ok: true; asset: string }).asset);
  return { ok: true, scenes, assets, r2Keys, title };
}

register({
  id: "video/pipeline",
  title: "影片生成",
  icon: "🎬",
  kind: "video",
  enabled: true,

  run: async (ctx: BlockCtx): Promise<VideoPipelineResult> => {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) return { ok: false, status: 503, error: "ANTHROPIC_API_KEY not configured" };

    const onProgress = (ctx as { onProgress?: (step: string) => void }).onProgress;

    // 1+2) 腳本 + 素材（共用 prepareScenes，與 /api/video/draft 同邏輯）
    const prep = await prepareScenes(
      {
        topic: (ctx.topic as string | undefined) ?? (ctx.keyword as string | undefined),
        articleTitle: ctx.articleTitle as string | undefined,
        articleContent: (ctx.articleContent as string | undefined) ?? (ctx.markdown as string | undefined),
        language: ctx.language as string | undefined,
        visualStyle: ctx.visualStyle as string | undefined,
        onProgress,
      },
      anthropicKey,
    );
    if (!prep.ok) return prep as { ok: false; status: number; error: string };
    const { scenes, assets, r2Keys, title } = prep;

    // 3) 提交 EU（短請求，不等渲染）→ 回 euJobId。渲染在 EU thread 跑，由 /status 輪詢收尾。
    onProgress?.("提交合成任務（EU 伺服器）…");
    const sub = await submitRender(
      scenes.map((s) => ({ id: s.id, narration: s.narration })),
      assets,
      title,
      undefined,
      {
        ttsProvider: ctx.ttsProvider as string | undefined,
        ttsVoice: ctx.ttsVoice as string | undefined,
        introTitle: ctx.introTitle as string | undefined,
        introDuration: ctx.introDuration as number | undefined,
      },
    );
    if (!sub.ok) {
      await cleanupVideoInputKeys(r2Keys);
      return {
        ok: false,
        status: "status" in sub ? sub.status : 502,
        error: "error" in sub ? sub.error : "提交渲染失敗",
      };
    }
    return { ok: true, pending: true, euJobId: sub.jobId, r2Keys, title, sceneCount: scenes.length };
  },
});
