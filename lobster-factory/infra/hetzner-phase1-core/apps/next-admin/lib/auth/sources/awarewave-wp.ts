// Login source `awarewave-wp` (ADR 015 §2, ADR 018 §1; cards/step-4.md 4b-4): a member on aware-wave.com presses
// 「進入」 for a product they hold, or for their workspace (WORKSPACE_KEY, the portal launcher); the WordPress server (wp-bridge plugin) asks here, server to server, for a one-time
// sign-in link, and sends the browser to it. Nothing about WordPress leaves this file.
//
// Request: POST /api/auth/wp-handoff, body {wp_user_id, product_key, ts, nonce, key_id?}, header
// X-AwareWave-Handoff-Signature = the site's hand-off signature over the raw body (4c-2, lib/payments/sites.ts): key_id
// names a seller_sites row and its handoff key verifies (ed25519); no key_id = aware-wave.com, base64(HMAC-SHA256(raw
// body, AUTH_WP_HANDOFF_SECRET)). Its own key, not the payments one: a leaked login key must not record payments and
// the other way round. A site with no hand-off key (or the env secret under 32 characters) = the source is off for it.
// key_id is read before the signature is checked only to choose which key checks it.
// Answer: {ok:true, url:"https://<door>/login/wp#token_hash=…&type=recovery&uid=…"}. The token is GoTrue's own one-time
// recovery token (the type every invite link uses, lib/accounts/client-invite.ts header: "recovery" never creates a
// user; each new link replaces the account's outstanding one, mailed set-password link included, and lives for GoTrue's
// OTP expiry -- the 60 s below bound the request, not the link). Replay: ts within ±60 s and each nonce once. The nonce memory is this process's (one next-admin container,
// as lib/accounts/staff-accounts.ts); a restart forgets at most the last 60 s of nonces, and the link itself stays
// single-use.
//
// POST /api/auth/wp-summary (blueprint §2A.4, ADR 021 G13): the same signed request without product_key, answered with
// what My Account draws -- the member's unit name, wallet, and the products the unit holds by app entitlements (not
// WooCommerce orders), each worded by rightLabel() with its door's address. aware-wave.com only (a seller's members buy
// from the seller). Both routes pass the one check below (verifySignedMember) and share the nonce memory, so a body
// signed for one route is never accepted by the other as well.
import type { SupabaseClient } from "@supabase/supabase-js";
import { signPayment as signBody } from "@/lib/payments/hmac";
import { AWARE_WAVE_KEY_ID, SITE_KEY_ID, findSiteByKeyId, siteIdentityProvider, siteSigns, verifySiteSignature, type SellerSite } from "@/lib/payments/sites";
import { findBillingAccount, type BillingAccountIdentity } from "@/lib/entitlements/identities";
import { holdsProduct } from "@/lib/entitlements/door-holds";
import type { BillingAccount, billingAccount } from "@/lib/entitlements/tables";
import type { CanStore } from "@/lib/entitlements/can";
import { rightLabel, type RightInput } from "@/lib/entitlements/right-label";
import { checkDoorAccount, mintDoorLink } from "@/lib/auth/door-link";
import { portalHost, productHost, servedNextAdminProducts, type NextAdminProduct } from "@/lib/portal/doors";
import type { heldDoors } from "@/lib/portal/held-doors";

/** product_key for the member's workspace (the portal launcher: every product, held or not): no product can take this
 *  key (RESERVED_SUBDOMAINS), and only aware-wave.com members have a workspace here -- a seller's members buy from the
 *  seller. */
export const WORKSPACE_KEY = "portal";

export const HANDOFF_SIGNATURE_HEADER = "x-awarewave-handoff-signature";
export const signHandoff = signBody;
const WINDOW_SECONDS = 60;
const NONCE = /^[A-Za-z0-9_-]{16,100}$/;

