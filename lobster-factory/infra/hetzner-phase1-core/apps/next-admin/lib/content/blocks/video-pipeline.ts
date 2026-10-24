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
import { generateVideoScript, reassignSceneVisuals } from "../video/video-script-core";
import { fetchBrollUrl, fetchBrollVideoUrl } from "../video/pexels";
import {
  parseImageDataUrl,
  buildDesignKey,
  putDesignObject,
  deleteDesignObject,
  isR2Configured,
} from "../../storage/r2";
import { submitRender, type RenderOutputMeta, type RenderOutputs, type VideoServiceCapability } from "../video/render-client";
import { generateTarotImage, isTarotModel } from "../../tarot/image-gen";
import { generateVideoMotionBatch, isVideoMotionModel } from "../../tarot/video-motion-gen";
import { grantFor } from "@/lib/entitlements/grant";
import { VIDEO_MOTION_RATES } from "../../ai/cost-model";
import { logImageCost } from "../../ai/log-ai-call";
import { getSupabaseWriteClient } from "../../supabase-server";
import { randomBytes, randomUUID } from "node:crypto";

/**
 * 輸出格式 → 生圖長寬比 + Pexels 取向 + 風格框景詞。
 * 三格式各自「原生」生成的依據：AI 圖按 aspectRatio 生（非裁 16:9）；Pexels B-roll 按 orientation
 * 抓對應方向素材（避免直式格式拿橫片再被裁掉重要部位）。EU 端再以各格式尺寸 cover-fit 填滿。
 * 鍵 = R2/檔名安全字（與 config.py FORMATS + 前端 OUTPUT_LABELS 一致）。
 */
export const FORMAT_SPEC: Record<
  string,
  { aspectRatio: "16:9" | "9:16" | "4:5"; orientation: "landscape" | "portrait"; framing: string }
> = {
  "16x9": { aspectRatio: "16:9", orientation: "landscape", framing: "Wide 16:9 cinematic framing." },
  "9x16": { aspectRatio: "9:16", orientation: "portrait", framing: "Vertical 9:16 full-frame composition, main subject centered." },
  "4x5": { aspectRatio: "4:5", orientation: "portrait", framing: "Vertical 4:5 full-frame composition, main subject centered." },
};
/** 預設輸出全部三格式（前端「全選」對應；未指定時的後備）。 */
export const DEFAULT_VIDEO_FORMATS = ["16x9", "9x16", "4x5"];

/**
 * 一組 render 產出的「主要輸出」挑選順序 —— **單一真相，禁止在呼叫端各自寫 fallback 鏈**。
 *
 * 為何必須共用：`media_assets.object_key` 由主要輸出的 URL 導出（videoObjectKey），所以
 * 這個順序**就是該列的身分**。2026-08-24 Codex 覆審抓到 `/api/video/status` 用
 * `16x9 ?? youtube_linkedin ?? Object.values(outputs)[0]`，而對帳 sweep 用
 * `16x9 ?? youtube_linkedin ?? 9x16 ?? 4x5 ?? Object.values(outputs)[0]` —— 兩條鏈不同。
 * 當一次 render 只選了 ["4x5","9x16"]（normalizeVideoFormats 允許）時兩邊會挑到不同格式、
 * 導出不同 object_key，於是同一支影片變成兩列（複合鍵不再衝突，去重失效）。
 *
 * 也涵蓋 R2 裡歷史存在的全部格式名（對帳掃描共用同一份清單，避免兩邊清單漂移）。
 */
export const PRIMARY_OUTPUT_PRIORITY = [
  "16x9",
  "youtube_linkedin",
  "9x16",
  "4x5",
  "tiktok_reels",
  "instagram_facebook",
  "twitter_reddit_bluesky",
];

/** 依 PRIMARY_OUTPUT_PRIORITY 挑主要輸出 URL；未知格式以**排序後**的鍵當決勝，不用插入順序。 */
export function pickPrimaryOutput(outputs: Record<string, string>): string | undefined {
  for (const fmt of PRIMARY_OUTPUT_PRIORITY) {
    if (outputs[fmt]) return outputs[fmt];
  }
  // 決勝刻意用 sort 而非 Object.values(...)[0]：後者取決於插入／JSON 序列化順序，
  // 正是上面那個「兩邊挑到不同格式」的不確定性來源。
  const rest = Object.keys(outputs).sort();
  return rest.length > 0 ? outputs[rest[0]] : undefined;
}

