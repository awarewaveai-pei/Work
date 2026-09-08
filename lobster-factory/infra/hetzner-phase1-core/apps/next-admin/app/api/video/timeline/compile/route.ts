import { NextRequest, NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "@/lib/ops-role";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { compileTimelineV1ToDynamicSlideshow } from "@/lib/content/video/timeline-remotion";

/**
 * Compile-only boundary for the Director UI. It never submits a render or writes
 * storage. Artifact URLs are resolved from tenant-owned media_assets server-side.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  let body: { timeline?: unknown };
  try { body = await req.json() as typeof body; }
  catch { return NextResponse.json({ ok: false, error: "無效 JSON" }, { status: 400 }); }
  if (body.timeline === undefined) return NextResponse.json({ ok: false, error: "timeline 為必填" }, { status: 400 });

  if (typeof body.timeline !== "object" || body.timeline === null || Array.isArray(body.timeline)) {
    return NextResponse.json({ ok: false, error: "timeline 必須是物件" }, { status: 400 });
  }
  const timeline = body.timeline as { organizationId?: unknown; provenance?: { sourceArtifacts?: unknown } };
  if (typeof timeline.organizationId !== "string") return NextResponse.json({ ok: false, error: "organizationId 為必填" }, { status: 400 });
  try { assertOrgAccess(req, timeline.organizationId); }
  catch (error) { if (error instanceof OrgAccessError) return toOrgAccessResponse(error); throw error; }

  const ids = Array.isArray(timeline.provenance?.sourceArtifacts)
    ? timeline.provenance.sourceArtifacts.filter((id): id is string => typeof id === "string")
    : [];
  const { getSupabaseWriteClient } = await import("@/lib/supabase-server");
  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  const { data: assets, error } = await supabase.from("media_assets").select("id, object_url, organization_id").eq("organization_id", timeline.organizationId).in("id", ids);
  if (error) return NextResponse.json({ ok: false, error: "素材解析失敗" }, { status: 503 });
  const urls = new Map((assets ?? []).map((asset) => [String(asset.id), String(asset.object_url ?? "")]));
  const { getDesignsPublicBase } = await import("@/lib/storage/r2");
  const allowedHosts = new Set([new URL(getDesignsPublicBase()).hostname, "images.pexels.com", "videos.pexels.com", "player.vimeo.com"]);
  const resolver = {
    resolve: (artifactId: string) => {
      const value = urls.get(artifactId);
      if (!value) return undefined;
      try {
        const url = new URL(value);
        if (url.protocol !== "https:" || !allowedHosts.has(url.hostname)) return undefined;
        return url.toString();
      } catch { return undefined; }
    },
  } as const;
  const result = compileTimelineV1ToDynamicSlideshow(body.timeline, resolver);
  if (result.ok === false) return NextResponse.json({ ok: false, error: "Timeline 無法編譯", errors: result.errors }, { status: 422 });
  return NextResponse.json({ ok: true, stage: "compiled", renderSubmission: "pending", timelineId: result.timelineId, specs: result.specs });
}
