import { NextResponse } from "next/server";
import { resolveOpsRole, canManageOutreach } from "@/lib/ops-role";
import { outreachDb } from "@/lib/outreach/db-client";
import { scoreLead } from "@/lib/outreach/scoring";
import { citableFact, recordLeadEvidence } from "@/lib/outreach/lead-evidence";
import { effectiveOrgId, assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { findExistingLead } from "@/lib/outreach/existing-leads";
import { inboxConsentSource } from "@/lib/outreach/sources/people-search";
import { inferEmail, inferenceKey, verifierKeys } from "@/lib/outreach/mailbox-verify";
import { splitLatinName } from "@/lib/outreach/email-guess";
import { findSuppressed } from "@/lib/outreach/suppression";
import { ownHostOf } from "@/lib/outreach/normalize";
import { billedTo } from "@/lib/outreach/billing";
import { grantFor } from "@/lib/entitlements/grant";
import { EntitlementRequired } from "@/lib/entitlements/can";

// Cold Outreach — Leads CRUD + Approve-to-Leads (task T7). Table: co_leads (migration 0048).
// Approve flow: read a co_lead_inbox row → the same business already a lead? (existing-leads.ts) that one : mechanical
// score → insert co_leads (a concurrent approve of the same email loses on 0149's unique index and gets the winner's
// lead) → mark inbox approved. Approving twice never makes two leads.
// findEmail (card C13.2): a person's address guessed from their company's formats, MX-checked, then verified by the paid
// verifier under the organization's outreach.verify grant; only a paid `valid` is written (consent_source 'inferred').
// Evidence (card C9.2): the inbox row's observation + source_url (or a manual lead's) become the lead's approved evidence
// (created_by import / manual; same fact twice = one row); co_leads.observation is no longer written.
// Writes ops-role gated; GET authed-only.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABLE = "co_leads";
const LIST_LIMIT = 200;

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v: unknown): string | null => { const s = str(v); return s && UUID_RE.test(s) ? s : null; };
// The service profile whose positioning, privacy page and review policy a lead's emails use (SPEC §5.3, D23): only
// one of the lead's own organization.
async function checkProfile(db: NonNullable<Awaited<ReturnType<typeof outreachDb>>>, profileId: string | null, orgId: string | null): Promise<Response | null> {
  if (!profileId) return null;
  if (!UUID_RE.test(profileId)) return NextResponse.json({ ok: false, error: "serviceProfileId must be a uuid" }, { status: 400 });
  let q = db.from("co_service_profiles").select("id").eq("id", profileId);
  q = orgId ? q.eq("organization_id", orgId) : q.is("organization_id", null);
  const { data, error } = await q.maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return data ? null : NextResponse.json({ ok: false, error: "service profile not found in this organization" }, { status: 404 });
}

// One lead per email per organization (migration 0149 co_leads_org_email_uniq): a second one is a 409, not a 500.
function leadWriteError(e: { code?: string; message: string }): Response {
  if (e.code === "23505") return NextResponse.json({ ok: false, error: "duplicate_email", detail: "這個 email 已經有一筆名單" }, { status: 409 });
  // 0149 trigger co_leads_profile_same_org: a lead's service profile is one of its own organization
  if (e.code === "P0149") return NextResponse.json({ ok: false, error: "profile_other_org" }, { status: 409 });
  return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
}

