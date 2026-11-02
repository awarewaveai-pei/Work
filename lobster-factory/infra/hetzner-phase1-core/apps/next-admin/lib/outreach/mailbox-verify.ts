// Paid mailbox verification before any automatic send (card C8.6, SPEC D25). MX (verify-email.ts) proves a domain takes
// mail, not that the mailbox exists: send-adapter.ts sends automatically only to an address a paid verifier called
// valid in the last 90 days. risky (catch-all, undecidable) and unknown go to a person (the Gmail draft stays for them);
// invalid is never sent and is suppressed (invalid_email). Only addresses about to be sent automatically are verified,
// never the whole lead base. The key is the organization's own Hunter / ZeroBounce connector, else the agency's
// (organization_id IS NULL); no key anywhere = no automatic send. The result overwrites the MX row in co_verified_emails
// (provider = hunter | zerobounce, verified_at).
// Response shapes are the providers' documented v2 ones (Hunter GET /v2/email-verifier: data.status, 202 = still
// running; ZeroBounce GET /v2/validate: status); no key was on hand to record a live answer (WORKLOG 2026-11-02).
import type { SupabaseClient } from "@supabase/supabase-js";
import { connectorSecretRef, getSecret } from "@/lib/secret-vault";
import type { EmailStatus } from "./verify-email";

export const PAID_PROVIDERS = ["hunter", "zerobounce"] as const;
export type PaidProvider = (typeof PAID_PROVIDERS)[number];
export const VERIFY_TTL_DAYS = 90;
const TIMEOUT_MS = 20_000;

export interface VerifierKey { provider: PaidProvider; apiKey: string }
export interface StoredVerdict { status: EmailStatus; provider: string | null; verified_at: string }

/** A paid verdict from the last 90 days, or null (none, MX-only, or too old). */
export function freshPaid(row: StoredVerdict | null, now: Date): StoredVerdict | null {
  if (!row || !PAID_PROVIDERS.includes(row.provider as PaidProvider)) return null;
  return now.getTime() - Date.parse(row.verified_at) <= VERIFY_TTL_DAYS * 86_400_000 ? row : null;
}

/** Hunter data.status: valid / invalid / accept_all / webmail / disposable / unknown. A webmail address is valid only
 *  when Hunter also calls it deliverable. */
export function mapHunter(j: { data?: { status?: string; result?: string } }): EmailStatus {
  const st = j.data?.status, res = j.data?.result;
  if (st === "valid") return "valid";
  if (st === "invalid" || st === "disposable" || res === "undeliverable") return "invalid";
  if (st === "webmail") return res === "deliverable" ? "valid" : "risky";
  if (st === "accept_all" || res === "risky") return "risky";
  return "unknown";
}

/** ZeroBounce status: valid / invalid / catch-all / unknown / spamtrap / abuse / do_not_mail. */
export function mapZeroBounce(j: { status?: string }): EmailStatus {
  const st = (j.status ?? "").toLowerCase();
  if (st === "valid") return "valid";
  if (st === "invalid" || st === "spamtrap" || st === "abuse" || st === "do_not_mail") return "invalid";
  if (st === "catch-all") return "risky";
  return "unknown";
}

export class VerifyPending extends Error {
  constructor(provider: string) { super(`${provider}: verification still running`); this.name = "VerifyPending"; }
}

/** One paid check. Throws on a transport error, a non-2xx, or a check still running (nothing is cached then). */
export async function verifyMailbox(email: string, key: VerifierKey, fetcher: typeof fetch = fetch): Promise<EmailStatus> {
  const url = key.provider === "hunter"
    ? `https://api.hunter.io/v2/email-verifier?${new URLSearchParams({ email, api_key: key.apiKey })}`
    : `https://api.zerobounce.net/v2/validate?${new URLSearchParams({ api_key: key.apiKey, email, ip_address: "" })}`;
  const resp = await fetcher(url, { method: "GET", signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (key.provider === "hunter" && resp.status === 202) throw new VerifyPending("hunter");
  if (!resp.ok) throw new Error(`${key.provider} verify ${resp.status}: ${(await resp.text().catch(() => "")).slice(0, 200).replace(key.apiKey, "***")}`);
  const j = await resp.json();
  if (key.provider === "zerobounce" && typeof (j as { error?: unknown }).error === "string") {
    throw new Error(`zerobounce verify: ${String((j as { error: string }).error).slice(0, 200)}`);
  }
  return key.provider === "hunter" ? mapHunter(j) : mapZeroBounce(j);
}

/** The verifier key for an organization: its own enabled Hunter / ZeroBounce connector first, then the agency's. */
export async function verifierKey(db: SupabaseClient, organizationId: string | null): Promise<VerifierKey | null> {
  for (const org of organizationId ? [organizationId, null] : [null]) {
    let q = db.from("co_connector_accounts").select("id, connector_name").in("connector_name", [...PAID_PROVIDERS])
      .eq("is_enabled", true).not("credentials_ref", "is", null);
    q = org ? q.eq("organization_id", org) : q.is("organization_id", null);
    const { data, error } = await q.order("created_at").limit(10);
    if (error) throw new Error(`verifier connector read failed: ${error.message}`);
    for (const c of (data ?? []) as Array<{ id: string; connector_name: PaidProvider }>) {
      const apiKey = await getSecret(connectorSecretRef(c.id));
      if (apiKey) return { provider: c.connector_name, apiKey };
    }
  }
  return null;
}

export async function storedVerdict(db: SupabaseClient, organizationId: string | null, email: string): Promise<StoredVerdict | null> {
  let q = db.from("co_verified_emails").select("status, provider, verified_at").eq("email", email.trim().toLowerCase());
  q = organizationId ? q.eq("organization_id", organizationId) : q.is("organization_id", null);
  const { data, error } = await q.order("verified_at", { ascending: false }).limit(1);
  if (error) throw new Error(`co_verified_emails read failed: ${error.message}`);
  return ((data ?? [])[0] as StoredVerdict | undefined) ?? null;
}

/** Stores a paid verdict over whatever the address had (the MX row). */
export async function saveVerdict(db: SupabaseClient, organizationId: string | null, email: string, status: EmailStatus, provider: PaidProvider, now: Date): Promise<void> {
  const row = { organization_id: organizationId, email: email.trim().toLowerCase(), status, provider, verified_at: now.toISOString() };
  // The key is unique nulls not distinct (0149), so the agency's (NULL organization) row upserts the same way.
  const { error } = await db.from("co_verified_emails").upsert(row, { onConflict: "organization_id,email" });
  if (error) throw new Error(`co_verified_emails write failed: ${error.message}`);
}
