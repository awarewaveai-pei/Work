// Paid mailbox verification before any automatic send (card C8.6, SPEC D25). MX (verify-email.ts) proves a domain takes
// mail, not that the mailbox exists: send-adapter.ts sends automatically only to an address a paid verifier called
// valid in the last 90 days. risky (catch-all, undecidable) and unknown go to a person (the Gmail draft stays for them);
// invalid is never sent and is suppressed (invalid_email). Only addresses about to be sent automatically are verified,
// never the whole lead base, and not a self-published address whose domain takes mail (SPEC D25, send-adapter.ts).
// Keys: the organization's own Hunter / ZeroBounce connectors, then the agency's (organization_id IS NULL), each tried in
// turn when one is out of quota; no key anywhere = only self-published addresses are sent automatically. The result overwrites the MX row in co_verified_emails
// (provider = reoon | zerobounce | hunter, verified_at).
// Response shapes are the providers' documented v2 ones (Hunter GET /v2/email-verifier: data.status, 202 = still
// running; ZeroBounce GET /v2/validate: status); no key was on hand to record a live answer (WORKLOG 2026-11-02).
import type { SupabaseClient } from "@supabase/supabase-js";
import { connectorSecretRef, getSecret } from "@/lib/secret-vault";
import { guessEmails, splitLatinName, type KnownEmail } from "./email-guess";
import { verifyEmails, type EmailStatus } from "./verify-email";

// Order = which free quota is spent first: Reoon refills daily (20), ZeroBounce monthly (100), Hunter's 50 a month are
// shared with its email finder (C13).
export const PAID_PROVIDERS = ["reoon", "zerobounce", "hunter"] as const;
export type PaidProvider = (typeof PAID_PROVIDERS)[number];
export const VERIFY_TTL_DAYS = 90;
const TIMEOUT_MS = 20_000;
// Reoon power mode talks to the recipient's mail server and may take "more than a minute" (its API documentation).
const REOON_TIMEOUT_MS = 90_000;
/** How long one call to this provider may take. */
export const timeoutOf = (provider: PaidProvider): number => (provider === "reoon" ? REOON_TIMEOUT_MS : TIMEOUT_MS);

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

/** Reoon power-mode status: safe / invalid / disabled / disposable / inbox_full / catch_all / role_account / spamtrap /
 *  unknown (https://www.reoon.com/articles/api-documentation-of-reoon-email-verifier/). A role account (info@) is a real
 *  mailbox: valid, as Hunter and ZeroBounce treat it. */
export function mapReoon(j: { status?: string }): EmailStatus {
  const st = (j.status ?? "").toLowerCase();
  if (st === "safe" || st === "role_account") return "valid";
  if (st === "invalid" || st === "disabled" || st === "disposable" || st === "spamtrap") return "invalid";
  if (st === "catch_all" || st === "inbox_full") return "risky";
  return "unknown";
}

export class VerifyPending extends Error {
  constructor(provider: string) { super(`${provider}: verification still running`); this.name = "VerifyPending"; }
}

/** One paid check. Throws on a transport error, a non-2xx, or a check still running (nothing is cached then). */
export async function verifyMailbox(email: string, key: VerifierKey, fetcher: typeof fetch = fetch): Promise<EmailStatus> {
  const url = key.provider === "hunter"
    ? `https://api.hunter.io/v2/email-verifier?${new URLSearchParams({ email, api_key: key.apiKey })}`
    : key.provider === "reoon"
      ? `https://emailverifier.reoon.com/api/v1/verify?${new URLSearchParams({ email, key: key.apiKey, mode: "power" })}`
      : `https://api.zerobounce.net/v2/validate?${new URLSearchParams({ api_key: key.apiKey, email, ip_address: "" })}`;
  const resp = await fetcher(url, { method: "GET", signal: AbortSignal.timeout(timeoutOf(key.provider)) });
  if (key.provider === "hunter" && resp.status === 202) throw new VerifyPending("hunter");
  if (!resp.ok) throw new Error(`${key.provider} verify ${resp.status}: ${(await resp.text().catch(() => "")).slice(0, 200).replace(key.apiKey, "***")}`);
  const j = await resp.json();
  if (key.provider === "zerobounce" && typeof (j as { error?: unknown }).error === "string") {
    throw new Error(`zerobounce verify: ${String((j as { error: string }).error).slice(0, 200)}`);
  }
  // Reoon answers an error (bad key, no credits) as { status: "error", reason } (its bulk endpoints document it).
  if (key.provider === "reoon" && (j as { status?: unknown }).status === "error") {
    throw new Error(`reoon verify: ${String((j as { reason?: unknown }).reason ?? "error").slice(0, 200)}`);
  }
  return key.provider === "hunter" ? mapHunter(j) : key.provider === "reoon" ? mapReoon(j) : mapZeroBounce(j);
}