const seen = new Map<string, number>(); // <key_id>:<nonce> -> expiry (unix seconds); a nonce is one site's
function takeNonce(nonce: string, now: number): boolean {
  for (const [n, exp] of seen) if (exp <= now) seen.delete(n);
  if (seen.has(nonce)) return false;
  seen.set(nonce, now + 2 * WINDOW_SECONDS);
  return true;
}
/** Tests only. */
export const resetHandoffNonces = (): void => seen.clear();

export type HandoffOutcome = { ok: true; url: string } | { ok: false; status: 400 | 401 | 403 | 404 | 503; error: string };
type Refusal = Extract<HandoffOutcome, { ok: false }>;
type Env = Record<string, string | undefined>;

export interface HandoffDeps {
  db: SupabaseClient;
  site: typeof findSiteByKeyId;
  find: typeof findBillingAccount;
  holds: typeof holdsProduct;
  now: () => number;
}
type MemberDeps = Pick<HandoffDeps, "db" | "site" | "find" | "now">;
type Verified = { ok: true; account: BillingAccountIdentity; now: number };

/** The one check both routes make, in this order: body, key id, the site's own hand-off key (none = source off),
 *  signature, site active, wp_user_id, nonce shape, clock, the route's own `gate`, nonce spent, member. The gate runs
 *  after the signature and the clock and before the nonce is spent: a refused request burns no nonce. */
async function verifySignedMember(rawBody: string, signature: string | null, env: Env, deps: MemberDeps,
  gate: (body: Record<string, unknown>, site: SellerSite) => Refusal | null): Promise<Verified | Refusal> {
  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch { return { ok: false, status: 400, error: "invalid_json" }; }
  const { wp_user_id: wpUserId, ts, nonce, key_id: keyId } = body;
  if (keyId !== undefined && (typeof keyId !== "string" || !SITE_KEY_ID.test(keyId))) return { ok: false, status: 400, error: "invalid_key_id" };
  const site = await deps.site(deps.db, (keyId as string | undefined) ?? AWARE_WAVE_KEY_ID);
  if (!site || !siteSigns(site, "handoff", env)) return { ok: false, status: 404, error: "source_disabled" };
  if (!verifySiteSignature(site, "handoff", rawBody, signature, env)) return { ok: false, status: 401, error: "invalid_signature" };
  if (site.status !== "active") return { ok: false, status: 403, error: "site_disabled" };
  if (!Number.isSafeInteger(wpUserId) || (wpUserId as number) < 1) return { ok: false, status: 400, error: "invalid_wp_user_id" };
  if (typeof nonce !== "string" || !NONCE.test(nonce)) return { ok: false, status: 400, error: "invalid_nonce" };
  const now = deps.now();
  if (!Number.isSafeInteger(ts) || Math.abs(now - (ts as number)) > WINDOW_SECONDS) return { ok: false, status: 401, error: "stale_request" };
  const refused = gate(body, site);
  if (refused) return refused;
  // The nonce is spent only by a request that passed the signature and the clock: an attacker cannot burn nonces.
  if (!takeNonce(`${site.keyId}:${nonce}`, now)) return { ok: false, status: 401, error: "replayed_request" };
  const account = await deps.find(deps.db, { provider: siteIdentityProvider(site), siteId: site.id, externalId: String(wpUserId) });
  if (!account) return { ok: false, status: 404, error: "not_a_member" };
  return { ok: true, account, now };
}

