import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { resolveWpSite } from "@/lib/content/wp-sites";
import { OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { decodeWpEntities } from "@/lib/content/wp-entities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// #3 — Fetch the target site's REAL existing post categories so the article generator classifies into
// the site's own taxonomy instead of inventing near-duplicate categories ("Art Therapy" vs an existing
// "Art therapy"). Mirrors the auth + site-resolution pattern of related-posts/route.ts. Read-only.

export async function GET(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });

  const url    = new URL(req.url);
  const siteId = url.searchParams.get("siteId") ?? "";

  let resolved;
  try { resolved = await resolveWpSite(req, siteId); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  if (!resolved) return NextResponse.json({ ok: true, categories: [] });
  const site = resolved.site;
  const authHeaders = resolved.authHeader ? { Authorization: resolved.authHeader } : {};

  // orderby=count desc → the site's most-used categories first (best classification targets). Skip the
  // default "Uncategorized" so the model never files an article under it. hide_empty omitted: a freshly
  // created site may have categories with zero posts that are still valid targets.
  const params = new URLSearchParams({
    per_page: "100",
    orderby: "count",
    order: "desc",
    _fields: "id,name,count",
  });
  try {
    const res = await fetch(`${site.url}/wp-json/wp/v2/categories?${params}`, {
      headers: authHeaders,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return NextResponse.json({ ok: true, categories: [] });
    const raw = await res.json() as Array<{ id?: number; name?: string; count?: number }>;
    const categories = raw
      .map(c => (typeof c.name === "string" ? decodeWpEntities(c.name) : ""))
      .filter(name => name && name.toLowerCase() !== "uncategorized" && name !== "未分類");
    return NextResponse.json({ ok: true, categories });
  } catch {
    return NextResponse.json({ ok: true, categories: [] });
  }
}
