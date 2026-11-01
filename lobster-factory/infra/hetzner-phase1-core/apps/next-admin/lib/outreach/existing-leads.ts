// Cold Outreach -- is this business already in the organization's inbox or lead list (card C10)? Identity = the same
// email (case-folded), the same own-website host (never a platform's: normalize.ts ownHostOf), or the same source_url
// (a map listing is one place). Read by those values only, never the whole table: an organization's list grows by
// hundreds a day. Used by inbox import (suspected_dup) and by approve-to-leads (return the existing lead, no second one).
import type { SupabaseClient } from "@supabase/supabase-js";
import { ownHostOf } from "./normalize";
import { isEmailSyntax } from "./verify-email";

export interface Identity { email?: string | null; website?: string | null; source_url?: string | null; name?: string | null; phone?: string | null }
interface Row { id: string; email: string | null; website: string | null; source_url: string | null; name?: string | null; phone?: string | null }

const CHUNK = 50;
const PAGE = 1000;   // PostgREST's default max-rows: every read is paged to the end, never cut at the cap
const HOST_RE = /^[a-z0-9.-]+$/;
// postgrest-js escapes neither `"` nor `\` in .in(), and ,() are .or() syntax: such a value goes in a filter of its own.
const SAFE = (v: string) => !/["\\,()*%]/.test(v);
// ilike wildcards: a name containing one cannot be matched literally.
const LITERAL = (v: string) => !/[*%\\]/.test(v);
const fold = (v: string | null | undefined) => (v && v.trim() ? v.trim().toLowerCase() : null);

function keysOf(i: Identity): string[] {
  const out: string[] = [];
  const email = fold(i.email);
  if (email) out.push(`email:${email}`);
  const host = ownHostOf(i.website ?? null);
  if (host) out.push(`host:${host}`);
  const src = i.source_url?.trim();
  if (src) out.push(`src:${src}`);
  return out;
}

async function readRows(db: SupabaseClient, table: "co_lead_inbox" | "co_leads", orgId: string | null, items: readonly Identity[]): Promise<Row[]> {
  const cols = table === "co_leads" ? "id, email, website, source_url, name, phone" : "id, email, website, source_url";
  const base = () => {
    const q = db.from(table).select(cols);
    return orgId ? q.eq("organization_id", orgId) : q.is("organization_id", null);
  };
  const emails = [...new Set(items.map((i) => fold(i.email)).filter((e): e is string => !!e && isEmailSyntax(e) && SAFE(e)))];
  const hosts = [...new Set(items.map((i) => ownHostOf(i.website ?? null)).filter((h): h is string => !!h && HOST_RE.test(h)))];
  const srcs = [...new Set(items.map((i) => i.source_url?.trim()).filter((s): s is string => !!s))];
  const rows: Row[] = [];
  type Q = ReturnType<typeof base>;
  // Keyset pages until a short page: a substring query by a short host can match more rows than max-rows.
  const run = async (filter: (q: Q) => Q) => {
    let after: string | null = null;
    for (;;) {
      let q = filter(base()).order("id").limit(PAGE);
      if (after) q = q.gt("id", after);
      const { data, error } = await q;
      if (error) throw new Error(`${table} read failed: ${error.message}`);
      const page = (data ?? []) as unknown as Row[];
      rows.push(...page);
      if (page.length < PAGE) return;
      after = page[page.length - 1].id;
    }
  };
  // email: ilike, because co_leads.email keeps the case it was typed in (the 0149 unique index is on lower(email)); an
  // `_` wildcard over-match is dropped by the exact comparison in the caller. website: stored as typed, so a substring
  // query by host, then the exact host compared in the caller.
  for (let i = 0; i < emails.length; i += CHUNK) { const part = emails.slice(i, i + CHUNK); await run((q) => q.or(part.map((e) => `email.ilike.${e}`).join(","))); }
  for (let i = 0; i < hosts.length; i += CHUNK) { const part = hosts.slice(i, i + CHUNK); await run((q) => q.or(part.map((h) => `website.ilike.*${h}*`).join(","))); }
  const safeSrcs = srcs.filter(SAFE);
  for (let i = 0; i < safeSrcs.length; i += CHUNK) { const part = safeSrcs.slice(i, i + CHUNK); await run((q) => q.in("source_url", part)); }
  for (const src of srcs.filter((v) => !SAFE(v))) await run((q) => q.eq("source_url", src));
  return rows;
}

/** For each item: true when the same business is already in this organization's inbox or leads. */
export async function findExisting(db: SupabaseClient, orgId: string | null, items: readonly Identity[]): Promise<boolean[]> {
  if (items.length === 0) return [];
  const known = new Set<string>();
  for (const table of ["co_lead_inbox", "co_leads"] as const) {
    for (const r of await readRows(db, table, orgId, items)) for (const k of keysOf(r)) known.add(k);
  }
  return items.map((i) => keysOf(i).some((k) => known.has(k)));
}

/** The organization's lead that is this business, or null: same email, else same source_url, else same name with the
 *  same own-website host (a chain's branches share a host, not a name), else same name and phone. */
export async function findExistingLead(db: SupabaseClient, orgId: string | null, i: Identity): Promise<Row | null> {
  const rows = await readRows(db, "co_leads", orgId, [i]);
  const email = fold(i.email);
  const src = i.source_url?.trim() || null;
  const host = ownHostOf(i.website ?? null);
  const name = fold(i.name);
  const digits = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");
  return rows.find((r) => email && fold(r.email) === email)
    ?? rows.find((r) => src && r.source_url?.trim() === src)
    ?? rows.find((r) => name && host && fold(r.name) === name && ownHostOf(r.website) === host)
    ?? (name && digits(i.phone).length >= 7 ? await byNamePhone(db, orgId, name, digits(i.phone)) : null);
}

async function byNamePhone(db: SupabaseClient, orgId: string | null, name: string, phone: string): Promise<Row | null> {
  if (!LITERAL(name)) return null;
  const q = db.from("co_leads").select("id, email, website, source_url, name, phone").ilike("name", name);
  const { data, error } = await (orgId ? q.eq("organization_id", orgId) : q.is("organization_id", null)).limit(50);
  if (error) throw new Error(`co_leads read failed: ${error.message}`);
  return ((data ?? []) as Row[]).find((r) => fold(r.name) === name && (r.phone ?? "").replace(/\D/g, "") === phone) ?? null;
}
