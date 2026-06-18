import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { getWpSites, wpAuthHeader } from "@/lib/content/wp-sites";
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

  const { sites, tokens, usernames } = await getWpSites();
  if (sites.length === 0) return NextResponse.json({ ok: true, tags: [] });

  const site     = (siteId && sites.find(s => s.id === siteId)) || sites[0];
  const token    = tokens[site.id] ?? "";
  const username = usernames[site.id] ?? "";
  const authHeaders = token ? { Authorization: wpAuthHeader(username, token) } : {};

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
