/**
 * video-render.ts — `video/render` 積木：影片生成「渲染」階段（提交 EU TTS + ffmpeg，回 euJobId）。
 *
 * 薄包裝 submitRender（單一 SSOT）。吃 `video/prepare` 輸出的場景 + 素材；渲染在 EU 背景 thread 跑、
 * 由 /api/video/status 輪詢收尾（next-admin 不做背景工作）。
 *
 * 接線狀態（D2）：/api/video/render-draft 已收斂到本積木（byId("video/render").run）委派提交。
 * /api/video/generate 仍走 video/pipeline 複合積木（內含 submitRender）。
 */
import { register, type BlockCtx } from "./registry";
import { submitRender } from "../video/render-client";
import { buildVideoOutName } from "./video-pipeline";

register({
  id: "video/render",
  title: "渲染影片",
  icon: "🎞️",
  kind: "video",
  enabled: true,
  run: async (ctx: BlockCtx) => {
    const scenes = (ctx.scenes as { id: number; narration: string }[] | undefined) ?? [];
    const assets = (ctx.assets as string[] | undefined) ?? [];
    const formatAssets = ctx.formatAssets as Record<string, string[]> | undefined;
    const formats = ctx.formats as string[] | undefined;
    const title = (ctx.title as string | undefined) ?? "影片";
    if (scenes.length === 0) {
      return { ok: false, status: 400, error: "video/render 需非空 scenes" };
    }
    // 多格式：每格式素材組須與 scenes 等長；否則退回舊單組 assets 等長檢查。
    const useMulti = !!formatAssets && Array.isArray(formats) && formats.length > 0;
    if (useMulti) {
      for (const f of formats!) {
        const arr = formatAssets![f];
        if (!Array.isArray(arr) || arr.length !== scenes.length) {
          return { ok: false, status: 400, error: `video/render formatAssets[${f}] 需與 scenes 等長` };
        }
      }
    } else if (assets.length !== scenes.length) {
      return { ok: false, status: 400, error: "video/render 需 scenes 與等長 assets" };
    }
    return submitRender(
      scenes.map((s) => ({ id: s.id, narration: s.narration })),
      assets,
      // submitRender 第 3 參數 = outName → 決定 R2 目錄 → object_key → 資產身分。
      // 帶租戶前綴+隨機碼（同 video/pipeline 積木），不再直接送標題。勿與後續位置參數對調。
      buildVideoOutName((ctx.organizationId as string | undefined) ?? null, title),
      undefined,  // baseUrl（用 VIDEO_SERVICE_URL 預設）
      {
        ttsProvider: ctx.ttsProvider as string | undefined,
        ttsVoice: ctx.ttsVoice as string | undefined,
        introTitle: ctx.introTitle as string | undefined,
        introDuration: ctx.introDuration as number | undefined,
        ...(useMulti ? { formats, formatAssets } : {}),
      },
    );
  },
});
