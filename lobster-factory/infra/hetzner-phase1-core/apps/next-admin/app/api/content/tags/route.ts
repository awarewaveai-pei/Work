import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { resolveWpSite } from "@/lib/content/wp-sites";
import { OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { decodeWpEntities } from "@/lib/content/wp-entities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fetch the target site's existing post tags so the chip UI can offer quick-pick.
// Tags are public (no auth required) but we pass auth when available for consistency.

export async function GET(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });

  const url    = new URL(req.url);
  const siteId = url.searchParams.get("siteId") ?? "";

  let resolved;
  try { resolved = await resolveWpSite(req, siteId); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  if (!resolved) return NextResponse.json({ ok: true, tags: [] });
  const site = resolved.site;
  const authHeaders = resolved.authHeader ? { Authorization: resolved.authHeader } : {};

  const params = new URLSearchParams({
    per_page: "100",
    orderby: "count",
    order: "desc",
    _fields: "id,name,count",
  });
  try {
    const res = await fetch(`${site.url}/wp-json/wp/v2/tags?${params}`, {
      headers: authHeaders,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return NextResponse.json({ ok: true, tags: [] });
    const raw = await res.json() as Array<{ id?: number; name?: string; count?: number }>;
    const tags = raw
      .map(t => (typeof t.name === "string" ? decodeWpEntities(t.name) : ""))
      .filter(Boolean);
    return NextResponse.json({ ok: true, tags });
  } catch {
    return NextResponse.json({ ok: true, tags: [] });
  }
}
