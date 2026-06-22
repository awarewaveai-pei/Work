/**
 * video-prepare.ts — `video/prepare` 積木：影片生成「準備場景」階段（腳本 + 生圖，不渲染）。
 *
 * 薄包裝 prepareScenes（單一 SSOT，不重複邏輯）。與 `video/render` 兩塊串成完整 pipeline；
 * 中間「停下來給人審核」= 兩塊的接縫：draft 流程在此停（人改旁白/重生/上傳），content 自動連跑。
 *
 * 安全第一步（D/4）：已登記、可用 byId("video/prepare") 取用，但現有三個入口
 * （/api/video/draft、/api/video/generate、/tools/content）尚未改接到積木 —— 待確認可單獨裝上去後再接線。
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
    if (!anthropicKey) return { ok: false, status: 503, error: "ANTHROPIC_API_KEY not configured" };
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
        providedScenes: ctx.providedScenes as { narration: string; imagePrompt: string }[] | undefined,
        onProgress: (ctx as { onProgress?: (s: string) => void }).onProgress,
      },
      anthropicKey,
    );
  },
});
