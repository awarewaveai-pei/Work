// /smartlink/<slug>/go/<item> -- a button on the public smart link page (SOCIAL_MANAGER_PLAN.md C26): 302 to the link's
// url, counted in social_smart_link_clicks (0113 social_smart_link_click). Counted once per visitor, link and day
// (the database dedupe key); a robot, a repeat or a HEAD is sent on without counting. The url comes only from
// the database row of a published page's active link, never from the request: not an open redirect.
import { NextResponse } from "next/server";
import { SLUG_RE, countClick, isCountableVisitor, itemUrl, visitorAddress, visitorHash } from "@/lib/social/smartlink";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Ctx = { params: Promise<{ slug: string; item: string }> };

const gone = () => new NextResponse("這個連結已經不在了。", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
const go = (url: string) => NextResponse.redirect(url, { status: 302, headers: { "cache-control": "no-store" } });

async function send(req: Request, ctx: Ctx, mayCount: boolean): Promise<Response> {
  const { slug, item } = await ctx.params;
  if (!SLUG_RE.test(slug) || !UUID_RE.test(item)) return gone();
  const ip = visitorAddress(req.headers);
  try {
    const hash = mayCount && isCountableVisitor(req.headers.get("user-agent") ?? "") ? visitorHash(ip) : null;
    const result = hash ? await countClick(slug, item, hash) : null;
    const url = result?.url ?? await itemUrl(slug, item);
    return url ? go(url) : gone();
  } catch (e) {
    console.error("[smartlink/go]", e);
    return new NextResponse("暫時無法前往，請稍後再試。", { status: 503, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  }
}

export const GET = (req: Request, ctx: Ctx) => send(req, ctx, true);
export const HEAD = (req: Request, ctx: Ctx) => send(req, ctx, false);
