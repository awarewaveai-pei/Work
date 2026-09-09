import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "@/lib/ops-role";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { compileEditPlanToTimeline } from "@/lib/content/video/edit-plan-timeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Compile an EDP into canonical Timeline v1; no render or database write. */
export async function POST(req: NextRequest): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = await req.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const organizationId = typeof body.organizationId === "string" ? body.organizationId.trim() : "";
  if (!organizationId) return NextResponse.json({ ok: false, error: "organizationId required" }, { status: 400 });
  try { assertOrgAccess(req, organizationId); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  const result = compileEditPlanToTimeline(body.editPlan, { timelineId: `tl_${randomUUID()}`, organizationId });
  if ("errors" in result) return NextResponse.json({ ok: false, error: "EDP 無法編譯成 Timeline", errors: result.errors }, { status: 422 });
  return NextResponse.json({ ok: true, timeline: result.timeline, next: "POST /api/video/timeline/submit" });
}
