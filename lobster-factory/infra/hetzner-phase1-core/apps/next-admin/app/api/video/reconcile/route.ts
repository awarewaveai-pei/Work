/**
 * POST /api/video/reconcile — 影片孤兒對帳（self-healing sweep）。
 *
 * 觸發：SG cron 每 ~15 分，帶 `x-ops-sync-key: <OPS_PROXY_SHARED_SECRET>`（既有 server-to-server
 * 認證；由 middleware 放行，無新增 PUBLIC_API_PATHS）。掃 R2 video bucket，補缺的 media_assets。
 * 處理「使用者生成中關頁 → 沒人輪詢 /status → 影片在 R2 卻沒進畫廊」等任何孤兒。
 */
import { NextResponse } from "next/server";

export async function POST(): Promise<NextResponse> {
  const { reconcileVideos } = await import("@/lib/content/video/reconcile");
  const r = await reconcileVideos();
  return NextResponse.json(r, { status: r.ok ? 200 : 500 });
}
