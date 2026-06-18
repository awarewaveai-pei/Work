import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { getWpSites, wpAuthHeader } from "@/lib/content/wp-sites";
import { decodeWpEntities } from "@/lib/content/wp-entities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// #6 — Fetch the site's saved synced patterns (wp_block posts, e.g. "btn_Explore Collaboration Paths").
// The article generator weaves 2-4 of these as funnel CTAs; publish resolves [KADENCE_PATTERN: id] →
// <!-- wp:block {"ref":id} /-->. The wp_block REST endpoint requires auth (edit_posts cap), so this only
// returns patterns when the site has a token configured. Read-only. Mirrors related-posts auth pattern.

interface PatternItem { id: number; title: string; slug: string }

export async function GET(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });

  const url    = new URL(req.url);
  const siteId = url.searchParams.get("siteId") ?? "";

  const { sites, tokens, usernames } = await getWpSites();
  if (sites.length === 0) return NextResponse.json({ ok: true, patterns: [] });

  const site     = (siteId && sites.find(s => s.id === siteId)) || sites[0];
  const token    = tokens[site.id] ?? "";
  const username = usernames[site.id] ?? "";
  // wp_block is not publicly listable — without a token the endpoint 401s, so skip cleanly.
  if (!token) return NextResponse.json({ ok: true, patterns: [], note: "no auth token for this site" });
  const authHeaders = { Authorization: wpAuthHeader(username, token) };

  const params = new URLSearchParams({
    per_page: "100",
    status: "publish",
    orderby: "title",
    order: "asc",
    _fields: "id,title,slug",
  });
  try {
    const res = await fetch(`${site.url}/wp-json/wp/v2/blocks?${params}`, {
      headers: authHeaders,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return NextResponse.json({ ok: true, patterns: [], note: `wp returned ${res.status}` });
    const raw = await res.json() as Array<{ id?: number; title?: { rendered?: string }; slug?: string }>;
    const patterns: PatternItem[] = raw
      .filter(p => typeof p.id === "number" && p.id > 0)
      .map(p => {
        const slug = typeof p.slug === "string" ? p.slug : "";
        const titleFromRendered = decodeWpEntities(p.title?.rendered ?? "");
        // Slug is the most reliable display name: convert kebab-case to Title Case
        const titleFromSlug = slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
        return {
          id: p.id!,
          slug,
          title: titleFromRendered || titleFromSlug || `Pattern ${p.id}`,
        };
      });
    return NextResponse.json({ ok: true, patterns });
  } catch {
    return NextResponse.json({ ok: true, patterns: [] });
  }
}
