import { NextResponse } from "next/server";
import { resolveOpsRole, canManageOutreach } from "@/lib/ops-role";
import { outreachDb } from "@/lib/outreach/db-client";
import { getSecret, connectorSecretRef } from "@/lib/secret-vault";
import { checkColdGate, gateMessage, lintMessage, GATE_VERSION, type RequiredParts } from "@/lib/outreach/cold-gate";
import { generateWithGemini } from "@/lib/outreach/ai-gemini";
import { effectiveOrgId, assertOrgAccess, OrgAccessError, toOrgAccessResponse, userKindOf } from "@/lib/tenant-guard";
import { generateWithClaude } from "@/lib/outreach/ai-claude";
import { generateWithOpenAI } from "@/lib/outreach/ai-openai";
import { grantFor } from "@/lib/entitlements/grant";
import { billedTo } from "@/lib/outreach/billing";
import { buildBrandContext, composeBody, BrandContextError, type BrandProfile, type EvidenceItem } from "@/lib/outreach/brand-context";
import { parseGenerationOutput, repairPrompt } from "@/lib/outreach/generation-schema";
import { pickVariant, inSample, autoApproves, type ClaimCheck } from "@/lib/outreach/review-policy";
import { checkClaims } from "@/lib/outreach/claim-check";
import { senderFor } from "@/lib/outreach/sender";

// Cold Outreach — message generation and review (SPEC §5.3, §5.4, D23). Table: co_messages (0048, 0149).
// POST: Cold Gate → brand context (signature, evidence, notice) → AI ladder (claude > openai > gemini > gemini_agency >
// manual_prompt) → JSON guard with one repair turn → 2 first emails (A/B) + follow-ups, each gated (gateMessage) → the
// profile's review policy. Nothing is sent here: rows are drafts, or approved by the sampled policy; drafting in Gmail is
// gmail-draft/route.ts. Writes need canManageOutreach; GET is authed-only.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABLE = "co_messages";
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
// Guard uuid-typed columns up front so a bad id returns a clean 400, not a raw PG 22P02 leak.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// First emails on the way out; at most one per lead (0149 co_messages_one_first_email).
const OUTBOUND = ["approved", "drafted", "sending", "copied", "sent"];

interface LeadRow {
  id: string;
  organization_id: string | null;
  service_profile_id: string | null;
  name: string | null;
  observation: string | null;
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

// The lead's approved evidence (co_evidence, card C3) plus, until card C9, its old observation + source as one more fact.
const EVIDENCE_LIMIT = 12;
async function approvedEvidence(db: NonNullable<Awaited<ReturnType<typeof outreachDb>>>, lead: LeadRow): Promise<EvidenceItem[]> {
  const { data, error } = await db.from("co_evidence").select("id, claim, excerpt, source_url, status")
    .eq("lead_id", lead.id).eq("status", "approved").order("created_at", { ascending: true }).limit(EVIDENCE_LIMIT);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as EvidenceItem[];
  const legacy: EvidenceItem[] = lead.observation?.trim() && lead.source_url?.trim()
    ? [{ id: "lead-observation", claim: lead.observation.trim(), excerpt: null, source_url: lead.source_url, status: "approved" }] : [];
  return [...rows, ...legacy];
}

const isUniqueViolation = (e: { code?: string } | null): boolean => e?.code === "23505";

export async function GET(req: Request): Promise<Response> {
  const params = new URL(req.url).searchParams;
  const supabase = await outreachDb(req, params.get("orgSlug"));
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  const leadId = params.get("leadId");
  if (leadId && !UUID_RE.test(leadId)) return NextResponse.json({ ok: false, error: "leadId must be a uuid" }, { status: 400 });
  const rawOrgId = params.get("organizationId");
  if (rawOrgId && !UUID_RE.test(rawOrgId)) return NextResponse.json({ ok: false, error: "organizationId must be a uuid" }, { status: 400 });
  let orgFilter: string | null;
  try { orgFilter = effectiveOrgId(req, rawOrgId); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  let query = supabase.from(TABLE).select("*").order("created_at", { ascending: false }).limit(100);
  if (leadId) query = query.eq("lead_id", leadId);
  if (orgFilter) query = query.eq("organization_id", orgFilter);
  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, messages: data ?? [] });
}

