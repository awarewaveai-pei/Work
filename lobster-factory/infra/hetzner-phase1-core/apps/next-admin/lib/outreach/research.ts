// Cold Outreach v2 -- research one lead (SPEC §5.1, card C3): read its own website (never social_url, SPEC D20), store
// the facts each page proves (sink/outreach-research), and, when the lead has no email, take the best address the site
// publishes and check its domain receives mail. Every outcome is a timeline row, so "why can't this lead get an email"
// has an answer in the lead's history. The caller has already authorized the lead and holds its outreach.research grant.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Grant } from "@/lib/entitlements/can";
import type { GrantContext } from "@/lib/entitlements/grant";
import { runLeadResearch } from "@/lib/collect/run";
import { createOutreachResearchSink } from "@/lib/collect/sinks/outreach-research";
import { autoEligible, bestEmail, hostOf, isPlatformHost } from "./research-extract";
import { LEAD_RESEARCH_BUDGET } from "@/lib/collect/run";

/** Fetch budget plus time for the last pages to be read by the model; past it no page goes to the model. */
const EXTRACTION_GRACE_MS = 30_000;
import { verifyEmails } from "./verify-email";

export interface ResearchLead { id: string; organization_id: string | null; name: string | null; website: string | null; email: string | null;
  consent_source: string | null }

export interface ResearchOutcome {
  leadId: string;
  status: "done" | "insufficient" | "no_website" | "platform_website" | "failed";
  organizationId: string | null;
  /** New evidence rows this run (an earlier run's rows are not counted again). */
  written: number;
  approved: number;
  /** Approved evidence the lead has after this run: 0 = cold email cannot be written yet. */
  evidence: number;
  /** Evidence waiting for a person. */
  pending: number;
  emailFound: string | null;
  error?: string;
  /** Bookkeeping that did not land (a timeline row, a count): the outcome stands, the record is incomplete. */
  errors: string[];
}

async function timeline(db: SupabaseClient, lead: ResearchLead, event_type: string, title: string, metadata: Record<string, unknown>, errors: string[]) {
  const { error } = await db.from("co_timeline_events").insert({ organization_id: lead.organization_id, lead_id: lead.id, event_type, title, metadata });
  if (error) errors.push(`timeline ${event_type}: ${error.message}`);
}

/** The website a research run may read: http(s) with a host, the scheme added when the operator typed a bare domain.
 *  A social network, link page or marketplace is not the business's own site (SPEC D20): refused. */
export function researchUrl(website: string | null): { url: string } | { reason: "no_website" | "platform_website" } {
  const w = (website ?? "").trim();
  if (!w) return { reason: "no_website" };
  const url = /^https?:\/\//i.test(w) ? w : `https://${w}`;
  const host = hostOf(url);
  if (!host) return { reason: "no_website" };
  return isPlatformHost(host) ? { reason: "platform_website" } : { url };
}

