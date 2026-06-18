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
import {
  parseImageDataUrl,
  buildDesignKey,
  putDesignObject,
  deleteDesignObject,
  isR2Configured,
} from "../../storage/r2";
import { callRenderService, type RenderOutputs } from "../video/render-client";
import { generateTarotImage } from "../../tarot/image-gen";
import { getSupabaseWriteClient } from "../../supabase-server";

/** POD_DESIGNS_DEFAULT_ORG_ID を使って組織 ID を解決（designs route と同じ規約）。 */
function defaultOrganizationId(): string | null {
  return process.env.POD_DESIGNS_DEFAULT_ORG_ID ?? null;
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

/** ベストエフォート：renders 成功後に media_assets 行を 1 件挿入する。
 *  失敗してもレンダー成功結果は返す（try/catch 必須）。*/
async function recordVideoAsset(params: {
  organizationId: string;
  primaryUrl: string;
  outputs: RenderOutputs;
  title: string;
  sceneCount: number;
}): Promise<void> {
  const supabase = getSupabaseWriteClient();
  if (!supabase) return; // Supabase 未設定 → skip（best-effort）

  // object_key: URL から "video/..." パスを抽出できれば使う、できなければ主 URL そのまま
  let objectKey: string;
  try {
    const u = new URL(params.primaryUrl);
    // pathname は "/video/<dir>/<fmt>.mp4" → 先頭 "/" を取る
    objectKey = u.pathname.replace(/^\//, "") || params.primaryUrl;
  } catch {
    objectKey = params.primaryUrl;
  }

  // asset_domain 用允許值 "ai_generated"（DB CHECK 不含 ai_video）；圖片/影片以 mime_type 區分。
  const { error } = await supabase.from("media_assets").insert({
    organization_id: params.organizationId,
    storage_backend: "r2",
    asset_domain: "ai_generated",
    object_key: objectKey,
    object_url: params.primaryUrl,
    mime_type: "video/mp4",
    byte_size: 0,
    is_current: true,
    metadata: {
      title: params.title,
      formats: params.outputs,
      sceneCount: params.sceneCount,
    },
  });

  if (error) {
    console.warn("[video-pipeline] media_assets insert failed (best-effort):", error.message);
  }
}

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
    // 跨機（next-admin SG → video-service EU）：素材必須是 https URL 供服務下載。
    // Pexels 本就是 URL；Flux 回 data URL → 上傳 R2 取得 public URL（render 後刪）。
    const pexelsKey = process.env.PEXELS_API_KEY as string | undefined;
    const assets: string[] = [];
    const r2Keys: string[] = []; // 本輪上傳的 Flux 輸入物件 → render 後於 finally 刪除

    try {
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

        // 需要生 Flux 圖 → 必須有 R2 才能把圖交給跨機服務
        if (!isR2Configured()) {
          return { ok: false, status: 503, error: "R2 未設定（跨機影片素材需 R2 暫存 Flux 圖）" };
        }

        // Flux 靜態圖（16:9 橫幅，適合影片）
        const imgResult = await generateTarotImage({
          model: "flux-schnell",
          prompt: scene.image_prompt,
          aspectRatio: "16:9",
        });
        if (imgResult.ok === false) {
          return { ok: false, status: 502, error: `場景 ${scene.id} 圖片生成失敗：${imgResult.error}` };
        }

        // Flux data URL → 解碼 → 上傳 R2 → 取 public URL（供 EU 服務下載）
        const parsed = parseImageDataUrl(imgResult.image);
        const key = parsed ? buildDesignKey(parsed.mime) : null;
        if (!parsed || !key) {
          return { ok: false, status: 502, error: `場景 ${scene.id} 圖片格式無法解析` };
        }
        const put = await putDesignObject(key, parsed.buffer, parsed.mime);
        if (!put.ok) {
          const msg = "error" in put ? put.error : "r2_put_failed";
          return { ok: false, status: 502, error: `場景 ${scene.id} 圖片上傳 R2 失敗：${msg}` };
        }
        r2Keys.push(key);
        assets.push(put.publicUrl);
      }

      // ── 5. 呼叫 Python render 服務 ──────────────────────────────────────────
      const renderResult = await callRenderService(
        scenes.map((s) => ({ id: s.id, narration: s.narration })),
        assets,
        title
      );

      if (!renderResult.ok) return renderResult as { ok: false; status: number; error: string };

      // ── 6. ベストエフォートで media_assets に記録（R2 モードかつ https URL の場合のみ）──
      const primaryUrl = renderResult.outputs["youtube_linkedin"] ?? Object.values(renderResult.outputs)[0];
      if (primaryUrl && primaryUrl.startsWith("https://")) {
        const orgId = (ctx.organizationId as string | undefined) ?? defaultOrganizationId();
        if (orgId && isUuid(orgId)) {
          try {
            await recordVideoAsset({
              organizationId: orgId,
              primaryUrl,
              outputs: renderResult.outputs,
              title,
              sceneCount: scenes.length,
            });
          } catch (e) {
            console.warn("[video-pipeline] recordVideoAsset threw (best-effort):", e);
          }
        }
      }

      return {
        ok: true,
        video: { outputs: renderResult.outputs, out_dir: renderResult.out_dir },
        scenes,
        title,
      };
    } finally {
      // render 已同步消費完輸入素材 → 刪除本輪上傳的 Flux 暫存物件（防 R2 累積）
      for (const key of r2Keys) {
        try {
          await deleteDesignObject(key);
        } catch {
          /* 清理失敗忽略，不影響主結果 */
        }
      }
    }
  },
});