/** 過濾出合法格式（落在 FORMAT_SPEC）；空 → 後備全三格式。單一 SSOT，避免各路徑各自硬編。 */
export function normalizeVideoFormats(formats?: string[]): string[] {
  const valid = (formats ?? []).filter((f) => f in FORMAT_SPEC);
  return valid.length > 0 ? valid : [...DEFAULT_VIDEO_FORMATS];
}

/**
 * 組出送給 EU 的 `out_name` —— 它決定 R2 目錄，因而決定 `media_assets.object_key`，
 * 因而決定這列資產的身分。**唯一性與租戶前綴必須放在字串最前面。**
 *
 * 為何前置：EU `video-service/pipeline.py:687,718` 會做
 * `re.sub(r"[^\w一-鿿]", "_", out_name)[:40]` —— **只保留前 40 字元**。放在後面的
 * 唯一性會被截掉，等於沒加。（`_` 與十六進位字元都是 `\w`，消毒不會動到前綴。）
 *
 * 為何需要：2026-08-25 之前 out_name 直接是影片標題，於是 object_key =
 * `video/<標題前40字>/<fmt>.mp4` —— 無 uuid、無租戶。後果：兩個租戶用同一個標題時
 * 後者的 R2 物件直接覆寫前者、DB 列互相遮蔽、刪除會誤刪對方的檔案。
 *
 * 格式：`<org 前8碼>_<10 碼隨機>_<標題slug>`，前綴 20 字元（8+1+10+1）+ 標題 20 字元 = 剛好 40。
 * **`noorg_` 分支不是 20 字元而是 17**（`noorg_` 6 + 隨機 10 + `_` 1），總長 37。原註解寫
 * 「前綴固定 20 字元」對該分支不成立（2026-08-25 critic ⑤，2026-08-26 修）。兩者都在 EU
 * `[:40]` 截斷之內，所以唯一性不受影響 —— 差異只在標題可見長度。
 * org 前綴讓對帳 sweep 能從 R2 key 反解出擁有者（不必再猜預設 org）；隨機碼保證同租戶同標題
 * 重複生成不互相覆寫。
 */
export function buildVideoOutName(orgId: string | null, title: string): string {
  // CSPRNG，不是 Math.random()：R2 video bucket 是 public + unsigned（畫廊直接 <video src>），
  // 所以 object key 的不可猜測性就是這支影片唯一的機密性控制。V8 的 Math.random 是 xorshift128+，
  // 可由連續輸出還原內部狀態，而攻擊者能從自己的 /status 回應讀回樣本。同 repo 既有正解：
  // lib/storage/r2.ts buildDesignKey() 用 randomUUID()。（2026-08-25 critic M1）
  const rand = randomBytes(5).toString("hex");
  const slug = (title ?? "").trim().slice(0, 20) || "video";
  if (!orgId) return `noorg_${rand}_${slug}`;
  // .toLowerCase() 不可省：resolveOrgId 的 uuid regex 帶 /i 會放行大寫 uuid，而
  // parseOrgPrefixFromDir 只收 [0-9a-f]。少了它，大寫 org id 產生的每一支新影片都會
  // 被反解成 null → 永久計入 reconcile 的 unattributableByMissingPrefix，看起來像「舊資料
  // backlog」而非新 bug（2026-08-26 前該欄位叫 skippedLegacy）。
  return `${orgId.replace(/-/g, "").toLowerCase().slice(0, 8)}_${rand}_${slug}`;
}

/** 從 R2 目錄名反解租戶前綴（對帳用）。舊格式（無前綴）回 null → 呼叫端必須 fail closed，不得猜。 */
export function parseOrgPrefixFromDir(dir: string): string | null {
  const m = /^([0-9a-f]{8})_[0-9a-f]{10}_/.exec(dir);
  return m ? m[1] : null;
}

