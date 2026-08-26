import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { resolveWpSite } from "@/lib/content/wp-sites";
import { OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fetch REAL existing published posts from the target WordPress site matching the keyword, so the
// article generator can weave genuine internal links instead of fabricating fake ones (the model
// invents /related-article URLs when it has no real ones — 2026-06-16 user-reported live bug).
// Returns canonical permalinks; the caller passes these into /api/content/generate as internalLinks.

interface RelatedPost { title: string; link: string; }

export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new NextResponse("invalid json", { status: 400 }); }

  const keyword = (typeof body.keyword === "string" ? body.keyword : "").trim();
  if (!keyword) return NextResponse.json({ ok: false, error: "keyword required" }, { status: 400 });
  const siteId = typeof body.siteId === "string" ? body.siteId : "";
  const limit  = typeof body.limit === "number" ? Math.min(Math.max(1, body.limit), 8) : 5;

  let resolved;
  try { resolved = await resolveWpSite(req, siteId); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  if (!resolved) {
    // No accessible site is not an error for the caller — it just means no internal links to weave.
    return NextResponse.json({ ok: true, posts: [] });
  }
  const site = resolved.site;

  // WP REST relevance search. Relevant content lives in BOTH posts AND pages on real sites
  // (verified on soulful: insights/* are posts, healing-modules/* are pages), so query both
  // and merge. orderby=relevance is valid only with `search`, which is always present here.
  // Note: WP search ANDs the terms, so an over-specific multi-word keyword can return 0 — that
  // is acceptable (the generator then adds no internal links rather than fabricating fakes).
  const authHeaders = resolved.authHeader ? { Authorization: resolved.authHeader } : {};
  const fetchType = async (restBase: "posts" | "pages"): Promise<RelatedPost[]> => {
    const params = new URLSearchParams({
      search: keyword,
      per_page: String(Math.min(limit + 3, 11)),
      status: "publish",
      orderby: "relevance",
      _fields: "title,link",
    });
    try {
      const res = await fetch(`${site.url}/wp-json/wp/v2/${restBase}?${params}`, {
        headers: authHeaders,
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return [];
      const raw = await res.json() as Array<{ title?: { rendered?: string }; link?: string }>;
      return raw
        .filter(p => typeof p.link === "string" && /^https?:\/\//.test(p.link))
        .map(p => ({
          title: (p.title?.rendered ?? "")
            .replace(/&amp;/g, "&").replace(/&#0?39;/g, "'").replace(/&#[0-9]+;/g, "").replace(/<[^>]+>/g, "").trim(),
          link: p.link!,
        }));
    } catch { return []; }
  };

  const [postHits, pageHits] = await Promise.all([fetchType("posts"), fetchType("pages")]);
  // Interleave posts/pages, dedup by link, cap at `limit`.
  const seen = new Set<string>();
  const merged: RelatedPost[] = [];
  for (let i = 0; i < Math.max(postHits.length, pageHits.length) && merged.length < limit; i++) {
    for (const p of [postHits[i], pageHits[i]]) {
      if (p && !seen.has(p.link) && merged.length < limit) { seen.add(p.link); merged.push(p); }
    }
  }
  return NextResponse.json({ ok: true, posts: merged, siteUrl: site.url });
}
