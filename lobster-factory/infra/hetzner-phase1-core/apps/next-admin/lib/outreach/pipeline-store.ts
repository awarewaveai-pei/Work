// The pipeline tick's database and paid-call wiring (lib/outreach/pipeline.ts holds the rules; kept apart so its tests
// do not load the crawler). The two long-lived scans (①②) read the oldest qualified leads a page at a time and stop at
// the limit, so leads already past a step never crowd out the ones still waiting.
import type { SupabaseClient } from "@supabase/supabase-js";
import { grantFor, runForOrg } from "@/lib/entitlements/grant";
import { isWarm } from "./cold-gate";
import { draftMessage } from "./draft";
import { approvedEvidence, generateForLead, isUniqueViolation } from "./generate";
import { researchLead } from "./research";
import { loadSampleContext, type SampleContext } from "./review-policy";
import { POOL_COLS, type PoolAccount } from "./sender-pool";
import { autoDrafts, type DraftRow, type DraftableMessage, type PipelineAccount, type PipelineDeps, type PipelineLead, type PipelineStore, type Profile } from "./pipeline";
import { inPool } from "./sender-pool";

export const PIPELINE_ACTOR = "schedule:outreach_pipeline";
const SCAN_PAGE = 200;
const SCAN_PAGES = 5;
const RESEARCH_RETRY_DAYS = 7;
const TICK_MS = 10 * 60_000;
/** The follow-up steps still to do (followups route STEP_OPEN). */
const STEP_OPEN = ["draft", "approved", "needs_edit", "drafted", "sending"];

const must = <T>(what: string, r: { data: T | null; error: { message: string } | null }): T => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return (r.data ?? ([] as unknown as T));
};
const ids = (rows: Array<{ lead_id: string }>): Set<string> => new Set(rows.map((r) => r.lead_id));
// The auto_draft switch (0155) with the account; the connector says whether drafts can be made at all.
const SWITCH_COLS = `${POOL_COLS}, auto_draft, co_connector_accounts(is_enabled, credentials_ref)`;
type Conn = { is_enabled?: boolean | null; credentials_ref?: string | null };
type SwitchedRow = PoolAccount & { auto_draft?: boolean | null; co_connector_accounts?: Conn | Conn[] | null };
type SwitchedRead = { data: SwitchedRow[] | null; error: { message: string } | null };
const withSwitch = (rows: SwitchedRow[]): PipelineAccount[] =>
  rows.map(({ co_connector_accounts: c, ...a }) => {
    const conn = Array.isArray(c) ? c[0] : c;
    return { ...a, auto_draft: a.auto_draft === true, connector_ok: conn?.is_enabled === true && !!conn?.credentials_ref };
  });