export async function wpHandoff(rawBody: string, signature: string | null, env: Env, deps: HandoffDeps): Promise<HandoffOutcome> {
  let product: NextAdminProduct | null = null;
  const v = await verifySignedMember(rawBody, signature, env, deps, (body, site) => {
    const workspace = body.product_key === WORKSPACE_KEY;
    product = workspace ? null : servedNextAdminProducts().find((p) => p.key === body.product_key) ?? null;
    if (!workspace && !product) return { ok: false, status: 400, error: "unknown_product" };
    // A seller's WordPress (customer-wp) opens only the doors that list it (products.ts loginSources, ADR 018 §3).
    // aware-wave.com is not held to the list: 4b-4 opened every served door to it while most list only "local" -- which
    // of the two is right is the operator's call (WORKLOG 2026-10-29), and closing those doors here would be that call.
    if (siteIdentityProvider(site) === "customer-wp" && (workspace || !product!.loginSources.includes("customer-wp"))) {
      return { ok: false, status: 403, error: "login_source_not_allowed" };
    }
    return null;
  });
  if (v.ok === false) return v;
  const door = product as NextAdminProduct | null;
  if (door && !(await deps.holds({ organizationId: v.account.organizationId, productKey: door.key, now: v.now }))) {
    return { ok: false, status: 403, error: "product_not_held" };
  }
  return mintDoorLink(deps.db, v.account, door ? productHost(door, env) : portalHost(env));
}

// ---------- wp-summary ----------

export type RightKind = "contract" | "comp" | "credits" | "trial" | "none";
/** Per feature of the product, by the row that decides it (pickEntitlementRow, the rule can() uses): covered = a contract
 *  row that covers the use, gift = a comp row, credits = a credit-pack row (pay: "credits"), locked = no valid live row. */
export interface RightCounts { covered: number; gift: number; credits: number; locked: number }
export interface WpSummaryProduct {
  key: string;
  name: string;
  /** kind: where the right comes from (none = not held). label: rightLabel()'s badge only. It is null for a product held
   *  by a contract row with no subscription (a staff-made contract): its period and status are unknown, so nothing is
   *  worded until U5 gives the feature list a source column. until: the contract's period end or the gift's end. */
  right: { kind: RightKind; label: string | null; until?: string; counts: RightCounts };
  /** = held (heldDoors). 「進入」 asks wp-handoff with `key` for the one-time link; `url` is the door, only when held. */
  can_enter: boolean;
  url?: string;
}
export interface WpSummary {
  ok: true;
  unit: { name: string };
  wallet: { balance: number; frozen: boolean };
  /** Every door open to members (servedNextAdminProducts), registry order; not held = kind "none", can_enter false. */
  products: WpSummaryProduct[];
  fetched_at: string;
}
export type SummaryOutcome = WpSummary | Refusal;

export interface SummaryDeps extends MemberDeps {
  held: typeof heldDoors;
  account: typeof billingAccount;
  /** createEntitlementStore().findActiveEntitlement: the row can() decides by (pickEntitlementRow), per feature. */
  entitlement: CanStore["findActiveEntitlement"];
}

type ContractStatus = NonNullable<RightInput["contractStatus"]>;

/** Where a held product's right comes from, read off the unit's own billing account: a subscription (active/trial before
 *  a gift, past_due/canceled after), a gift, or the all-features account's source; otherwise null, never guessed. */
export function productRight(account: BillingAccount, productKey: string): Pick<RightInput, "source" | "contractStatus" | "endsAt"> {
  const contracts = account.contracts.filter((c) => c.product_key === productKey);
  const contract = (statuses: ContractStatus[]) => contracts.find((c) => (statuses as string[]).includes(c.status));
  const live = contract(["active", "trial"]);
  if (live) return { source: "contract", contractStatus: live.status as ContractStatus, endsAt: live.current_period_end };
  const comp = account.grants.find((g) => g.product_key === productKey && g.source === "comp" && g.state === "active");
  if (comp) return { source: "comp", contractStatus: null, endsAt: comp.ends_at };
  const lapsing = contract(["past_due", "canceled"]);
  if (lapsing) return { source: "contract", contractStatus: lapsing.status as ContractStatus, endsAt: lapsing.current_period_end };
  const all = account.all_features?.source;
  if (all === "contract" || all === "comp") return { source: all, contractStatus: null, endsAt: null };
  return { source: null, contractStatus: null, endsAt: null };
}

