// The mass-production pipeline tick (card C15; SPEC §6, D23, D24): each tick moves every organization's leads one step
// along research -> write -> review policy -> Gmail draft -> due follow-up draft, so that with a sampled profile a person
// only sees the sample and the doubtful. Runs in the gmail-sync tick after the reply sync and BEFORE the automatic send
// (app/api/internal/outreach/gmail-sync). It never sends: sending stays in send-adapter.ts.
//   ① research   qualified lead with a website, no evidence, never researched      -> deps.research     (outreach.research)
//   ② write      qualified lead with approved evidence and no message at all        -> deps.generate     (outreach.draft)
//   ③ policy     draft first emails of a sampled profile's leads: one variant per lead (hash), the other 'skipped';
//                lint pass + fact check supported + not sampled out -> approved, gate_snapshot.auto=true; else queue.
//                'manual' never reaches here: nothing approves it but a person.
//   ④ draft      approved first email whose mailbox drafts by itself                 -> deps.draft
//   ⑤ follow-up  lead 'sent', next_followup_date <= today (Taipei), its lowest unsent step approved, same mailboxes -> deps.draft
// "Drafts by itself" = a pool mailbox (send_mode='auto', sent by send-adapter.ts) or a draft mailbox with auto_draft on
// (migration 0155) and an enabled Gmail connector (the operator's own Gmail, 2026-11-03: drafts appear in Gmail, a person
// presses send; send-adapter never reads it, SPEC I10). Every step has a per-tick cap (PIPELINE_CAP) and ①② a per-organization daily
// budget: those mailboxes' caps today x 1.5.
// Cold Gate side: a do_not_contact or warm lead (isWarm: replied, opted out, Meta lead ad...) is never touched, whatever
// the store returned. Work runs inside deps.runInOrg so every paid call bills that organization.
import { EntitlementRequired } from "@/lib/entitlements/can";
import { grantFor } from "@/lib/entitlements/grant";
import type { EvidenceItem } from "./brand-context";
import { isWarm } from "./cold-gate";
import { autoDecision, type LeadRow } from "./generate";
import { decideSample, favouredLabel, minConfidence, pickVariant, NEUTRAL_SAMPLE_CONTEXT, type ClaimCheck, type SampleContext } from "./review-policy";
import { capOf, inPool, type PoolAccount } from "./sender-pool";

export const PIPELINE_CAP = 20;
export const BUDGET_FACTOR = 1.5;
/** Paid steps run this many leads at once: 20 leads one after another would not fit a tick. */
const CONCURRENCY = 4;

/** A sender account with its auto_draft switch and whether its Gmail connector is enabled and holds a token. */
export type PipelineAccount = PoolAccount & { auto_draft?: boolean; connector_ok?: boolean };
/** A draft-mode mailbox the operator switched on for the pipeline: drafted for, never sent from. A disabled connector
 *  could not take the drafts, so nothing is researched or written for it. */
export const autoDrafts = (a: PipelineAccount): boolean =>
  a.is_active && a.health_status === "healthy" && a.send_mode === "draft" && a.auto_draft === true && !!a.connector_id && a.connector_ok === true;
const drafting = (a: PipelineAccount): boolean => inPool(a) || autoDrafts(a);

/** Lead columns the steps read; generation needs the whole row (LeadRow is what the messages route passes it). */
export type PipelineLead = LeadRow & { website: string | null; email: string | null; social_url?: string | null };
export interface Profile { id: string; review_mode: "manual" | "sampled"; review_sample_pct: number }
export interface DraftRow { id: string; lead_id: string; variant_label: string | null; angle?: string | null; quality_gate_status: "pass" | "warn" | "block";
  body: string; gate_snapshot: Record<string, unknown> | null }
export interface DraftableMessage { messageId: string; leadId: string; senderId: string | null }
export type DecideResult = "ok" | "conflict" | "changed";

