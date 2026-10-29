// Cash-register sites (ADR 017 decision #12, cards/step-4-seller.md 4c-2; table = migration 0133 seller_sites). The
// request names a site by key id (a header, never the body); the site's own key proves the request; the site's row
// names the seller. Nothing a site sends decides who the seller is. The only reader and writer of seller_sites.
// Keys made from a site's own numbers (WordPress user ids, event ids) carry the site's namespace, the same rule as
// 0133's v_ns: aware-wave.com keeps the names it had before 0133, every other site is `<provider>@<key_id>`.
import { createPublicKey, verify as verifySignature } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sellerMaySell, type CanStore } from "@/lib/entitlements/can";
import { createEntitlementStore } from "@/lib/entitlements/tables";
import { verifyPayment } from "./hmac";

/** aware-wave.com's row (0133): hmac-env until its plugin moves to ed25519; a request with no site header is this one. */
export const AWARE_WAVE_KEY_ID = "aware-wave-com";
export const SITE_KEY_ID = /^[a-z0-9][a-z0-9-]{1,23}$/;   // 0133 seller_sites.key_id check

export interface SellerSite {
  id: string;
  host: string;
  keyId: string;
  sellerOrganizationId: string;
  sellerKind: "internal" | "customer";
  verifyAlg: "ed25519" | "hmac-env";
  publicKey: string | null;
  envVar: string | null;
  handoffPublicKey: string | null;
  handoffEnvVar: string | null;
  status: "pending" | "active" | "disabled";
}

const COLUMNS = "id, host, key_id, seller_organization_id, verify_alg, public_key, env_var, handoff_public_key, handoff_env_var, status, seller:organizations!seller_sites_seller_organization_id_fkey(kind)";
type Row = {
  id: string; host: string; key_id: string; seller_organization_id: string; verify_alg: SellerSite["verifyAlg"];
  public_key: string | null; env_var: string | null; handoff_public_key: string | null; handoff_env_var: string | null;
  status: SellerSite["status"]; seller: { kind: string } | Array<{ kind: string }> | null;
};
function toSite(r: Row): SellerSite {
  const seller = Array.isArray(r.seller) ? r.seller[0] : r.seller;
  // 0133 seller_root_account_check: a seller is a root internal or customer account; anything else is not a seller.
  if (seller?.kind !== "internal" && seller?.kind !== "customer") throw new Error(`seller_sites ${r.key_id}: seller is not a billing account`);
  return {
    id: r.id, host: r.host, keyId: r.key_id, sellerOrganizationId: r.seller_organization_id, sellerKind: seller.kind,
    verifyAlg: r.verify_alg, publicKey: r.public_key, envVar: r.env_var, handoffPublicKey: r.handoff_public_key,
    handoffEnvVar: r.handoff_env_var, status: r.status,
  };
}

/** The site with this key id, whatever its status; null = no such site. A caller verifies the signature first and
 *  then refuses a site that is not active, so a closed site's request is a refusal someone hears of, not a 401. */
export async function findSiteByKeyId(db: SupabaseClient, keyId: string): Promise<SellerSite | null> {
  if (!SITE_KEY_ID.test(keyId)) return null;
  const { data, error } = await db.from("seller_sites").select(COLUMNS).eq("key_id", keyId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toSite(data as unknown as Row) : null;
}

export type SitePurpose = "payment" | "handoff";

/** true only when the site's own key for this purpose signed exactly these bytes. Payments and the 「進入」 hand-off
 *  use different keys (a leaked login key must not record payments, 4b-4). hmac-env reads the env var the row names.
 *  Says nothing about status: every caller refuses a site that is not active after this (site_disabled). */
export function verifySiteSignature(site: SellerSite, purpose: SitePurpose, rawBody: string, signature: string | null,
  env: Record<string, string | undefined>): boolean {
  if (!signature) return false;
  if (site.verifyAlg === "hmac-env") {
    const name = purpose === "payment" ? site.envVar : site.handoffEnvVar;
    return name ? verifyPayment(rawBody, signature, env[name]) : false;
  }
  const publicKey = purpose === "payment" ? site.publicKey : site.handoffPublicKey;
  if (!publicKey) return false;
  try {
    return verifySignature(null, Buffer.from(rawBody, "utf8"), { key: publicKey, format: "pem", type: "spki" }, Buffer.from(signature, "base64"));
  } catch {
    return false;   // a malformed key or signature verifies nothing
  }
}

/** Whether this site can sign the purpose at all (the source is off for it, not a bad signature). */
export function siteSigns(site: SellerSite, purpose: SitePurpose, env: Record<string, string | undefined>): boolean {
  if (site.verifyAlg === "ed25519") return !!(purpose === "payment" ? site.publicKey : site.handoffPublicKey);
  const name = purpose === "payment" ? site.envVar : site.handoffEnvVar;
  return !!name && (env[name] ?? "").trim().length >= 32;
}

/** `woo` for aware-wave.com (names unchanged since before 0133), `woo@<key_id>` for every other site. */
export const siteNamespace = (provider: string, site: Pick<SellerSite, "keyId">): string =>
  site.keyId === AWARE_WAVE_KEY_ID ? provider : `${provider}@${site.keyId}`;

/** The 0124 identity provider a site's members sign in with: aware-wave.com's own, or a seller's WordPress (ADR 018 §3). */
export const siteIdentityProvider = (site: Pick<SellerSite, "keyId">): "awarewave-wp" | "customer-wp" =>
  site.keyId === AWARE_WAVE_KEY_ID ? "awarewave-wp" : "customer-wp";

/** Why this site may not take money for this plan, or null when it may. Checked before any account is made, so a site
 *  without the right never creates one; billing_apply_payment_event (0133) checks the same rules again. A pack with no
 *  plan names no product, so another seller's site cannot sell one (0133 seller_pack_needs_plan). */
export async function siteMaySellPlan(db: SupabaseClient, site: SellerSite, planKey: string | undefined,
  store: () => CanStore = () => createEntitlementStore(db)): Promise<string | null> {
  if (!planKey) return site.sellerKind === "internal" ? null : "seller_pack_needs_plan";
  const { data, error } = await db.from("plans").select("product_key, owner_organization_id").eq("plan_key", planKey).maybeSingle();
  if (error) throw new Error(error.message);
  const plan = data as { product_key: string; owner_organization_id: string | null } | null;
  if (!plan) return "unknown_plan";
  if (plan.owner_organization_id !== null && plan.owner_organization_id !== site.sellerOrganizationId) return "plan_not_sellable_here";
  const seller = { orgId: site.sellerOrganizationId, kind: site.sellerKind };
  return (await sellerMaySell(store(), seller, plan.product_key)) ? null : "seller_not_licensed";
}

// ---- /ops/sellers (staff only; the page reads and writes through these, never the table) ----

const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;   // 0133 seller_sites.host check
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listSites(db: SupabaseClient): Promise<SellerSite[]> {
  const { data, error } = await db.from("seller_sites").select(COLUMNS).order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Row[]).map(toSite);
}

