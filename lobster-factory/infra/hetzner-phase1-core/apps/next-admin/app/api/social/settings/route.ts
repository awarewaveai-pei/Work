// /api/social/settings -- a brand's social settings (C8; migration 0102)
//   GET  ?brand                         { requireReview }
//   PUT  { brand, requireReview }       owner only: whether posts go out only after an approval
//   PUT  { brand, timezone }            the organisation's zone (organizations.default_timezone, its one copy): brand owner AND
//                                       canWriteTenantConfig (staff owner/admin), the same people as the ops tenant PATCH --
//                                       a customer made brand owner (authz.ts) may not change an organisation field
import { ANY_ROLE, actorOf, BrandAccessError, requireBrandRole } from "@/lib/social/authz";
import { BadRequest, handle, jsonBody, uuid } from "@/lib/social/http";
import { requiresReview, setRequiresReview } from "@/lib/social/review";
import { canWriteTenantConfig, resolveOpsRole } from "@/lib/ops-role";
import { setBrandTimezone } from "@/lib/social/store";
import { isTimeZone } from "@/lib/social/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  return handle(async () => {
    const brand = uuid(new URL(req.url).searchParams.get("brand"), "brand");
    await requireBrandRole(req, brand, ANY_ROLE);
    return { requireReview: await requiresReview(brand) };
  });
}

export async function PUT(req: Request): Promise<Response> {
  return handle(async () => {
    const body = await jsonBody(req);
    const brand = uuid(body.brand, "brand");
    await requireBrandRole(req, brand, ["owner"]);
    if (body.timezone !== undefined) {
      if (!canWriteTenantConfig(resolveOpsRole(req).role)) throw new BrandAccessError("forbidden: the organisation's time zone is changed by AwareWave owners and admins");
      if (typeof body.timezone !== "string" || !isTimeZone(body.timezone)) throw new BadRequest("timezone must be an IANA time zone such as Asia/Taipei");
      return { timezone: await setBrandTimezone(brand, body.timezone, actorOf(req)) };
    }
    if (typeof body.requireReview !== "boolean") throw new BadRequest("requireReview must be a boolean");
    await setRequiresReview(brand, body.requireReview, actorOf(req));
    return { requireReview: body.requireReview };
  });
}
