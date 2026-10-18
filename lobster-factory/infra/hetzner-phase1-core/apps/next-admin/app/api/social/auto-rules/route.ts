// /api/social/auto-rules -- a brand's auto-reply rules (0105 social_auto_rules; the composer's own rule C21, the tab C27)
//   GET     ?brand[&post]               the brand's rules, or that post's own
//   POST    { brand, id?, rule }        create (id absent) or edit -> { id, postVersion } (a post's rule moves its version)
//   DELETE  ?brand&id                   -> { postVersion }
// A post's own rule is part of what an approver approved: with review on, an editor changes it only off the schedule
// (the content rule of posts/[id] PUT, lib/social/review.ts); a queued post's rules wait (store.ts).
import { ANY_ROLE, WRITE_ROLES, actorOf, requireBrandRole } from "@/lib/social/authz";
import { BadRequest, handle, jsonBody, uuid } from "@/lib/social/http";
import { parseAutoRule, RuleError } from "@/lib/social/auto-rules";
import { autoRulePost, deleteAutoRule, getPost, listAutoRules, saveAutoRule } from "@/lib/social/store";
import { assertCanEditContent, requiresReview } from "@/lib/social/review";
import type { BrandRole } from "@/lib/social/state";

async function reviewGate(brand: string, role: BrandRole, postId: string | null): Promise<void> {
  if (postId && (await requiresReview(brand))) assertCanEditContent(true, role, (await getPost(brand, postId)).state);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  return handle(async () => {
    const q = new URL(req.url).searchParams;
    const brand = uuid(q.get("brand"), "brand");
    await requireBrandRole(req, brand, ANY_ROLE);
    return { rules: await listAutoRules(brand, q.get("post") ? uuid(q.get("post"), "post") : undefined) };
  });
}

export async function POST(req: Request): Promise<Response> {
  return handle(async () => {
    const body = await jsonBody(req);
    const brand = uuid(body.brand, "brand");
    const role = await requireBrandRole(req, brand, WRITE_ROLES);
    let rule;
    try {
      rule = parseAutoRule(body.rule);
    } catch (e) {
      if (e instanceof RuleError) throw new BadRequest(e.message);
      throw e;
    }
    const id = body.id == null ? null : uuid(body.id, "id");
    await reviewGate(brand, role, id ? await autoRulePost(brand, id) : rule.post_id);
    return await saveAutoRule(brand, id, rule, actorOf(req));
  });
}

export async function DELETE(req: Request): Promise<Response> {
  return handle(async () => {
    const q = new URL(req.url).searchParams;
    const brand = uuid(q.get("brand"), "brand");
    const role = await requireBrandRole(req, brand, WRITE_ROLES);
    const id = uuid(q.get("id"), "id");
    await reviewGate(brand, role, await autoRulePost(brand, id));
    return await deleteAutoRule(brand, id, actorOf(req));
  });
}