/** A PEM public key that is Ed25519, normalised; null = not one (an RSA key or junk is never stored). A private key is
 *  refused, not turned into its public half: createPublicKey would accept one silently (critic 2026-10-29 n1). */
export function ed25519PublicKeyPem(text: string): string | null {
  const pem = text.trim();
  if (!pem.startsWith("-----BEGIN PUBLIC KEY-----") || /PRIVATE KEY/.test(pem)) return null;
  try {
    const key = createPublicKey({ key: pem, format: "pem" });
    return key.asymmetricKeyType === "ed25519" ? key.export({ format: "pem", type: "spki" }).toString() : null;
  } catch {
    return null;
  }
}

export type RegisterSiteResult = { ok: true; site: SellerSite } | { ok: false; error: string };

/** A new cash register on ed25519 (hmac-env is aware-wave.com's alone). Active at once: staff registering it is the
 *  decision. The seller must be a root billing account (0133 trigger); key_id and seller never change afterwards. */
export async function registerSite(db: SupabaseClient, input: { host: string; keyId: string; sellerOrganizationId: string; publicKey: string; handoffPublicKey?: string | null }): Promise<RegisterSiteResult> {
  const host = input.host.trim().toLowerCase();
  if (!HOST.test(host)) return { ok: false, error: "invalid_host" };
  if (!SITE_KEY_ID.test(input.keyId)) return { ok: false, error: "invalid_key_id" };
  if (!UUID.test(input.sellerOrganizationId)) return { ok: false, error: "invalid_seller" };
  const publicKey = ed25519PublicKeyPem(input.publicKey);
  if (!publicKey) return { ok: false, error: "invalid_public_key" };
  const handoffText = (input.handoffPublicKey ?? "").trim();
  const handoffPublicKey = handoffText ? ed25519PublicKeyPem(handoffText) : null;
  if (handoffText && !handoffPublicKey) return { ok: false, error: "invalid_handoff_public_key" };
  if (handoffPublicKey && handoffPublicKey === publicKey) return { ok: false, error: "handoff_key_must_differ" };   // 4b-4: one key per purpose
  const { data, error } = await db.from("seller_sites").insert({
    seller_organization_id: input.sellerOrganizationId, host, platform: "woo", key_id: input.keyId, verify_alg: "ed25519",
    public_key: publicKey, handoff_public_key: handoffPublicKey, status: "active",
  }).select(COLUMNS).single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: "site_exists" };
    if (/root billing account/.test(error.message)) return { ok: false, error: "seller_not_a_billing_account" };
    throw new Error(error.message);
  }
  return { ok: true, site: toSite(data as unknown as Row) };
}

/** Disable (a leaked key, a seller who stopped) or re-enable a site. A disabled site's requests are refused site_disabled
 *  after its signature checks, so the operator hears of money it still sends (woo-billing.ts; 0133 does the same). */
export async function setSiteStatus(db: SupabaseClient, siteId: string, status: "active" | "disabled"): Promise<boolean> {
  if (!UUID.test(siteId)) return false;
  const { data, error } = await db.from("seller_sites").update({ status }).eq("id", siteId).select("id").maybeSingle();
  if (error) throw new Error(error.message);
  return !!data;
}

/** For scripts/rollout-wp-bridge.ps1 -Plugin store (4c-3): the store plugin goes only onto a registered, active site. */
export async function siteActiveForHost(db: SupabaseClient, host: string): Promise<boolean> {
  const h = host.trim().toLowerCase();
  if (!HOST.test(h)) return false;
  const { data, error } = await db.from("seller_sites").select("status").eq("host", h).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { status: string } | null)?.status === "active";
}
