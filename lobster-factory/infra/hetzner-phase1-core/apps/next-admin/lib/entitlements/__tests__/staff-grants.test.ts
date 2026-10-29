import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { giveProduct, staffGrantFeatures, summarizeStaffGrants, takeProduct } from "../staff-grants";
import { PRODUCTS } from "@/lib/portal/products";

const change = { accountId: "acct", productKey: "social", kind: "use" as const, actor: "ops:owner:u1", actorRole: "owner", note: "試用" };
const rpcClient = (result: { data?: unknown; error?: { message: string } | null }) => {
  const rpc = vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null });
  return { client: { rpc } as unknown as SupabaseClient, rpc };
};

describe("staff gifts (ADR 017 4b-10)", () => {
  it("a use gift is every registered feature of the product and never the seller licence; a licence gift is only it", () => {
    const social = PRODUCTS.find((p) => p.key === "social")!;
    expect(staffGrantFeatures("social", "use")).toEqual(social.features.map((f) => f.feature_key));
    expect(staffGrantFeatures("social", "use")).not.toContain("social.resell");
    expect(staffGrantFeatures("social", "resell")).toEqual(["social.resell"]);
    expect(staffGrantFeatures("nope", "use")).toEqual([]);
  });

  it("the licence row and the use rows are counted apart, and only staff:% rows count as this page's", () => {
    const rows = [
      { product_key: "social", feature_key: "social.rewrite", source_ref: "staff:t1" },
      { product_key: "social", feature_key: "social.dispatch", source_ref: "sub-1" },
      { product_key: "social", feature_key: "social.resell", source_ref: "staff:t2" },
      { product_key: "video", feature_key: "video.resell", source_ref: null },
    ];
    const byKey = new Map(summarizeStaffGrants(rows).map((p) => [p.key, p]));
    expect(byKey.get("social")).toMatchObject({ use: { staff: 1, other: 1, gifts: ["staff:t1"] }, resell: { staff: true, other: false, gifts: ["staff:t2"] } });
    expect(byKey.get("video")).toMatchObject({ use: { staff: 0, other: 0 }, resell: { staff: false, other: true } });
  });

  it("give / take call 0143 with the kind, and map its refusals to codes", async () => {
    const give = rpcClient({ data: { added: 5 } });
    expect(await giveProduct(change, give.client)).toBe("given");
    expect(give.rpc).toHaveBeenCalledWith("entitlement_staff_grant", expect.objectContaining({ p_kind: "use", p_features: staffGrantFeatures("social", "use") }));
    expect(await giveProduct(change, rpcClient({ data: { added: 0 } }).client)).toBe("already");
    expect(await giveProduct(change, rpcClient({ error: { message: "staff_grant:all_features_account" } }).client)).toBe("all_features_account");
    await expect(giveProduct(change, rpcClient({ error: { message: "connection reset" } }).client)).rejects.toThrow("connection reset");
    const take = rpcClient({ data: { ended: 1 } });
    expect(await takeProduct({ ...change, kind: "resell", sourceRefs: ["staff:t2"] }, take.client)).toBe("taken");
    expect(take.rpc).toHaveBeenCalledWith("entitlement_staff_revoke", expect.objectContaining({ p_kind: "resell", p_product_key: "social", p_source_refs: ["staff:t2"] }));
    expect(await takeProduct({ ...change, sourceRefs: ["staff:t1"] }, rpcClient({ data: { ended: 0 } }).client)).toBe("nothing_to_take");
    const none = rpcClient({ data: { ended: 1 } });
    expect(await takeProduct(change, none.client)).toBe("nothing_to_take");   // no gift shown = nothing to end
    expect(none.rpc).not.toHaveBeenCalled();
  });
});
