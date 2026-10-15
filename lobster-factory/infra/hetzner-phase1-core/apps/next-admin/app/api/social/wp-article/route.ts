// GET /api/social/wp-article?brand&site&post -- one WordPress article of this brand's site, as the start of a post
// (C10, lib/social/wp-article.ts): title, excerpt, text for the AI rewrite, link, featured image. Read only.
// Editors and up (the content calendar's rule, as GET posts?wp=1); a site of another brand is a 404.
import { listAccessibleWpSites, wpAuthHeader } from "@/lib/content/wp-sites";
import { WRITE_ROLES, requireBrandRole } from "@/lib/social/authz";
import { BadRequest, handle, uuid } from "@/lib/social/http";
import { SocialStoreError } from "@/lib/social/store";
import { articleFromWp } from "@/lib/social/wp-article";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  return handle(async () => {
    const q = new URL(req.url).searchParams;
    const brand = uuid(q.get("brand"), "brand");
    await requireBrandRole(req, brand, WRITE_ROLES);
    const siteId = q.get("site") ?? "";
    const postId = q.get("post") ?? "";
    if (!/^\d{1,12}$/.test(postId)) throw new BadRequest("post must be a WordPress post id");
    const { sites, tokens, usernames } = await listAccessibleWpSites(req);
    const site = sites.find((s) => s.id === siteId && s.organizationId === brand);
    if (!site) throw new SocialStoreError(404, "no such WordPress site in this brand");
    const res = await fetch(`${site.url}/wp-json/wp/v2/posts/${postId}?_embed=wp:featuredmedia`, {
      headers: { Authorization: wpAuthHeader(usernames[site.id] ?? "", tokens[site.id] ?? "") },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (res.status === 404) throw new SocialStoreError(404, "the site has no such article");
    if (!res.ok) throw new SocialStoreError(502, `the WordPress site answered ${res.status}`);
    return { article: articleFromWp(await res.json()) };
  });
}