/** POD_DESIGNS_DEFAULT_ORG_ID（designs route 同規約）；ctx.organizationId 優先。 */
export function resolveOrgId(ctxOrgId?: string): string | null {
  const v = ctxOrgId ?? process.env.POD_DESIGNS_DEFAULT_ORG_ID ?? null;
  if (!v) return null;
  // 版本/variant nibble 刻意放寬為通用 uuid：原本限 v1-v5 + variant [89ab]，遇到 UUIDv7
  // 之類的 org id 會回 null → out_name 走 noorg_ 分支，但 recordParams 仍帶著那個 org
  // → 同一支影片「DB 歸屬正確、R2 key 無租戶」，兩條路徑各說各話。（2026-08-25 critic M4）
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v : null;
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
  formats?: string[];
  visualBreakdown?: { custom: number; broll: number };
  imageModel?: string;
  source?: "generate" | "draft" | "footage";
  serviceCapability?: VideoServiceCapability;
  outputMeta?: RenderOutputMeta;
  /**
   * True only for the caller that holds the REAL render metadata (/api/video/status,
   * which has recordParams: title, sceneCount, formats, visualBreakdown, imageModel).
   * Such a caller merges on conflict so it can enrich a row that the reconcile sweep
   * already inserted with placeholders (reconcile.ts:83 passes `title: dir,
   * sceneCount: 0` because that is all an R2 listing can know).
   *
   * Gap-fillers leave this false so they can never clobber richer data. Without this
   * split, whichever writer lands first wins permanently: if the user closes the tab
   * and the 15-minute sweep records the row first, the gallery would show the
   * directory name as the title and 0 scenes forever.
   */
  authoritative?: boolean;
}): Promise<{ id: string; checksumSha256?: string } | null> {
  const supabase = getSupabaseWriteClient();
  if (!supabase) return null;
  const objectKey = videoObjectKey(params.primaryUrl);
  const primaryFormat = Object.entries(params.outputs).find(([, url]) => url === params.primaryUrl)?.[0];
  const primaryMeta = primaryFormat ? params.outputMeta?.[primaryFormat] : undefined;
  const checksumSha256 = primaryMeta?.checksumSha256;
  // Upsert arbiter = uq_media_assets_org_backend_key_version (migrations 0011/0038,
  // already live on EU prod). /status poll and reconcile cron can race on the same
  // finished job; conflicting on the full composite makes the second write a no-op.
  //
  // Why the composite and NOT a single-column unique(object_key) — measured on EU prod
  // 2026-08-24, do not "simplify" this back:
  //   * LEGACY rows (everything written before 2026-08-25) have an object_key derived
  //     straight from the video TITLE — `video/<title-slug>/<fmt>.mp4`, no uuid, no org
  //     prefix — so those keys collide across tenants. A global unique(object_key) would
  //     make a second org's row vanish via DO NOTHING while its render still overwrote
  //     the R2 object: cross-tenant data loss. New keys carry an org+random prefix
  //     (buildVideoOutName), but the 142 legacy rows on EU prod do not, and this arbiter
  //     has to stay correct for both.
  //   * It would also kill the version/is_current multi-version model that 0011:49-50
  //     deliberately introduced, and break the 'wp_uploads' backend namespace (0011:41),
  //     whose keys ("2026/08/hero.jpg") collide across sites by nature.
  //   * `version` is intentionally omitted below: it defaults to 1 (0011:49) and defaults
  //     are applied before conflict detection, so the composite arbiter still matches.
  // (A short-lived migration 0060 tried the single-column route and was reverted the same
  //  day: PostgREST emits a bare `ON CONFLICT (object_key)`, which cannot even infer a
  //  PARTIAL unique index — it errors outright rather than deduping. See WORKLOG 2026-08-24.)
  const { error } = await supabase.from("media_assets").upsert(
    {
      organization_id: params.organizationId,
      storage_backend: "r2",
      asset_domain: "ai_generated",
      object_key: objectKey,
      object_url: params.primaryUrl,
      mime_type: "video/mp4",
      byte_size: primaryMeta?.byteSize ?? 0,
      ...(checksumSha256 ? { checksum_sha256: checksumSha256 } : {}),
      is_current: true,
      metadata: {
        title: params.title,
        formats: params.outputs,
        selectedFormats: params.formats ?? Object.keys(params.outputs),
        formatCount: Object.keys(params.outputs).length,
        sceneCount: params.sceneCount,
        visualBreakdown: params.visualBreakdown,
        imageModel: params.imageModel,
        source: params.source,
        serviceCapability: params.serviceCapability,
        outputMeta: params.outputMeta,
        renderedAt: new Date().toISOString(),
      },
    },
    {
      onConflict: "organization_id,storage_backend,object_key,version",
      // Authoritative writer merges (DO UPDATE) to enrich placeholder rows;
      // gap-fillers ignore (DO NOTHING) so they never overwrite richer data.
      ignoreDuplicates: !params.authoritative,
    },
  );
  if (error) {
    console.warn("[video-pipeline] media_assets upsert failed (best-effort):", error.message);
    return null;
  }
  const row = await supabase
    .from("media_assets")
    .select("id, checksum_sha256")
    .eq("organization_id", params.organizationId)
    .eq("storage_backend", "r2")
    .eq("object_key", objectKey)
    .eq("version", 1)
    .maybeSingle();
  if (row.error || !row.data) {
    if (row.error) console.warn("[video-pipeline] media_assets lookup failed (best-effort):", row.error.message);
    return null;
  }
  return { id: String(row.data.id), checksumSha256: row.data.checksum_sha256 ? String(row.data.checksum_sha256) : undefined };
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
  formats: string[];
  visualBreakdown: { custom: number; broll: number };
  imageModel?: string;
  serviceCapability?: VideoServiceCapability;
}
type VideoPipelineResult = VideoPipelinePending | { ok: false; status: number; error: string };