export function supabasePipelineStore(sb: SupabaseClient): PipelineStore {
  const leadsByIds = async (leadIds: string[]): Promise<Map<string, PipelineLead>> => {
    if (!leadIds.length) return new Map();
    const rows = must<PipelineLead[]>("leads read", await sb.from("co_leads").select("*").in("id", leadIds));
    return new Map(rows.map((l) => [l.id, l]));
  };
  /** Up to SCAN_PAGES pages of the organization's qualified leads, filtered by `keep`, until `limit` are kept. The first
   *  page rotates with the tick, so leads past the first pages are reached too (Codex C15 F3). */
  const scan = async (org: string, extra: (q: ReturnType<typeof base>) => ReturnType<typeof base>, keep: (page: PipelineLead[]) => Promise<PipelineLead[]>, limit: number) => {
    const out: PipelineLead[] = [];
    const { count, error } = await extra(sb.from("co_leads").select("id", { count: "exact", head: true }).eq("organization_id", org)
      .eq("status", "qualified").eq("do_not_contact", false) as unknown as ReturnType<typeof base>);
    if (error) throw new Error(`leads count: ${error.message}`);
    const pages = Math.max(1, Math.ceil((count ?? 0) / SCAN_PAGE));
    const first = Math.floor(Date.now() / TICK_MS) % pages;
    for (let i = 0; i < Math.min(SCAN_PAGES, pages) && out.length < limit; i++) {
      const p = (first + i) % pages;
      const page = must<PipelineLead[]>("leads read", await extra(base(org)).order("created_at").order("id").range(p * SCAN_PAGE, (p + 1) * SCAN_PAGE - 1));
      if (!page.length) break;
      out.push(...(await keep(page.filter((l) => !isWarm(l)))));
      if (page.length < SCAN_PAGE) break;
    }
    return out.slice(0, limit);
  };
  const base = (org: string) => sb.from("co_leads").select("*").eq("organization_id", org).eq("status", "qualified").eq("do_not_contact", false);

  return {
    async organizations() {
      const rows = withSwitch(must<SwitchedRow[]>("sender accounts read", (await sb.from("co_sender_accounts").select(SWITCH_COLS)
        .eq("is_active", true).eq("stream_type", "cold").not("organization_id", "is", null).or("send_mode.eq.auto,auto_draft.eq.true")
        .limit(1000)) as unknown as SwitchedRead));
      return [...new Set(rows.filter((a) => inPool(a) || autoDrafts(a)).map((r) => r.organization_id!))];
    },
    async accounts(org) {
      return withSwitch(must<SwitchedRow[]>("sender accounts read", (await sb.from("co_sender_accounts").select(SWITCH_COLS).eq("organization_id", org).eq("stream_type", "cold")) as unknown as SwitchedRead));
    },
    async usedSince(org, sinceIso) {
      const research = await sb.from("co_timeline_events").select("id", { count: "exact", head: true })
        .eq("organization_id", org).eq("event_type", "research_started").gte("created_at", sinceIso);
      if (research.error) throw new Error(`research count: ${research.error.message}`);
      // one set of first emails = its A variant
      const generate = await sb.from("co_messages").select("id", { count: "exact", head: true })
        .eq("organization_id", org).eq("output_type", "cold_email").eq("variant_label", "A").gte("created_at", sinceIso);
      if (generate.error) throw new Error(`generation count: ${generate.error.message}`);
      return { research: research.count ?? 0, generate: generate.count ?? 0 };
    },
    researchCandidates(org, limit) {
      return scan(org, (q) => q.not("website", "is", null), async (page) => {
        const cand = page.filter((l) => (l.website ?? "").trim());
        if (!cand.length) return [];
        const idList = cand.map((l) => l.id);
        const withEvidence = ids(must("evidence read", await sb.from("co_evidence").select("lead_id").in("lead_id", idList)));
        // researched in the last week (nothing found, or the run died): retried once a week, never every tick (Codex C15 F2)
        const weekAgo = new Date(Date.now() - RESEARCH_RETRY_DAYS * 86_400_000).toISOString();
        const tried = ids(must("timeline read", await sb.from("co_timeline_events").select("lead_id").eq("event_type", "research_started")
          .gte("created_at", weekAgo).in("lead_id", idList)));
        return cand.filter((l) => !withEvidence.has(l.id) && !tried.has(l.id));
      }, limit);
    },
    generateCandidates(org, limit) {
      return scan(org, (q) => q.not("email", "is", null), async (page) => {
        if (!page.length) return [];
        const idList = page.map((l) => l.id);
        const approved = ids(must("evidence read", await sb.from("co_evidence").select("lead_id").eq("status", "approved").in("lead_id", idList)));
        const written = ids(must("messages read", await sb.from("co_messages").select("lead_id").in("lead_id", idList)));
        return page.filter((l) => approved.has(l.id) && !written.has(l.id));
      }, limit);
    },
    async undecidedDrafts(org, limit) {
      const profs = must<Array<{ id: string }>>("profiles read", await sb.from("co_service_profiles").select("id").eq("organization_id", org).eq("review_mode", "sampled"));
      if (!profs.length) return { rows: [], leads: new Map() };
      // the policy decides a draft once: gate_snapshot.sampled is its mark (manual-mode drafts never get it, and are not read here)
      const rows = must<Array<DraftRow & { co_leads?: unknown }>>("drafts read", await sb.from("co_messages")
        .select("id, lead_id, variant_label, angle, quality_gate_status, body, gate_snapshot, co_leads!inner(service_profile_id)")
        .eq("organization_id", org).eq("output_type", "cold_email").eq("status", "draft").in("variant_label", ["A", "B"])
        .is("gate_snapshot->>sampled", null).in("co_leads.service_profile_id", profs.map((p) => p.id)).order("created_at").limit(limit));
      return { rows: rows.map(({ co_leads: _l, ...r }) => r), leads: await leadsByIds([...new Set(rows.map((r) => r.lead_id))]) };
    },
    async profile(org, id) {
      if (!id) return null;
      const { data, error } = await sb.from("co_service_profiles").select("id, review_mode, review_sample_pct").eq("id", id).eq("organization_id", org).maybeSingle();
      if (error) throw new Error(`profile read: ${error.message}`);
      return (data as Profile | null) ?? null;
    },
    sampleContext: (org, profileId) => loadSampleContext(sb, org, profileId),
    evidence: (lead) => approvedEvidence(sb, lead),
    async decide(rowId, patch) {
      const { data, error } = await sb.from("co_messages").update(patch).eq("id", rowId).eq("status", "draft").select("id").maybeSingle();
      if (isUniqueViolation(error)) return "conflict";
      if (error) throw new Error(`decision write: ${error.message}`);
      return data ? "ok" : "changed";
    },
    async approveFollowups(leadId, atIso) {
      const { data, error } = await sb.from("co_messages").update({ status: "approved", approved_at: atIso })
        .eq("lead_id", leadId).eq("output_type", "followup").eq("status", "draft").eq("quality_gate_status", "pass").select("id");
      if (error) throw new Error(`follow-up approval write: ${error.message}`);
      return (data ?? []).length;
    },
    async autoApprovedFollowupLeads(org, limit) {
      const fu = must<Array<{ lead_id: string }>>("follow-ups read", await sb.from("co_messages").select("lead_id").eq("organization_id", org)
        .eq("output_type", "followup").eq("status", "draft").eq("quality_gate_status", "pass").limit(500));
      const leadIds = [...ids(fu)];
      if (!leadIds.length) return [];
      const firsts = must<Array<{ lead_id: string }>>("first emails read", await sb.from("co_messages").select("lead_id").eq("output_type", "cold_email")
        .in("status", ["approved", "drafted", "sending", "sent"]).eq("gate_snapshot->>auto", "true").in("lead_id", leadIds.slice(0, 200)));
      return [...ids(firsts)].slice(0, limit);
    },
    async skip(rowIds) {
      if (!rowIds.length) return;
      const { error } = await sb.from("co_messages").update({ status: "skipped" }).in("id", rowIds).eq("status", "draft");
      if (error) throw new Error(`skip write: ${error.message}`);
    },
    async approvedFirstEmails(org, autoSenderIds, limit) {
      if (!autoSenderIds.length) return { rows: [], leads: new Map() };
      const rows = must<Array<{ id: string; lead_id: string; prompt_snapshot: { sender_id?: string } | null }>>("approved read", await sb.from("co_messages")
        .select("id, lead_id, prompt_snapshot").eq("organization_id", org).eq("output_type", "cold_email").eq("status", "approved")
        .in("prompt_snapshot->>sender_id", autoSenderIds).order("approved_at").limit(limit));
      return { rows: rows.map((r) => ({ messageId: r.id, leadId: r.lead_id, senderId: r.prompt_snapshot?.sender_id ?? null })), leads: await leadsByIds([...new Set(rows.map((r) => r.lead_id))]) };
    },
    async dueFollowups(org, todayTaipei, autoSenderIds, limit) {
      if (!autoSenderIds.length) return { rows: [], leads: new Map() };
      const leads = must<PipelineLead[]>("due leads read", await sb.from("co_leads").select("*").eq("organization_id", org).eq("status", "sent")
        .eq("do_not_contact", false).lte("next_followup_date", todayTaipei).order("next_followup_date").limit(SCAN_PAGE));
      if (!leads.length) return { rows: [], leads: new Map() };
      const steps = must<Array<{ id: string; lead_id: string; status: string; channel: string; prompt_snapshot: { sender_id?: string } | null }>>("followups read",
        await sb.from("co_messages").select("id, lead_id, status, channel, prompt_snapshot").eq("output_type", "followup").in("status", STEP_OPEN)
          .in("lead_id", leads.map((l) => l.id)).order("version"));
      // a lead's lowest unsent step only; it must already be approved (a draft step waits for a person) and an email
      const lowest = new Map<string, (typeof steps)[number]>();
      for (const s of steps) if (!lowest.has(s.lead_id)) lowest.set(s.lead_id, s);
      const rows: DraftableMessage[] = [];
      for (const s of lowest.values()) {
        const sender = s.prompt_snapshot?.sender_id ?? null;
        if (s.status === "approved" && s.channel === "email" && sender && autoSenderIds.includes(sender)) rows.push({ messageId: s.id, leadId: s.lead_id, senderId: sender });
      }
      return { rows: rows.slice(0, limit), leads: new Map(leads.map((l) => [l.id, l])) };
    },
  };
}