/** One store read per feature (as heldDoors asks per door): an all-features account's rows exceed PostgREST's row cap. */
export async function rightCounts(organizationId: string, product: Pick<NextAdminProduct, "key" | "features">, now: number,
  entitlement: SummaryDeps["entitlement"]): Promise<RightCounts> {
  const counts: RightCounts = { covered: 0, gift: 0, credits: 0, locked: 0 };
  const rows = await Promise.all(product.features.map((f) => entitlement({ organizationId, productKey: product.key, featureKey: f.feature_key, now })));
  for (const row of rows) {
    const pay = row?.limits?.pay;
    if (row && pay === undefined && row.source === "contract") counts.covered += 1;
    else if (row && pay === undefined && row.source === "comp") counts.gift += 1;
    else if (row && pay === "credits" && row.source === "contract") counts.credits += 1;
    else counts.locked += 1;   // no live row, or one can() refuses (malformed marker)
  }
  return counts;
}

export async function wpSummary(rawBody: string, signature: string | null, env: Env, deps: SummaryDeps): Promise<SummaryOutcome> {
  const v = await verifySignedMember(rawBody, signature, env, deps, (body, site) => {
    // A hand-off body names a product: it is not a summary request (the routes never take each other's bodies).
    if (body.product_key !== undefined) return { ok: false, status: 400, error: "unexpected_product_key" };
    // aware-wave.com only until a seller's summary is specified (blueprint §2A.4 外掛 2).
    if (siteIdentityProvider(site) !== "awarewave-wp") return { ok: false, status: 403, error: "login_source_not_allowed" };
    return null;
  });
  if (v.ok === false) return v;
  const checked = await checkDoorAccount(deps.db, v.account);
  if (checked.ok === false) return checked;
  const orgId = v.account.organizationId;
  const account = await deps.account(orgId, deps.db);
  if (!account) return { ok: false, status: 404, error: "not_a_member" };
  // billing_account resolves a brand to its root; a brand's member is not a member (ADR 021 D1: member links join root
  // organizations only), and the root's name and wallet are not theirs to see.
  if (account.organization_id !== orgId) return { ok: false, status: 403, error: "brand_unit_unsupported" };
  const held = new Set((await deps.held(orgId, undefined, v.now)).map((p) => p.key));
  const products = await Promise.all(servedNextAdminProducts().map(async (p): Promise<WpSummaryProduct> => {
    if (!held.has(p.key)) {
      const l = rightLabel({ entry: null, door: "not_held", source: null, viewer: "manager", mode: "enforce", productName: p.name });
      return { key: p.key, name: p.name, right: { kind: "none", label: l.label, counts: { covered: 0, gift: 0, credits: 0, locked: p.features.length } }, can_enter: false };
    }
    const counts = await rightCounts(orgId, p, v.now, deps.entitlement);
    const r = productRight(account, p.key);
    // No subscription, gift or all-features source: a credit pack is still known by its rows; a contract row alone is not
    // worded (see WpSummaryProduct.right).
    const source = r.source ?? (counts.covered === 0 && counts.credits > 0 ? "credits" : null);
    const kind: RightKind = r.contractStatus === "trial" ? "trial" : source ?? (counts.covered > 0 ? "contract" : "none");
    const l = rightLabel({ entry: { allowed: true, verdict: true, reason: null }, door: "open", viewer: "manager", mode: "enforce",
      productName: p.name, ...r, source });
    return { key: p.key, name: p.name, right: { kind, label: l.label, ...(r.endsAt ? { until: r.endsAt } : {}), counts },
      can_enter: true, url: `https://${productHost(p, env)}/` };
  }));
  return {
    ok: true,
    unit: { name: account.name },
    wallet: { balance: account.balance, frozen: account.hold !== null },
    products,
    fetched_at: new Date(v.now * 1000).toISOString(),
  };
}

