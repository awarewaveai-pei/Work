// The schedule's monthly proposal (AUTO_CONTENT P9.2). Invariants B1-B4, B8 live here and nowhere else:
//  B1 a site with any non-manual topic this Taipei month is done (a person's button proposal counts, `source='plan'` would re-plan monthly);
//  B2 the paid step is claimed in the DB (wp_sites.content_plan_attempted_at, 0139) BEFORE the AI call, at most once per 24 h;
//  B3 one firing plans at most one site and then does not tick (the caller returns the summary);
//  B4 topics are approved only for ai_pick sites, never because of publishMode;
//  B8 no entitlement = skip quietly (no claim, no spend, the tick still runs); any other error is a real failure.
// Everything outside the decisions is injected (PlanDueDeps), so tests need no DB and no model.
import type { SupabaseClient } from "@supabase/supabase-js";
import { aiPicksTopics, type SiteContentDefaults } from "@/lib/content/brand-voice";
import { EntitlementRequired } from "@/lib/entitlements/can";
import { grantFor, runForOrg } from "@/lib/entitlements/grant";
import { planAsker, proposeMonth } from "./plan";
import { monthKey, move, taipeiParts, type Topic } from "./store";

export interface PlanDueDeps {
  canPlan(): Promise<boolean>;
  sites(): Promise<Array<{ id: string; defaults: SiteContentDefaults }>>;
  hasProposal(siteId: string, month: string): Promise<boolean>;
  claimAttempt(siteId: string, now: Date): Promise<boolean>;
  propose(siteId: string, month: string): Promise<Topic[]>;
  approve(t: Topic): Promise<Topic | null>;
}

export const PLAN_RETRY_MS = 24 * 60 * 60 * 1000;

/** At most one site per firing (B3); returns the summary, or null when there is nothing to plan. A throw from propose
 *  goes up: the sweep records it and raises the incident, and B2 lets the next attempt through 24 hours later. */
export async function planIfDue(deps: PlanDueDeps, now: Date): Promise<string | null> {
  const month = monthKey(taipeiParts(now.toISOString()).month);
  const due: Array<{ id: string; defaults: SiteContentDefaults }> = [];
  for (const s of await deps.sites()) {
    if (await deps.hasProposal(s.id, month)) continue;
    due.push(s);
  }
  if (!due.length) return null;
  if (!(await deps.canPlan())) return null;
  for (const s of due) {
    if (!(await deps.claimAttempt(s.id, now))) continue;
    const topics = await deps.propose(s.id, month);
    let approved = 0;
    if (aiPicksTopics(s.defaults)) for (const t of topics) if (await deps.approve(t)) approved++;
    return `planned site=${s.id} month=${month} topics=${topics.length} approved=${approved}`;
  }
  return null;
}

const fail = (what: string, e: { message: string }): never => { throw new Error(`content_plan_due:${what}:${e.message}`); };

export function planDueDeps(sb: SupabaseClient, organizationId: string, actor: string): PlanDueDeps {
  return {
    async canPlan() {
      try {
        await runForOrg(organizationId, actor, () => grantFor("content.plan"));
        return true;
      } catch (e) {
        if (e instanceof EntitlementRequired) return false;
        throw e;
      }
    },
    async sites() {
      const { data, error } = await sb.from("wp_sites").select("id, content_defaults").eq("organization_id", organizationId).eq("active", true).order("id");
      if (error) fail("sites", error);
      return ((data ?? []) as Array<{ id: string; content_defaults: SiteContentDefaults | null }>).map((r) => ({ id: r.id, defaults: r.content_defaults ?? {} }));
    },
    async hasProposal(siteId, month) {
      const { data, error } = await sb.from("content_topics").select("id").eq("site_id", siteId).eq("month", month).neq("source", "manual").limit(1);
      if (error) fail("has_proposal", error);
      return (data ?? []).length > 0;
    },
    async claimAttempt(siteId, now) {
      const cutoff = new Date(now.getTime() - PLAN_RETRY_MS).toISOString();
      const { data, error } = await sb.from("wp_sites").update({ content_plan_attempted_at: now.toISOString() }).eq("id", siteId)
        .or(`content_plan_attempted_at.is.null,content_plan_attempted_at.lt.${cutoff}`).select("id");
      if (error) fail("claim", error);
      return (data ?? []).length === 1;
    },
    propose: (siteId, month) => runForOrg(organizationId, actor, async () =>
      proposeMonth(sb, { organizationId, siteId, month, actor }, planAsker(await grantFor("content.plan"), "lib/schedules/content_pipeline"))),
    approve: (t) => move(sb, t, "approved"),
  };
}