type AssetResult =
  // bytes/mime 只在 Flux/reference 生圖路徑填（Pexels 路徑無本地 buffer）；
  // 供 story-bibles/generate-portrait 直接註冊 media_assets，不必回抓 R2 算 checksum。
  | { ok: true; asset: string; r2Key?: string; bytes?: Buffer; mime?: string }
  | { ok: false; status: number; error: string };

/** 草稿生成結果：腳本 + 每格式圖片 URL，不含渲染（供 /api/video/draft 使用）。 */
export interface PreparedScenes {
  ok: true;
  scenes: import("../video/video-script-core").VideoScene[];
  /** 每格式一組素材 URL（與 scenes 等長）；key ∈ formats。每格式原生比例，非裁同一張。 */
  formatAssets: Record<string, string[]>;
  /** 實際輸出的格式（已 normalize；前端勾選的子集或全三格式）。 */
  formats: string[];
  r2Keys: string[];
  title: string;
}

/**
 * 生成單一場景的素材（Pexels 影片/照片 或 Flux AI 圖 → R2）。
 * 供 prepareScenes 批次呼叫，及 /api/video/regenerate-image 單張重生重用（單一 SSOT，避免邏輯重複）。
 */
export async function buildSceneAsset(
  scene: Pick<import("../video/video-script-core").VideoScene, "id" | "image_prompt" | "broll_keyword" | "visual">,
  opts: {
    imageModel?: string;
    visualStyle?: string;
    /** 目標長寬比（AI 生圖用）；省略 = 16:9（向後相容）。 */
    aspectRatio?: "16:9" | "9:16" | "4:5";
    /** Pexels 取向（B-roll 用）；省略 = landscape。 */
    orientation?: "landscape" | "portrait";
    /** 風格框景詞（接在 visualStyle 後）；省略 = 16:9 寬框。 */
    framing?: string;
    /**
     * Story Bible 角色定裝照 URL——提供時（且非 Pexels 路徑）強制改用支援 reference image
     * 的模型（flux-kontext-dev，$0.045/張——同樣支援 input_image 的 flux-kontext-pro 是 $0.10/張，
     * 兩者 buildInput 邏輯完全相同，操作者要求「盡量用最便宜的模型」故選 dev），忽略
     * opts.imageModel/fluxModel 的一般選型，換取跨場景角色一致性。
     */
    referenceImageUrl?: string;
  },
): Promise<AssetResult> {
  const pexelsKey = process.env.PEXELS_API_KEY as string | undefined;
  const orientation = opts.orientation ?? "landscape";
  const forcePexelsVideo = opts.imageModel === "pexels-video";
  const forcePexels = opts.imageModel === "pexels-all";
  const fluxModel = (!opts.imageModel || opts.imageModel === "pexels-all" || opts.imageModel === "pexels-video") ? "flux-schnell" : opts.imageModel;

  // pexels-video 模式：抓 Pexels 影片片段（MP4 URL → EU stream_loop）
  if (forcePexelsVideo && pexelsKey) {
    const keyword = scene.broll_keyword || scene.image_prompt.split(" ").slice(0, 3).join(" ");
    const videoUrl = await fetchBrollVideoUrl(keyword, pexelsKey, undefined, orientation);
    if (videoUrl) return { ok: true, asset: videoUrl };
    // 影片抓失敗 → 降級 Pexels 照片（EU zoompan 仍可出片）
    const photoUrl = await fetchBrollUrl(keyword, pexelsKey, undefined, orientation);
    if (photoUrl) return { ok: true, asset: photoUrl };
    return { ok: false, status: 502, error: `場景 ${scene.id} Pexels 影片與照片均搜尋失敗（keyword: ${keyword}）` };
  }
  // Pexels 照片路徑：明確選 pexels-all（全部場景），或 Claude 判定為 broll 場景
  if ((forcePexels || scene.visual === "broll") && pexelsKey) {
    const keyword = scene.broll_keyword || scene.image_prompt.split(" ").slice(0, 3).join(" ");
    const brollUrl = await fetchBrollUrl(keyword, pexelsKey, undefined, orientation);
    if (brollUrl) return { ok: true, asset: brollUrl };
    // pexels-all 模式：Pexels 抓失敗 → 不 fallback Flux（避免非預期費用）
    if (forcePexels) return { ok: false, status: 502, error: `場景 ${scene.id} Pexels 搜圖失敗（keyword: ${keyword}）` };
  }
  if (!isR2Configured()) return { ok: false, status: 503, error: "R2 未設定（跨機影片素材需 R2 暫存 Flux 圖）" };
  // 風格前綴：使用者選了風格 → 用該風格（已含材質/光線/色盤）+ 該格式框景；否則用 cinematic 預設。
  // framing/aspectRatio 依目標格式（16:9 寬框 / 9:16・4:5 直式置中）→ 每格式原生構圖，非裁 16:9。
  const aspectRatio = opts.aspectRatio ?? "16:9";
  const framing = opts.framing ?? "Wide 16:9 cinematic framing.";
  const stylePrefix = opts.visualStyle?.trim()
    ? `${opts.visualStyle.trim()} ${framing}`
    : `Cinematic realistic photography, dramatic natural lighting, rich color grade. ${framing}`;
  const styledPrompt = `${stylePrefix} ${scene.image_prompt}`;
  // 有角色定裝照 → 強制走 reference-conditioned 模型（忽略一般選型），換角色跨場景一致性；
  // 沒有就照原本選型（使用者選的模型或預設 flux-schnell）。
  const referenceImageUrl = opts.referenceImageUrl?.trim() || undefined;
  const safeModel = referenceImageUrl ? "flux-kontext-dev" : (isTarotModel(fluxModel) ? fluxModel : "flux-schnell");
  const img = await generateTarotImage({
    model: safeModel,
    prompt: styledPrompt,
    aspectRatio,
    referenceImages: referenceImageUrl ? [referenceImageUrl] : undefined,
    costLog: { route: "video/scene-image", tool: "video" },
  }, await grantFor("video.image"));
  if (img.ok === false) return { ok: false, status: 502, error: `場景 ${scene.id} 圖片生成失敗：${img.error}` };
  const parsed = parseImageDataUrl(img.image);
  const key = parsed ? buildDesignKey(parsed.mime) : null;
  if (!parsed || !key) return { ok: false, status: 502, error: `場景 ${scene.id} 圖片格式無法解析` };
  const put = await putDesignObject(key, parsed.buffer, parsed.mime);
  if (!put.ok) return { ok: false, status: 502, error: `場景 ${scene.id} 圖片上傳 R2 失敗：${"error" in put ? put.error : "r2_put_failed"}` };
  return { ok: true, asset: put.publicUrl, r2Key: key, bytes: parsed.buffer, mime: parsed.mime };
}