/** Every verifier key an organization may use, in order: its own enabled Hunter / ZeroBounce connectors, then the
 *  agency's. More than one = a second free quota to fall back on (verifyWithFallback). */
export async function verifierKeys(db: SupabaseClient, organizationId: string | null): Promise<VerifierKey[]> {
  const out: VerifierKey[] = [];
  for (const org of organizationId ? [organizationId, null] : [null]) {
    let q = db.from("co_connector_accounts").select("id, connector_name").in("connector_name", [...PAID_PROVIDERS])
      .eq("is_enabled", true).not("credentials_ref", "is", null);
    q = org ? q.eq("organization_id", org) : q.is("organization_id", null);
    const { data, error } = await q.order("created_at").limit(10);
    if (error) throw new Error(`verifier connector read failed: ${error.message}`);
    const rows = ((data ?? []) as Array<{ id: string; connector_name: PaidProvider }>)
      .sort((a, b) => PAID_PROVIDERS.indexOf(a.connector_name) - PAID_PROVIDERS.indexOf(b.connector_name));
    for (const c of rows) {
      const apiKey = await getSecret(connectorSecretRef(c.id));
      if (apiKey) out.push({ provider: c.connector_name, apiKey });
    }
  }
  return out;
}

/** The key email inference (C13) uses: Hunter when there is one -- only Hunter has the email finder -- else the first. */
export const inferenceKey = (keys: readonly VerifierKey[]): VerifierKey | null => keys.find((k) => k.provider === "hunter") ?? keys[0] ?? null;

/** One answer from the first key that gives one: a key out of quota or failing (non-2xx, timeout) hands over to the next;
 *  a check still running (VerifyPending) stops here and is asked again next tick. All failing = the last error. With a
 *  deadline (epoch ms), no call starts that could end after it (the send tick's own limit). */