export async function researchLead(db: SupabaseClient, lead: ResearchLead,
  opts: { grant: Grant; grantContext: GrantContext; runKey: string; log?: (msg: string) => void }): Promise<ResearchOutcome> {
  const errors: string[] = [];
  const base: ResearchOutcome = { leadId: lead.id, organizationId: lead.organization_id, status: "failed", written: 0, approved: 0, evidence: 0,
    pending: 0, emailFound: null, errors };
  const target = researchUrl(lead.website);
  if ("reason" in target) {
    const title = target.reason === "platform_website" ? "網站欄是社群或平台頁，不是對方自己的網站：不研究" : "沒有網站可研究";
    await timeline(db, lead, "research_insufficient", title, { reason: target.reason, website: lead.website }, errors);
    return { ...base, status: target.reason };
  }
  const url = target.url;
  // started without done/insufficient/failed after it = a run the server lost (restart): the pipeline tick (C15) picks
  // the lead again by its state, so no job outlives the process.
  await timeline(db, lead, "research_started", "開始研究", { url, run: opts.runKey }, errors);

  const sink = createOutreachResearchSink({ db, lead: { ...lead, website: url }, grant: opts.grant,
    deadline: Date.now() + LEAD_RESEARCH_BUDGET.ms + EXTRACTION_GRACE_MS });
  let sinkErrors: string[] = [];
  try {
    const r = await runLeadResearch({ website: url, sink, tenantRef: `outreach:${lead.organization_id ?? "agency"}`,
      runKey: opts.runKey, grantContext: opts.grantContext, log: opts.log });
    sinkErrors = r.sink.errors ?? [];
    base.written = r.sink.written;
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await timeline(db, lead, "research_failed", "研究失敗", { url, error: error.slice(0, 300) }, errors);
    return { ...base, error };
  }
  base.approved = sink.approved;

  for (const status of ["approved", "pending"] as const) {
    const { count, error } = await db.from("co_evidence").select("id", { count: "exact", head: true }).eq("lead_id", lead.id).eq("status", status);
    if (error) errors.push(`count ${status}: ${error.message}`);
    if (status === "approved") base.evidence = count ?? 0; else base.pending = count ?? 0;
  }

  // A contact address only when the lead has none: an operator-entered one is never replaced. Only an eligible address
  // (own domain, or a mailto on the business's own page) is taken; it was published by the business itself on its own
  // site (SPEC D20 self_published: no notice line). Everything else is a candidate on the timeline, for a person.
  // Compare-and-set on the email read at the start, so an address set meanwhile (or a blank one) is never overwritten.
  if (!(lead.email ?? "").trim()) {
    // MX first: an undeliverable address would be filled in, block every draft (contact-guard email_invalid), and never
    // be replaced (an email is never overwritten). Only a definite "invalid" excludes; unknown is a later lookup.
    const statuses = await verifyEmails(db, lead.organization_id, sink.emails.filter(autoEligible).map((f) => f.email)).catch(() => new Map<string, string>());
    const undeliverable = sink.emails.filter((f) => autoEligible(f) && statuses.get(f.email) === "invalid");
    const eligible = sink.emails.filter((f) => autoEligible(f) && statuses.get(f.email) !== "invalid");
    const others = sink.emails.filter((f) => !autoEligible(f)).slice(0, 5);
    for (let pick = bestEmail(eligible); pick; pick = bestEmail(eligible)) {
      eligible.splice(eligible.indexOf(pick), 1);
      const q = db.from("co_leads").update({ email: pick.email, updated_at: new Date().toISOString() }).eq("id", lead.id);
      const { data, error } = await (lead.email === null ? q.is("email", null) : q.eq("email", lead.email)).select("id").maybeSingle();
      if (error?.code === "23505") {
        await timeline(db, lead, "email_skipped", "網站上的 email 已屬於另一筆名單", { email: pick.email, source_url: pick.sourceUrl }, errors);
        continue; // the next eligible address
      }
      if (error) { errors.push(`email: ${error.message}`); break; }
      if (!data) break; // someone set the address meanwhile
      base.emailFound = pick.email;
      await timeline(db, lead, "email_found", "從網站找到 email", { email: pick.email, source_url: pick.sourceUrl, mailto: pick.mailto }, errors);
      const { error: cErr } = await db.from("co_leads").update({ consent_source: `self_published:${pick.sourceUrl}` })
        .eq("id", lead.id).is("consent_source", null);
      if (cErr) errors.push(`consent_source: ${cErr.message}`);
      break;
    }
    if (undeliverable.length) {
      await timeline(db, lead, "email_undeliverable", "網站上的 email 網域收不到信，沒有填入", { emails: undeliverable.map((f) => f.email) }, errors);
    }
    if (!base.emailFound && others.length) {
      await timeline(db, lead, "email_candidates", "網站上有其他 email，需要人確認是不是對方的", { candidates: others.map((f) => ({ email: f.email, source_url: f.sourceUrl })) }, errors);
    }
  }

  // done = cold email can be written now (approved evidence); pending-only waits for a person, said as such.
  const status = base.evidence > 0 ? "done" : "insufficient";
  await timeline(db, lead, status === "done" ? "research_done" : "research_insufficient",
    status === "done" ? `研究完成：${base.written} 條新證據` : base.pending ? `有 ${base.pending} 條證據等人核准` : "網站上找不到可用的事實",
    { url, written: base.written, approved: base.approved, evidence: base.evidence, pending: base.pending, late: sink.late, stale: sink.stale, revived: sink.revived,
      errors: sinkErrors.slice(0, 5) }, errors);
  return { ...base, status };
}