// POST { leadId, orgSlug? } — generate the first emails (A/B) and follow-ups for one lead.
export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canManageOutreach(role)) return new NextResponse("forbidden", { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  const supabase = await outreachDb(req, str(body.orgSlug));
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  const leadId = str(body.leadId);
  if (!leadId) return NextResponse.json({ ok: false, error: "leadId required" }, { status: 400 });
  if (!UUID_RE.test(leadId)) return NextResponse.json({ ok: false, error: "leadId must be a uuid" }, { status: 400 });

  const { data: leadData, error: leadErr } = await supabase.from("co_leads").select("*").eq("id", leadId).maybeSingle();
  if (leadErr) return NextResponse.json({ ok: false, error: leadErr.message }, { status: 500 });
  if (!leadData) return NextResponse.json({ ok: false, error: "lead not found" }, { status: 404 });
  const lead = leadData as LeadRow;
  try { assertOrgAccess(req, lead.organization_id); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }

  let evidence: EvidenceItem[];
  try { evidence = await approvedEvidence(supabase, lead); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "evidence read failed" }, { status: 500 }); }
  // Cold Gate — refuse to generate without evidence, for a do_not_contact lead, or for a warm one.
  const gate = checkColdGate(lead, evidence.filter((e) => e.id !== "lead-observation").length);
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
  try { sender = await senderFor(supabase, lead.organization_id, { agencyFallback: userKindOf(req.headers) !== "client" }); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "sender read failed" }, { status: 500 }); }
  if (!sender) return NextResponse.json({ ok: false, blocked: true, blockers: ["還沒有冷信寄件信箱：到「信箱與連線」連一個 Gmail"] }, { status: 422 });

  let collector = sender.display_name ?? sender.email;
  if (lead.organization_id) {
    const { data: org } = await supabase.from("organizations").select("name").eq("id", lead.organization_id).maybeSingle();
    collector = (org as { name?: string } | null)?.name ?? collector;
  }

  let ctx: ReturnType<typeof buildBrandContext>;
  try {
    ctx = buildBrandContext({ lead, profile: sp, signature: sender.signature_block, collector, evidence });
  } catch (e) {
    if (e instanceof BrandContextError) return NextResponse.json({ ok: false, blocked: true, blockers: [BRAND_BLOCK[e.code]] }, { status: 422 });
    throw e;
  }
  const required: RequiredParts = { signature: ctx.signature, notice: ctx.notice };

  // A reply the operator got from ChatGPT/Claude for the manual prompt, pasted back: the same guard and rows as the AI
  // path, no AI call (SPEC §5.3 manual_prompt).
  const pasted = typeof body.pastedReply === "string" && body.pastedReply.trim() ? body.pastedReply : null;

  // Resolve AI connector via router ladder: claude → openai → gemini → gemini_agency → manual_prompt.
  // For each paid provider: try client BYO key first, then agency default (null org).
  const AI_PROVIDERS = ["claude", "openai", "gemini", "gemini_agency"] as const;
  type AiProvider = (typeof AI_PROVIDERS)[number];
  let resolvedProvider: AiProvider | null = null;
  let apiKey: string | null = null;
  let vaultError: string | null = null;

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
    if (!ref) continue;
    try {
      apiKey = await getSecret(ref);
      resolvedProvider = provider;
      break;
    } catch (e) {
      vaultError = e instanceof Error ? e.message.slice(0, 80) : "vault read error";
      // vault error on one provider → try next rather than hard-fail
    }
  }

  let mode: AiProvider | "manual_prompt" | "manual_paste" = "manual_prompt";
  let aiModel: string | null = vaultError ? `vault_read_failed:${vaultError}` : null;
  let parsed: ReturnType<typeof parseGenerationOutput> | null = null;
  if (pasted) {
    parsed = parseGenerationOutput(pasted, ctx.evidenceIds);
    if (parsed.ok === false) return NextResponse.json({ ok: false, error: "pasted_unparseable", detail: parsed.error }, { status: 400 });
    mode = "manual_paste";
    aiModel = null;
  } else if (apiKey && resolvedProvider) {
    try {
      const grant = await grantFor("outreach.draft", await billedTo(req, lead.organization_id));
      const generate = (prompt: string) => resolvedProvider === "claude" ? generateWithClaude(grant, apiKey!, prompt)
        : resolvedProvider === "openai" ? generateWithOpenAI(grant, apiKey!, prompt) : generateWithGemini(grant, apiKey!, prompt);
      const first = await generate(ctx.prompt);
      parsed = parseGenerationOutput(first.text, ctx.evidenceIds);
      aiModel = first.model;
      if (parsed.ok === false) {
        const second = await generate(repairPrompt(ctx.prompt, first.text, parsed.error));
        parsed = parseGenerationOutput(second.text, ctx.evidenceIds);
      }
      if (parsed.ok === true) mode = resolvedProvider;
      else aiModel = `${resolvedProvider}_unparseable:${parsed.error.slice(0, 80)}`;
    } catch (e) {
      aiModel = `${resolvedProvider}_failed:${e instanceof Error ? e.message.slice(0, 80) : "error"}`;
    }
  }

  const base = { organization_id: lead.organization_id ?? null, lead_id: lead.id, channel: "email", ai_model: aiModel,
    prompt_snapshot: { prompt: ctx.prompt, mode, sender_id: sender.id } };


  if (!parsed?.ok) {
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
  const keep = sampledMode ? pickVariant(lead.id) : null;
  const sampled = sampledMode && inSample(lead.id, sp?.review_sample_pct ?? 10);
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
      let claim: ClaimCheck | null = null;
      if (g.quality_gate_status === "pass" && !sampled) {
        // A refused outreach.qa grant (no credits) is a check that did not happen: the email goes to a person, and the
        // generation already paid for is kept.
        try {
          claim = await checkClaims({ body: text, evidence, grant: await grantFor("outreach.qa", await billedTo(req, lead.organization_id)), metadata: { lead_id: lead.id } });
        } catch (e) {
          claim = { verdict: "error", error: e instanceof Error ? e.message : "claim check failed" };
        }
        snapshot.claim_check = claim;
      }
      snapshot.sampled = sampled;
      if (autoApproves({ gate: g.quality_gate_status, sampled, claim })) {
        status = "approved";
        approvedAt = nowIso;
        snapshot.auto = true;
      }
    }
    rows.push({ ...base, output_type: "cold_email", variant_label: b.label, subject, body: text, version: 1,
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

// PATCH { id, status, subject?, body?, orgSlug? } — human review (approve / edit / skip). Never sends.
// An edited subject or body is gated again with the parts generation required. Approving a first email skips its other
// variant; a second approved first email for the lead is refused by the 0149 index → 409 variant_already_approved.
const ALLOWED_STATUS = new Set(["draft", "approved", "needs_edit", "skipped"]);
const LOCKED = new Set(["drafted", "sending", "copied", "sent"]);
interface CurRow { organization_id: string | null; lead_id: string; output_type: string; subject: string | null; body: string; gate_snapshot: Record<string, unknown> | null }
export async function PATCH(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canManageOutreach(role)) return new NextResponse("forbidden", { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  const supabase = await outreachDb(req, str(body.orgSlug));
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  const id = str(body.id);
  const status = str(body.status);
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  if (!UUID_RE.test(id)) return NextResponse.json({ ok: false, error: "id must be a uuid" }, { status: 400 });
  if (!status || !ALLOWED_STATUS.has(status)) {
    return NextResponse.json({ ok: false, error: "valid status required (draft|approved|needs_edit|skipped)" }, { status: 400 });
  }

  const { data: curData, error: curErr } = await supabase.from(TABLE)
    .select("organization_id, lead_id, output_type, subject, body, gate_snapshot, quality_gate_status, status").eq("id", id).maybeSingle();
  if (curErr) return NextResponse.json({ ok: false, error: curErr.message }, { status: 500 });
  if (!curData) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  const cur = curData as CurRow & { quality_gate_status: string | null; status: string };
  try { assertOrgAccess(req, cur.organization_id); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  // A drafted or sent email exists in a mailbox: its row may no longer change, or a second draft could follow.
  if (LOCKED.has(cur.status)) return NextResponse.json({ ok: false, error: `already_${cur.status}` }, { status: 409 });

  const patch: Record<string, unknown> = { status };
  const editedBody = str(body.body);
  const editedSubject = cur.output_type === "cold_email" ? str(body.subject) : null;
  let gateStatus = cur.quality_gate_status;
  const snapshot: Record<string, unknown> = { ...(cur.gate_snapshot ?? {}) };
  if (editedBody || editedSubject) {
    const text = editedBody ?? cur.body;
    const subject = cur.output_type === "cold_email" ? editedSubject ?? cur.subject ?? "" : null;
    const required = snapshot.required as RequiredParts | undefined;
    const forbidden = Array.isArray(snapshot.forbidden) ? (snapshot.forbidden as string[]) : [];
    const g = required ? gateMessage({ subject, body: text, forbidden, required }) : { ...lintMessage(text, forbidden), gate_version: GATE_VERSION };
    gateStatus = g.quality_gate_status;
    Object.assign(snapshot, { gate_version: g.gate_version, findings: g.findings, edited: true });
    Object.assign(patch, { body: text, subject: cur.output_type === "cold_email" ? subject : null,
      safety_score: g.safety_score, quality_gate_status: g.quality_gate_status });
  }
  if (status === "approved") {
    // A row from before the v2 gate carries no required parts: it could be approved without signature or notice.
    if (!snapshot.required) return NextResponse.json({ ok: false, error: "regenerate_required" }, { status: 422 });
    if (gateStatus === "block") return NextResponse.json({ ok: false, error: "gate_blocked", findings: snapshot.findings ?? [] }, { status: 422 });
    patch.approved_at = new Date().toISOString();
  } else {
    patch.approved_at = null; // approved_at counts toward the sampled unlock (review-policy.ts): only while approved
  }
  snapshot.auto = false; // any person's action ends the policy's decision
  patch.gate_snapshot = snapshot;

  // Conditional on the status read above: a concurrent change (another tab, gmail-draft taking the row) wins, not this one.
  const { data, error } = await supabase.from(TABLE).update(patch).eq("id", id).eq("status", cur.status).select("*").maybeSingle();
  if (isUniqueViolation(error)) return NextResponse.json({ ok: false, error: "variant_already_approved" }, { status: 409 });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "status_changed" }, { status: 409 });

  if (status === "approved" && cur.output_type === "cold_email") {
    const { error: skipErr } = await supabase.from(TABLE).update({ status: "skipped" })
      .eq("lead_id", cur.lead_id).eq("output_type", "cold_email").neq("id", id).in("status", ["draft", "needs_edit"]);
    if (skipErr) return NextResponse.json({ ok: true, message: data, warning: `the other variant was not skipped: ${skipErr.message}` });
  }
  return NextResponse.json({ ok: true, message: data });
}

export async function DELETE(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canManageOutreach(role)) return new NextResponse("forbidden", { status: 403 });
  const params = new URL(req.url).searchParams;
  const supabase = await outreachDb(req, params.get("orgSlug"));
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  const id = params.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  if (!UUID_RE.test(id)) return NextResponse.json({ ok: false, error: "id must be a uuid" }, { status: 400 });
  const { data: cur, error: readErr } = await supabase.from(TABLE).select("organization_id").eq("id", id).maybeSingle();
  if (readErr) return NextResponse.json({ ok: false, error: readErr.message }, { status: 500 });
  if (!cur) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  try { assertOrgAccess(req, (cur as Record<string, unknown>).organization_id as string | null); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
