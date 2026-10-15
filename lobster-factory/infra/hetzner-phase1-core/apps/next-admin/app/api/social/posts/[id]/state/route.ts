// PUT /api/social/posts/[id]/state  { brand, version, action, scheduledAt?, listId?, listPosition?, reason?, confirmPublishNow? }
// Who may do which action from which state: lib/social/state.ts (the one place); the reason of a rejection goes to the log.
// A post already in Postiz (queued) is withdrawn there first (lib/social/actions.ts -> withdraw.ts).
import { ANY_ROLE, actorOf, requireBrandRole } from "@/lib/social/authz";
import { BadRequest, handle, jsonBody, postVersion, uuid } from "@/lib/social/http";
import { applyAction } from "@/lib/social/actions";
import { RULES, type PostAction } from "@/lib/social/state";
import { getPostAt } from "@/lib/social/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  return handle(async () => {
    const id = uuid((await params).id, "id");
    const body = await jsonBody(req);
    const brand = uuid(body.brand, "brand");
    const role = await requireBrandRole(req, brand, ANY_ROLE);
    const action = body.action as PostAction;
    if (typeof body.action !== "string" || !Object.hasOwn(RULES, body.action)) throw new BadRequest(`action must be one of ${Object.keys(RULES).join(", ")}`);
    const post = await getPostAt(brand, id, postVersion(body.version));
    const input = {
      scheduledAt: typeof body.scheduledAt === "string" ? body.scheduledAt : undefined,
      listId: body.listId === undefined ? undefined : uuid(body.listId, "listId"),
      listPosition: typeof body.listPosition === "number" ? body.listPosition : undefined,
      reason: typeof body.reason === "string" ? body.reason : undefined,
      confirmPublishNow: body.confirmPublishNow === true,
    };
    const detail = typeof body.reason === "string" ? { reason: body.reason.slice(0, 2000) } : {};
    const saved = await applyAction(brand, post, action, role, input, actorOf(req), detail);
    return { post: { id: saved.id, version: saved.version } };
  });
}
