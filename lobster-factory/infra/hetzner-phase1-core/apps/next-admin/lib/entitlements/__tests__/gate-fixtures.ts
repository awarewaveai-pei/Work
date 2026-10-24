import { generateKeyPairSync } from "node:crypto";
import { vi } from "vitest";
import type { EntitlementRecord, EntitlementMode, GateDependencies, Subject } from "../can";
import { PRODUCTS } from "@/lib/portal/products";

const CREDITS_FEATURES = new Set(PRODUCTS.flatMap((p) => p.features.filter((f) => f.billing === "credits").map((f) => f.feature_key)));

const pair = generateKeyPairSync("ed25519");
export const CUSTOMER: Subject = { orgId: "11111111-1111-4111-8111-111111111111", kind: "customer" };
export const INTERNAL: Subject = { orgId: "22222222-2222-4222-8222-222222222222", kind: "internal" };

/** `credits: true` = the account holds a credit-pack add-on: an active row with limits {pay: "credits"} for whatever
 *  credits-billed feature is asked (ADR 017 #11: the wallet pays only for a feature a row grants; a wallet alone opens nothing). */
export function gateFixture(opts: {
  mode?: EntitlementMode; entitlement?: Partial<EntitlementRecord> | null; balance?: number; storeError?: Error; debitAllowed?: boolean; credits?: boolean;
} = {}) {
  const now = Math.floor(Date.now() / 1000);
  const entitlement = opts.entitlement === null ? null : { id: "ent-1", organizationId: CUSTOMER.orgId, productKey: "social", featureKey: "social.dispatch",
    source: "contract" as const, sourceRef: "c-1", startsAt: now - 60, endsAt: now + 3600, status: "active", limits: {}, ...opts.entitlement };
  const audit = vi.fn().mockResolvedValue(undefined);
  const debit = vi.fn().mockResolvedValue(opts.debitAllowed ?? true);
  const findActiveEntitlement = vi.fn(async (q: { organizationId: string; productKey: string; featureKey: string }) => {
    if (opts.storeError) throw opts.storeError;
    // a pack plan lists only credits features (ADR 017 #11); other features keep the fixture row
    if (opts.credits && CREDITS_FEATURES.has(q.featureKey)) return { id: "ent-pack", organizationId: q.organizationId, productKey: q.productKey, featureKey: q.featureKey, source: "contract" as const,
      sourceRef: "pack-contract-1", startsAt: now - 60, endsAt: null, status: "active", limits: { pay: "credits" } };
    return entitlement;
  });
  const deps: GateDependencies = {
    permit: async () => ({
      store: { findActiveEntitlement, getCreditBalance: async () => { if (opts.storeError) throw opts.storeError; return opts.balance ?? 0; } },
      key: { kid: "k1", privateKey: pair.privateKey },
      creditPolicy: async () => ({ minimumCharge: 1, singleLimit: 100 }),
    }),
    publicKeys: () => ({ k1: pair.publicKey }),
    mode: () => opts.mode ?? "enforce",
    audit, debit,
  };
  return { deps, audit, debit, findActiveEntitlement };
}
