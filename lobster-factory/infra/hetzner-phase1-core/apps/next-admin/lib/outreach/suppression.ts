// The suppression rows that can match these leads, read without truncation, for every caller: inbox import, the draft
// guard (contact-guard.ts) and auto-send (C8). Reading the whole list with a row cap silently drops rows past the cap
// (PostgREST max-rows), so the list is never read whole: rows are fetched by the leads' own emails and domains
// (indexed, 0048:181-182), plus every company and global row of the organization, paged to the end.
import type { SupabaseClient } from "@supabase/supabase-js";
import { domainOf, isSuppressed, type SuppressionRow, type SuppressionSubject } from "./normalize";
import { isEmailSyntax } from "./verify-email";

const COLS = "id, email, domain, company_name, scope";
const DOMAIN_RE = /^[a-z0-9.-]+$/;
const CHUNK = 100;   // values per .in(): keeps the request line short
const PAGE = 1000;   // PostgREST's default max-rows

export async function findSuppressed(db: SupabaseClient, organizationId: string | null, leads: readonly SuppressionSubject[],
  appliesTo: readonly string[] = ["cold", "all"]): Promise<boolean[]> {
  if (leads.length === 0) return [];
  const base = () => {
    const q = db.from("co_suppression_list").select(COLS).in("applies_to", [...appliesTo]);
    return organizationId ? q.eq("organization_id", organizationId) : q.is("organization_id", null);
  };
  const run = async (q: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<SuppressionRow[]> => {
    const { data, error } = await q;
    if (error) throw new Error(`suppression read failed: ${error.message}`);
    return (data ?? []) as SuppressionRow[];
  };
  const rows: SuppressionRow[] = [];
  // Only values a stored row could equal go into .in(): postgrest-js does not escape `"` or `\`, so one pasted
  // `"John" <j@x.com>` would 400 the whole read. An address failing this is already "invalid" (verify-email.ts).
  const emails = [...new Set(leads.map((l) => l.email?.trim().toLowerCase()).filter((e): e is string => !!e && isEmailSyntax(e) && !/["\\,()]/.test(e)))];
  const domains = [...new Set(leads.map((l) => domainOf(l.email?.trim().toLowerCase() ?? null) ?? domainOf(l.website ?? null)).filter((d): d is string => !!d && DOMAIN_RE.test(d)))];
  for (let i = 0; i < emails.length; i += CHUNK) rows.push(...await run(base().in("email", emails.slice(i, i + CHUNK))));
  for (let i = 0; i < domains.length; i += CHUNK) rows.push(...await run(base().in("domain", domains.slice(i, i + CHUNK))));
  // Company names are stored as typed (suppression/route.ts) and matched case-insensitively, so they are read whole.
  // Keyset pages until an empty page: correct whatever max-rows is set to, and a concurrent delete skips nothing.
  for (const scope of ["company", "global"]) {
    let after: string | null = null;
    for (;;) {
      let q = base().eq("scope", scope).order("id").limit(PAGE);
      if (after) q = q.gt("id", after);
      const page = (await run(q)) as Array<SuppressionRow & { id: string }>;
      if (page.length === 0) break;
      rows.push(...page);
      after = page[page.length - 1].id;
    }
  }
  return leads.map((l) => isSuppressed(l, rows));
}
