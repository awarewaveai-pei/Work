import { NextResponse } from "next/server";
import { resolveOpsRole, canManageOutreach } from "@/lib/ops-role";
import { outreachDb } from "@/lib/outreach/db-client";
import { effectiveOrgId, assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { normalizeLead, flagDuplicatesInBatch, type RawLead, type NormalizedLead } from "@/lib/outreach/normalize";
import { findSuppressed } from "@/lib/outreach/suppression";
import { scoreLeadQuality, scoreContactability } from "@/lib/outreach/scoring";
import { citableFact } from "@/lib/outreach/lead-evidence";
import { verifyEmails, type EmailStatus } from "@/lib/outreach/verify-email";
import { findExisting } from "@/lib/outreach/existing-leads";
import { discoverInput, discoverPlaces, creditsTwd, creditsUsd, DISCOVER_MAX_USD, LocationNotRecognized, MAX_PAGES, type PlacesCursor } from "@/lib/outreach/discover";
import { loadCursor, saveCursor, searchKey, type SearchSource } from "@/lib/outreach/search-cursor";
import { billedOrgId, holdCost, logFreeCall, logToolCost } from "@/lib/ai/log-ai-call";
import { billedTo } from "@/lib/outreach/billing";
import { grantFor } from "@/lib/entitlements/grant";
import { EntitlementRequired } from "@/lib/entitlements/can";
import { createBudget, createProviderCall, ProviderCallError } from "@/lib/collect";
import { discoverCompanies, searchBusinessItems, GcisError, GCIS_COUNTIES, GCIS_MAX_SERPER_CREDITS, type GcisCursor, type GcisUsage } from "@/lib/outreach/sources/gcis";
import { captureWarmLead } from "@/lib/outreach/warm-leads";
import { peopleInput, searchPeople, PEOPLE_MAX_SERPER_CREDITS, PEOPLE_SOURCE_TYPE, type PeopleCursor, type PeopleUsage } from "@/lib/outreach/sources/people-search";

// Cold Outreach — Lead Inbox import (task T5). Table: co_lead_inbox (migration 0048).
// Pipeline: normalize → dedup (within batch, and against this org's existing inbox + leads) → suppression check →
// MX check (cached) → mechanical scoring → classify. `discover` (card C10) fills the batch from a Serper map search
// first, under the org's outreach.discover grant. Writes ops-role gated; GET authed-only.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABLE = "co_lead_inbox";
const LIST_LIMIT = 200;
const MAX_BATCH = 500;
// Each row may call the FluentCRM bridge (up to ~30 s) inside this request, behind nginx's 300 s proxy_read_timeout
// (nginx/default.conf:244): 5 at a time and at most 50 a request (Codex C14 F3).
const MAX_WARM_ROWS = 50;
const WARM_CONCURRENCY = 5;
// Guard uuid-typed columns up front so a bad id returns a clean 400, not a raw PG 22P02 leak.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function classify(
  n: NormalizedLead,
  quality: number,
  contactability: number,
  isDup: boolean,
  suppressed: boolean,
  emailStatus: EmailStatus | null,
): string {
  if (suppressed) return "risky";
  if (isDup) return "suspected_dup";
  // An address whose domain has no mail server (verify-email.ts) is not a contact channel.
  const email = emailStatus === "invalid" ? null : n.email;
  if (!email && !n.phone && !n.social_url) return "no_contact";
  if (quality < 50) return "needs_data";
  if (quality >= 70 && contactability >= 50) return "high_quality";
  return "pending";
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const supabase = await outreachDb(req, url.searchParams.get("orgSlug"));
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  const rawOrgId = url.searchParams.get("organizationId");
  if (rawOrgId && !UUID_RE.test(rawOrgId)) return NextResponse.json({ ok: false, error: "organizationId must be a uuid" }, { status: 400 });
  let orgFilter: string | null;
  try { orgFilter = effectiveOrgId(req, rawOrgId); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  const status = url.searchParams.get("status");
  let query = supabase.from(TABLE).select("*").order("created_at", { ascending: false }).limit(LIST_LIMIT);
  if (orgFilter) query = query.eq("organization_id", orgFilter);
  if (status) query = query.eq("inbox_status", status);
  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, items: data ?? [] });
}