export async function verifyWithFallback(email: string, keys: readonly VerifierKey[],
  verify: (email: string, key: VerifierKey) => Promise<EmailStatus> = verifyMailbox, deadline?: number): Promise<{ status: EmailStatus; provider: PaidProvider } | null> {
  let last: unknown = null;
  for (const key of keys) {
    if (deadline !== undefined && Date.now() + timeoutOf(key.provider) > deadline) continue;  // a faster one may still fit
    try { return { status: await verify(email, key), provider: key.provider }; }
    catch (e) { if (e instanceof VerifyPending) throw e; last = e; }
  }
  if (last) throw last;
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

/** Hunter GET /v2/email-finder (domain + first and last name): the address Hunter knows for that person, with its own
 *  verification status (data.verification.status: valid / accept_all / unknown). Hunter only: ZeroBounce has no finder.
 *  null = Hunter knows none. Throws like verifyMailbox. Shape is the documented v2 one; no key was on hand to record a live answer. */
export async function findMailbox(domain: string, first: string, last: string, key: VerifierKey, fetcher: typeof fetch = fetch): Promise<{ email: string; status: EmailStatus } | null> {
  if (key.provider !== "hunter") return null;
  const url = `https://api.hunter.io/v2/email-finder?${new URLSearchParams({ domain, first_name: first, last_name: last, api_key: key.apiKey })}`;
  const resp = await fetcher(url, { method: "GET", signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (resp.status === 202) throw new VerifyPending("hunter");
  if (!resp.ok) throw new Error(`hunter find ${resp.status}: ${(await resp.text().catch(() => "")).slice(0, 200).replace(key.apiKey, "***")}`);
  const j = (await resp.json()) as { data?: { email?: unknown; verification?: { status?: unknown } } };
  const email = typeof j.data?.email === "string" ? j.data.email.trim().toLowerCase() : "";
  if (!email) return null;
  const st = j.data?.verification?.status;
  return { email, status: mapHunter({ data: { status: typeof st === "string" ? st : undefined } }) };
}

export interface InferCandidate { email: string; mx: EmailStatus; paid: EmailStatus | null }
export interface InferResult {
  /** The one address a paid verifier called valid; null otherwise. */
  email: string | null;
  /** valid = `email` is set; unverified = no verifier key, candidates passed MX only; none = nothing deliverable found;
   *  pending = a paid check was still running, ask again later. */
  outcome: "valid" | "unverified" | "none" | "pending";
  provider: PaidProvider | null;
  via: "guess" | "finder" | null;
  candidates: InferCandidate[];
  /** Paid answers received (metered): what the run cost. */
  paidCalls: number;
}
export interface InferDeps {
  now?: () => Date;
  mx?: (emails: readonly string[]) => Promise<Map<string, EmailStatus>>;
  stored?: (email: string) => Promise<StoredVerdict | null>;
  save?: (email: string, status: EmailStatus, provider: PaidProvider) => Promise<void>;
  verify?: (email: string, key: VerifierKey) => Promise<EmailStatus>;
  find?: (domain: string, first: string, last: string, key: VerifierKey) => Promise<{ email: string; status: EmailStatus } | null>;
  /** Called once per paid answer, before the next paid call (meters it; throws to stop the run). */
  onPaid?: (provider: PaidProvider) => Promise<void>;
}

/** A person's address (SPEC D20, card C13.2): guesses from the company's formats -> MX (nothing paid for a dead domain) ->
 *  paid verifier on each survivor, first `valid` wins -> Hunter email-finder as the second path. Only a paid `valid` is
 *  returned as `email`; every paid answer is stored (co_verified_emails) so asking again is free for 90 days. No key = MX
 *  only: the survivors come back as `unverified` candidates and nothing is an address. */
export async function inferEmail(db: SupabaseClient, organizationId: string | null,
  person: { name: string | null; domain: string; known?: readonly KnownEmail[] }, key: VerifierKey | null, deps: InferDeps = {}): Promise<InferResult> {
  const now = deps.now ?? (() => new Date());
  const mx = deps.mx ?? ((emails: readonly string[]) => verifyEmails(db, organizationId, emails));
  const stored = deps.stored ?? ((email: string) => storedVerdict(db, organizationId, email));
  const save = deps.save ?? ((email: string, status: EmailStatus, provider: PaidProvider) => saveVerdict(db, organizationId, email, status, provider, now()));
  const verify = deps.verify ?? ((email: string, k: VerifierKey) => verifyMailbox(email, k));
  const find = deps.find ?? ((d: string, f: string, l: string, k: VerifierKey) => findMailbox(d, f, l, k));
  const result: InferResult = { email: null, outcome: "none", provider: null, via: null, candidates: [], paidCalls: 0 };

  const guesses = guessEmails(person.name, person.domain, person.known ?? []);
  const parts = splitLatinName(person.name);
  if (guesses.length === 0 || !parts) return result;
  const checked = await mx(guesses);
  const alive = guesses.filter((g) => (checked.get(g) ?? "unknown") !== "invalid");
  result.candidates = alive.map((email) => ({ email, mx: checked.get(email) ?? "unknown", paid: null }));
  if (!key) return alive.length ? { ...result, outcome: "unverified" } : result;
  // Every guess dead: a domain with no mail server ends here (nothing paid); guesses a paid verifier called invalid
  // mean the domain lives, and the finder may know a fifth form (Codex C13 F1).
  if (!alive.length) {
    const paidDead = await Promise.all(guesses.map(async (g) => PAID_PROVIDERS.includes((await stored(g))?.provider as PaidProvider)));
    if (!paidDead.some(Boolean)) return result;
  }

  const accept = (email: string, via: "guess" | "finder"): InferResult => ({ ...result, email, outcome: "valid", provider: key.provider, via });
  try {
    for (const c of result.candidates) {
      const fresh = freshPaid(await stored(c.email), now());
      if (fresh) { c.paid = fresh.status; if (fresh.status === "valid") return accept(c.email, "guess"); continue; }
      const status = await verify(c.email, key);
      result.paidCalls++;
      await deps.onPaid?.(key.provider);
      c.paid = status;
      await save(c.email, status, key.provider);
      if (status === "valid") return accept(c.email, "guess");
    }
    const found = await find(person.domain.trim().toLowerCase().replace(/^www\./, ""), parts.first, parts.last, key);
    if (key.provider === "hunter") { result.paidCalls++; await deps.onPaid?.(key.provider); }
    if (found && !result.candidates.some((c) => c.email === found.email)) result.candidates.push({ email: found.email, mx: "unknown", paid: found.status });
    if (found && found.status === "valid") {
      await save(found.email, "valid", key.provider);
      return accept(found.email, "finder");
    }
    return result;
  } catch (e) {
    if (e instanceof VerifyPending) return { ...result, outcome: "pending" };
    throw e;
  }
}
