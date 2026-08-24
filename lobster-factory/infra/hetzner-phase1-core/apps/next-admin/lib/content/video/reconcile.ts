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
import { recordVideoAsset, videoObjectKey, pickPrimaryOutput, parseOrgPrefixFromDir } from "../blocks/video-pipeline";

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
  /** 舊格式 key（無租戶前綴）→ 無法判定擁有者，刻意不補記。非錯誤，但必須可見。 */
  skippedLegacy: number;
  /** 前綴解析不出唯一 org（不存在或撞碼）→ 同樣拒絕猜測。 */
  skippedUnresolved: number;
  error?: string;
}

/** 掃 R2 video bucket → 補缺的 media_assets。idempotent、self-healing。 */
export async function reconcileVideos(): Promise<ReconcileResult> {
  const cfg = r2cfg();
  if (!cfg) return { ok: false, checked: 0, recorded: 0, skippedLegacy: 0, skippedUnresolved: 0, error: "R2 video env 未設定" };
  const supabase = getSupabaseWriteClient();
  if (!supabase) return { ok: false, checked: 0, recorded: 0, skippedLegacy: 0, skippedUnresolved: 0, error: "supabase 未設定" };

  // 租戶來源 = R2 key 自帶的 org 前綴，**不再是 POD_DESIGNS_DEFAULT_ORG_ID**。
  // 舊行為把每個孤兒都記到同一個預設 org：實測 EU prod 有 5 個 org、2 個有 media，
  // 所以那等於把 B 租戶的影片放進 A 租戶的媒體庫（A 看得到、B 永遠沒有自己的列）。
  // R2 key 本來就沒有租戶資訊 —— 這是 buildVideoOutName 要把 org 前綴寫進目錄名的原因。
  const { data: orgRows, error: orgErr } = await supabase.from("organizations").select("id");
  if (orgErr) return { ok: false, checked: 0, recorded: 0, skippedLegacy: 0, skippedUnresolved: 0, error: "organizations 查詢失敗" };
  // 前綴 → org id。撞碼時標記為 null，之後一律拒絕（寧可不補也不記到錯的租戶）。
  const byPrefix = new Map<string, string | null>();
  for (const row of (orgRows ?? []) as { id: string }[]) {
    const pfx = row.id.replace(/-/g, "").slice(0, 8);
    byPrefix.set(pfx, byPrefix.has(pfx) ? null : row.id);
  }

  // 1) 列 R2 物件（分頁）
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const u = new URL(`https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/r2/buckets/${cfg.bucket}/objects`);
    u.searchParams.set("per_page", "1000");
    if (cursor) u.searchParams.set("cursor", cursor);
    const r = await fetch(u.toString(), { headers: { Authorization: `Bearer ${cfg.apiToken}` }, signal: AbortSignal.timeout(30_000) });
    if (!r.ok) return { ok: false, checked: 0, recorded: 0, skippedLegacy: 0, skippedUnresolved: 0, error: `r2_list_${r.status}` };
    const j = (await r.json()) as { result?: { key: string }[]; result_info?: { cursor?: string; is_truncated?: boolean } };
    for (const o of j.result ?? []) keys.push(o.key);
    cursor = j.result_info?.is_truncated ? j.result_info?.cursor : undefined;
  } while (cursor);

  // 2) 依 R2 實際存在的檔案分組（dir = sanitized 標題，fmt = 檔名）。
  //
  // 格式段刻意用 `([^/]+)` 收**任何**格式名，不用已知清單過濾。理由（2026-08-24
  // Codex round 3 抓到）：`/api/video/status` 拿到的是 EU 回傳的原始 `poll.outputs`，
  // 未知格式（例如日後新增的 `1x1`）也會被 pickPrimaryOutput 的排序退路挑中並記錄；
  // 若這裡先用已知清單過濾，同一支影片對 sweep 就是隱形的 —— 兩個呼叫端「共用挑選
  // 函式」但「候選集不同」，等於沒有真正統一。收全部格式後兩邊看到的輸入形狀才一致。
  const FORMAT_SUFFIX_RE = /^video\/(.+)\/([^/]+)\.mp4$/;
  const groups = new Map<string, Record<string, string>>();
  for (const k of keys) {
    const m = FORMAT_SUFFIX_RE.exec(k);
    if (!m) continue;
    const dir = m[1];
    const fmt = m[2];
    let g = groups.get(dir);
    if (!g) { g = {}; groups.set(dir, g); }
    g[fmt] = `${cfg.publicBase}/${k}`;
  }

  // 3) 缺 media_assets 的補上（依 org + object_key 去重 → idempotent）
  let recorded = 0;
  let skippedLegacy = 0;
  let skippedUnresolved = 0;
  for (const [dir, outputs] of groups) {
    // 擁有者只能從 key 反解，解不出就**不補**。這是刻意的 fail-closed：
    // 跨租戶把影片記到錯的人名下，比「暫時沒被自癒」嚴重得多。
    const prefix = parseOrgPrefixFromDir(dir);
    if (!prefix) { skippedLegacy++; continue; }
    const ownerOrgId = byPrefix.get(prefix) ?? null;
    if (!ownerOrgId) { skippedUnresolved++; continue; }
    // 與 /api/video/status 共用同一個挑選函式 —— 兩邊必須導出同一個 object_key，
    // 否則同一支影片會變成兩列（見 pickPrimaryOutput 註解的 2026-08-24 案例）。
    const primary = pickPrimaryOutput(outputs);
    if (!primary) continue;
    // 存在性檢查用與 recordVideoAsset 相同的 object_key 推導（編碼一致 → idempotent）
    const checkKey = videoObjectKey(primary);
    // 存在性檢查必須與 recordVideoAsset 的唯一性域一致（org + object_key）。
    // 只用 object_key 查會讓「另一個租戶剛好有同名 key」的列擋掉本租戶的補記。
    const { data, error } = await supabase
      .from("media_assets")
      .select("id")
      .eq("object_key", checkKey)
      .eq("organization_id", ownerOrgId)
      .limit(1);
    if (error) continue;            // 查詢失敗 → 跳過本筆，下輪再試
    if (data && data.length > 0) continue; // 已記錄
    try {
      await recordVideoAsset({ organizationId: ownerOrgId, primaryUrl: primary, outputs, title: dir, sceneCount: 0 });
      recorded++;
    } catch {
      /* best-effort：下輪再補 */
    }
  }
  return { ok: true, checked: groups.size, recorded, skippedLegacy, skippedUnresolved };
}