// POST — import one or many. Body: { organizationId?, orgSlug?, leads: RawLead[] }  OR  { ..., lead: RawLead }
//   OR  { ..., discover: { query, location } } — ≤ 20 contactable businesses from a map search; the answer adds
//   discovery { credits, twd, skipped }.
//   OR  { ..., gcis: { item, itemDesc, county } } — ≤ 100 registered companies running business item `item` (card C12);
//   the answer adds discovery { credits, twd, skipped, withoutWebsite }.
//   OR  { ..., gcisItems: "<text>" } — the business items whose description holds the text; nothing is written.
//   OR  { ..., people: { role, company, location, keyword } } — ≤ 20 people from a search engine's public index (card
//   C13.1; title, snippet and link only); the answer adds discovery { credits, twd, skipped }.
//   OR  { ..., warmLeads: { form, rows: [{ email, full_name, phone, created_time }] } } — the CSV of a Meta lead-ad form
//   (card C14.1): each row is a person who asked to hear from us, so it skips the inbox review and goes straight to a warm
//   lead + FluentCRM (warm-leads.ts); the answer is { imported, existing, summary }.
export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canManageOutreach(role)) return new NextResponse("forbidden", { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  const orgSlug = typeof body.orgSlug === "string" && body.orgSlug.trim() ? body.orgSlug.trim() : null;
  const supabase = await outreachDb(req, orgSlug);
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });

  const rawBodyOrgId = typeof body.organizationId === "string" && body.organizationId.trim() ? body.organizationId.trim() : null;
  if (rawBodyOrgId && !UUID_RE.test(rawBodyOrgId)) {
    return NextResponse.json({ ok: false, error: "organizationId must be a uuid" }, { status: 400 });
  }
  let organizationId: string | null;
  try { organizationId = effectiveOrgId(req, rawBodyOrgId); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  let rawList: RawLead[] = Array.isArray(body.leads)
    ? (body.leads as RawLead[])
    : body.lead && typeof body.lead === "object"
      ? [body.lead as RawLead]
      : [];
  // gcis and search are sources this route writes itself (body.gcis, body.people below), and approval trusts their
  // consent_source (leads route, inboxConsentSource): an import may not claim them (Codex C12 F4).
  const reserved = rawList.map((l) => (typeof l?.source_type === "string" ? l.source_type.trim().toLowerCase() : "")).find((t) => t === "gcis" || t === PEOPLE_SOURCE_TYPE);
  if (reserved) {
    return NextResponse.json({ ok: false, error: `source_type ${reserved} is reserved for ${reserved === "gcis" ? "找公司" : "找人"}` }, { status: 400 });
  }

  let discovery: { credits: number; twd: number; skipped: number } | null = null;
  let gcisWithoutWebsite = 0;
  // A search resumes where the same search stopped (search-cursor.ts). The new position is saved only once its rows are
  // in the inbox: a failed insert must not skip them for good. A search already at its end spends nothing.
  const restart = body.restart === true;
  let advance: (() => Promise<void>) | null = null;
  let more: boolean | null = null;
  const resume = async <S,>(source: SearchSource, key: string) => {
    const c = await loadCursor<S>(supabase, organizationId, source, key, restart);
    const done = (next: S | null) => { more = next !== null; advance = () => saveCursor(supabase, organizationId, source, key, c, next); };
    return { from: c.from, exhausted: c.exhausted, done };
  };
  const exhausted = () => NextResponse.json({ ok: true, imported: 0, summary: {}, discovery: { credits: 0, twd: 0, skipped: 0 }, search: { exhausted: true } });
  // The rows are already in when this runs: a failed cursor write must not answer "failed" (a retry would import them
  // again); the answer says the position was not kept, so the next same search repeats this one (Codex 2026-11-04).
  const finish = async (res: Record<string, unknown>, status = 200) => {
    if (more === null) return NextResponse.json(res, { status });
    let saved = true;
    try { await advance!(); }
    catch (e) { saved = false; console.error(`[outreach-search] cursor not saved: ${String(e).slice(0, 200)}`); }
    return NextResponse.json({ ...res, search: saved ? { more } : { more, saved } }, { status });
  };
  if (body.discover !== undefined) {
    const input = discoverInput(body.discover);
    if (!input) return NextResponse.json({ ok: false, error: "discover.query and discover.location required (≤ 100 chars)" }, { status: 400 });
    const cur = await resume<PlacesCursor>("places", searchKey([input.query, input.location]));
    if (cur.exhausted) return exhausted();
    let grant;
    try { grant = await grantFor("outreach.discover", await billedTo(req, organizationId)); }
    catch (e) { if (e instanceof EntitlementRequired) return NextResponse.json({ ok: false, error: e.code }, { status: e.status }); throw e; }
    // Priced like every paid call (ADR 017 4b-12): the ceiling is held before the first request, the credits Serper
    // reported are kept when it answers. A paying wallet that cannot cover the ceiling starts nothing.
    const hold = await holdCost(grant, DISCOVER_MAX_USD);
    if (!hold) return NextResponse.json({ ok: false, error: "no_credits" }, { status: 402 });
    let used = 0;
    const settle = () => logToolCost({ route: "outreach/discover", model: "serper.places", vendor: "Serper", tool: "outreach", grant, hold,
      costUsd: creditsUsd(used), metadata: { provider: "serper", serper_credits: used } });
    try {
      const found = await discoverPlaces(createProviderCall({ budget: createBudget({ fetches: MAX_PAGES, ms: 30_000 }), grant, timeoutMs: 20_000 }), input, undefined, cur.from);
      used = found.credits;
      await settle();
      rawList = found.leads;
      cur.done(found.next);
      discovery = { credits: found.credits, twd: creditsTwd(found.credits), skipped: found.skipped };
    } catch (e) {
      if (e instanceof LocationNotRecognized) used = e.credits;
      await settle();
      if (e instanceof LocationNotRecognized) {
        return NextResponse.json({ ok: false, error: "location_not_recognized", location: e.location,
          detail: "看不懂這個地區：請填縣市（例：台中市）或英文地名（例：Xinyi District, Taipei City, Taiwan）",
          discovery: { credits: e.credits, twd: creditsTwd(e.credits), skipped: 0 } }, { status: 422 });
      }
      if (!(e instanceof ProviderCallError)) throw e;
      return NextResponse.json({ ok: false, error: e.message }, { status: e.kind === "unconfigured" ? 503 : 502 });
    }
    if (rawList.length === 0) return finish({ ok: true, imported: 0, summary: {}, discovery });
  }

  if (body.gcisItems !== undefined) {
    const text = typeof body.gcisItems === "string" ? body.gcisItems.trim() : "";
    if (!text || text.length > 40) return NextResponse.json({ ok: false, error: "gcisItems must be 1-40 chars" }, { status: 400 });
    let grant;
    try { grant = await grantFor("outreach.discover", await billedTo(req, organizationId)); }
    catch (e) { if (e instanceof EntitlementRequired) return NextResponse.json({ ok: false, error: e.code }, { status: e.status }); throw e; }
    try {
      const usage: GcisUsage = { serperCredits: 0, gcisCalls: 0 };
      const items = await searchBusinessItems(createProviderCall({ budget: createBudget({ fetches: 2, ms: 30_000 }), grant, timeoutMs: 20_000 }), usage, text);
      return NextResponse.json({ ok: true, items });
    } catch (e) {
      if (e instanceof GcisError) return NextResponse.json({ ok: false, error: e.message }, { status: 502 });
      if (!(e instanceof ProviderCallError)) throw e;
      return NextResponse.json({ ok: false, error: e.message }, { status: e.kind === "unconfigured" ? 503 : 502 });
    }
  }

  if (body.gcis !== undefined) {
    const g = body.gcis && typeof body.gcis === "object" ? (body.gcis as Record<string, unknown>) : {};
    const item = typeof g.item === "string" ? g.item.trim().toUpperCase() : "";
    const itemDesc = typeof g.itemDesc === "string" ? g.itemDesc.trim().slice(0, 100) : "";
    const county = typeof g.county === "string" ? g.county.trim() : "";
    if (!/^[A-Z]\d{6}$/.test(item) || !(GCIS_COUNTIES as readonly string[]).includes(county)) {
      return NextResponse.json({ ok: false, error: "gcis.item (e.g. F101040) and gcis.county (one of the 22 counties) required" }, { status: 400 });
    }
    const cur = await resume<GcisCursor>("gcis", searchKey([item, county]));
    if (cur.exhausted) return exhausted();
    let grant;
    try { grant = await grantFor("outreach.discover", await billedTo(req, organizationId)); }
    catch (e) { if (e instanceof EntitlementRequired) return NextResponse.json({ ok: false, error: e.code }, { status: e.status }); throw e; }
    // Same pricing as the map search: the Serper ceiling (one /search per company) is held before the first request,
    // the credits Serper reported are kept. The registry itself is free.
    const hold = await holdCost(grant, creditsUsd(GCIS_MAX_SERPER_CREDITS));
    if (!hold) return NextResponse.json({ ok: false, error: "no_credits" }, { status: 402 });
    const usage: GcisUsage = { serperCredits: 0, gcisCalls: 0 };
    const settle = async () => {
      // The registry calls are free: one row per run, the count in metadata (free quota ledger, /ops/costs).
      if (usage.gcisCalls > 0) void logFreeCall({ route: "outreach/gcis", vendor: "經濟部 GCIS", model: "gcis.opendata", organizationId: billedOrgId(grant), tool: "outreach", metadata: { gcis_calls: usage.gcisCalls } });
      await logToolCost({ route: "outreach/gcis", model: "serper.search", vendor: "Serper", tool: "outreach", grant, hold,
        costUsd: creditsUsd(usage.serperCredits), metadata: { provider: "serper", serper_credits: usage.serperCredits, source: "gcis" } });
    };
    try {
      const found = await discoverCompanies(createProviderCall({ budget: createBudget({ fetches: 220, ms: 240_000 }), grant, timeoutMs: 20_000 }), usage, { item, itemDesc, county }, undefined, cur.from);
      await settle();
      rawList = found.leads;
      discovery = { credits: usage.serperCredits, twd: creditsTwd(usage.serperCredits), skipped: found.skipped };
      gcisWithoutWebsite = found.withoutWebsite;
      cur.done(found.next);
    } catch (e) {
      await settle();
      if (e instanceof GcisError) return NextResponse.json({ ok: false, error: e.message }, { status: 502 });
      if (!(e instanceof ProviderCallError)) throw e;
      return NextResponse.json({ ok: false, error: e.message }, { status: e.kind === "unconfigured" ? 503 : 502 });
    }
    if (rawList.length === 0) return finish({ ok: true, imported: 0, summary: {}, discovery });
  }

  if (body.people !== undefined) {
    const input = peopleInput(body.people);
    if (!input) return NextResponse.json({ ok: false, error: "people.role or people.keyword required (each field ≤ 100 chars)" }, { status: 400 });
    const cur = await resume<PeopleCursor>("people", searchKey([input.role, input.company, input.location, input.keyword]));
    if (cur.exhausted) return exhausted();
    let grant;
    try { grant = await grantFor("outreach.discover", await billedTo(req, organizationId)); }
    catch (e) { if (e instanceof EntitlementRequired) return NextResponse.json({ ok: false, error: e.code }, { status: e.status }); throw e; }
    // Same pricing as the other searches: the ceiling (2 pages per query) is held before the first request, the credits
    // Serper reported are kept.
    const hold = await holdCost(grant, creditsUsd(PEOPLE_MAX_SERPER_CREDITS));
    if (!hold) return NextResponse.json({ ok: false, error: "no_credits" }, { status: 402 });
    const usage: PeopleUsage = { serperCredits: 0 };
    const settle = () => logToolCost({ route: "outreach/people", model: "serper.search", vendor: "Serper", tool: "outreach", grant, hold,
      costUsd: creditsUsd(usage.serperCredits), metadata: { provider: "serper", serper_credits: usage.serperCredits, source: "people" } });
    let skipped = 0;
    try {
      const found = await searchPeople(createProviderCall({ budget: createBudget({ fetches: PEOPLE_MAX_SERPER_CREDITS, ms: 30_000 }), grant, timeoutMs: 20_000 }), usage, input, undefined, cur.from);
      await settle();
      rawList = found.leads;
      cur.done(found.next);
      skipped = found.skipped;
      discovery = { credits: usage.serperCredits, twd: creditsTwd(usage.serperCredits), skipped };
    } catch (e) {
      await settle();
      if (!(e instanceof ProviderCallError)) throw e;
      return NextResponse.json({ ok: false, error: e.message }, { status: e.kind === "unconfigured" ? 503 : 502 });
    }
    if (rawList.length === 0) return finish({ ok: true, imported: 0, summary: {}, discovery });
  }

  if (body.warmLeads !== undefined) {
    const w = body.warmLeads && typeof body.warmLeads === "object" ? (body.warmLeads as Record<string, unknown>) : {};
    const form = typeof w.form === "string" ? w.form.trim().slice(0, 100) : "";
    const rows = Array.isArray(w.rows) ? (w.rows as Array<Record<string, unknown>>) : [];
    if (!form) return NextResponse.json({ ok: false, error: "warmLeads.form (the form's name) required" }, { status: 400 });
    if (rows.length === 0) return NextResponse.json({ ok: false, error: "warmLeads.rows required" }, { status: 400 });
    if (rows.length > MAX_WARM_ROWS) return NextResponse.json({ ok: false, error: `max ${MAX_WARM_ROWS} rows per CSV import` }, { status: 413 });
    const text = (v: unknown) => (typeof v === "string" ? v : "");
    const summary: Record<string, number> = {};
    let imported = 0;
    let existing = 0;
    // One row per address before rows run in parallel: two rows of one person would race to create the same lead.
    const seenEmail = new Set<string>();
    const unique = rows.filter((r) => { const e = text(r?.email).trim().toLowerCase(); if (!e) return true; if (seenEmail.has(e)) return false; seenEmail.add(e); return true; });
    existing += rows.length - unique.length;
    if (rows.length > unique.length) summary.duplicate_in_file = rows.length - unique.length;
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(WARM_CONCURRENCY, unique.length) }, async () => {
      while (next < unique.length) {
        const r = unique[next++];
        const at = Date.parse(text(r?.created_time));
        const res = await captureWarmLead(supabase, {
          orgId: organizationId, email: text(r?.email), name: text(r?.full_name), phone: text(r?.phone), sourceRef: null,
          consent: { source: `meta_lead_ad_csv:${form}`, at: Number.isFinite(at) ? new Date(at).toISOString() : null },
          channel: "meta_lead_ad", form,
        });
        const key = res.ok ? res.sync : res.reason;
        summary[key] = (summary[key] ?? 0) + 1;
        if (res.ok) { if (res.created) imported++; else existing++; }
      }
    }));
    return NextResponse.json({ ok: true, imported, existing, summary }, { status: 201 });
  }

  if (rawList.length === 0) return NextResponse.json({ ok: false, error: "leads[] or lead required" }, { status: 400 });
  if (rawList.length > MAX_BATCH) return NextResponse.json({ ok: false, error: `max ${MAX_BATCH} leads per import` }, { status: 413 });

  const normalized = rawList.map(normalizeLead);
  const dupFlags = flagDuplicatesInBatch(normalized);
  let suppressedFlags: boolean[];
  let existingFlags: boolean[];
  try {
    suppressedFlags = await findSuppressed(supabase, organizationId, normalized.map((n) => ({ email: n.email, website: n.website, name: n.normalized_name })));
    existingFlags = await findExisting(supabase, organizationId, normalized);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "suppression read failed" }, { status: 500 });
  }
  // One MX lookup per domain, cached when definitive in co_verified_emails: "unknown" = domain accepts mail, only a paid verifier writes "valid".
  const verified = await verifyEmails(supabase, organizationId, normalized.flatMap((n) => (n.email ? [n.email] : [])));

  const rows = normalized.map((n, i) => {
    const isDup = dupFlags[i] || existingFlags[i];
    const suppressed = suppressedFlags[i];
    const emailStatus = n.email ? (verified.get(n.email) ?? "unknown") : null;
    const scorable = {
      name: n.normalized_name,
      industry: n.normalized_industry,
      website: n.website,
      social_url: n.social_url,
      email: emailStatus === "invalid" ? null : n.email,   // an undeliverable address scores as no address
      phone: n.phone,
      contact_name: n.contact_name,
      contact_role: n.contact_role,
      source_url: n.source_url,
      evidence_count: citableFact(n.observation, n.source_url) ? 1 : 0,   // approval turns the pair into evidence
    };
    const quality = scoreLeadQuality(scorable, { isDuplicate: isDup });
    const contactability = scoreContactability(scorable, { doNotContact: suppressed, emailVerified: emailStatus === "valid" });
    const inbox_status = classify(n, quality, contactability, isDup, suppressed, emailStatus);
    return {
      organization_id: organizationId,
      raw_payload: rawList[i] as object,
      normalized_name: n.normalized_name,
      normalized_industry: n.normalized_industry,
      website: n.website,
      social_url: n.social_url,
      email: n.email,
      phone: n.phone,
      region: n.region,
      source_type: n.source_type,
      source_url: n.source_url,
      quality_score: quality,
      contactability_score: contactability,
      duplicate_score: isDup ? 100 : 0,
      inbox_status,
      ai_notes: suppressed ? "suppression hit — do not contact" : emailStatus === "invalid" ? "email domain has no mail server (MX) — treated as no email"
        : existingFlags[i] ? "already in this organization's inbox or leads (same email, website or source)" : null,
    };
  });

  const { data, error } = await supabase.from(TABLE).insert(rows).select("id, inbox_status");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const summary: Record<string, number> = {};
  for (const r of data ?? []) {
    const s = (r as { inbox_status: string }).inbox_status;
    summary[s] = (summary[s] ?? 0) + 1;
  }
  return finish({ ok: true, imported: data?.length ?? 0, summary, ...(discovery ? { discovery: { ...discovery, ...(body.gcis !== undefined ? { withoutWebsite: gcisWithoutWebsite } : {}) } } : {}) }, 201);
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
