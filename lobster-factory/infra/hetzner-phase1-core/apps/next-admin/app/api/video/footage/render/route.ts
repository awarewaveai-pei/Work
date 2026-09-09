import { NextRequest, NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "@/lib/ops-role";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { getDesignsPublicBase } from "@/lib/storage/r2";
import { validateMediaTimelineV1, type MediaTimelineV1 } from "@/lib/content/video/timeline-v1";
import { submitFootageRender } from "@/lib/content/video/render-client";
import { createJob, finishJob } from "@/lib/content/video/job-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROFILE_TO_FORMAT: Record<string, string> = {
  landscape_16_9: "16x9",
  vertical_9_16: "9x16",
  square_4_5: "4x5",
};

/** Resolve a validated footage Timeline to tenant-owned URLs and submit a durable render job. */
export async function POST(req: NextRequest): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  let body: { timeline?: unknown; outputProfile?: unknown };
  try { body = await req.json() as { timeline?: unknown; outputProfile?: unknown }; }
  catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const validation = validateMediaTimelineV1(body.timeline);
  if (validation.ok === false) return NextResponse.json({ ok: false, error: "Timeline 無法編譯", errors: validation.errors }, { status: 422 });
  const timeline: MediaTimelineV1 = validation.value;
  try { assertOrgAccess(req, timeline.organizationId); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  const profile = typeof body.outputProfile === "string" ? body.outputProfile : timeline.outputProfiles[0];
  const format = PROFILE_TO_FORMAT[profile];
  if (!format) return NextResponse.json({ ok: false, error: "實拍 renderer 僅支援 landscape_16_9、vertical_9_16、square_4_5" }, { status: 422 });

  const videoTracks = timeline.tracks.filter((track): track is Extract<MediaTimelineV1["tracks"][number], { kind: "video" }> => track.kind === "video");
  if (videoTracks.length !== 1 || videoTracks[0].items.length === 0) return NextResponse.json({ ok: false, error: "實拍 Timeline 必須有一條非空 video track" }, { status: 422 });
  if (timeline.tracks.some((track) => track.kind !== "video" && track.items.length > 0)) return NextResponse.json({ ok: false, error: "實拍 renderer 尚未支援 audio/caption track；請先輸出純 video Timeline" }, { status: 422 });
  const items = videoTracks[0].items;
  if (items.some((item) => item.provenance !== "footage")) return NextResponse.json({ ok: false, error: "實拍 renderer 只接受 provenance=footage" }, { status: 422 });

  const db = getSupabaseWriteClient();
  if (!db) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  const artifactIds = [...new Set(items.map((item) => item.sourceArtifactId))];
  const { data: assets, error } = await db.from("media_assets")
    .select("id, object_url, organization_id, mime_type, asset_domain")
    .eq("organization_id", timeline.organizationId)
    .in("id", artifactIds);
  if (error) return NextResponse.json({ ok: false, error: "素材解析失敗" }, { status: 503 });
  const assetMap = new Map((assets ?? []).map((asset) => [String(asset.id), asset]));
  const allowedHosts = new Set([new URL(getDesignsPublicBase()).hostname]);
  const videoBase = process.env.R2_VIDEO_PUBLIC_BASE?.replace(/\/+$/, "");
  if (videoBase) allowedHosts.add(new URL(videoBase).hostname);
  const clips: Array<{ source_url: string; source_start_ms: number; duration_ms: number }> = [];
  for (const item of items) {
    const asset = assetMap.get(item.sourceArtifactId);
    if (!asset || !String(asset.mime_type).startsWith("video/")) return NextResponse.json({ ok: false, error: `影片素材不存在或格式不支援：${item.sourceArtifactId}` }, { status: 422 });
    let url: URL;
    try { url = new URL(String(asset.object_url)); }
    catch { return NextResponse.json({ ok: false, error: "影片素材 URL 無效" }, { status: 422 }); }
    if (url.protocol !== "https:" || !allowedHosts.has(url.hostname)) return NextResponse.json({ ok: false, error: "影片素材 URL 不在受控來源" }, { status: 422 });
    clips.push({ source_url: url.toString(), source_start_ms: item.sourceStartMs ?? 0, duration_ms: item.durationMs });
  }

  let job: Awaited<ReturnType<typeof createJob>>;
  try { job = await createJob(timeline.organizationId); }
  catch { return NextResponse.json({ ok: false, error: "無法建立影片工作" }, { status: 500 }); }
  const submission = await submitFootageRender(clips, [format], timeline.timelineId);
  if (submission.ok === false) {
    await finishJob(job.id, { status: "error", error: submission.error, statusCode: submission.status });
    return NextResponse.json({ ok: false, error: submission.error }, { status: submission.status });
  }
  await finishJob(job.id, {
    status: "running",
    euJobId: submission.jobId,
    step: "實拍素材 ffmpeg 渲染中",
    recordParams: {
      title: timeline.timelineId,
      sceneCount: items.length,
      organizationId: timeline.organizationId,
      formats: [format],
      source: "footage",
      rendererKind: "footage",
      timelineId: timeline.timelineId,
      outputProfile: profile,
    },
  });
  return NextResponse.json({ ok: true, jobId: job.id, outputProfile: profile, format }, { status: 202 });
}
