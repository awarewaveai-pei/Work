/**
 * POST /api/video/remotion-render
 *
 * Forwards { templateId, props } to the EU remotion-service and returns
 * the remotion service's own jobId for polling via /api/video/remotion-status.
 *
 * Env: REMOTION_SERVICE_URL (default http://127.0.0.1:8733), REMOTION_AUTH_TOKEN
 */
import { NextRequest, NextResponse } from "next/server";
import { submitRemotion } from "@/lib/content/video/remotion-client";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { templateId?: string; props?: Record<string, unknown> };
  try {
    body = (await req.json()) as { templateId?: string; props?: Record<string, unknown> };
  } catch {
    return NextResponse.json({ ok: false, error: "無效 JSON" }, { status: 400 });
  }
  if (!body.templateId) {
    return NextResponse.json({ ok: false, error: "templateId 為必填" }, { status: 400 });
  }
  const result = await submitRemotion(body.templateId, body.props ?? {});
  if (result.ok === false) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true, jobId: result.jobId });
}
