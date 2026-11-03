import { NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";
import { reportWorkbenchUsage } from "@/lib/content/video/workbench-usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/internal/video/workbench/usage -- video-workbench reports one paid action that succeeded
 * {organization_id (billing account), feature_key (a video feature), actor "video:<userId>", job_id, cost_usd}.
 * Bearer = VW_INTERNAL_TOKEN; unset = every call 401. Charging: lib/content/video/workbench-usage.ts -> lib/entitlements/service-usage.ts (idempotent per job_id).
 */
export async function POST(req: Request): Promise<Response> {
  const expected = process.env.VW_INTERNAL_TOKEN;
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!expected || !bearer || !timingSafeEqual(bearer, expected)) return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, reason: "invalid_request" }, { status: 400 }); }
  const answer = await reportWorkbenchUsage(body);
  return NextResponse.json(answer.body, { status: answer.status });
}
