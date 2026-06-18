/**
 * video-pipeline.ts — `video/pipeline` 積木（headless 影片生成入口）。
 *
 * 流程：topic/文章 → Claude 腳本 → 每場景取一個視覺素材（Pexels B-roll 或 Flux 靜態圖）
 *       → POST 到 Python video-service render → 回傳輸出路徑。
 *
 * 本積木不做 TTS、不做 ffmpeg、不做發布 — 單一職責是「膠合各子模組」。
 * 與 article-generate 形狀相同：讀 env → 組參數 → 呼叫 core → 回傳 {ok,..}。
 */
import { register, type BlockCtx } from "./registry";
import { generateVideoScript, type VideoScene } from "../video/video-script-core";
import { fetchBrollUrl } from "../video/pexels";
import { dataUrlToTempFile, cleanupTempFiles } from "../video/asset-prep";
import { callRenderService, type RenderOutputs } from "../video/render-client";
import { generateTarotImage } from "../../tarot/image-gen";

/** video/pipeline 積木的成功回傳形狀。 */
interface VideoPipelineSuccess {
  ok: true;
  video: { outputs: RenderOutputs; out_dir: string };
  scenes: VideoScene[];
  title: string;
}

type VideoPipelineResult =
  | VideoPipelineSuccess
  | { ok: false; status: number; error: string };

register({
  id: "video/pipeline",
  title: "影片生成",
  icon: "🎬",
  kind: "video",
  enabled: true,

  run: async (ctx: BlockCtx): Promise<VideoPipelineResult> => {
    // ── 1. 環境變數前置檢查 ────────────────────────────────────────────────────
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      return { ok: false, status: 503, error: "ANTHROPIC_API_KEY not configured" };
    }

    // ── 2. 從 ctx 組成腳本輸入（支援 topic 或 article 兩種入口）─────────────────
    const scriptInput = {
      topic: (ctx.topic as string | undefined) ?? (ctx.keyword as string | undefined),
      articleTitle: ctx.articleTitle as string | undefined,
      articleContent:
        (ctx.articleContent as string | undefined) ??
        (ctx.markdown as string | undefined),
      language: ctx.language as string | undefined,
    };

    // ── 3. 生成 Claude 腳本 ──────────────────────────────────────────────────
    const scriptResult = await generateVideoScript(scriptInput, anthropicKey);
    if (!scriptResult.ok) return scriptResult as { ok: false; status: number; error: string };

    const { scenes, title } = scriptResult;

    // ── 4. 每場景取一個視覺素材 ──────────────────────────────────────────────
    const pexelsKey = process.env.PEXELS_API_KEY as string | undefined;
    const assets: string[] = [];

    for (const scene of scenes) {
      // 策略：broll + 有 Pexels key → 嘗試抓真實影片；否則用 Flux 靜態圖
      if (scene.visual === "broll" && pexelsKey) {
        const brollUrl = await fetchBrollUrl(scene.broll_keyword, pexelsKey);
        if (brollUrl) {
          assets.push(brollUrl);
          continue;
        }
        // Pexels 找不到結果 → 降級到 Flux（fall through）
      }

      // Flux 靜態圖（16:9 橫幅，適合影片）
      const imgResult = await generateTarotImage({
        model: "flux-schnell",
        prompt: scene.image_prompt,
        aspectRatio: "16:9",
      });

      if (imgResult.ok === false) {
        return {
          ok: false,
          status: 502,
          error: `場景 ${scene.id} 圖片生成失敗：${imgResult.error}`,
        };
      }

      // Flux 回傳 data: URL → 寫入本機臨時檔（與 video-service 共享 /tmp volume）
      const localPath = dataUrlToTempFile(imgResult.image, `scene${scene.id}`);
      assets.push(localPath);
    }

    // ── 5. 呼叫 Python render 服務 ──────────────────────────────────────────
    const renderResult = await callRenderService(
      scenes.map((s) => ({ id: s.id, narration: s.narration })),
      assets,
      title
    );

    if (!renderResult.ok) return renderResult as { ok: false; status: number; error: string };

    return {
      ok: true,
      video: { outputs: renderResult.outputs, out_dir: renderResult.out_dir },
      scenes,
      title,
    };
  },
});