/** The real deps: the tick's organization is the billing account (runForOrg), every call the same code the routes run. */
export function pipelineDeps(sb: SupabaseClient, deadline: number): PipelineDeps {
  // one sampling-context read per (organization, profile) for the whole tick, not one per written mail
  const contexts = new Map<string, Promise<SampleContext>>();
  return {
    store: supabasePipelineStore(sb),
    deadline,
    runInOrg: (org, fn) => runForOrg(org, PIPELINE_ACTOR, fn),
    async research(lead) {
      const grant = await grantFor("outreach.research");
      const o = await researchLead(sb, lead, { grant, grantContext: {}, runKey: `pipeline-${crypto.randomUUID()}` });
      if (o.status === "failed") throw new Error(o.error ?? "research failed");
    },
    async generate(lead) {
      const res = await generateForLead(sb, lead, { agencyFallback: false, grant: (feature) => grantFor(feature), pastedReply: null, unattended: true,
        sampleContext: (profileId) => {
          const key = `${lead.organization_id}:${profileId}`;
          let c = contexts.get(key);
          if (!c) { c = loadSampleContext(sb, lead.organization_id, profileId); contexts.set(key, c); }
          return c;
        } });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      return { status: res.status, error: j.error };
    },
    async draft(messageId) {
      const res = await draftMessage(sb, messageId, { agencyFallback: false, confirmedNoDraft: false });
      const j = (await res.json().catch(() => ({}))) as { error?: string; dailyLimitReached?: boolean };
      return { status: res.status, error: j.error, dailyLimitReached: j.dailyLimitReached === true };
    },
  };
}
