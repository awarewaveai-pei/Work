/**
 * GET /api/video/status?jobId=<id>
 *
 * 回報 async 影片生成 job 的狀態（前端輪詢）。
 *   running → { ok:true, status:"running" }
 *   done    → { ok:true, status:"done", video:{outputs,out_dir}, title }
 *   error   → { ok:true, status:"error", error, statusCode }
 *   未知 id  → 404 { ok:false, error:"job_not_found" }（含容器重啟後 in-memory job 遺失）
 */
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const jobId = new URL(req.url).searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ ok: false, error: "jobId is required" }, { status: 400 });
  }

  const { getJob } = await import("@/lib/content/video/job-store");
  const job = getJob(jobId);
  if (!job) {
    return NextResponse.json({ ok: false, error: "job_not_found" }, { status: 404 });
  }

  if (job.status === "running") {
    return NextResponse.json({ ok: true, status: "running" });
  }
  if (job.status === "done") {
    return NextResponse.json({ ok: true, status: "done", video: job.video, title: job.title });
  }
  return NextResponse.json({ ok: true, status: "error", error: job.error, statusCode: job.statusCode });
}