export interface PipelineStore {
  /** Organizations with a mailbox that drafts by itself (pool, or draft + auto_draft): the only ones the pipeline works for. */
  organizations(): Promise<string[]>;
  accounts(org: string): Promise<PipelineAccount[]>;
  /** Research runs started and first-email sets written since sinceIso (the Taipei day start). */
  usedSince(org: string, sinceIso: string): Promise<{ research: number; generate: number }>;
  researchCandidates(org: string, limit: number): Promise<PipelineLead[]>;
  generateCandidates(org: string, limit: number): Promise<PipelineLead[]>;
  /** Draft first emails (A/B) not yet decided by the policy, of leads whose profile is sampled, with those leads. */
  undecidedDrafts(org: string, limit: number): Promise<{ rows: DraftRow[]; leads: Map<string, PipelineLead> }>;
  profile(org: string, id: string | null): Promise<Profile | null>;
  /** The profile's sampling risk and angle winner (C16), one batch read; absent = nothing flagged, plain review_sample_pct. */
  sampleContext?(org: string, profileId: string): Promise<SampleContext>;
  evidence(lead: PipelineLead): Promise<EvidenceItem[]>;
  /** draft -> approved or just the snapshot (status undefined); conditional on the row still being a draft. */
  decide(rowId: string, patch: { status?: "approved"; approved_at?: string; gate_snapshot: Record<string, unknown> }): Promise<DecideResult>;
  skip(rowIds: string[]): Promise<void>;
  /** The lead's draft follow-ups whose gate passed -> approved (with an auto-approved first email); returns how many. */
  approveFollowups(leadId: string, atIso: string): Promise<number>;
  /** Leads with draft follow-ups whose gate passed and whose first email was auto-approved (gate_snapshot.auto). */
  autoApprovedFollowupLeads(org: string, limit: number): Promise<string[]>;
  /** Approved first emails of auto mailboxes, oldest approval first, with their leads. */
  approvedFirstEmails(org: string, autoSenderIds: string[], limit: number): Promise<{ rows: DraftableMessage[]; leads: Map<string, PipelineLead> }>;
  /** The lowest unsent follow-up of every due lead, when that step is approved and an email step, with its lead. */
  dueFollowups(org: string, todayTaipei: string, autoSenderIds: string[], limit: number): Promise<{ rows: DraftableMessage[]; leads: Map<string, PipelineLead> }>;
}

export interface PipelineDeps {
  store: PipelineStore;
  /** Runs fn billed to the organization (runForOrg); tests run it directly. */
  runInOrg<T>(org: string, fn: () => Promise<T>): Promise<T>;
  research(lead: PipelineLead): Promise<void>;
  /** The messages route's generation: its HTTP status and error name. */
  generate(lead: PipelineLead): Promise<{ status: number; error?: string }>;
  /** The gmail-draft route's drafting. */
  draft(messageId: string): Promise<{ status: number; error?: string; dailyLimitReached?: boolean }>;
  /** The paid fact check for a body; absent = the real outreach.qa call. */
  check?: (lead: PipelineLead, body: string, evidence: EvidenceItem[]) => Promise<ClaimCheck>;
  now?: () => Date;
  /** Epoch ms after which no new lead starts. Research stops 80 s and writing 30 s before it. */
  deadline?: number;
}

