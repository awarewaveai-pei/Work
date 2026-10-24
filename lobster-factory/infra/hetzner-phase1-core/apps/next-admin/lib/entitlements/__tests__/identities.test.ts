import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { findBillingAccount, linkIdentity } from "../identities";

const IDENTITY = { provider: "awarewave-wp" as const, externalId: "wp-user-17" };
const ACCOUNT = { userId: "user-1", organizationId: "org-1" };
const row = (overrides: Partial<{ external_id: string; user_id: string; organization_id: string }> = {}) => ({
  external_id: IDENTITY.externalId,
  user_id: ACCOUNT.userId,
  organization_id: ACCOUNT.organizationId,
  ...overrides,
});

function fakeSb(options: {
  insertResults?: Array<{ data: unknown; error: unknown }>;
  selectResults?: Array<{ data: unknown; error: unknown }>;
}) {
  const insertRows: unknown[] = [];
  const selectFilters: Array<Array<[string, unknown]>> = [];
  const from = vi.fn((table: string) => {
    if (table !== "customer_identities") throw new Error(`unexpected table ${table}`);
    return {
      select: () => {
        const filters: Array<[string, unknown]> = [];
        const chain = {
          eq: (column: string, value: unknown) => {
            filters.push([column, value]);
            return chain;
          },
          maybeSingle: async () => {
            selectFilters.push(filters);
            return options.selectResults?.shift() ?? { data: null, error: null };
          },
        };
        return chain;
      },
      insert: (value: unknown) => {
        insertRows.push(value);
        return {
          select: () => ({
            single: async () => options.insertResults?.shift() ?? { data: null, error: { message: "not configured" } },
          }),
        };
      },
    };
  });
  return { db: { from } as unknown as SupabaseClient, insertRows, selectFilters };
}

describe("customer identity store", () => {
  it("an unknown identity resolves to null", async () => {
    const { db } = fakeSb({ selectResults: [{ data: null, error: null }] });
    await expect(findBillingAccount(db, IDENTITY)).resolves.toBeNull();
  });

  it("a store error is thrown, not read as unknown", async () => {
    const { db } = fakeSb({ selectResults: [{ data: null, error: { message: "database unavailable" } }] });
    await expect(findBillingAccount(db, IDENTITY)).rejects.toThrow("database unavailable");
  });

  it("linking the same identity twice is a no-op", async () => {
    const { db, insertRows } = fakeSb({
      insertResults: [
        { data: row(), error: null },
        { data: null, error: { code: "23505", message: "duplicate key" } },
      ],
      selectResults: [{ data: row(), error: null }],
    });
    await expect(linkIdentity(db, { ...IDENTITY, ...ACCOUNT })).resolves.toEqual({ ...ACCOUNT, created: true });
    await expect(linkIdentity(db, { ...IDENTITY, ...ACCOUNT })).resolves.toEqual({ ...ACCOUNT, created: false });
    expect(insertRows).toHaveLength(2);
  });

  it("one wp user cannot link to two accounts", async () => {
    const { db, selectFilters } = fakeSb({
      insertResults: [{ data: null, error: { code: "23505", message: "duplicate key" } }],
      selectResults: [
        { data: null, error: null },
        { data: row({ external_id: "wp-user-other" }), error: null },
      ],
    });
    await expect(linkIdentity(db, { ...IDENTITY, userId: ACCOUNT.userId, organizationId: "org-2" }))
      .rejects.toThrow("identity_conflict");
    expect(selectFilters).toEqual([
      [["provider", "awarewave-wp"], ["external_id", IDENTITY.externalId]],
      [["provider", "awarewave-wp"], ["user_id", ACCOUNT.userId]],
    ]);

    const sameAccount = fakeSb({
      insertResults: [{ data: null, error: { code: "23505", message: "duplicate key" } }],
      selectResults: [
        { data: null, error: null },
        { data: row({ external_id: "wp-user-other" }), error: null },
      ],
    });
    await expect(linkIdentity(sameAccount.db, { ...IDENTITY, ...ACCOUNT }))
      .rejects.toThrow("identity_conflict");
  });
});
