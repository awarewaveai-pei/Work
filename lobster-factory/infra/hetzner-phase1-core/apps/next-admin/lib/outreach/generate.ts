import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSecret, connectorSecretRef } from "@/lib/secret-vault";
import { checkColdGate, gateMessage, GATE_VERSION, type RequiredParts } from "@/lib/outreach/cold-gate";
import { generateWithGemini } from "@/lib/outreach/ai-gemini";
import { generateWithClaude } from "@/lib/outreach/ai-claude";
import { generateWithOpenAI } from "@/lib/outreach/ai-openai";
import type { Grant } from "@/lib/entitlements/can";

/** The caller's grant for a paid outreach step. Each caller asks it itself, literally (registry-code.test.ts reads the
 *  route's own grantFor): the route for its request's billing account, the pipeline for its organization (runForOrg). */
export type OutreachGrant = (feature: "outreach.draft" | "outreach.qa") => Promise<Grant>;
import { buildBrandContext, composeBody, BrandContextError, type BrandProfile, type EvidenceItem } from "@/lib/outreach/brand-context";
import { parseGenerationOutput, repairPrompt } from "@/lib/outreach/generation-schema";
import { pickVariant, favouredLabel, decideSample, minConfidence, loadSampleContext, NEUTRAL_SAMPLE_CONTEXT, autoApproves, type ClaimCheck, type SampleContext } from "@/lib/outreach/review-policy";
import { checkClaimsVoted, type Recipient } from "@/lib/outreach/claim-check";
import { senderFor } from "@/lib/outreach/sender";

// Cold Outreach -- write one lead's first emails and follow-ups (SPEC §5.3, D23). The one implementation: the messages
// route (a person pressing the button) and the pipeline tick (lib/outreach/pipeline.ts) both call generateForLead. It
// answers as the route does (a Response), so the route stays a pass-through and the pipeline reads status + body.
// Nothing is sent here: rows are drafts, or approved by the sampled policy.

const TABLE = "co_messages";
// First emails on the way out; at most one per lead (0149 co_messages_one_first_email).
const OUTBOUND = ["approved", "drafted", "sending", "copied", "sent"];

export interface LeadRow {
  id: string;
  organization_id: string | null;
  service_profile_id: string | null;
  industry?: string | null;
  name: string | null;
  website?: string | null;
  source_url: string | null;
  consent_source: string | null;
  status: string | null;
  do_not_contact: boolean | null;
}
interface ProfileRow extends BrandProfile { id: string; review_mode: "manual" | "sampled"; review_sample_pct: number }

const PROFILE_COLS = "id, service_name, positioning, usp, target_problems, price_position, tone, forbidden_words, compliance_rules, sensitive_industry_type, privacy_url, review_mode, review_sample_pct";

const BRAND_BLOCK: Record<BrandContextError["code"], string> = {
  no_signature: "寄件信箱還沒有署名：到「信箱與連線」填署名",
  no_evidence: "沒有已核准的證據：冷信必須有對得到的事實",
  no_privacy_url: "這筆名單需要個資告知：到「服務設定」填隱私說明網址",
};

// The lead's approved evidence (co_evidence, card C3).
const EVIDENCE_LIMIT = 12;
export async function approvedEvidence(db: SupabaseClient, lead: LeadRow): Promise<EvidenceItem[]> {
  const { data, error } = await db.from("co_evidence").select("id, claim, excerpt, source_url, status, confidence")
    .eq("lead_id", lead.id).eq("status", "approved").order("created_at", { ascending: true }).limit(EVIDENCE_LIMIT);
  if (error) throw new Error(error.message);
  return (data ?? []) as EvidenceItem[];
}

export const isUniqueViolation = (e: { code?: string } | null): boolean => e?.code === "23505";

/** SPEC D23 steps ② and the final test for one first email: fact check (only when the lint passed and the email was not
 *  sampled out -- a check that cannot change the outcome is not paid for), then autoApproves. A refused outreach.qa grant
 *  (no credits) is a check that did not happen: the email goes to a person. Shared by generation and the pipeline tick. */
export async function autoDecision(a: { gate: "pass" | "warn" | "block"; sampled: boolean; body: string; evidence: EvidenceItem[]; leadId: string;
  /** who the email is to: naming them or their own site is not a claim */ recipient: Recipient;
  grant: OutreachGrant; /** replaces the paid fact check (tests) */ check?: () => Promise<ClaimCheck> }): Promise<{ approve: boolean; claim: ClaimCheck | null }> {
  let claim: ClaimCheck | null = null;
  if (a.gate === "pass" && !a.sampled) {
    try {
      claim = a.check ? await a.check() : await checkClaimsVoted({ body: a.body, evidence: a.evidence, recipient: a.recipient, grant: await a.grant("outreach.qa"), metadata: { lead_id: a.leadId } });
    } catch (e) {
      claim = { verdict: "error", error: e instanceof Error ? e.message : "claim check failed" };
    }
  }
  return { approve: autoApproves({ gate: a.gate, sampled: a.sampled, claim }), claim };
}