interface ScoreInput {
  name?: string | null;
  industry?: string | null;
  website?: string | null;
  social_url?: string | null;
  email?: string | null;
  phone?: string | null;
  contact_name?: string | null;
  contact_role?: string | null;
  source_url?: string | null;
  evidence_count?: number;
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const supabase = await outreachDb(req, url.searchParams.get("orgSlug"));
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });

  const id = url.searchParams.get("id");
  if (id) {
    // Guard uuid-typed columns up front so a bad id returns a clean 400, not a raw PG 22P02 leak.
    if (!UUID_RE.test(id)) return NextResponse.json({ ok: false, error: "id must be a uuid" }, { status: 400 });
    const { data, error } = await supabase.from(TABLE).select("*").eq("id", id).maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    try { assertOrgAccess(req, (data as Record<string, unknown>).organization_id as string | null); }
    catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
    return NextResponse.json({ ok: true, lead: data });
  }

  let orgFilter: string | null;
  try { orgFilter = effectiveOrgId(req, uuid(url.searchParams.get("organizationId"))); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  const status = url.searchParams.get("status");
  const priority = url.searchParams.get("priority");
  let query = supabase.from(TABLE).select("*").order("score", { ascending: false }).limit(LIST_LIMIT);
  if (orgFilter) query = query.eq("organization_id", orgFilter);
  if (status) query = query.eq("status", status);
  if (priority) query = query.eq("priority", priority);
  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, leads: data ?? [] });
}

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

  // Pre-resolve org for the manual create/update path (approve path resolves its own org from inbox row).
  let orgId: string | null;
  try { orgId = effectiveOrgId(req, uuid(body.organizationId)); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }

  // --- Find a person's email (card C13.2): body { findEmail: { fromInboxId, domain? } } ---
  if (body.findEmail !== undefined) {
    const f = body.findEmail && typeof body.findEmail === "object" ? (body.findEmail as Record<string, unknown>) : {};
    const inboxId = str(f.fromInboxId);
    if (!inboxId || !UUID_RE.test(inboxId)) return NextResponse.json({ ok: false, error: "findEmail.fromInboxId must be a uuid" }, { status: 400 });
    const { data: ib, error: ibErr } = await supabase.from("co_lead_inbox").select("*").eq("id", inboxId).maybeSingle();
    if (ibErr) return NextResponse.json({ ok: false, error: ibErr.message }, { status: 500 });
    if (!ib) return NextResponse.json({ ok: false, error: "inbox row not found" }, { status: 404 });
    const ibRow = ib as Record<string, unknown>;
    const ibOrg = (ibRow.organization_id as string | null) ?? null;
    try { assertOrgAccess(req, ibOrg); }
    catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
    let found;
    try { found = await findExistingLead(supabase, ibOrg, { email: str(ibRow.email), website: ibRow.website as string | null, source_url: ibRow.source_url as string | null, name: ibRow.normalized_name as string | null, phone: ibRow.phone as string | null }); }
    catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 }); }
    if (!found) return NextResponse.json({ ok: false, error: "not_a_lead_yet", detail: "先核准成名單，再找 email" }, { status: 409 });
    const { data: lead, error: leadErr } = await supabase.from(TABLE).select("id, organization_id, name, email, website, contact_name, industry").eq("id", found.id).maybeSingle();
    if (leadErr) return NextResponse.json({ ok: false, error: leadErr.message }, { status: 500 });
    const l = lead as { id: string; organization_id: string | null; name: string | null; email: string | null; website: string | null; contact_name: string | null; industry: string | null } | null;
    if (!l) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    if (l.email) return NextResponse.json({ ok: false, error: "has_email", detail: "這筆名單已經有 email" }, { status: 409 });
    const personName = [l.contact_name, l.name].find((n) => splitLatinName(n)) ?? null;
    if (!personName) return NextResponse.json({ ok: false, error: "no_latin_name", detail: "推 email 需要英文姓名（名＋姓）" }, { status: 422 });
    const typed = str(f.domain)?.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] ?? null;
    const domain = typed ?? ownHostOf(l.website);
    if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return NextResponse.json({ ok: false, error: "no_domain", detail: "需要公司網域（官網或手動填）" }, { status: 422 });

    const org = l.organization_id;
    let key, known;
    try {
      key = inferenceKey(await verifierKeys(supabase, org));
      let kq = supabase.from(TABLE).select("email, contact_name, name").ilike("email", `%@${domain}`);
      kq = org ? kq.eq("organization_id", org) : kq.is("organization_id", null);
      const { data: ks, error: kErr } = await kq.limit(50);
      if (kErr) throw new Error(`co_leads read failed: ${kErr.message}`);
      known = ((ks ?? []) as Array<{ email: string | null; contact_name: string | null; name: string | null }>)
        .flatMap((k) => (k.email ? [{ email: k.email, name: k.contact_name ?? k.name }] : []));
    } catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 }); }
    let grant;
    if (key) {
      try { grant = await grantFor("outreach.verify", await billedTo(req, org)); }
      catch (e) { if (e instanceof EntitlementRequired) return NextResponse.json({ ok: false, error: e.code }, { status: e.status }); throw e; }
    }
    let inferred;
    try {
      // Each paid answer is metered as it arrives (same as auto-send's verification), so a run that stops midway is charged only for what it got.
      inferred = await inferEmail(supabase, org, { name: personName, domain, known }, key, { onPaid: async (provider) => { await grant?.recordUse({ provider, lead_id: l.id, source: "email_find" }); } });
    } catch (e) {
      if (e instanceof EntitlementRequired) return NextResponse.json({ ok: false, error: e.code }, { status: e.status });
      return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
    }
    const report = { candidates: inferred.candidates, paidCalls: inferred.paidCalls, provider: inferred.provider, via: inferred.via };
    if (inferred.outcome !== "valid" || !inferred.email) return NextResponse.json({ ok: true, outcome: inferred.outcome, email: null, ...report });
    try {
      // A person found by search keeps the company in industry: a company-scope suppression must stop them too (Codex C13 F2).
      const flags = await findSuppressed(supabase, org, [{ email: inferred.email, website: l.website, name: l.name },
        ...(l.industry ? [{ email: null, website: null, name: l.industry }] : [])]);
      if (flags.some(Boolean)) return NextResponse.json({ ok: true, outcome: "suppressed", email: null, ...report });
    } catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 }); }
    // Only into an empty address: one written meanwhile by a person or another path wins (Codex C13 F3).
    const { data: upd, error: upErr } = await supabase.from(TABLE).update({ email: inferred.email, consent_source: "inferred", updated_at: new Date().toISOString() })
      .eq("id", l.id).is("email", null).select("id");
    if (upErr) return leadWriteError(upErr);
    if (!(upd ?? []).length) return NextResponse.json({ ok: false, error: "email_set_meanwhile", detail: "這筆名單在查詢期間已經有 email 了，沒有覆寫", ...report }, { status: 409 });
    return NextResponse.json({ ok: true, outcome: "valid", email: inferred.email, ...report });
  }

  // --- Approve-from-inbox path ---
  const fromInboxId = str(body.fromInboxId);
  if (fromInboxId) {
    if (!UUID_RE.test(fromInboxId)) return NextResponse.json({ ok: false, error: "fromInboxId must be a uuid" }, { status: 400 });
    const { data: inbox, error: inErr } = await supabase.from("co_lead_inbox").select("*").eq("id", fromInboxId).maybeSingle();
    if (inErr) return NextResponse.json({ ok: false, error: inErr.message }, { status: 500 });
    if (!inbox) return NextResponse.json({ ok: false, error: "inbox row not found" }, { status: 404 });

    const row = inbox as Record<string, unknown>;
    // Verify caller may act on this inbox item's org before promoting it to a lead.
    try { assertOrgAccess(req, row.organization_id as string | null); }
    catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
    const raw = (row.raw_payload ?? {}) as Record<string, unknown>;
    const rawText = (k: string): string | null => (typeof raw[k] === "string" && (raw[k] as string).trim() ? (raw[k] as string).trim().slice(0, 300) : null);
    // co_lead_inbox has no observation column: the imported observation is in raw_payload.
    const importedFact = { claim: rawText("observation"), sourceUrl: row.source_url as string | null };
    const lead: ScoreInput = {
      name: (row.normalized_name as string | null) ?? "(未命名)",
      industry: row.normalized_industry as string | null,
      website: row.website as string | null,
      social_url: row.social_url as string | null,
      email: str(row.email),
      phone: row.phone as string | null,
      source_url: row.source_url as string | null,
      evidence_count: citableFact(importedFact.claim, importedFact.sourceUrl) ? 1 : 0,
    };
    const evidenceFor = async (lead: { id: string; organization_id: string | null }): Promise<Response | null> => {
      const err = await recordLeadEvidence(supabase, { lead, ...importedFact, createdBy: "import" });
      return err ? NextResponse.json({ ok: false, error: err }, { status: 500 }) : null;
    };
    const orgOfRow = (row.organization_id as string | null) ?? null;
    const identity = { email: lead.email, website: lead.website, source_url: lead.source_url, name: lead.name, phone: lead.phone };
    const markApproved = () => supabase.from("co_lead_inbox").update({ inbox_status: "approved", updated_at: new Date().toISOString() }).eq("id", fromInboxId);
    const existingLead = async (): Promise<Response | null> => {
      let found;
      try { found = await findExistingLead(supabase, orgOfRow, identity); }
      catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 }); }
      if (!found) return null;
      const { data: full, error: readErr } = await supabase.from(TABLE).select("*").eq("id", found.id).maybeSingle();
      if (readErr) return NextResponse.json({ ok: false, error: readErr.message }, { status: 500 });
      const evErr = await evidenceFor({ id: found.id, organization_id: orgOfRow });  // findExistingLead is scoped to orgOfRow
      if (evErr) return evErr;
      await markApproved();
      return NextResponse.json({ ok: true, lead: full, existing: true });
    };
    const before = await existingLead();
    if (before) return before;
    const scores = scoreLead(lead, { isDuplicate: false, doNotContact: false });

    const { data: created, error: createErr } = await supabase
      .from(TABLE)
      .insert({
        organization_id: row.organization_id ?? null,
        name: lead.name ?? "(未命名)",
        industry: lead.industry,
        website: lead.website,
        social_url: lead.social_url,
        email: lead.email,
        phone: lead.phone,
        region: row.region ?? null,
        source_type: row.source_type ?? null,
        source_url: lead.source_url,
        // co_lead_inbox has no contact or consent columns: the import keeps them in raw_payload (C12.2 gcis: 負責人,
        // general_source:<公示資料頁>), and they reach the lead here.
        contact_name: rawText("contact_name"),
        contact_role: rawText("contact_role"),
        // Only the values this app's own sources write (people-search.ts inboxConsentSource): raw_payload is whatever an
        // import sent, and a typed self_published:… would drop the personal-data notice (brand-context.ts), meta_lead_ad…
        // would make the lead warm.
        consent_source: inboxConsentSource(row.source_type, rawText("consent_source"), lead.source_url ?? null),
        lead_quality_score: scores.lead_quality_score,
        contactability_score: scores.contactability_score,
        icp_score: scores.icp_score,
        score: scores.score,
        priority: scores.priority,
        status: "qualified",
      })
      .select("*")
      .single();
    if (createErr?.code === "23505") {
      const winner = await existingLead();
      if (winner) return winner;
    }
    if (createErr) return leadWriteError(createErr);

    const evErr = await evidenceFor({ id: (created as { id: string }).id, organization_id: orgOfRow });
    if (evErr) return evErr;
    await markApproved();
    return NextResponse.json({ ok: true, lead: created }, { status: 201 });
  }

  // --- Manual create / update path ---
  const id = str(body.id);
  if (id && !UUID_RE.test(id)) return NextResponse.json({ ok: false, error: "id must be a uuid" }, { status: 400 });
  const name = str(body.name);
  if (!name) return NextResponse.json({ ok: false, error: "name required" }, { status: 400 });

  const base: ScoreInput = {
    name,
    industry: str(body.industry),
    website: str(body.website),
    social_url: str(body.socialUrl),
    email: str(body.email),
    phone: str(body.phone),
    contact_name: str(body.contactName),
    contact_role: str(body.contactRole),
    source_url: str(body.sourceUrl),
  };
  // An observation is a fact only with the page it came from: it becomes the lead's approved evidence (card C9.2).
  const manualFact = citableFact(str(body.observation), str(body.sourceUrl));
  if (str(body.observation) && !manualFact) {
    return NextResponse.json({ ok: false, error: "observation_needs_source", detail: "觀察要附來源網址（1000 字以內）" }, { status: 400 });
  }
  const scored = (evidenceCount: number) => {
    const s = scoreLead({ ...base, evidence_count: evidenceCount }, { isDuplicate: false, doNotContact: false });
    return { lead_quality_score: s.lead_quality_score, contactability_score: s.contactability_score, icp_score: s.icp_score, score: s.score, priority: s.priority };
  };

  const manualEvidence = async (lead: { id: string; organization_id: string | null }): Promise<Response | null> => {
    const err = await recordLeadEvidence(supabase, { lead, claim: str(body.observation), sourceUrl: str(body.sourceUrl), createdBy: "manual" });
    return err ? NextResponse.json({ ok: false, error: err }, { status: 500 }) : null;
  };

  const profileId = str(body.serviceProfileId);
  const badProfile = await checkProfile(supabase, profileId, orgId);
  if (badProfile) return badProfile;

  const fields = {
    organization_id: orgId,
    // only when sent: an update without it keeps the lead's profile
    ...("serviceProfileId" in body ? { service_profile_id: profileId } : {}),
    name,
    industry: base.industry,
    website: base.website,
    social_url: base.social_url,
    contact_name: base.contact_name,
    contact_role: base.contact_role,
    email: base.email,
    phone: base.phone,
    region: str(body.region),
    source_type: str(body.sourceType),
    source_url: base.source_url,
  };

  if (id) {
    // Verify caller owns this lead before overwriting.
    const { data: cur, error: curErr } = await supabase.from(TABLE).select("organization_id, service_profile_id, email").eq("id", id).maybeSingle();
    if (curErr) return NextResponse.json({ ok: false, error: curErr.message }, { status: 500 });
    if (!cur) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    const prev = cur as { organization_id: string | null; service_profile_id: string | null; email: string | null };
    try { assertOrgAccess(req, prev.organization_id); }
    catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
    // A lead moved to another organization cannot keep the old one's profile (0149 trigger refuses it).
    const keepsProfile = "serviceProfileId" in body || !prev.service_profile_id || prev.organization_id === orgId;
    // The score counts the evidence the lead already has (research, backfill), not only what this request sends.
    const { count: evCount, error: evReadErr } = await supabase.from("co_evidence").select("id", { count: "exact", head: true }).eq("lead_id", id).eq("status", "approved");
    if (evReadErr) return NextResponse.json({ ok: false, error: evReadErr.message }, { status: 500 });

    const { data, error } = await supabase
      .from(TABLE)
      // consent_source describes where THIS address came from (self_published: lets it skip verification, SPEC D25;
      // inferred / general_source: carry the notice): a person typing another address leaves no known source.
      .update({ ...fields, ...scored((evCount ?? 0) + (manualFact ? 1 : 0)), ...(keepsProfile ? {} : { service_profile_id: null }),
        ...((prev.email ?? "").trim().toLowerCase() !== (base.email ?? "").trim().toLowerCase() ? { consent_source: null } : {}),
        updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) return leadWriteError(error);
    if (!data) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    const evErr = await manualEvidence(data as { id: string; organization_id: string | null });
    if (evErr) return evErr;
    return NextResponse.json({ ok: true, lead: data });
  }

  const { data, error } = await supabase.from(TABLE).insert({ ...fields, ...scored(manualFact ? 1 : 0), status: "new" }).select("*").single();
  if (error) return leadWriteError(error);
  const evErr = await manualEvidence(data as { id: string; organization_id: string | null });
  if (evErr) return evErr;
  return NextResponse.json({ ok: true, lead: data }, { status: 201 });
}

// PATCH { id, serviceProfileId: uuid | null, orgSlug? } — assign (or clear) a lead's service profile, nothing else.
export async function PATCH(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canManageOutreach(role)) return new NextResponse("forbidden", { status: 403 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new NextResponse("invalid json", { status: 400 }); }
  const supabase = await outreachDb(req, str(body.orgSlug));
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  const id = uuid(body.id);
  if (!id) return NextResponse.json({ ok: false, error: "id must be a uuid" }, { status: 400 });
  const { data: cur, error: curErr } = await supabase.from(TABLE).select("organization_id").eq("id", id).maybeSingle();
  if (curErr) return NextResponse.json({ ok: false, error: curErr.message }, { status: 500 });
  if (!cur) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  const orgId = (cur as { organization_id: string | null }).organization_id;
  try { assertOrgAccess(req, orgId); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  const profileId = str(body.serviceProfileId);
  const badProfile = await checkProfile(supabase, profileId, orgId);
  if (badProfile) return badProfile;
  const { data, error } = await supabase.from(TABLE).update({ service_profile_id: profileId, updated_at: new Date().toISOString() })
    .eq("id", id).select("*").maybeSingle();
  if (error) return leadWriteError(error);
  return NextResponse.json({ ok: true, lead: data });
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
