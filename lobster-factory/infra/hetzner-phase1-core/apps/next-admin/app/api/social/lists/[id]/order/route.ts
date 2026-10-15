// PUT /api/social/lists/[id]/order  { brand, postIds } -- the list's items in a new order; postIds must be exactly its
// current items (0101 social_reorder_list: 409 otherwise, e.g. someone added one since this page loaded).
import { WRITE_ROLES, actorOf, requireBrandRole } from "@/lib/social/authz";
import { BadRequest, handle, jsonBody, uuid } from "@/lib/social/http";
import { reorderList } from "@/lib/social/rotation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  return handle(async () => {
    const id = uuid((await params).id, "id");
    const body = await jsonBody(req);
    const brand = uuid(body.brand, "brand");
    requireBrandRole(req, brand, WRITE_ROLES);
    if (!Array.isArray(body.postIds) || body.postIds.length > 500) throw new BadRequest("postIds must be an array of at most 500");
    const ids = body.postIds.map((x, i) => uuid(x, `postIds[${i}]`));
    if (new Set(ids).size !== ids.length) throw new BadRequest("a post appears twice in postIds");
    await reorderList(brand, id, ids, actorOf(req));
    return {};
  });
}
