import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { adoptableClient, ensureWpCustomer, ensureWpOrganization, findWpOrganization, wpOrgSlug, type EmailOwner, type MemberInviteDeps, type WpCustomerDeps } from "../wp-customers";

const AWC = { id: "site-awc", keyId: "aware-wave-com", sellerOrganizationId: "org-internal" };
const SHOP = { id: "site-shop", keyId: "shop-b", sellerOrganizationId: "org-reseller" };
const MEMBER = { site: AWC, wpUserId: 57, email: "a@b.tw", displayName: "A B", emailVerified: true };

function fakeDb(insert: { data: unknown; error: unknown }, existing: unknown = null) {
  const inserted: unknown[] = [];
  const db = {
    from: (table: string) => {
      if (table !== "organizations") throw new Error(`unexpected table ${table}`);
      return {
        insert: (row: unknown) => { inserted.push(row); return { select: () => ({ single: async () => insert }) }; },
        select: () => ({ eq: (_c: string, slug: string) => ({ maybeSingle: async () => ({ data: existing && (existing as { slug?: string }).slug === slug ? existing : null, error: null }) }) }),
      };
    },
  } as unknown as SupabaseClient;
  return { db, inserted };
}

describe("a WordPress member's organization", () => {
  it("is a root customer organization whose slug is the member id", async () => {
    const { db, inserted } = fakeDb({ data: { id: "o1", name: "A B" }, error: null });
    await expect(ensureWpOrganization(db, MEMBER)).resolves.toEqual({ id: "o1", name: "A B" });
    expect(inserted).toEqual([{ type: "client", kind: "customer", name: "A B", slug: "wp-member-57", sold_by_organization_id: "org-internal",
      metadata: { source: "awarewave-wp", wp_user_id: 57, site_id: "site-awc" } }]);
  });

  it("two sites with the same wp user id make two accounts", async () => {
    const { db, inserted } = fakeDb({ data: { id: "o1", name: "A B" }, error: null });
    await ensureWpOrganization(db, MEMBER);
    await ensureWpOrganization(db, { ...MEMBER, site: SHOP });
    expect(inserted).toMatchObject([
      { slug: "wp-member-57", sold_by_organization_id: "org-internal", metadata: { source: "awarewave-wp", site_id: "site-awc" } },
      { slug: "wp-member-shop-b-57", sold_by_organization_id: "org-reseller", metadata: { source: "customer-wp", site_id: "site-shop" } },
    ]);
    // the other site's organization with the same member id is never this site's
    const theirs = { slug: wpOrgSlug(AWC, 57), id: "x", name: "X", kind: "customer", parent_organization_id: null, metadata: { wp_user_id: 57, site_id: "site-shop" } };
    await expect(findWpOrganization(fakeDb({ data: null, error: null }, theirs).db, AWC, 57)).rejects.toMatchObject({ code: "organization_slug_taken" });
  });

  it("a second call finds the same organization by its slug", async () => {
    const row = { id: "o1", name: "A B", slug: wpOrgSlug(AWC, 57), kind: "customer", parent_organization_id: null, metadata: { source: "awarewave-wp", wp_user_id: 57 } };
    const { db } = fakeDb({ data: null, error: { code: "23505", message: "duplicate key" } }, row);
    await expect(ensureWpOrganization(db, MEMBER)).resolves.toEqual({ id: "o1", name: "A B" });
  });

  it("a member organization marked test (0175) is found like a customer one", async () => {
    const row = { id: "o1", name: "A B", slug: wpOrgSlug(AWC, 57), kind: "test", parent_organization_id: null, metadata: { source: "awarewave-wp", wp_user_id: 57 } };
    await expect(findWpOrganization(fakeDb({ data: null, error: null }, row).db, AWC, 57)).resolves.toEqual({ id: "o1", name: "A B" });
  });

  it("a slug taken by an organization that is not this member's is refused, never billed", async () => {
    for (const other of [
      { slug: wpOrgSlug(AWC, 57), id: "x", name: "X", kind: "customer", parent_organization_id: null, metadata: {} },
      { slug: wpOrgSlug(AWC, 57), id: "x", name: "X", kind: "internal", parent_organization_id: null, metadata: { wp_user_id: 57 } },
      { slug: wpOrgSlug(AWC, 57), id: "x", name: "X", kind: "customer", parent_organization_id: "p", metadata: { wp_user_id: 57 } },
    ]) {
      const { db } = fakeDb({ data: null, error: { code: "23505", message: "duplicate key" } }, other);
      await expect(ensureWpOrganization(db, MEMBER)).rejects.toMatchObject({ code: "organization_slug_taken" });
    }
  });

  it("looking it up finds nothing for a new member and refuses a slug that is not this member's", async () => {
    await expect(findWpOrganization(fakeDb({ data: null, error: null }).db, AWC, 57)).resolves.toBeNull();
    const other = { slug: wpOrgSlug(AWC, 57), id: "x", name: "X", kind: "customer", parent_organization_id: null, metadata: { wp_user_id: 58 } };
    await expect(findWpOrganization(fakeDb({ data: null, error: null }, other).db, AWC, 57)).rejects.toMatchObject({ code: "organization_slug_taken" });
  });

  it("an outage is thrown, not read as taken", async () => {
    const { db } = fakeDb({ data: null, error: { code: "08006", message: "connection failure" } });
    await expect(ensureWpOrganization(db, MEMBER)).rejects.toThrow("connection failure");
  });
});

