/**
 * reconcile.ts — 影片孤兒對帳（self-healing）。
 *
 * 為何存在：影片完成的「記錄媒體庫」目前由 /status 在使用者輪詢時觸發；若使用者在生成中
 * 關閉/離開頁面 → 沒人輪詢 → EU 算完寫了 R2，但 media_assets 沒記 → 影片成孤兒（在 R2 卻
 * 不在畫廊）。本對帳定期掃 R2 video bucket，把缺 media_assets 的補上 → 自癒**任何**孤兒成因
 * （關頁 / 容器重啟 / 漏記）。idempotent（依 object_key 去重）；由 SG cron 每 ~15 分觸發。
 *
 * 零新攻擊面：不開新對外端點機制（/api/video/reconcile 走既有 x-ops-sync-key middleware 閘）；
 * 不加 EU↔SG 反向耦合（不在 EU 放任何 SG 憑證）；重用 recordVideoAsset（記錄邏輯單一真相）。
 */
import { getSupabaseWriteClient } from "../../supabase-server";
import { recordVideoAsset, resolveOrgId, videoObjectKey } from "../blocks/video-pipeline";

const OUTPUT_FORMATS = ["youtube_linkedin", "tiktok_reels", "instagram_facebook", "twitter_reddit_bluesky"];

function r2cfg(): { apiToken: string; accountId: string; bucket: string; publicBase: string } | null {
  const apiToken = process.env.R2_API_TOKEN;
  const accountId = process.env.R2_ACCOUNT_ID;
  const bucket = process.env.R2_VIDEO_BUCKET ?? "lobster-videos";
  const publicBase = (process.env.R2_VIDEO_PUBLIC_BASE ?? "").replace(/\/$/, "");
  if (!apiToken || !accountId || !publicBase) return null;
  return { apiToken, accountId, bucket, publicBase };
}

export interface ReconcileResult {
  ok: boolean;
  checked: number;   // R2 內偵測到的影片組數
  recorded: number;  // 本次補記的孤兒數
  error?: string;
}

/** 掃 R2 video bucket → 補缺的 media_assets。idempotent、self-healing。 */
export async function reconcileVideos(): Promise<ReconcileResult> {
  const cfg = r2cfg();
  if (!cfg) return { ok: false, checked: 0, recorded: 0, error: "R2 video env 未設定" };
  const supabase = getSupabaseWriteClient();
  if (!supabase) return { ok: false, checked: 0, recorded: 0, error: "supabase 未設定" };
  const orgId = resolveOrgId();
  if (!orgId) return { ok: false, checked: 0, recorded: 0, error: "org id 未設定" };

  // 1) 列 R2 物件（分頁）
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const u = new URL(`https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/r2/buckets/${cfg.bucket}/objects`);
    u.searchParams.set("per_page", "1000");
    if (cursor) u.searchParams.set("cursor", cursor);
    const r = await fetch(u.toString(), { headers: { Authorization: `Bearer ${cfg.apiToken}` }, signal: AbortSignal.timeout(30_000) });
    if (!r.ok) return { ok: false, checked: 0, recorded: 0, error: `r2_list_${r.status}` };
    const j = (await r.json()) as { result?: { key: string }[]; result_info?: { cursor?: string; is_truncated?: boolean } };
    for (const o of j.result ?? []) keys.push(o.key);
    cursor = j.result_info?.is_truncated ? j.result_info?.cursor : undefined;
  } while (cursor);

  // 2) 找出有 youtube_linkedin.mp4 的影片組（dir = sanitized 標題）
  const dirs = new Set<string>();
  for (const k of keys) {
    const m = /^video\/(.+)\/youtube_linkedin\.mp4$/.exec(k);
    if (m) dirs.add(m[1]);
  }

  // 3) 缺 media_assets 的補上（依 object_key 去重 → idempotent）
  let recorded = 0;
  for (const dir of dirs) {
    const primaryKey = `video/${dir}/youtube_linkedin.mp4`;
    const { data, error } = await supabase.from("media_assets").select("id").eq("object_key", primaryKey).limit(1);
    if (error) continue;            // 查詢失敗 → 跳過本筆，下輪再試
    if (data && data.length > 0) continue; // 已記錄
    const outputs: Record<string, string> = {};
    for (const fmt of OUTPUT_FORMATS) {
      if (keys.includes(`video/${dir}/${fmt}.mp4`)) outputs[fmt] = `${cfg.publicBase}/video/${dir}/${fmt}.mp4`;
    }
    if (!outputs["youtube_linkedin"]) continue;
    try {
      await recordVideoAsset({ organizationId: orgId, primaryUrl: outputs["youtube_linkedin"], outputs, title: dir, sceneCount: 0 });
      recorded++;
    } catch {
      /* best-effort：下輪再補 */
    }
  }
  return { ok: true, checked: dirs.size, recorded };
}
