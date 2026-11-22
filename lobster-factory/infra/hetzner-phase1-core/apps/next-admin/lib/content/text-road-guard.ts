// Card K7 (訂閱通道 PLAN I1): who may put a subscription on a site's road, and for which sites a subscription may run at
// all. Shared by PATCH /api/content/sites/[id], its "套用到所有網站" route, the owner's mark route, the sites list and the
// scheduled article (lib/content/topics/make.ts), so they cannot drift.
import { NextResponse } from "next/server";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { requestActor, resolveSubject, type SubjectStore } from "@/lib/entitlements/subject";
import { codexAllowed } from "@/lib/tarot/codex-bridge";

/** organizations.metadata.client_config.ownerSubscription === true: the owner marked this organization as hers too (a
 *  client she runs for herself, e.g. Soulful; operator 2026-11-22), so its sites may use her subscriptions. Default off;
 *  only the owner sets it (app/api/content/sites/owner-subscription). Same JSON as client_config.audioExternalAiAllowed. */
export function ownerSubscriptionOn(metadata: unknown): boolean {
  const m = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};
  const c = m.client_config && typeof m.client_config === "object" ? (m.client_config as Record<string, unknown>) : {};
  return c.ownerSubscription === true;
}

/** Whether a site of this organization may use the subscriptions: its root is the internal account (organizations.kind,
 *  the same rule as lib/entitlements/grant.ts "own"), or the owner marked the organization as hers. No organization, or
 *  a lookup that fails = not allowed: API only. */
export async function subscriptionOrgStatus(orgId: string | null | undefined, store?: SubjectStore): Promise<{ allowed: boolean; internal: boolean; marked: boolean }> {
  if (!orgId) return { allowed: false, internal: false, marked: false };
  const internal = await resolveSubject({ orgId }, store).then((s) => s.kind === "internal", () => false);
  let marked = false;
  if (!internal) {
    try {
      const db = getSupabaseWriteClient();
      const { data, error } = db ? await db.from("organizations").select("metadata").eq("id", orgId).maybeSingle() : { data: null, error: null };
      marked = !error && ownerSubscriptionOn((data as { metadata?: unknown } | null)?.metadata);
    } catch { marked = false; }
  }
  return { allowed: internal || marked, internal, marked };
}

export async function subscriptionOrgAllowed(orgId: string | null | undefined, store?: SubjectStore): Promise<boolean> {
  return (await subscriptionOrgStatus(orgId, store)).allowed;
}

export const SUB_OWN_SITES_ONLY = "訂閱只用在自己的網站：這個網站屬於客戶，只能用 API";

/** A chain other than "api", or a claude level, spends the owner's own subscription: only she may set it, and only on a
 *  site her subscriptions may serve. Going back to API only (or picking the API model) is any staff member's call.
 *  null = allowed. */
export async function subscriptionRoadDenied(req: Request, road: { textChain?: unknown; textClaudeModel?: unknown },
  orgId: () => Promise<string | null | undefined>): Promise<Response | null> {
  const wantsSub = (road.textChain !== undefined && road.textChain !== "api") || road.textClaudeModel !== undefined;
  if (!wantsSub) return null;
  if (!codexAllowed(requestActor(req))) return NextResponse.json({ ok: false, error: "sub_operator_only" }, { status: 403 });
  return (await subscriptionOrgAllowed(await orgId())) ? null : NextResponse.json({ ok: false, error: SUB_OWN_SITES_ONLY }, { status: 403 });
}
