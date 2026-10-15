// /api/social/posts
//   GET  ?brand&start&end[&wp=1] -> posts timed in [start, end) plus the newest 500 undated ones (undatedTruncated
//        says when there were more); wp=1 adds the brand's WordPress posts
//   POST { brand, fields, targets?, media? } -> a new draft (lib/social/posts.ts says what may be sent)
import { listAccessibleWpSites } from "@/lib/content/wp-sites";
import { fetchSitePosts } from "@/lib/content/wp-calendar";
import { ANY_ROLE, WRITE_ROLES, actorOf, requireBrandRole } from "@/lib/social/authz";
import { BadRequest, handle, jsonBody, uuid } from "@/lib/social/http";
import { assertWithinLimits, parsePostPayload } from "@/lib/social/posts";
import { listPosts, savePost } from "@/lib/social/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_WINDOW_MS = 100 * 24 * 60 * 60 * 1000;   // a month view plus margins; keeps one GET bounded

function iso(value: string | null, name: string): string {
  const t = value ? Date.parse(value) : NaN;
  if (!Number.isFinite(t)) throw new BadRequest(`${name} must be an ISO time`);
  return new Date(t).toISOString();
}

export async function GET(req: Request): Promise<Response> {
  return handle(async () => {
    const q = new URL(req.url).searchParams;
    const brand = uuid(q.get("brand"), "brand");
    requireBrandRole(req, brand, ANY_ROLE);
    const start = iso(q.get("start"), "start");
    const end = iso(q.get("end"), "end");
    if (Date.parse(end) <= Date.parse(start) || Date.parse(end) - Date.parse(start) > MAX_WINDOW_MS) {
      throw new BadRequest("end must be after start and within 100 days of it");
    }
    const { posts, undatedTruncated } = await listPosts(brand, start, end);
    if (q.get("wp") !== "1") return { posts, undatedTruncated };
    requireBrandRole(req, brand, WRITE_ROLES);   // WordPress drafts: the content calendar's rule (operator and up)
    // the caller's sites (same rule as the content calendar), narrowed to this brand's
    const { sites, tokens, usernames } = await listAccessibleWpSites(req);
    const brandSites = sites.filter((s) => s.organizationId === brand);
    const wordpress = (await Promise.all(brandSites.map((s) =>
      fetchSitePosts(s, tokens[s.id] ?? "", usernames[s.id] ?? "", ["draft", "future", "publish"], start, end)))).flat();
    return { posts, undatedTruncated, wordpress };
  });
}

export async function POST(req: Request): Promise<Response> {
  return handle(async () => {
    const body = await jsonBody(req);
    const brand = uuid(body.brand, "brand");
    requireBrandRole(req, brand, WRITE_ROLES);
    const payload = parsePostPayload(body);
    if (payload.targets?.length) await assertWithinLimits(brand, payload.fields.body ?? "", payload.targets);
    return { post: await savePost(brand, null, null, payload.fields, payload.targets, payload.media, actorOf(req)) };
  });
}
