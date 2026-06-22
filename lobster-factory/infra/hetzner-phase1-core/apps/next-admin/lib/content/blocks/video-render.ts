/**
 * video-render.ts — `video/render` 積木：影片生成「渲染」階段（提交 EU TTS + ffmpeg，回 euJobId）。
 *
 * 薄包裝 submitRender（單一 SSOT）。吃 `video/prepare` 輸出的場景 + 素材；渲染在 EU 背景 thread 跑、
 * 由 /api/video/status 輪詢收尾（next-admin 不做背景工作）。
 *
 * 安全第一步（D/4）：已登記、可用 byId("video/render") 取用；現有 render-draft / generate 尚未改接。
 */
import { register, type BlockCtx } from "./registry";
import { submitRender } from "../video/render-client";

register({
  id: "video/render",
  title: "渲染影片",
  icon: "🎞️",
  kind: "video",
  enabled: true,
  run: async (ctx: BlockCtx) => {
    const scenes = (ctx.scenes as { id: number; narration: string }[] | undefined) ?? [];
    const assets = (ctx.assets as string[] | undefined) ?? [];
    const title = (ctx.title as string | undefined) ?? "影片";
    if (scenes.length === 0 || assets.length !== scenes.length) {
      return { ok: false, status: 400, error: "video/render 需 scenes 與等長 assets" };
    }
    return submitRender(
      scenes.map((s) => ({ id: s.id, narration: s.narration })),
      assets,
      title,      // submitRender 第 3 參數 = outName（輸出檔名前綴），勿與後續位置參數對調
      undefined,  // baseUrl（用 VIDEO_SERVICE_URL 預設）
      {
        ttsProvider: ctx.ttsProvider as string | undefined,
        ttsVoice: ctx.ttsVoice as string | undefined,
        introTitle: ctx.introTitle as string | undefined,
        introDuration: ctx.introDuration as number | undefined,
      },
    );
  },
});