/**
 * AI 影片動態後製：把主格式已生成的靜態圖再過一次 image-to-video。獨立於 buildSceneAsset 之外
 * （不是每個場景各自 inline 呼叫）是刻意設計——critic 2026-09-12 抓到的真實問題：inline 版本讓
 * 「每場景 × 每個動態相容格式(16:9/9:16)」各自序列疊加等待，一次請求可能疊出 >nginx 300s
 * proxy_read_timeout，逾時後使用者重試會讓已經在跑、會計費的 Replicate 呼叫變成雙重收費。
 * 這裡改成：只對主格式（formats[0]）套用、只取前 MAX_MOTION_SCENES 個自訂場景、且
 * MAX_MOTION_SCENES === generateVideoMotionBatch 的併發上限 → 保證這批呼叫一次全部併發送出、
 * 一輪等完，總耗時 ≈ 單次生成時間（≤280s 內部逾時），不會隨場景數疊加。
 * 失敗/超額的場景一律靜默維持原本靜態圖（動態是加分特效，不是必要條件）。
 */
const MAX_MOTION_SCENES = 3; // 必須 <= generateVideoMotionBatch 的併發上限，見上方註解
export async function applyVideoMotionToPrimaryFormat(
  scenes: Pick<import("../video/video-script-core").VideoScene, "id" | "image_prompt" | "visual">[],
  formatAssets: Record<string, string[]>,
  primaryFormat: string,
  primaryAspectRatio: "16:9" | "9:16" | "4:5",
  motionModel: string,
): Promise<{ motionAppliedCount: number; r2Keys: string[] }> {
  if (primaryAspectRatio !== "16:9" && primaryAspectRatio !== "9:16") {
    console.warn(`[video-pipeline] motion requested but primary format ${primaryFormat} is 4:5 (unsupported by all 3 vendors) — all scenes stay static`);
    return { motionAppliedCount: 0, r2Keys: [] };
  }
  if (!isVideoMotionModel(motionModel)) return { motionAppliedCount: 0, r2Keys: [] };
  const assets = formatAssets[primaryFormat];
  if (!assets) return { motionAppliedCount: 0, r2Keys: [] };

  const eligible = scenes
    .map((s, i) => ({ s, i }))
    .filter(({ s, i }) => s.visual !== "broll" && assets[i]) // broll 場景走真實影片，不需要也不該套 AI 動態
    .slice(0, MAX_MOTION_SCENES);
  if (eligible.length === 0) return { motionAppliedCount: 0, r2Keys: [] };

  const jobs = eligible.map(({ s, i }) => ({
    imageUrl: assets[i],
    // 2026-09-12 真實測試發現："Subtle" 這個字讓 Runway 選了幾乎看不出來的慢速鏡頭飄移，操作者
    // 直接比對三個時間點截圖後回報「看起來像照片」。拿掉 Subtle，改成明確要求主體本身有動作
    // （不只是運鏡飄移），讓生成結果更像操作者要的「真的像電影」而非過去 Ken Burns 那種死氣沉沉。
    motionPrompt: `${s.image_prompt}. The subject moves naturally and visibly (gesture, expression, or action) — not just a slow camera drift. Cinematic camera movement.`,
    aspectRatio: primaryAspectRatio as "16:9" | "9:16",
  }));
  const results = await generateVideoMotionBatch(await grantFor("video.motion"), motionModel, jobs);

  // 這批（同一支影片、最多 MAX_MOTION_SCENES 個場景）共用一個關聯 id，讓 /ops/costs「⑤ 流水帳」
  // 能把同一支影片的多筆動態收費歸成一組，而非各自散落、事後對不回是哪支影片花的（critic 2026-09-12）。
  // 必須是合法 UUID：`ai_call_logs.job_id` 欄位是 Postgres uuid 型別，PostgREST 對非 UUID 字串回
  // 400（22P02 invalid input syntax for type uuid），而 logImageCost 是 fire-and-forget 全吞錯誤
  // ——這代表插入整列失敗、真實花費完全沒進流水帳，且不會有任何錯誤浮現。第一版用
  // `randomBytes(8).toString("hex")`（16 碼十六進位、非 UUID 格式）就是這樣悄悄壞掉，2026-09-12
  // 對 production 跑真實 Runway 測試時才用真的 DB insert 撞出來（curl 重現：22P02）。改用
  // `randomUUID()` 從根本避免這整類「格式不合法→靜默吞錯→數字看起來正常其實是全空」的錯誤。
  const motionBatchJobId = randomUUID();
  const r2Keys: string[] = [];
  let motionAppliedCount = 0;
  for (let k = 0; k < results.length; k++) {
    const r = results[k];
    const { i } = eligible[k];
    if (!r.ok) {
      console.error(`[video-pipeline] scene ${scenes[i].id} motion generation failed, keeping static image:`, "error" in r ? r.error : "unknown_error");
      continue;
    }
    // 記真實花費到 ai_call_logs（/ops/costs 讀這張表）——沿用 tarot/studio 既有的單一慣例
    // （每筆真實付費呼叫成功後 fire-and-forget 記一筆，見 log-ai-call.ts 呼叫端清單)。
    // 刻意放在 r.ok 確認的當下就記，不等後面 buildDesignKey/putDesignObject 的結果：Replicate
    // 在 r.ok===true 那刻就已經收費，之後 mime 辨識失敗或 R2 上傳失敗都只是「片子沒留住」，
    // 不代表「沒被收費」——放在那些 continue 分支之後會讓真實花費在 infra 不穩時悄悄漏記
    // （critic 2026-09-12 抓到：漏記剛好發生在最該被看見的時候）。
    // 本函式只在 prepareScenes 呼叫一次、prepareScenes 本身每支影片的草稿→渲染流程只會跑一次
    // （見 render-draft 直接吃已生成的 formatImageUrls、不重跑 prepareScenes）——log 呼叫次數
    // = 真實收費次數，不會多記也不會漏記。
    const rate = VIDEO_MOTION_RATES[motionModel];
    if (rate) {
      void logImageCost({
        route: "video/motion",
        model: motionModel,
        vendor: rate.vendor,
        costUsd: rate.usdPerSec * rate.defaultDurationSec,
        jobId: motionBatchJobId,
        tool: "video",
        kind: "video",
      });
    } else {
      console.error(`[video-pipeline] scene ${scenes[i].id} motion billed but no VIDEO_MOTION_RATES entry for "${motionModel}" — cost NOT logged`);
    }
    const videoKey = buildDesignKey(r.mime);
    if (!videoKey) {
      console.error(`[video-pipeline] scene ${scenes[i].id} motion output has unrecognized mime, keeping static image:`, r.mime);
      continue;
    }
    const put = await putDesignObject(videoKey, r.buffer, r.mime);
    if (!put.ok) {
      console.error(`[video-pipeline] scene ${scenes[i].id} motion R2 upload failed, keeping static image:`, "error" in put ? put.error : "r2_put_failed");
      continue;
    }
    assets[i] = put.publicUrl;
    r2Keys.push(videoKey);
    motionAppliedCount++;
  }
  return { motionAppliedCount, r2Keys };
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
    /**
     * 生圖來源 / 模型。
     * "pexels-video" → 全部場景用 Pexels 真實影片片段（$0，不需 R2，EU stream_loop）。
     * "pexels-all"   → 全部場景用 Pexels 免費照片（$0，不需 R2）。
     * 其他字串       → 傳給 Flux 作為 model ID（如 "flux-schnell"、"flux-dev"）。
     * 省略           → 依 scene.visual 決定（broll=Pexels 照片，custom=flux-schnell）。
     */
    imageModel?: string;
    /** 目標影片時長（分鐘）→ 控制場景數與旁白字數。1=6場景, 3=8場景, 5=10場景。 */
    targetMinutes?: number;
    /** 明確場景數（前端「場景總數」滑桿）→ 覆蓋 targetMinutes 推導的場景數。僅 Claude 生腳本路徑有效；providedScenes 路徑場景數由腳本決定。 */
    sceneCount?: number;
    /** 站別品牌語氣（renderSiteVoice）；只有 Claude 生腳本路徑使用。 */
    brandVoice?: string;
    /** 「自訂 AI 圖」數量（前端滑桿）→ 用 Flux AI 圖的場景數，其餘走 Pexels B-roll。僅 AI 生圖模式 + Claude 生腳本路徑有效。 */
    customScenes?: number;
    /** 要輸出的格式（["16x9","9x16","4x5"] 子集）→ 每格式各生一組原生圖。省略 = 全三格式。 */
    formats?: string[];
    /** AI 影片動態模型 id（選填）；套用到全部 custom 場景（4x5 格式與 broll 場景不受影響）。 */
    videoMotionModel?: string;
    /** 深層接力：前製腳本已寫好的場景（台詞+畫面）→ 跳過 Claude 重生，直接用這些。 */
    providedScenes?: {
      narration: string;
      imagePrompt: string;
      visual?: "custom" | "broll";
      brollKeyword?: string;
      /** Story Bible 角色定裝照 URL（該場景登場角色已有參考照時）。 */
      referenceImageUrl?: string;
    }[];
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
      broll_keyword: (s.brollKeyword || "").trim(),
      visual: s.visual === "broll" ? "broll" as const : "custom" as const,
      reference_image_url: s.referenceImageUrl?.trim() || undefined,
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
        targetMinutes: input.targetMinutes,
        sceneCount: input.sceneCount,
        brandVoice: input.brandVoice,
      },
      anthropicKey,
    );
    if (!scriptResult.ok) return scriptResult as { ok: false; status: number; error: string };
    scenes = scriptResult.scenes;
    title = scriptResult.title;
  }

  const forcePexelsVideo = input.imageModel === "pexels-video";
  const forcePexels = input.imageModel === "pexels-all";

  // 「自訂 AI 圖」數量：依 customScenes 重新指派 scene.visual，使「Flux AI 圖」場景數恰為 customScenes、其餘走 Pexels B-roll。
  // 僅 AI 生圖模式套用（pexels-video/pexels-all 素材來源固定；接力 providedScenes 由前製腳本決定，全 custom，不動）。
  const isRelay = !!(input.providedScenes && input.providedScenes.length > 0);
  if (typeof input.customScenes === "number" && !forcePexels && !forcePexelsVideo && !isRelay) {
    reassignSceneVisuals(scenes, input.customScenes);
  }

  const formats = normalizeVideoFormats(input.formats);
  input.onProgress?.(`素材生成中（${scenes.length} 場景 × ${formats.length} 比例）…`);

  // 每格式各生一組原生素材。格式維度序列、場景維度並行 → 控並行數（避免一次 N×格式 張同時打 Replicate
  // 撞 429）；AI 圖按 aspectRatio 原生生、B-roll 按 orientation 抓對應方向，皆非裁同一張。
  const formatAssets: Record<string, string[]> = {};
  const r2Keys: string[] = [];
  for (const fmt of formats) {
    const spec = FORMAT_SPEC[fmt];
    const results = await Promise.all(
      scenes.map((s) =>
        buildSceneAsset(s, {
          imageModel: input.imageModel,
          visualStyle: input.visualStyle,
          aspectRatio: spec.aspectRatio,
          orientation: spec.orientation,
          framing: spec.framing,
          referenceImageUrl: s.reference_image_url,
        }),
      ),
    );
    r2Keys.push(...results.flatMap((r) => (r.ok && r.r2Key ? [r.r2Key] : [])));
    const failed = results.find((r): r is { ok: false; status: number; error: string } => !r.ok);
    if (failed) {
      await cleanupVideoInputKeys(r2Keys); // 任一格式任一場景失敗 → 清掉本輪所有格式已上傳的暫存圖
      return failed;
    }
    formatAssets[fmt] = results.map((r) => (r as { ok: true; asset: string }).asset);
  }

  // AI 影片動態：僅主格式（formats[0]）+ 前 MAX_MOTION_SCENES 個自訂場景，見 applyVideoMotionToPrimaryFormat
  // 註解——刻意不對每格式都套，避免多格式疊加把單次請求的總耗時推過 nginx proxy_read_timeout 300s。
  if (input.videoMotionModel && formats.length > 0) {
    const primaryFmt = formats[0];
    const motionResult = await applyVideoMotionToPrimaryFormat(
      scenes, formatAssets, primaryFmt, FORMAT_SPEC[primaryFmt].aspectRatio, input.videoMotionModel,
    );
    r2Keys.push(...motionResult.r2Keys);
    input.onProgress?.(`AI 影片動態：${motionResult.motionAppliedCount} 個場景套用成功`);
  }

  return { ok: true, scenes, formatAssets, formats, r2Keys, title };
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
        imageModel: ctx.imageModel as string | undefined,
        // sceneCount / customScenes 從 generate/content 路徑 forward（D 接線後 generate route + ContentStudio
        // 已連同 sceneCount 一起傳 → total/custom/成本一致，不再分歧）。
        sceneCount: ctx.sceneCount as number | undefined,
        customScenes: ctx.customScenes as number | undefined,
        formats: ctx.outputFormats as string[] | undefined,
        videoMotionModel: ctx.videoMotionModel as string | undefined,
        brandVoice: ctx.brandVoice as string | undefined,
        onProgress,
      },
      anthropicKey,
    );
    if (!prep.ok) return prep as { ok: false; status: number; error: string };
    const { scenes, formatAssets, formats, r2Keys, title } = prep;

    // 3) 提交 EU（短請求，不等渲染）→ 回 euJobId。渲染在 EU thread 跑，由 /status 輪詢收尾。
    onProgress?.("提交合成任務（EU 伺服器）…");
    const sub = await submitRender(
      scenes.map((s) => ({ id: s.id, narration: s.narration })),
      [], // 多格式走 formatAssets（下方 opts）；位置參數 assets 忽略
      // out_name 決定 R2 目錄 → object_key → 這列資產的身分。帶租戶前綴+隨機碼，
      // 不再直接送標題（見 buildVideoOutName 註解的跨租戶覆寫案例）。
      buildVideoOutName((ctx.organizationId as string | undefined) ?? null, title),
      undefined,
      {
        ttsProvider: ctx.ttsProvider as string | undefined,
        ttsVoice: ctx.ttsVoice as string | undefined,
        introTitle: ctx.introTitle as string | undefined,
        introDuration: ctx.introDuration as number | undefined,
        formats,
        formatAssets,
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
    const visualBreakdown = scenes.reduce(
      (acc, scene) => {
        if (scene.visual === "broll") acc.broll += 1;
        else acc.custom += 1;
        return acc;
      },
      { custom: 0, broll: 0 },
    );
    return {
      ok: true,
      pending: true,
      euJobId: sub.jobId,
      r2Keys,
      title,
      sceneCount: scenes.length,
      formats,
      visualBreakdown,
      imageModel: ctx.imageModel as string | undefined,
      serviceCapability: sub.serviceCapability,
    };
  },
});