export interface GenerateOptions {
  /** May the agency's own mailbox write for this lead (staff yes, a customer no). */
  agencyFallback: boolean;
  /** Who the AI calls are billed to: the request's billedTo, or {} inside runForOrg. */
  grant: OutreachGrant;
  /** A reply the operator got from ChatGPT/Claude for the manual prompt, pasted back. */
  pastedReply: string | null;
  /** The profile's risk and angle context. The pipeline passes one cached per tick (a read per profile, not per mail);
   *  absent = read it here. */
  sampleContext?: (profileId: string) => Promise<SampleContext>;
  /** No person is watching (the pipeline tick): without usable AI output write nothing and answer 503, so the lead stays
   *  a candidate for the next tick. A person pressing the button still gets the manual prompt row. */
  unattended?: boolean;
}

/** The caller has authorized access to the lead's organization. */
export async function generateForLead(supabase: SupabaseClient, lead: LeadRow, o: GenerateOptions): Promise<Response> {
  let evidence: EvidenceItem[];
  try { evidence = await approvedEvidence(supabase, lead); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "evidence read failed" }, { status: 500 }); }
  // Cold Gate — refuse to generate without evidence, for a do_not_contact lead, or for a warm one.
  const gate = checkColdGate(lead, evidence.length);
  if (gate.status === "block") {
    return NextResponse.json({ ok: false, blocked: true, blockers: gate.blockers }, { status: 422 });
  }

  // A lead already has a first email on its way out: a new pair could only ever be skipped.
  const { count: outbound, error: outErr } = await supabase.from(TABLE).select("id", { count: "exact", head: true })
    .eq("lead_id", lead.id).eq("output_type", "cold_email").in("status", OUTBOUND);
  if (outErr) return NextResponse.json({ ok: false, error: outErr.message }, { status: 500 });
  if ((outbound ?? 0) > 0) return NextResponse.json({ ok: false, error: "first_email_exists" }, { status: 409 });

  let sp: ProfileRow | null = null;
  if (lead.service_profile_id) {
    const pq = supabase.from("co_service_profiles").select(PROFILE_COLS).eq("id", lead.service_profile_id);
    const { data, error } = await (lead.organization_id ? pq.eq("organization_id", lead.organization_id) : pq.is("organization_id", null))
      .maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    sp = (data as ProfileRow | null) ?? null;
  }
  const forbidden = Array.isArray(sp?.forbidden_words) ? sp!.forbidden_words!.filter(Boolean) : [];

  let sender: Awaited<ReturnType<typeof senderFor>>;
  try { sender = await senderFor(supabase, lead.organization_id, { agencyFallback: o.agencyFallback }); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "sender read failed" }, { status: 500 }); }
  if (!sender) return NextResponse.json({ ok: false, blocked: true, blockers: ["還沒有冷信寄件信箱：到「信箱與連線」連一個 Gmail"] }, { status: 422 });

  let collector = sender.display_name ?? sender.email;
  if (lead.organization_id) {
    const { data: org } = await supabase.from("organizations").select("name").eq("id", lead.organization_id).maybeSingle();
    collector = (org as { name?: string } | null)?.name ?? collector;
  }

  // C16: what the sampling weights and the angle winner are measured against. A sampled profile never samples on a failed
  // read (nothing would be auto-approved on guesses); a manual one has no sampling, so the prompt just goes without.
  let sctx: SampleContext = NEUTRAL_SAMPLE_CONTEXT;
  if (sp) {
    try { sctx = await (o.sampleContext ?? ((pid) => loadSampleContext(supabase, lead.organization_id, pid)))(sp.id); }
    catch (e) {
      if (sp.review_mode === "sampled") return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "sample context read failed" }, { status: 500 });
    }
  }

  let ctx: ReturnType<typeof buildBrandContext>;
  try {
    ctx = buildBrandContext({ lead, profile: sp, signature: sender.signature_block, collector, evidence, winningAngle: sctx.winner });
  } catch (e) {
    if (e instanceof BrandContextError) return NextResponse.json({ ok: false, blocked: true, blockers: [BRAND_BLOCK[e.code]] }, { status: 422 });
    throw e;
  }
  const required: RequiredParts = { signature: ctx.signature, notice: ctx.notice };

  // A reply the operator got from ChatGPT/Claude for the manual prompt, pasted back: the same guard and rows as the AI
  // path, no AI call (SPEC §5.3 manual_prompt).
  const pasted = o.pastedReply;

  // Resolve AI connector via router ladder: claude → openai → gemini → gemini_agency → manual_prompt.
  // For each paid provider: try client BYO key first, then agency default (null org).
  const AI_PROVIDERS = ["claude", "openai", "gemini", "gemini_agency"] as const;
  type AiProvider = (typeof AI_PROVIDERS)[number];
  let mode: AiProvider | "manual_prompt" | "manual_paste" = "manual_prompt";
  let aiModel: string | null = null;
  let parsed: ReturnType<typeof parseGenerationOutput> | null = null;
  if (pasted) {
    parsed = parseGenerationOutput(pasted, ctx.evidenceIds);
    if (parsed.ok === false) return NextResponse.json({ ok: false, error: "pasted_unparseable", detail: parsed.error }, { status: 400 });
    mode = "manual_paste";
  }

  for (const provider of pasted ? [] : AI_PROVIDERS) {
    const pickRef = async (orgFilter: "client" | "agency"): Promise<string | null> => {
      let q = supabase
        .from("co_connector_accounts")
        .select("id")
        .eq("connector_name", provider)
        .eq("is_enabled", true)
        .not("credentials_ref", "is", null)
        .limit(1);
      q = orgFilter === "client" && lead.organization_id
        ? q.eq("organization_id", lead.organization_id)
        : q.is("organization_id", null);
      const { data } = await q.maybeSingle();
      // The vault name is derived from the row (connectorSecretRef), never read from it: a stored name could point at
      // another tenant's secret. Agency keys (organization_id IS NULL) serve a customer without its own key, billed through
      // outreach.draft credits (grantFor below); unlike Gmail, an AI key is not the customer's identity.
      const id = (data as { id?: string } | null)?.id;
      return id ? connectorSecretRef(id) : null;
    };
    const ref = (lead.organization_id ? await pickRef("client") : null) ?? (await pickRef("agency"));
    // No connector: OpenAI falls back to the platform key every other feature uses (lib/ai/cheap-json.ts), one copy of
    // it in the host env rather than a second in the vault. The agency Gemini free key 429s after ~12 emails (C15.4).
    let apiKey: string | null = !ref && provider === "openai" ? process.env.OPENAI_API_KEY?.trim() || null : null;
    if (ref) {
      // vault error on one provider → try next rather than hard-fail
      try { apiKey = await getSecret(ref); }
      catch (e) { aiModel ??= `vault_read_failed:${e instanceof Error ? e.message.slice(0, 80) : "vault read error"}`; }
    }
    if (!apiKey) continue;
    const key = apiKey;
    // A provider whose call fails (no credits, 429, network) hands the lead to the next rung: with the platform OpenAI
    // key out of credits (2026-11-05) nothing was written although the Gemini key worked. An answer that cannot be
    // parsed, even after the repair prompt, is that model's output and ends the walk.
    try {
      const grant = await o.grant("outreach.draft");
      const generate = (prompt: string) => provider === "claude" ? generateWithClaude(grant, key, prompt)
        : provider === "openai" ? generateWithOpenAI(grant, key, prompt) : generateWithGemini(grant, key, prompt);
      const first = await generate(ctx.prompt);
      parsed = parseGenerationOutput(first.text, ctx.evidenceIds);
      aiModel = first.model;
      if (parsed.ok === false) {
        const second = await generate(repairPrompt(ctx.prompt, first.text, parsed.error));
        parsed = parseGenerationOutput(second.text, ctx.evidenceIds);
      }
      if (parsed.ok === true) mode = provider;
      else aiModel = `${provider}_unparseable:${parsed.error.slice(0, 80)}`;
      break;
    } catch (e) {
      aiModel = `${provider}_failed:${e instanceof Error ? e.message.slice(0, 80) : "error"}`;
    }
  }

  const base = { organization_id: lead.organization_id ?? null, lead_id: lead.id, channel: "email", ai_model: aiModel,
    prompt_snapshot: { prompt: ctx.prompt, mode, sender_id: sender.id } };


  if (!parsed?.ok) {
    if (o.unattended) return NextResponse.json({ ok: false, error: `ai_unavailable:${aiModel ?? "no_ai_key"}` }, { status: 503 });
    // No usable AI output: the prompt itself, for the operator to paste into ChatGPT/Claude (極省模式). It is a prompt,
    // not an email, so it is blocked until a person pastes the email back (PATCH re-gates the edited body).
    const { data: created, error: createErr } = await supabase.from(TABLE).insert({
      ...base, output_type: "cold_email", subject: null, body: ctx.prompt, version: 1, safety_score: null,
      quality_gate_status: "block", status: "draft", evidence_snapshot: { evidence_ids: ctx.evidenceIds },
      gate_snapshot: { gate_version: GATE_VERSION, findings: ["這是提示詞：貼到 AI，再把產出的信貼回來"], required, forbidden },
    }).select("*").single();
    if (createErr) return NextResponse.json({ ok: false, error: createErr.message }, { status: 500 });
    return NextResponse.json({ ok: true, mode, messages: [created] });
  }

  const out = parsed.value;
  const sampledMode = sp?.review_mode === "sampled";
  const keep = sampledMode ? pickVariant(lead.id, favouredLabel(sctx.winner, out.bodies)) : null;
  const lowest = minConfidence(evidence);
  const nowIso = new Date().toISOString();

  const rows: Record<string, unknown>[] = [];
  for (const [i, b] of out.bodies.entries()) {
    const subject = out.subjects[i];
    const text = composeBody(b.text, ctx);
    const g = gateMessage({ subject, body: text, forbidden, required });
    const snapshot: Record<string, unknown> = { gate_version: g.gate_version, findings: g.findings, required, forbidden, profile_id: sp?.id ?? null };
    let status = "draft";
    let approvedAt: string | null = null;
    if (keep && b.label !== keep) {
      status = "skipped";
    } else if (keep) {
      const ds = decideSample(sctx, { leadId: lead.id, pct: sp?.review_sample_pct ?? 10, industry: lead.industry, angle: b.angle, minConfidence: lowest });
      const d = await autoDecision({ gate: g.quality_gate_status, sampled: ds.sampled, body: text, evidence, leadId: lead.id,
        recipient: { name: lead.name, website: lead.website ?? null }, grant: o.grant });
      if (d.claim) snapshot.claim_check = d.claim;
      snapshot.sampled = ds.sampled;
      snapshot.sample = { weight: ds.weight, mean: ds.mean, p: ds.p, flags: ds.flags };
      if (d.approve) {
        status = "approved";
        approvedAt = nowIso;
        snapshot.auto = true;
      }
    }
    rows.push({ ...base, output_type: "cold_email", variant_label: b.label, angle: b.angle, subject, body: text, version: 1,
      safety_score: g.safety_score, quality_gate_status: g.quality_gate_status, gate_snapshot: snapshot,
      evidence_snapshot: { evidence_ids: b.evidence_ids }, status, approved_at: approvedAt });
  }
  const fuRequired: RequiredParts = { signature: ctx.signature, notice: null };
  for (const f of out.followups) {
    const text = composeBody(f.text, { signature: ctx.signature, notice: null });
    const g = gateMessage({ subject: null, body: text, forbidden, required: fuRequired });
    rows.push({ ...base, output_type: "followup", variant_label: null, subject: null, body: text, version: f.step,
      followup_delay_days: f.delay_days, safety_score: g.safety_score, quality_gate_status: g.quality_gate_status,
      gate_snapshot: { gate_version: g.gate_version, findings: g.findings, required: fuRequired, forbidden },
      evidence_snapshot: { evidence_ids: [] }, status: "draft" });
  }

  const { data: created, error: createErr } = await supabase.from(TABLE).insert(rows).select("*");
  if (isUniqueViolation(createErr)) return NextResponse.json({ ok: false, error: "first_email_exists" }, { status: 409 });
  if (createErr) return NextResponse.json({ ok: false, error: createErr.message }, { status: 500 });
  // The new set replaces this lead's unsent one (the earlier pair, its follow-ups, a manual prompt): one set under
  // review. Written first, retired second: a failed write or AI call never takes away a set a person is reviewing.
  // Retired = created before this set; two concurrent generations then keep the newer set, never neither.
  const createdAts = ((created ?? []) as Array<{ created_at?: string }>).map((r) => r.created_at).filter((v): v is string => !!v).sort();
  const cutoff = createdAts[0] ?? nowIso;
  const { error: retireErr } = await supabase.from(TABLE).update({ status: "skipped" })
    .eq("lead_id", lead.id).in("status", ["draft", "needs_edit"]).lt("created_at", cutoff);
  const warning = retireErr ? `the earlier unsent set was not skipped: ${retireErr.message}` : undefined;

  await supabase.from("co_leads").update({ status: "message_generated", updated_at: nowIso }).eq("id", lead.id);
  return NextResponse.json({ ok: true, mode, messages: created ?? [], warning });
}
