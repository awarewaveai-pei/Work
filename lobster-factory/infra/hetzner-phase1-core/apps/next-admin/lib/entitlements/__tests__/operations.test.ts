import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { productOperations, setProductOperator, summarizeOperations } from "../operations";

const ACC = "00000000-0000-4000-8000-0000000000c1";

/** A one-table stand-in: upsert keyed on (organization_id, product_key), select by organization_id. */
function fakeDb(opts: { upsertError?: string } = {}) {
  const rows = new Map<string, Record<string, string>>();
  const upsert = vi.fn(async (row: Record<string, string>, o: { onConflict: string }) => {
    if (opts.upsertError) return { error: { message: opts.upsertError } };
    expect(o.onConflict).toBe("organization_id,product_key");
    rows.set(`${row.organization_id}/${row.product_key}`, row);
    return { error: null };
  });
  const from = vi.fn((table: string) => {
    expect(table).toBe("organization_product_operations");
    return {
      upsert,
      select: () => ({ eq: async (_c: string, org: string) => ({ data: [...rows.values()].filter((r) => r.organization_id === org), error: null }) }),
    };
  });
  return { db: { from } as unknown as SupabaseClient, upsert };
}

describe("product operations: no row reads as customer; a switch reads back the same", () => {
  it("an account with no row: every registered product is operated by the customer", async () => {
    const { db } = fakeDb();
    const ops = await productOperations(ACC, db);
    expect(ops.length).toBeGreaterThan(5);
    expect(ops.every((o) => o.operatedBy === "customer" && o.updatedBy === null)).toBe(true);
  });

  it("switch to awarewave, read back; switch back to customer, read back", async () => {
    const { db, upsert } = fakeDb();
    await expect(setProductOperator({ accountId: ACC, productKey: "content", operatedBy: "awarewave", actor: "ops:owner:u1" }, db)).resolves.toBe("set");
    let ops = await productOperations(ACC, db);
    expect(ops.find((o) => o.key === "content")).toMatchObject({ operatedBy: "awarewave", updatedBy: "ops:owner:u1" });
    expect(ops.filter((o) => o.operatedBy === "awarewave").map((o) => o.key)).toEqual(["content"]);
    await setProductOperator({ accountId: ACC, productKey: "content", operatedBy: "customer", actor: "ops:admin:u2" }, db);
    ops = await productOperations(ACC, db);
    expect(ops.find((o) => o.key === "content")?.operatedBy).toBe("customer");
    expect(upsert).toHaveBeenCalledTimes(2);
  });

  it("a row for a product the registry no longer has (withdrawn) is skipped on read, never an error", () => {
    const ops = summarizeOperations([
      { product_key: "withdrawn-product", operated_by: "awarewave", updated_at: "2026-11-23T00:00:00Z", updated_by: "ops:owner:u1" },
      { product_key: "video", operated_by: "awarewave", updated_at: "2026-11-23T00:00:00Z", updated_by: "ops:owner:u1" },
    ]);
    expect(ops.map((o) => o.key)).not.toContain("withdrawn-product");
    expect(ops.filter((o) => o.operatedBy === "awarewave").map((o) => o.key)).toEqual(["video"]);
  });

  it("an unregistered product is refused before the database; a 0178 refusal is a code; anything else throws", async () => {
    const { db, upsert } = fakeDb();
    await expect(setProductOperator({ accountId: ACC, productKey: "oracle", operatedBy: "awarewave", actor: "a" }, db)).resolves.toBe("unknown_product");
    expect(upsert).not.toHaveBeenCalled();
    const refused = fakeDb({ upsertError: "operation:not_a_customer_account" }).db;
    await expect(setProductOperator({ accountId: ACC, productKey: "content", operatedBy: "awarewave", actor: "a" }, refused)).resolves.toBe("not_a_customer_account");
    const broken = fakeDb({ upsertError: "connection reset" }).db;
    await expect(setProductOperator({ accountId: ACC, productKey: "content", operatedBy: "awarewave", actor: "a" }, broken)).rejects.toThrow("connection reset");
  });
});
