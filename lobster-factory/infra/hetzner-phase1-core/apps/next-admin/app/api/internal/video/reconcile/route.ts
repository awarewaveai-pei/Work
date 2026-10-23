/**
 * POST /api/internal/video/reconcile — 影片孤兒對帳（self-healing sweep）。
 *
 * 觸發：主機 cron `scripts/reconcile-videos.sh` 每 15 分打 127.0.0.1，帶 `x-ops-sync-key: <OPS_PROXY_SHARED_SECRET>`。
 * 掃 R2 video bucket，補缺的 media_assets（使用者生成中關頁 → 沒人輪詢 /status → 影片在 R2 卻沒進畫廊）。
 *
 * 放在 /api/internal：主機 loopback 不是任何產品門，middleware 對 127.0.0.1 只放 `GET /` 與
 * `GET /api/ops/summary`（`middleware.ts` probe door）；舊路徑 /api/video/reconcile 自 2026-10-20 起被 404，
 * 偵測器靜默 3 天。/api/internal 不經 middleware（matcher 排除），所以認證只在本檔，缺 secret 一律 401。
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

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
