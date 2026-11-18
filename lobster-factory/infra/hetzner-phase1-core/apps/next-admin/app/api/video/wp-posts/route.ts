import { NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "@/lib/ops-role";
import { OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { resolveWpSite } from "@/lib/content/wp-sites";
import { listNotLiveDrafts } from "@/lib/content/video/embed-in-post";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/video/wp-posts?siteId= -- the site's newest NOT-live posts (draft, pending) for the release page's
 * "embed in an article" picker (V5.3). Published and scheduled posts are left out: editing one is a live edit
 * (WP REST has no draft revision), and the release page must not put anything live (P6.10, 2026-11-13).
 * Read through the site's one channel (listNotLiveDrafts: the bridge on a bridge site, REST elsewhere).
 */
export async function GET(req: Request): Promise<Response> {
  if (!canCreateAiImageJob(resolveOpsRole(req).role)) return new NextResponse("forbidden", { status: 403 });
  const siteId = new URL(req.url).searchParams.get("siteId")?.trim() ?? "";
  if (!siteId) return NextResponse.json({ ok: false, error: "siteId required" }, { status: 400 });
  let resolved;
  try { resolved = await resolveWpSite(req, siteId); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  if (!resolved) return NextResponse.json({ ok: false, error: "Site not found" }, { status: 404 });
  const r = await listNotLiveDrafts(resolved);
  if (!r.ok) {
    const failed = r as { status: number; error: string };   // strict:false: no narrowing on !ok
    return NextResponse.json({ ok: false, error: failed.error }, { status: failed.status });
  }
  return NextResponse.json({ ok: true, posts: r.posts });
}
