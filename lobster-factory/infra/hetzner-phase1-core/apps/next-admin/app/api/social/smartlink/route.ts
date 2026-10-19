// /api/social/smartlink -- a brand's smart link page (SOCIAL_MANAGER_PLAN.md C26; 0105 social_smart_links / _items)
//   GET   ?brand                                   { link | null, items (with 28-day clicks), suggested, base }
//   PUT   { brand, link: {slug, title, bio, colour, published}, items: [{id?, title, url, active}] }   page order; an
//         item left out is removed. 409 = the slug is another brand's.
import { ANY_ROLE, WRITE_ROLES, actorOf, requireBrandRole } from "@/lib/social/authz";
import { BadRequest, handle, jsonBody, uuid } from "@/lib/social/http";
import { productHost } from "@/lib/portal/doors";
import { PRODUCTS } from "@/lib/portal/products";
import { COLOURS, MAX_ITEMS, getSmartLink, saveSmartLink, slugProblem, urlProblem, type Colour, type ItemInput } from "@/lib/social/smartlink";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** the public address up to the slug: the social door's host from config (lib/portal/doors.ts), never a literal */
function base(): string {
  const social = PRODUCTS.find((p) => p.key === "social");
  return social ? `https://${productHost(social)}/smartlink/` : "/smartlink/";
}

export async function GET(req: Request): Promise<Response> {
  return handle(async () => {
    const brand = uuid(new URL(req.url).searchParams.get("brand"), "brand");
    await requireBrandRole(req, brand, ANY_ROLE);
    return { ...(await getSmartLink(brand)), base: base() };
  });
}

const text = (v: unknown, name: string, max: number, min = 0): string => {
  const s = typeof v === "string" ? v.trim() : "";
  if (s.length < min || s.length > max) throw new BadRequest(min ? `${name} must be ${min}..${max} characters` : `${name} must be at most ${max} characters`);
  return s;
};

export async function PUT(req: Request): Promise<Response> {
  return handle(async () => {
    const body = await jsonBody(req);
    const brand = uuid(body.brand, "brand");
    await requireBrandRole(req, brand, WRITE_ROLES);
    const l = (body.link ?? {}) as Record<string, unknown>;
    const slug = typeof l.slug === "string" ? l.slug.trim() : "";
    const bad = slugProblem(slug);
    if (bad) throw new BadRequest(bad);
    if (!COLOURS.includes(l.colour as Colour)) throw new BadRequest(`colour must be one of ${COLOURS.join(", ")}`);
    if (!Array.isArray(body.items) || body.items.length > MAX_ITEMS) throw new BadRequest(`items must be a list of at most ${MAX_ITEMS}`);
    const items: ItemInput[] = body.items.map((raw: unknown, i: number) => {
      const it = (raw ?? {}) as Record<string, unknown>;
      const url = typeof it.url === "string" ? it.url.trim() : "";
      const wrong = urlProblem(url);
      if (wrong) throw new BadRequest(`第 ${i + 1} 個連結：${wrong}`);
      return {
        ...(it.id == null ? {} : { id: uuid(it.id, "item id") }),
        title: text(it.title, `item ${i + 1} title`, 80, 1), url, active: it.active !== false,
      };
    });
    const link = { slug, title: text(l.title, "title", 120), bio: text(l.bio, "bio", 300), colour: l.colour as Colour, published: l.published === true };
    return { slug: await saveSmartLink(brand, link, items, actorOf(req)) };
  });
}
