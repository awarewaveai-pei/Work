import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { ensureWpOrganization, findWpOrganization, wpOrgSlug } from "../wp-customers";

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
