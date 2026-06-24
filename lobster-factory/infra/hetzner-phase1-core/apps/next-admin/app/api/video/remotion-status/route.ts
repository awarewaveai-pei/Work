/**
 * GET /api/video/remotion-status?jobId=<remotion-job-id>
 *
 * Single-shot poll proxy to remotion-service /status/:jobId.
 * Frontend polls this endpoint every 5s until status is "done" or "error".
 *
 * Response: { ok: true, status: "rendering"|"done"|"error", url?: string, error?: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { pollRemotion } from "@/lib/content/video/remotion-client";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const jobId = new URL(req.url).searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ ok: false, error: "jobId 為必填" }, { status: 400 });
  }
  const poll = await pollRemotion(jobId);
  return NextResponse.json({ ok: true, ...poll });
}
