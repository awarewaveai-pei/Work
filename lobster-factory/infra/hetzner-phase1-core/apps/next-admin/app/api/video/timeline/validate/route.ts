import { NextRequest, NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "@/lib/ops-role";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { validateMediaTimelineV1 } from "@/lib/content/video/timeline-v1";

/**
 * Structural preflight only. It deliberately has no renderer, storage or
 * database side effect: durable asset ownership and renderer feasibility are
 * separate gates and must not be implied by a schema-valid Timeline.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: { timeline?: unknown };
  try {
    body = await req.json() as { timeline?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "無效 JSON" }, { status: 400 });
  }
  if (body.timeline === undefined) {
    return NextResponse.json({ ok: false, error: "timeline 為必填" }, { status: 400 });
  }

  const result = validateMediaTimelineV1(body.timeline);
  if (result.ok === false) {
    return NextResponse.json({ ok: false, error: "Timeline v1 結構驗證失敗", errors: result.errors }, { status: 400 });
  }

  // Structural validation does not prove an artifact belongs to this tenant.
  // It must still reject a client-supplied Timeline for another organization.
  try {
    assertOrgAccess(req, result.value.organizationId);
  } catch (error) {
    if (error instanceof OrgAccessError) return toOrgAccessResponse(error);
    throw error;
  }

  return NextResponse.json({
    ok: true,
    stage: "structural_only",
    readyForRender: false,
    timeline: {
      timelineId: result.value.timelineId,
      organizationId: result.value.organizationId,
      trackCount: result.value.tracks.length,
      outputProfiles: result.value.outputProfiles,
    },
    pendingChecks: ["artifact_ownership", "artifact_rights", "source_bounds", "safe_area", "renderer_feasibility"],
  });
}