export interface PipelineResult {
  orgs: number;
  researched: number;
  generated: number;
  /** drafts the policy approved by itself / left for a person / skipped as the other variant */
  autoApproved: number;
  queued: number;
  skipped: number;
  drafted: number;
  followupsDrafted: number;
  /** a step stopped for the day: budget used up, or no credits */
  held: string[];
  /** a lead's step that failed (it is tried again next tick, or by a person) */
  failed: number;
  /** the store could not be read: the tick is incomplete (turns /ops/schedules red) */
  errors: string[];
}

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));
/** The Asia/Taipei calendar date (YYYY-MM-DD) of an instant; Taipei has no DST. */
const taipeiDate = (at: Date): string => new Date(at.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
/** The Taipei midnight today's budget counts from. */
const dayStartIso = (at: Date): string => new Date(`${taipeiDate(at)}T00:00:00+08:00`).toISOString();
const cold = (l: PipelineLead): boolean => !l.do_not_contact && !isWarm(l);

/** The daily limit of ① and ②: what the organization's drafting mailboxes may take today, x 1.5 (C15.3); a draft
 *  mailbox counts its daily_limit (the draft route's own daily cap). */
export const dailyBudget = (accounts: readonly PipelineAccount[]): number =>
  Math.floor(accounts.reduce((n, a) => n + (inPool(a) ? capOf(a) : autoDrafts(a) ? a.daily_limit : 0), 0) * BUDGET_FACTOR);

/** fn over items, CONCURRENCY at a time; no new item starts after stopAt. */
async function each<T>(items: readonly T[], stopAt: number, now: () => Date, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => { for (;;) { const i = next++; if (i >= items.length || now().getTime() >= stopAt) return; await fn(items[i]); } };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
}

export async function runPipelineTick(deps: PipelineDeps): Promise<PipelineResult> {
  const now = deps.now ?? (() => new Date());
  const r: PipelineResult = { orgs: 0, researched: 0, generated: 0, autoApproved: 0, queued: 0, skipped: 0, drafted: 0, followupsDrafted: 0, held: [], failed: 0, errors: [] };
  let orgs: string[];
  try { orgs = await deps.store.organizations(); }
  catch (e) { r.errors.push(`pipeline organizations: ${errText(e)}`); return r; }
  for (const org of orgs) {
    r.orgs++;
    try { await deps.runInOrg(org, () => runOrg(deps, org, r, now)); }
    catch (e) { r.errors.push(`pipeline ${org}: ${errText(e)}`); }
  }
  return r;
}

async function runOrg(deps: PipelineDeps, org: string, r: PipelineResult, now: () => Date): Promise<void> {
  const { store } = deps;
  const end = deps.deadline ?? Number.POSITIVE_INFINITY;
  const accounts = await store.accounts(org);
  // Drafts only for mailboxes that can take them now (a paused one gets none; Codex C15 F4).
  const autoIds = accounts.filter(drafting).map((a) => a.id);
  const budget = dailyBudget(accounts);
  const used = await store.usedSince(org, dayStartIso(now()));
  // A refused grant (no credits) stops that paid step for the organization: not a failure of the leads.
  const guarded = async <T>(step: string, fn: () => Promise<T>): Promise<T | undefined> => {
    try { return await fn(); }
    catch (e) { if (e instanceof EntitlementRequired) { r.held.push(`${org}:${step}:${e.code}`); return undefined; } throw e; }
  };

  // ① research
  const researchRoom = Math.min(PIPELINE_CAP, budget - used.research);
  if (researchRoom <= 0) r.held.push(`${org}:research:daily_budget`);
  else {
    const leads = (await store.researchCandidates(org, researchRoom)).filter(cold).slice(0, researchRoom);
    await each(leads, end - 80_000, now, async (lead) => {
      const ok = await guarded("research", async () => { await deps.research(lead); return true; }).catch(() => { r.failed++; return false; });
      if (ok) r.researched++;
    });
  }

  // ② write first emails
  const writeRoom = Math.min(PIPELINE_CAP, budget - used.generate);
  if (writeRoom <= 0) r.held.push(`${org}:generate:daily_budget`);
  else {
    const leads = (await store.generateCandidates(org, writeRoom)).filter(cold).slice(0, writeRoom);
    await each(leads, end - 30_000, now, async (lead) => {
      const res = await guarded("generate", () => deps.generate(lead)).catch(() => ({ status: 500 }));
      if (res && res.status === 200) r.generated++;
      else if (res && res.status !== 409) { r.failed++; r.errors.push(`generate ${lead.id}: ${res.status}${"error" in res && res.error ? ` ${res.error}` : ""}`); }
    });
  }

  // ③ review policy
  const { rows, leads: draftLeads } = await store.undecidedDrafts(org, PIPELINE_CAP * 2 * 3);
  const byLead = new Map<string, DraftRow[]>();
  for (const row of rows) byLead.set(row.lead_id, [...(byLead.get(row.lead_id) ?? []), row]);
  // one context read per profile per tick, shared by every lead of the profile
  const contexts = new Map<string, Promise<SampleContext>>();
  const contextOf = (profileId: string): Promise<SampleContext> => {
    let c = contexts.get(profileId);
    if (!c) { c = store.sampleContext ? store.sampleContext(org, profileId) : Promise.resolve(NEUTRAL_SAMPLE_CONTEXT); contexts.set(profileId, c); }
    return c;
  };
  const decide = [...byLead.entries()].filter(([id]) => { const l = draftLeads.get(id); return !!l && cold(l); }).slice(0, PIPELINE_CAP);
  await each(decide, end, now, async ([leadId, variants]) => {
    try { await applyPolicy(deps, org, draftLeads.get(leadId)!, variants, r, now, contextOf); }
    catch (e) { if (e instanceof EntitlementRequired) r.held.push(`${org}:policy:${e.code}`); else r.failed++; }
  });

  // ③b Follow-ups ride on their first email (decision 2026-11-02): a lead whose first email was auto-approved -- by
  // generation or by ③ -- gets its draft follow-ups approved when their own gate passed; warn / block stay for a person.
  // Without this nothing approves follow-ups in a sampled profile (Codex C15 F1).
  for (const leadId of await store.autoApprovedFollowupLeads(org, PIPELINE_CAP)) {
    try { r.autoApproved += await store.approveFollowups(leadId, now().toISOString()); } catch { r.failed++; }
  }

  // ④ Gmail drafts of approved first emails, drafting mailboxes only
  const firsts = await store.approvedFirstEmails(org, autoIds, PIPELINE_CAP);
  r.drafted += await draftAll(deps, firsts, end, now, r);

  // ⑤ due follow-ups, in the thread (draftMessage does the reply headers)
  const due = await store.dueFollowups(org, taipeiDate(now()), autoIds, PIPELINE_CAP);
  r.followupsDrafted += await draftAll(deps, due, end, now, r);
}

/** One lead's drafts of a sampled profile (SPEC D23). Decisions are deterministic: the same lead always gets the same
 *  variant and the same sample answer. */
async function applyPolicy(deps: PipelineDeps, org: string, lead: PipelineLead, variants: DraftRow[], r: PipelineResult, now: () => Date,
  contextOf: (profileId: string) => Promise<SampleContext>): Promise<void> {
  const profile = await deps.store.profile(org, lead.service_profile_id);
  if (profile?.review_mode !== "sampled") return;
  const ctx = await contextOf(profile.id);
  const keepLabel = pickVariant(lead.id, favouredLabel(ctx.winner, variants.map((v) => ({ label: v.variant_label, angle: v.angle ?? null }))));
  const keep = variants.find((v) => v.variant_label === keepLabel);
  if (!keep) return;
  const others = variants.filter((v) => v.id !== keep.id).map((v) => v.id);
  const evidence = await deps.store.evidence(lead);
  const ds = decideSample(ctx, { leadId: lead.id, pct: profile.review_sample_pct, industry: lead.industry, angle: keep.angle, minConfidence: minConfidence(evidence) });
  const sampled = ds.sampled;
  const d = await autoDecision({ gate: keep.quality_gate_status, sampled, body: keep.body, evidence, leadId: lead.id,
    recipient: { name: lead.name, website: lead.website }, grant: (feature) => grantFor(feature),
    ...(deps.check ? { check: () => deps.check!(lead, keep.body, evidence) } : {}) });
  const snapshot: Record<string, unknown> = { ...(keep.gate_snapshot ?? {}), sampled, sample: { weight: ds.weight, mean: ds.mean, p: ds.p, flags: ds.flags }, profile_id: profile.id, ...(d.claim ? { claim_check: d.claim } : {}) };
  let outcome: DecideResult;
  if (d.approve) {
    snapshot.auto = true;
    outcome = await deps.store.decide(keep.id, { status: "approved", approved_at: now().toISOString(), gate_snapshot: snapshot });
  } else {
    outcome = await deps.store.decide(keep.id, { gate_snapshot: snapshot });
  }
  if (outcome === "changed") return;  // a person got there first
  // One first email per lead: the other variant goes either way. A second approved first email would also hit the
  // 0149 unique index (conflict): the kept one is then the loser and is skipped as well.
  if (outcome === "conflict") others.push(keep.id);
  await deps.store.skip(others);
  r.skipped += others.length;
  if (outcome === "ok" && d.approve) r.autoApproved++; else if (outcome === "ok") r.queued++;
}

/** Draft each message; a mailbox that answered "daily limit" gets no more this tick. Returns how many were drafted. */
async function draftAll(deps: PipelineDeps, src: { rows: DraftableMessage[]; leads: Map<string, PipelineLead> }, end: number, now: () => Date, r: PipelineResult): Promise<number> {
  const full = new Set<string>();
  let n = 0;
  for (const m of src.rows.slice(0, PIPELINE_CAP)) {
    if (now().getTime() >= end) break;
    const lead = src.leads.get(m.leadId);
    if (!lead || !cold(lead) || (m.senderId && full.has(m.senderId))) continue;
    try {
      const res = await deps.draft(m.messageId);
      if (res.status === 200) n++;
      else if (res.dailyLimitReached && m.senderId) full.add(m.senderId);
      else if (res.status >= 500) r.failed++;
    } catch { r.failed++; }
  }
  return n;
}
