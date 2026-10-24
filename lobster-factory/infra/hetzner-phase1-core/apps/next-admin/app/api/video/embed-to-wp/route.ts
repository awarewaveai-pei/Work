import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { blockedChangeResponse } from "@/lib/system-modes/blocked-change";
import { embedVideoInPost } from "@/lib/content/video/embed-in-post";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/video/embed-to-wp -- shell over embedVideoInPost (lib/content/video/embed-in-post.ts). */
export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new NextResponse("invalid json", { status: 400 }); }

  const siteId  = typeof body.siteId  === "string" ? body.siteId.trim()  : "";
  const videoUrl = typeof body.videoUrl === "string" ? body.videoUrl.trim() : "";
  const releaseId = typeof body.releaseId === "string" ? body.releaseId.trim() : "";
  const variant = typeof body.variant === "string" && body.variant.trim() ? body.variant.trim() : "default";
  const rawId    = typeof body.postId   === "number" ? body.postId : parseInt(String(body.postId), 10);
  const postId   = Number.isInteger(rawId) && rawId > 0 ? rawId : NaN;

  let result;
  try { result = await embedVideoInPost(req, { siteId, postId, videoUrl, releaseId, variant }); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }

  if ("blockedMode" in result) return blockedChangeResponse(result.blockedMode);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
