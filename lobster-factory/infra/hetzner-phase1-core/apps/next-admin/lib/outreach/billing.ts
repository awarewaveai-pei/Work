// Who an outreach AI call is billed to (ADR 017 §3): the lead's organization, through actorFor -- not the staff
// caller's own (internal) account. A caller without a role there still names the org, so the gate answers
// not_authorized_for_org (shadow allows and audits it, enforce refuses). A lead with no organization = internal.
import type { GrantContext } from "@/lib/entitlements/grant";
import { actorFor } from "@/lib/social/authz";

export async function billedTo(req: Request, organizationId: string | null): Promise<GrantContext> {
  const acting = organizationId ? await actorFor(req, organizationId).catch(() => null) : null;
  return acting ? { req, acting } : organizationId ? { req, orgId: organizationId } : { req };
}
