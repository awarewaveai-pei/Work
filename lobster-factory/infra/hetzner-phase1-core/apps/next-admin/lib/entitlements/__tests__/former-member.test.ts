// A member a transfer replaced (0182 former_customer_identities; DISPATCH M8 review): money they moved while managing the
// account stays that account's, on the payment path only -- they never sign in or count as its manager again, and a
// current identity always wins. The table and its writer are checked on a throwaway database (test_0182_member_transfer.py).
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { ensureWpCustomer, type WpCustomerDeps } from "../wp-customers";
import { isAccountManager } from "../identities";

const AWC = { id: "site-awc", keyId: "aware-wave-com", sellerOrganizationId: "org-internal" };
const OLD_MEMBER = { site: AWC, wpUserId: 11, email: "old@unit.tw", displayName: "Old", emailVerified: true };
const UNIT = "org-unit";
const db = {} as SupabaseClient;

function deps(current: string | null, former: string | null): WpCustomerDeps {
  return {
    find: vi.fn(async () => (current ? { organizationId: current, userId: "u-now" } : null)),
    former: vi.fn(async () => (former ? { organizationId: former } : null)),
    link: vi.fn(async () => { throw new Error("no identity may be written"); }),
    existingOrganization: vi.fn(async () => null),
    organization: vi.fn(async () => { throw new Error("no account may be made"); }),
    emailOwner: vi.fn(async () => null),
    adoptable: vi.fn(async () => null),
    invite: vi.fn(async () => { throw new Error("no mail"); }),
    verified: vi.fn(async () => { throw new Error("no account"); }),
    productKey: vi.fn(async () => "social"),
  };
}

describe("the member a transfer replaced (0182)", () => {
  it("their payment still in the queue lands on the account they managed: no new account, no identity", async () => {
    const d = deps(null, UNIT);
    await expect(ensureWpCustomer(db, OLD_MEMBER, "credits_100", true, d)).resolves.toEqual({ organizationId: UNIT, created: false });
    expect(d.organization).not.toHaveBeenCalled();
    expect(d.link).not.toHaveBeenCalled();
  });

  it("their later refund lands on the same account (not refused as an unknown member)", async () => {
    await expect(ensureWpCustomer(db, OLD_MEMBER, undefined, false, deps(null, UNIT))).resolves.toEqual({ organizationId: UNIT, created: false });
  });

  it("a current identity wins: once a member of another account, their money goes there", async () => {
    const d = deps("org-other", UNIT);
    await expect(ensureWpCustomer(db, OLD_MEMBER, "credits_100", true, d)).resolves.toEqual({ organizationId: "org-other", created: false });
    expect(d.former).not.toHaveBeenCalled();
  });

  it("they are not the account's manager any more (isAccountManager reads current identities only)", async () => {
    const rows: Record<string, unknown[]> = {
      customer_identities: [],                                                    // their identity was moved out
      former_customer_identities: [{ user_id: "u-old", organization_id: UNIT }],  // ...to here
    };
    const fake = {
      from: (table: string) => {
        const q = { select: () => q, eq: () => q, order: () => q, limit: async () => ({ data: rows[table] ?? [], error: null }) };
        return q;
      },
    } as unknown as SupabaseClient;
    await expect(isAccountManager(fake, UNIT, "u-old")).resolves.toBe(false);
  });
});
