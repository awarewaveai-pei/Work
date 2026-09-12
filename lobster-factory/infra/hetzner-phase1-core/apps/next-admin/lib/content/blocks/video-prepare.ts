/**
 * video-prepare.ts — `video/prepare` 積木：影片生成「準備場景」階段（腳本 + 生圖，不渲染）。
 *
 * 薄包裝 prepareScenes（單一 SSOT，不重複邏輯）。與 `video/render` 兩塊串成完整 pipeline；
 * 中間「停下來給人審核」= 兩塊的接縫：draft 流程在此停（人改旁白/重生/上傳），content 自動連跑。
 *
 * 接線狀態（D2）：/api/video/draft 已收斂到本積木（byId("video/prepare").run）。
 * /api/video/generate（含 /tools/content）仍走 video/pipeline 複合積木（prepare+submit 一次完成）。
 */
import { register, type BlockCtx } from "./registry";
import { prepareScenes } from "./video-pipeline";

register({
  id: "video/prepare",
  title: "準備場景",
  icon: "📝",
  kind: "video",
  enabled: true,
  run: async (ctx: BlockCtx) => {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const providedScenes = ctx.providedScenes as {
      narration: string;
      imagePrompt: string;
      visual?: "custom" | "broll";
      brollKeyword?: string;
      referenceImageUrl?: string;
    }[] | undefined;
    // 接力（providedScenes）路徑跳過 Claude → 不需 key；只有要生腳本時才強制（與 /api/video/draft 同邏輯）。
    if (!anthropicKey && !(providedScenes && providedScenes.length > 0)) {
      return { ok: false, status: 503, error: "ANTHROPIC_API_KEY not configured" };
    }
    return prepareScenes(
      {
        topic: (ctx.topic as string | undefined) ?? (ctx.keyword as string | undefined),
        articleTitle: ctx.articleTitle as string | undefined,
        articleContent: (ctx.articleContent as string | undefined) ?? (ctx.markdown as string | undefined),
        language: ctx.language as string | undefined,
        visualStyle: ctx.visualStyle as string | undefined,
        imageModel: ctx.imageModel as string | undefined,
        targetMinutes: ctx.targetMinutes as number | undefined,
        sceneCount: ctx.sceneCount as number | undefined,
        customScenes: ctx.customScenes as number | undefined,
        // 勾選的輸出格式（draft route 傳 `formats`；generate 路徑用 `outputFormats`）→ 兩者皆收，
        // 否則 normalizeVideoFormats(undefined) 會無視勾選永遠生全三格式（critic 2026-06-23 Critical）。
        formats: (ctx.formats as string[] | undefined) ?? (ctx.outputFormats as string[] | undefined),
        videoMotionModel: ctx.videoMotionModel as string | undefined,
        providedScenes,
        onProgress: (ctx as { onProgress?: (s: string) => void }).onProgress,
      },
      anthropicKey ?? "",
    );
  },
});