describe("an account a member may take over (decision 2026-10-30 §5)", () => {
  /** held = identity rows on this user; orgHeld = rows on its organization (another member already linked there). */
  function idDb(held: unknown[], confirmErr: unknown = null, orgHeld: unknown[] = []) {
    const confirm = vi.fn(async () => ({ data: {}, error: confirmErr }));
    const db = {
      from: (table: string) => {
        if (table !== "customer_identities") throw new Error(`unexpected table ${table}`);
        return { select: () => ({ eq: (col: string) => ({ limit: async () => ({ data: col === "user_id" ? held : orgHeld, error: null }) }) }) };
      },
      auth: { admin: { updateUserById: confirm } },
    } as unknown as SupabaseClient;
    return { db, confirm };
  }
  const INVITED: EmailOwner = { userKind: "client", orgId: "org-inv", userId: "u-inv", emailConfirmed: true, orgMetadata: { source: "ops" }, orgRootCustomer: true };

  it("a client staff invited, billable and held by no member: linked as is", async () => {
    const { db, confirm } = idDb([]);
    await expect(adoptableClient(db, INVITED)).resolves.toEqual({ userId: "u-inv", organizationId: "org-inv" });
    expect(confirm).not.toHaveBeenCalled();
  });

  it("an invite never opened is confirmed by the site's verification", async () => {
    const { db, confirm } = idDb([]);
    await expect(adoptableClient(db, { ...INVITED, emailConfirmed: false })).resolves.toMatchObject({ userId: "u-inv" });
    expect(confirm).toHaveBeenCalledWith("u-inv", { email_confirm: true });
    await expect(adoptableClient(idDb([], { message: "down" }).db, { ...INVITED, emailConfirmed: false })).rejects.toThrow("confirm_failed");
  });

  it("never: staff, a profile-only owner, a site-made or unbillable organization, or a user some member holds", async () => {
    const { db, confirm } = idDb([]);
    for (const owner of [
      { ...INVITED, userKind: "staff" },
      { ...INVITED, userId: undefined },
      { ...INVITED, orgMetadata: { source: "awarewave-wp", wp_user_id: 9 } },
      { ...INVITED, orgRootCustomer: false },
    ]) await expect(adoptableClient(db, owner), JSON.stringify(owner)).resolves.toBeNull();
    await expect(adoptableClient(idDb([{ user_id: "u-inv" }]).db, INVITED)).resolves.toBeNull();
    // a colleague in the same organization already linked a member: two members on one account is refused (L1)
    await expect(adoptableClient(idDb([], null, [{ organization_id: "org-inv" }]).db, INVITED)).resolves.toBeNull();
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe("a member who signed up through a staff invite (ADR 021 D4, 0180)", () => {
  const CODE = "A".repeat(43);
  const ORG_INV = "org-soulful";
  const live = { id: "inv-1", organizationId: ORG_INV, email: "boss@soulful.tw", expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    createdAt: new Date().toISOString(), usedAt: null, usedSiteId: null, usedExternalId: null, voidedAt: null };
  function deps(inv: Partial<typeof live> | null = {}) {
    const linked: unknown[] = [];
    const d: WpCustomerDeps = {
      find: vi.fn(async () => null),
      former: vi.fn(async () => null),
      link: vi.fn(async (_db, input) => { linked.push(input); return { organizationId: input.organizationId, userId: input.userId, created: true }; }),
      existingOrganization: vi.fn(async () => null),
      organization: vi.fn(async () => ({ id: "org-new", name: "new" })),
      emailOwner: vi.fn(async () => null),
      adoptable: vi.fn(async () => null),
      invite: vi.fn(async () => ({ ok: true as const, userId: "u-mail", kind: "invite" as const, created: true })),
      verified: vi.fn(async () => ({ ok: true as const, userId: "u-boss", created: true })),
      productKey: vi.fn(async () => "social"),
    };
    const i: MemberInviteDeps = {
      memberInvite: vi.fn(async () => (inv === null ? null : { ...live, ...inv })),
      inviteTarget: vi.fn(async () => ({ customerRoot: true, linked: false })),
      redeem: vi.fn(async () => "ok"),
    };
    return { d, i, linked };
  }
  const db = {} as SupabaseClient;
  const invited = { ...MEMBER, email: "Boss@Soulful.tw", inviteCode: CODE };

  it("email verified on aware-wave.com: one identity row on the invited account, no new organization", async () => {
    const { d, i, linked } = deps();
    await expect(ensureWpCustomer(db, invited, undefined, false, d, i)).resolves.toEqual({ organizationId: ORG_INV, created: false });
    expect(d.verified).toHaveBeenCalledWith(db, { orgId: ORG_INV, email: "boss@soulful.tw" });
    // the identity row is written by 0180 member_invite_redeem (checked on a throwaway database), never by link
    expect(i.redeem).toHaveBeenCalledWith(db, { provider: "awarewave-wp", siteId: "site-awc", externalId: "57", inviteId: "inv-1", userId: "u-boss", email: "Boss@Soulful.tw" });
    expect(linked).toEqual([]);
    expect(d.organization).not.toHaveBeenCalled();
    expect(d.emailOwner).not.toHaveBeenCalled();   // never found by email
  });

  it("refused, nothing linked: email not verified, expired, other email, used by someone else", async () => {
    for (const [why, member, inv] of [
      ["email_unverified", { ...invited, emailVerified: false }, {}],
      ["invite_expired", invited, { expiresAt: new Date(Date.now() - 1000).toISOString() }],
      ["invite_email_mismatch", { ...invited, email: "someone@else.tw" }, {}],
      ["invite_used", invited, { usedAt: new Date().toISOString(), usedSiteId: "site-awc", usedExternalId: "99" }],
    ] as const) {
      const { d, i, linked } = deps(inv);
      await expect(ensureWpCustomer(db, member, undefined, true, d, i), why).rejects.toMatchObject({ code: why });
      expect(i.redeem, why).not.toHaveBeenCalled();
      expect(linked, why).toEqual([]);
      expect(d.organization, why).not.toHaveBeenCalled();
    }
  });

  it("the member a transfer replaces uses its code: refused transfer_same_member; an ordinary invite stays an idempotent ok (0182)", async () => {
    const holder = { organizationId: ORG_INV, userId: "u-old" };
    const t = deps();
    t.d.find = vi.fn(async () => holder);
    t.i.transferOf = vi.fn(async () => "identity-old");
    await expect(ensureWpCustomer(db, invited, undefined, false, t.d, t.i)).rejects.toMatchObject({ code: "transfer_same_member" });
    expect(t.i.redeem).not.toHaveBeenCalled();
    const o = deps();
    o.d.find = vi.fn(async () => holder);
    o.i.transferOf = vi.fn(async () => null);
    await expect(ensureWpCustomer(db, invited, undefined, false, o.d, o.i)).resolves.toEqual({ organizationId: ORG_INV, created: false });
  });

  it("no code: the path of today, the invite is never read", async () => {
    const { d, i, linked } = deps();
    await expect(ensureWpCustomer(db, MEMBER, undefined, true, d, i)).resolves.toEqual({ organizationId: "org-new", created: true });
    expect(i.memberInvite).not.toHaveBeenCalled();
    expect(linked).toEqual([{ provider: "awarewave-wp", siteId: "site-awc", externalId: "57", userId: "u-boss", organizationId: "org-new" }]);
  });
});
