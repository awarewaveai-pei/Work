// POST /api/social/posts/bulk  { brand, items: [{ id, version, action, scheduledAt?, ... }] }  (at most 100)
// Each item goes through the same rules as PUT .../state and stands on its own: one refusal does not undo the others,
// and the answer says per item what happened. publish_now is never taken in bulk: it needs confirmPublishNow per post
// (state.ts), which this route deliberately does not pass through.
import { PostizApiError } from "@/lib/content/postiz";
import { ANY_ROLE, actorOf, requireBrandRole } from "@/lib/social/authz";
import { BadRequest, handle, jsonBody, postVersion, uuid } from "@/lib/social/http";
import { applyAction } from "@/lib/social/actions";
import { RULES, TransitionError, type PostAction } from "@/lib/social/state";
import { getPostAt, SocialStoreError } from "@/lib/social/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  return handle(async () => {
    const body = await jsonBody(req);
    const brand = uuid(body.brand, "brand");
    const role = await requireBrandRole(req, brand, ANY_ROLE);
    if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 100) throw new BadRequest("items must be 1..100 entries");
    const actor = actorOf(req);
    const results = [];
    for (const item of body.items as unknown[]) {
      const raw = (item && typeof item === "object" && !Array.isArray(item) ? item : {}) as Record<string, unknown>;
      const id = typeof raw.id === "string" ? raw.id : "";
      try {
        if (typeof raw.action !== "string" || !Object.hasOwn(RULES, raw.action)) throw new BadRequest("unknown action");
        const post = await getPostAt(brand, uuid(id, "id"), postVersion(raw.version));
        const input = {
          scheduledAt: typeof raw.scheduledAt === "string" ? raw.scheduledAt : undefined,
          listId: raw.listId === undefined ? undefined : uuid(raw.listId, "listId"),
          listPosition: typeof raw.listPosition === "number" ? raw.listPosition : undefined,
          reason: typeof raw.reason === "string" ? raw.reason : undefined,
        };
        const detail = typeof raw.reason === "string" ? { bulk: true, reason: raw.reason.slice(0, 2000) } : { bulk: true };
        const saved = await applyAction(brand, post, raw.action as PostAction, role, input, actor, detail);
        results.push({ id, ok: true, version: saved.version, state: saved.state });
      } catch (e) {
        if (!(e instanceof BadRequest || e instanceof TransitionError || e instanceof SocialStoreError || e instanceof PostizApiError)) throw e;
        results.push({ id, ok: false, error: e.message });
      }
    }
    return { results };
  });
}
