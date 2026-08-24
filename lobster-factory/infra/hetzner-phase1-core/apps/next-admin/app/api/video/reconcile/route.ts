/**
 * POST /api/video/reconcile — 影片孤兒對帳（self-healing sweep）。
 *
 * 觸發：SG cron 每 ~15 分，帶 `x-ops-sync-key: <OPS_PROXY_SHARED_SECRET>`。
 * 掃 R2 video bucket，補缺的 media_assets（使用者生成中關頁 → 沒人輪詢 /status → 影片在 R2 卻沒進畫廊）。
 *
 * **認證在本 route 自己做，不能依賴 middleware。** 2026-08-25 critic 抓到：本檔原本
 * 零 auth，而 docstring 宣稱「由 middleware 放行」——`middleware.ts:146` 的
 * `hasValidSyncKey()` 是 **exempt（有 key 就跳過 session 檢查）**，不是 require；沒帶 key 時
 * 走一般 session 驗證後照樣執行。等於任何登入帳號（含 viewer、含他租戶的 client）都能
 * ① 觸發跨 org 的 media_assets 寫入 ② 讀回全租戶 R2 影片組數的聚合 ③ 無限次觸發整桶
 * R2 LIST。同一把 secret 的正確寫法見 `app/api/video/cleanup/route.ts`。
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const authKey = req.headers.get("x-ops-sync-key");
  const expected = process.env.OPS_PROXY_SHARED_SECRET;
  if (!expected || !authKey || !timingSafeEqual(authKey, expected)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const { reconcileVideos } = await import("@/lib/content/video/reconcile");
  const r = await reconcileVideos();
  return NextResponse.json(r, { status: r.ok ? 200 : 500 });
}
