/**
 * GET /api/video/remotion-status?jobId=<remotion-job-id>
 *
 * Single-shot poll proxy to remotion-service /status/:jobId.
 * Frontend polls this endpoint every 5s until status is "done" or "error".
 *
 * Response: { ok: true, status: "rendering"|"done"|"error", url?: string, error?: string }
 */
import { NextResponse } from "next/server";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: false, error: "deprecated_use_remotion_job_status" }, { status: 410 });
}
