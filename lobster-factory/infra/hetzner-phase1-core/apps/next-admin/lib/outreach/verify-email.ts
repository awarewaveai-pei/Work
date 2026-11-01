// Email deliverability check without a vendor (SPEC D19, card C1.5): does the address's domain accept mail?
// MX present, or no MX but an A/AAAA record (RFC 5321 §5.1 implicit MX) = "unknown": the domain accepts mail, the mailbox
// is NOT proven -- only a paid verifier (Hunter, C13.2) writes "valid". NXDOMAIN, a null MX (RFC 7505 `MX 0 .`), or a
// domain with neither MX nor address = "invalid". A timeout or resolver failure is "unknown" and is NOT cached: only a
// definitive answer goes into co_verified_emails (0048:295), so a flaky lookup is asked again next time.
import dns from "node:dns/promises";
import type { SupabaseClient } from "@supabase/supabase-js";
import { domainOf } from "./normalize";

export type EmailStatus = "valid" | "invalid" | "risky" | "unknown";
export interface MxResult { status: EmailStatus; definitive: boolean }
export const MX_PROVIDER = "mx_syntax";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_TIMEOUT_MS = 3000;
const DEFAULT_BUDGET_MS = 20_000;   // a whole import never waits longer on DNS than this
const CONCURRENCY = 10;
const CHUNK = 100;

export interface Resolver {
  resolveMx(domain: string): Promise<Array<{ exchange: string; priority: number }>>;
  resolve4(domain: string): Promise<string[]>;
  resolve6(domain: string): Promise<string[]>;
}
export interface VerifyOptions { resolver?: Resolver; timeoutMs?: number; budgetMs?: number }

const NO_ANSWER = new Set(["ENOTFOUND", "ENODATA"]);
const code = (e: unknown) => (e as NodeJS.ErrnoException).code ?? "";

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([p, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error("dns timeout"), { code: "ETIMEOUT" })), ms); })])
    .finally(() => { if (timer) clearTimeout(timer); });
}

/** Whether a syntactically valid address, or its domain, can receive mail. */
export function isEmailSyntax(email: string): boolean { return EMAIL_RE.test(email.trim()); }

export async function domainMailStatus(domain: string, opts: VerifyOptions = {}): Promise<MxResult> {
  const r = opts.resolver ?? dns;
  const ms = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  try {
    const mx = await withTimeout(r.resolveMx(domain), ms);
    if (mx.length === 0) return { status: "invalid", definitive: true };
    const real = mx.some((m) => m.exchange && m.exchange !== ".");
    return { status: real ? "unknown" : "invalid", definitive: true };
  } catch (e) {
    if (code(e) === "ENOTFOUND") return { status: "invalid", definitive: true };
    if (code(e) !== "ENODATA") return { status: "unknown", definitive: false };
  }
  // No MX: an address record is the implicit MX (RFC 5321 §5.1).
  const settled = await Promise.allSettled([withTimeout(r.resolve4(domain), ms), withTimeout(r.resolve6(domain), ms)]);
  if (settled.some((s) => s.status === "fulfilled" && s.value.length > 0)) return { status: "unknown", definitive: true };
  if (settled.every((s) => s.status === "fulfilled" || NO_ANSWER.has(code(s.reason)))) return { status: "invalid", definitive: true };
  return { status: "unknown", definitive: false };
}

export async function mxStatus(email: string, opts: VerifyOptions = {}): Promise<MxResult> {
  const domain = isEmailSyntax(email) ? domainOf(email.trim().toLowerCase()) : null;
  return domain ? domainMailStatus(domain, opts) : { status: "invalid", definitive: true };
}

/** Status per lowercased email: cached rows first, then one lookup per distinct domain (≤CONCURRENCY at a time, within
 *  budgetMs; anything past the budget is "unknown" and uncached). Cache I/O errors are logged and never fail the caller. */
export async function verifyEmails(db: SupabaseClient, organizationId: string | null, emails: readonly string[], opts: VerifyOptions = {}): Promise<Map<string, EmailStatus>> {
  const out = new Map<string, EmailStatus>();
  const wanted = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (wanted.length === 0) return out;
  for (let i = 0; i < wanted.length; i += CHUNK) {
    let q = db.from("co_verified_emails").select("email, status").in("email", wanted.slice(i, i + CHUNK));
    q = organizationId ? q.eq("organization_id", organizationId) : q.is("organization_id", null);
    const { data, error } = await q;
    if (error) console.error(`[outreach] co_verified_emails read failed: ${error.message}`);
    for (const row of (data ?? []) as Array<{ email: string; status: EmailStatus }>) out.set(row.email, row.status);
  }
  const missing = wanted.filter((e) => !out.has(e));
  const byDomain = new Map<string, string[]>();
  const definitive = new Set<string>();
  for (const e of missing) {
    const d = isEmailSyntax(e) ? domainOf(e) : null;
    if (!d) { out.set(e, "invalid"); definitive.add(e); continue; }
    byDomain.set(d, [...(byDomain.get(d) ?? []), e]);
  }
  const deadline = Date.now() + (opts.budgetMs ?? DEFAULT_BUDGET_MS);
  const domains = [...byDomain.keys()];
  for (let i = 0; i < domains.length; i += CONCURRENCY) {
    const batch = domains.slice(i, i + CONCURRENCY);
    const results = Date.now() < deadline ? await Promise.all(batch.map((d) => domainMailStatus(d, opts))) : batch.map((): MxResult => ({ status: "unknown", definitive: false }));
    batch.forEach((d, j) => { for (const e of byDomain.get(d)!) { out.set(e, results[j].status); if (results[j].definitive) definitive.add(e); } });
  }
  const rows = [...definitive].map((email) => ({ organization_id: organizationId, email, status: out.get(email), provider: MX_PROVIDER }));
  if (rows.length > 0) {
    const { error } = await db.from("co_verified_emails").upsert(rows, { onConflict: "organization_id,email", ignoreDuplicates: true });
    if (error) console.error(`[outreach] co_verified_emails write failed: ${error.message}`);
  }
  return out;
}
