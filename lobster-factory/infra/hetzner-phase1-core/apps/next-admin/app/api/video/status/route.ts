/**
 * POST /api/video/status?jobId=<id>
 *
 * 前端輪詢。每次呼叫：若 job running 且有 euJobId → 查 EU /job 一次（短請求）。
 *   - EU running → 回 running
 *   - EU done    → **此刻**記錄 media_assets（best-effort）+ 清 R2 暫存 + 標記 job done → 回 done+video
 *   - EU error   → 標記 job error → 回 error
 * 收尾全在這個快速請求內完成 → 不依賴任何背景工作（繞開 Next.js 背景限制）。
 *
 * 授權兩層：① 角色閘 canCreateAiImageJob（viewer 擋掉）② 租戶閘 assertOrgAccess，讀 job 之後
 * 立刻執行、在任何回傳資料的分支之前（見下方註解）。
 *
 * T20: was GET -- moved to POST. The "done"/"error" branches finalize the job (media_assets
 * insert, R2 cleanup, job-store write); a GET must never risk a side effect (SameSite=Lax cookie
 * + <img>/<script> can force a same-site page to send an authenticated GET; the CSRF guard only
 * covers non-GET). No GET is exported here any more -- Next.js answers a GET to this route 405.
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { finalizeVideoJob } from "@/lib/content/video/finalize";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const jobId = new URL(req.url).searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ ok: false, error: "jobId is required" }, { status: 400 });
  }

  const { getJob } = await import("@/lib/content/video/job-store");
  const job = await getJob(jobId);
  if (!job) {
    return NextResponse.json({ ok: false, error: "job_not_found" }, { status: 404 });
  }

  // ── 租戶閘 ──────────────────────────────────────────────────────────────────
  // 位置很重要：必須在**第一個回傳資料的分支之前**。下面 :status==="done" 那支直接回
  // job.video（該次 render 全部格式的 R2 URL）+ title —— 那是本 route 最有價值的外洩點，
  // 而且它會在走到下方 recordVideoAsset 之前就 return。原始 finding 寫「在 recordVideoAsset
  // 之前補」，照那個位置補出來的是一道**對已完成 job 完全無效**的假閘（2026-08-26 覆核）。
  //
  // 讀 job.organizationId（createJob 建立列時寫定）而**不是** job.recordParams?.organizationId：
  // recordParams 在 prepare 失敗時根本不存在（generate/route.ts:142、:168），拿它當依據會讓
  // client 對自己失敗的 render 永久 403，連錯誤訊息都拿不到。所有權必須獨立於 record payload。
  //
  // organizationId 為 null 的情況：① 本 migration（0060）之前建立的舊列 ② staff 且
  // POD_DESIGNS_DEFAULT_ORG_ID 未設。①**不會自動隨時間消失** —— 1h TTL 的清理只在
  // createJob 時順手執行（job-store.ts:106），不是計時器；2026-08-26 實測該表有 14 列殘留，
  // 因為 2026-08-25 之後 prod 未再生成影片。實務影響為零（舊列只能憑 jobId 定址，而持有該
  // jobId 的瀏覽器早已離開；staff 一律放行），但別把它當成「一小時後就乾淨了」。
  // 兩者 assertOrgAccess 都放行 staff、
  // 擋下 client，即 fail-closed。（client 帳號無 org 綁定時 effectiveOrgId 早在建 job 時就拋，
  // 所以「client 的 job 沒有 org」不可能發生 —— lib/tenant-guard.ts:114-117。）
  try { assertOrgAccess(req, job.organizationId ?? null); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e) as NextResponse; throw e; }

  const result = await finalizeVideoJob(job);
  switch (result.status) {
    case "done":
      return NextResponse.json({ ok: true, status: "done", video: result.video, title: result.title });
    case "error":
      return NextResponse.json({ ok: true, status: "error", error: result.error, statusCode: result.statusCode });
    case "running":
      return NextResponse.json({ ok: true, status: "running", step: result.step });
    case "wrong_poller":
      return NextResponse.json({ ok: false, error: "Remotion job 使用 /api/video/remotion-job-status" }, { status: 409 });
  }
}
