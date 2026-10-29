import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { sellerLicenceKey } from "@/lib/entitlements/can";
import { generateKeyPairSync } from "node:crypto";
import { ed25519PublicKeyPem, siteMaySellPlan, type SellerSite } from "../sites";

const SHOP: SellerSite = { id: "site-shop", host: "shop.example", keyId: "shop-b", sellerOrganizationId: "org-reseller", sellerKind: "customer",
  verifyAlg: "ed25519", publicKey: "-----BEGIN PUBLIC KEY-----", envVar: null, handoffPublicKey: null, handoffEnvVar: null, status: "active" };
const AWC: SellerSite = { ...SHOP, id: "site-awc", keyId: "aware-wave-com", sellerOrganizationId: "org-internal", sellerKind: "internal" };
const now = Math.floor(Date.now() / 1000);

/** plans answers one plan; the entitlement store answers the seller's licence row (or none). */
function fixture(plan: { product_key: string; owner_organization_id: string | null } | null, licence: { endsAt: number | null } | null) {
  const db = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: plan, error: null }) }) }) }) } as unknown as SupabaseClient;
  const findActiveEntitlement = vi.fn(async () => licence === null ? null
    : { id: "lic-1", organizationId: SHOP.sellerOrganizationId, productKey: "social", featureKey: sellerLicenceKey("social"), source: "contract" as const,
      sourceRef: "reseller-2026", startsAt: now - 60, endsAt: licence.endsAt, status: "active", limits: {} });
  return { db, store: () => ({ findActiveEntitlement, getCreditBalance: async () => 0 }), findActiveEntitlement };
}
const CATALOG = { product_key: "social", owner_organization_id: null };

describe("a site's public key (ADR 017 #12, 4c-2)", () => {
  it("is stored only when it is an ed25519 public key; a pasted private key is refused, not turned into its public half", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const pub = publicKey.export({ format: "pem", type: "spki" }).toString();
    expect(ed25519PublicKeyPem(pub)).toBe(pub);
    expect(ed25519PublicKeyPem(privateKey.export({ format: "pem", type: "pkcs8" }).toString())).toBeNull();
    expect(ed25519PublicKeyPem(generateKeyPairSync("rsa", { modulusLength: 1024 }).publicKey.export({ format: "pem", type: "spki" }).toString())).toBeNull();
  });
});

describe("which plans a cash-register site may sell (ADR 017 #12, 4c-2)", () => {
  it("a seller without the resell row for the product is refused", async () => {
    const none = fixture(CATALOG, null);
    expect(await siteMaySellPlan(none.db, SHOP, "social_pro", none.store)).toBe("seller_not_licensed");
    const ended = fixture(CATALOG, { endsAt: now - 1 });
    expect(await siteMaySellPlan(ended.db, SHOP, "social_pro", ended.store)).toBe("seller_not_licensed");
    const live = fixture(CATALOG, { endsAt: null });
    expect(await siteMaySellPlan(live.db, SHOP, "social_pro", live.store)).toBeNull();
    // aware-wave.com sells the whole catalog without a row; a plan another seller owns is sold only on that seller's sites
    const awc = fixture(CATALOG, null);
    expect(await siteMaySellPlan(awc.db, AWC, "social_pro", awc.store)).toBeNull();
    expect(awc.findActiveEntitlement).not.toHaveBeenCalled();
    const owned = fixture({ product_key: "social", owner_organization_id: "org-other-seller" }, { endsAt: null });
    expect(await siteMaySellPlan(owned.db, SHOP, "social_pro", owned.store)).toBe("plan_not_sellable_here");
    // a pack with no plan names no product: only aware-wave.com sells one
    expect(await siteMaySellPlan(none.db, SHOP, undefined, none.store)).toBe("seller_pack_needs_plan");
    expect(await siteMaySellPlan(awc.db, AWC, undefined, awc.store)).toBeNull();
  });
});
