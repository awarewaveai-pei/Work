// /api/social/settings -- a brand's social settings (C8; migration 0102)
//   GET  ?brand                         { requireReview }
//   PUT  { brand, requireReview }       owner only: whether posts go out only after an approval
import { ANY_ROLE, actorOf, requireBrandRole } from "@/lib/social/authz";
import { BadRequest, handle, jsonBody, uuid } from "@/lib/social/http";
import { requiresReview, setRequiresReview } from "@/lib/social/review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  return handle(async () => {
    const brand = uuid(new URL(req.url).searchParams.get("brand"), "brand");
    requireBrandRole(req, brand, ANY_ROLE);
    return { requireReview: await requiresReview(brand) };
  });
}

export async function PUT(req: Request): Promise<Response> {
  return handle(async () => {
    const body = await jsonBody(req);
    const brand = uuid(body.brand, "brand");
    requireBrandRole(req, brand, ["owner"]);
    if (typeof body.requireReview !== "boolean") throw new BadRequest("requireReview must be a boolean");
    await setRequiresReview(brand, body.requireReview, actorOf(req));
    return { requireReview: body.requireReview };
  });
}
