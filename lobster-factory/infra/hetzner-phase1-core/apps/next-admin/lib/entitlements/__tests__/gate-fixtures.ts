import { generateKeyPairSync } from "node:crypto";
import { vi } from "vitest";
import type { EntitlementRecord, EntitlementMode, GateDependencies, Subject } from "../can";

const pair = generateKeyPairSync("ed25519");
export const CUSTOMER: Subject = { orgId: "11111111-1111-4111-8111-111111111111", kind: "customer" };
export const INTERNAL: Subject = { orgId: "22222222-2222-4222-8222-222222222222", kind: "internal" };

export function gateFixture(opts: {
  mode?: EntitlementMode; entitlement?: Partial<EntitlementRecord> | null; balance?: number; storeError?: Error; debitAllowed?: boolean;
} = {}) {
  const now = Math.floor(Date.now() / 1000);
  const entitlement = opts.entitlement === null ? null : { id: "ent-1", organizationId: CUSTOMER.orgId, productKey: "social", featureKey: "social.dispatch",
    source: "contract" as const, sourceRef: "c-1", startsAt: now - 60, endsAt: now + 3600, status: "active", limits: {}, ...opts.entitlement };
  const audit = vi.fn().mockResolvedValue(undefined);
  const debit = vi.fn().mockResolvedValue(opts.debitAllowed ?? true);
  const findActiveEntitlement = vi.fn(async () => { if (opts.storeError) throw opts.storeError; return entitlement; });
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
