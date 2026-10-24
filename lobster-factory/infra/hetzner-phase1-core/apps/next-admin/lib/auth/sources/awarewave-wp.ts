// Login source `awarewave-wp` (ADR 015 §2, ADR 018 §1; cards/step-4.md 4b-4): a member on aware-wave.com presses
// 「進入」 for a product they hold; the WordPress server (wp-bridge plugin) asks here, server to server, for a one-time
// sign-in link, and sends the browser to it. Nothing about WordPress leaves this file.
//
// Request: POST /api/auth/wp-handoff, body {wp_user_id, product_key, ts, nonce}, header X-AwareWave-Handoff-Signature =
// base64(HMAC-SHA256(raw body, AUTH_WP_HANDOFF_SECRET)) -- its own secret, not the payments one: a leaked login key must
// not record payments and the other way round. Unset or under 32 characters = the source is off.
// Answer: {ok:true, url:"https://<door>/login/wp#token_hash=…&type=recovery"}. The token is GoTrue's own one-time
// recovery token (the type every invite link uses, lib/accounts/client-invite.ts header: "recovery" never creates a
// user; each new link replaces the account's outstanding one, mailed set-password link included, and lives for GoTrue's
// OTP expiry -- the 60 s below bound the request, not the link). Replay: ts within ±60 s and each nonce once. The nonce memory is this process's (one next-admin container,
// as lib/accounts/staff-accounts.ts); a restart forgets at most the last 60 s of nonces, and the link itself stays
// single-use.
import type { SupabaseClient } from "@supabase/supabase-js";
import { signPayment as signBody, verifyPayment as verifyBody } from "@/lib/payments/hmac";
import { findBillingAccount } from "@/lib/entitlements/identities";
import { holdsProduct } from "@/lib/entitlements/door-holds";
import { productHost, servedNextAdminProducts } from "@/lib/portal/doors";

export const HANDOFF_SIGNATURE_HEADER = "x-awarewave-handoff-signature";
export const signHandoff = signBody;
const WINDOW_SECONDS = 60;
const NONCE = /^[A-Za-z0-9_-]{16,100}$/;

const seen = new Map<string, number>(); // nonce -> expiry (unix seconds)
function takeNonce(nonce: string, now: number): boolean {
  for (const [n, exp] of seen) if (exp <= now) seen.delete(n);
  if (seen.has(nonce)) return false;
  seen.set(nonce, now + 2 * WINDOW_SECONDS);
  return true;
}
/** Tests only. */
export const resetHandoffNonces = (): void => seen.clear();

export type HandoffOutcome = { ok: true; url: string } | { ok: false; status: 400 | 401 | 403 | 404 | 503; error: string };

export interface HandoffDeps {
  db: SupabaseClient;
  find: typeof findBillingAccount;
  holds: typeof holdsProduct;
  now: () => number;
}

export async function wpHandoff(rawBody: string, signature: string | null, env: Record<string, string | undefined>, deps: HandoffDeps): Promise<HandoffOutcome> {
  if ((env.AUTH_WP_HANDOFF_SECRET ?? "").trim().length < 32) return { ok: false, status: 404, error: "source_disabled" };
  if (!verifyBody(rawBody, signature, env.AUTH_WP_HANDOFF_SECRET)) return { ok: false, status: 401, error: "invalid_signature" };
  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch { return { ok: false, status: 400, error: "invalid_json" }; }
  const { wp_user_id: wpUserId, product_key: productKey, ts, nonce } = body;
  if (!Number.isSafeInteger(wpUserId) || (wpUserId as number) < 1) return { ok: false, status: 400, error: "invalid_wp_user_id" };
  if (typeof nonce !== "string" || !NONCE.test(nonce)) return { ok: false, status: 400, error: "invalid_nonce" };
  const now = deps.now();
  if (!Number.isSafeInteger(ts) || Math.abs(now - (ts as number)) > WINDOW_SECONDS) return { ok: false, status: 401, error: "stale_request" };
  const product = servedNextAdminProducts().find((p) => p.key === productKey);
  if (!product) return { ok: false, status: 400, error: "unknown_product" };
  // The nonce is spent only by a request that passed the signature and the clock: an attacker cannot burn nonces.
  if (!takeNonce(nonce, now)) return { ok: false, status: 401, error: "replayed_request" };

  const account = await deps.find(deps.db, { provider: "awarewave-wp", externalId: String(wpUserId) });
  if (!account) return { ok: false, status: 404, error: "not_a_member" };
  if (!(await deps.holds({ organizationId: account.organizationId, productKey: product.key, now }))) {
    return { ok: false, status: 403, error: "product_not_held" };
  }
  const { data: got, error: getErr } = await deps.db.auth.admin.getUserById(account.userId);
  if (getErr || !got?.user?.email) return { ok: false, status: 503, error: "auth_lookup_failed" };
  // Still this organization's client (as client-invite.ts belongsTo): a later app_metadata change must not open a door.
  const meta = (got.user.app_metadata ?? {}) as Record<string, unknown>;
  if (String(meta.user_kind ?? "").toLowerCase() !== "client" || meta.org_id !== account.organizationId) {
    return { ok: false, status: 403, error: "not_this_account" };
  }
  // Only an email the person proved (the mailed set-password link) may be signed in from WordPress: WooCommerce does
  // not verify emails, and verifying a recovery token marks the email proven (client-invite.ts header) -- without this
  // check, registering on aware-wave.com with someone else's address would hand that address's account to the payer
  // and fake the 0103 proof. The first entry is always the mailed link. (critic 2026-10-25 High)
  if (!got.user.email_confirmed_at) return { ok: false, status: 403, error: "email_unverified" };
  const { data: link, error: linkErr } = await deps.db.auth.admin.generateLink({ type: "recovery", email: got.user.email });
  const hashed = link?.properties?.hashed_token;
  // generateLink goes by email; it must have resolved the same account (an email changed in between is not this member).
  if (linkErr || !hashed || link.user?.id !== account.userId) return { ok: false, status: 503, error: "link_failed" };
  return { ok: true, url: `https://${productHost(product, env)}/login/wp#token_hash=${encodeURIComponent(hashed)}&type=recovery` };
}
