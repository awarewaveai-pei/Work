// /api/social/posts
//   GET  ?brand&start&end[&wp=1] -> posts timed in [start, end) plus the newest 500 undated ones (undatedTruncated
//        says when there were more); wp=1 adds the brand's WordPress posts; tags = the brand's tags (the filter panel's list)
//   GET  ?brand&trash=1 -> the bin: deleted posts, most recently deleted first, and deletions = who put each there and
//        from which state (C6; C22; restore = PUT .../state restore)
//   POST { brand, fields, targets?, media?, comments?, tags? } -> a new draft (lib/social/posts.ts says what may be sent)
import { listAccessibleWpSites } from "@/lib/content/wp-sites";
import { fetchSitePosts } from "@/lib/content/wp-calendar";
import { ANY_ROLE, WRITE_ROLES, actorForViewer, actorOf, requireBrandRole } from "@/lib/social/authz";
import { BadRequest, handle, jsonBody, uuid } from "@/lib/social/http";
import { assertWithinLimits, parsePostPayload } from "@/lib/social/posts";
import { listDeletions, listPosts, listTags, listTrash, savePost } from "@/lib/social/store";
import { resolveTenant } from "@/lib/tenant-guard";

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
    await requireBrandRole(req, brand, ANY_ROLE);
    if (q.get("trash") === "1") {
      const posts = await listTrash(brand);
      const viewer = resolveTenant(req).userKind;
      const deletions = Object.fromEntries(Object.entries(await listDeletions(brand, posts.map((p) => p.id))).map(([id, d]) => [id, { ...d, actor: actorForViewer(d.actor, viewer) }]));
      return { posts, deletions };
    }
    const start = iso(q.get("start"), "start");
    const end = iso(q.get("end"), "end");
    if (Date.parse(end) <= Date.parse(start) || Date.parse(end) - Date.parse(start) > MAX_WINDOW_MS) {
      throw new BadRequest("end must be after start and within 100 days of it");
    }
    const [{ posts, undatedTruncated }, tags] = await Promise.all([listPosts(brand, start, end), listTags(brand)]);
    if (q.get("wp") !== "1") return { posts, undatedTruncated, tags };
    await requireBrandRole(req, brand, WRITE_ROLES);   // WordPress drafts: the content calendar's rule (operator and up)
    // the caller's sites (same rule as the content calendar), narrowed to this brand's
    const { sites, tokens, usernames } = await listAccessibleWpSites(req);
    const brandSites = sites.filter((s) => s.organizationId === brand);
    const wordpress = (await Promise.all(brandSites.map((s) =>
      fetchSitePosts(s, tokens[s.id] ?? "", usernames[s.id] ?? "", ["draft", "future", "publish"], start, end)))).flat();
    return { posts, undatedTruncated, tags, wordpress };
  });
}

export async function POST(req: Request): Promise<Response> {
  return handle(async () => {
    const body = await jsonBody(req);
    const brand = uuid(body.brand, "brand");
    await requireBrandRole(req, brand, WRITE_ROLES);
    const payload = parsePostPayload(body);
    if (payload.targets?.length) {
      await assertWithinLimits(brand, payload.fields.body ?? "", payload.targets, { url: payload.fields.link_url ?? null, utm: payload.fields.link_utm ?? false },
        payload.children.comments ?? []);
    }
    return { post: await savePost(brand, null, null, payload.fields, payload.targets, payload.media, actorOf(req), payload.children) };
  });
}
