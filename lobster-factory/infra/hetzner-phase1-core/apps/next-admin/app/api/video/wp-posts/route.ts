import { NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "@/lib/ops-role";
import { OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { resolveWpSite } from "@/lib/content/wp-sites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/video/wp-posts?siteId= -- the site's newest posts (draft, scheduled, published) for the "embed in an article" picker (V5.3). */
export async function GET(req: Request): Promise<Response> {
  if (!canCreateAiImageJob(resolveOpsRole(req).role)) return new NextResponse("forbidden", { status: 403 });
  const siteId = new URL(req.url).searchParams.get("siteId")?.trim() ?? "";
  if (!siteId) return NextResponse.json({ ok: false, error: "siteId required" }, { status: 400 });
  let resolved;
  try { resolved = await resolveWpSite(req, siteId); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  if (!resolved || !resolved.token) return NextResponse.json({ ok: false, error: "Site not found" }, { status: 404 });
  try {
    const res = await fetch(`${resolved.site.url.replace(/\/+$/, "")}/wp-json/wp/v2/posts?per_page=30&status=draft,future,publish&orderby=modified&order=desc&context=edit&_fields=id,title,status,modified`, {
      headers: { Authorization: resolved.authHeader }, signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return NextResponse.json({ ok: false, error: `WordPress ${res.status}` }, { status: 502 });
    const rows = await res.json() as Array<{ id: number; title?: { raw?: string }; status: string; modified: string }>;
    return NextResponse.json({ ok: true, posts: rows.map((p) => ({ id: p.id, title: p.title?.raw || `（無標題 #${p.id}）`, status: p.status, modified: p.modified })) });
  } catch {
    return NextResponse.json({ ok: false, error: "Failed to reach WordPress" }, { status: 502 });
  }
}
