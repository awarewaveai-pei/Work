import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createEntitlementStore } from "../tables";
import { isLiveRow, rowSource, type EntitlementRecord } from "../can";
import { rightCounts, type RightCounts } from "@/lib/entitlements/product-right";
import { servedNextAdminProducts } from "@/lib/portal/doors";

// A table in memory behind the PostgREST calls the store makes (eq / lte / or ends_at / in / order / limit / range).
type Row = { id: string; organization_id: string; product_key: string; feature_key: string; source: "contract" | "comp"; source_ref: null;
  starts_at: string; ends_at: string | null; status: string; limits: Record<string, string>; created_at: string };
function fakeDb(table: Row[]) {
  let reads = 0;
  const db = {
    from(name: string) {
      if (name !== "organization_entitlements") throw new Error(name);
      reads += 1;
      const preds: Array<(r: Row) => boolean> = [];
      const sorts: Array<keyof Row> = [];
      let slice: [number, number] = [0, Infinity];
      const q = {
        select: () => q,
        eq: (c: keyof Row, v: unknown) => { preds.push((r) => r[c] === v); return q; },
        lte: (c: keyof Row, v: string) => { preds.push((r) => String(r[c]) <= v); return q; },
        in: (c: keyof Row, v: unknown[]) => { preds.push((r) => v.includes(r[c])); return q; },
        or: (expr: string) => { const t = expr.split("ends_at.gt.")[1]; preds.push((r) => r.ends_at === null || r.ends_at > t); return q; },
        order: (c: keyof Row) => { sorts.push(c); return q; },
        limit: (n: number) => { slice = [0, n]; return q; },
        range: (a: number, b: number) => { slice = [a, b + 1]; return q; },
        then: (done: (v: { data: Row[]; error: null }) => unknown) => {
          const rows = table.filter((r) => preds.every((p) => p(r)))
            .sort((x, y) => { for (const c of sorts) { const d = String(x[c]).localeCompare(String(y[c])); if (d) return d; } return 0; });
          return Promise.resolve(done({ data: rows.slice(slice[0], slice[1]), error: null }));
        },
      };
      return q;
    },
  };
  return { db: db as unknown as SupabaseClient, reads: () => reads };
}

const NOW = 1_800_000_000;
const iso = (s: number) => new Date(s * 1000).toISOString();
const content = servedNextAdminProducts().find((p) => p.key === "content")!;
const social = servedNextAdminProducts().find((p) => p.key === "social")!;
const tarot = servedNextAdminProducts().find((p) => p.key === "tarot")!;
let n = 0;
const row = (o: Partial<Row> & Pick<Row, "product_key" | "feature_key">): Row => ({ id: `r${String(++n).padStart(3, "0")}`, organization_id: "org-1",
  source: "contract", source_ref: null, starts_at: iso(NOW - 1000), ends_at: null, status: "active", limits: {}, created_at: iso(NOW - 2000 + n), ...o });
const cf = content.features.map((f) => f.feature_key);
const credited = [...content.features].reverse().find((f) => f.billing === "credits" && !cf.slice(0, 6).includes(f.feature_key))!.feature_key;
const TABLE: Row[] = [
  row({ product_key: "content", feature_key: cf[0] }),                                          // covered
  row({ product_key: "content", feature_key: credited, limits: { pay: "credits" } }),            // pack row, older ...
  row({ product_key: "content", feature_key: credited, source: "comp" }),                        // ... a gift wins over it
  row({ product_key: "content", feature_key: cf[1], status: "expired" }),                       // not live
  row({ product_key: "content", feature_key: cf[2], starts_at: iso(NOW + 10) }),               // not started
  row({ product_key: "content", feature_key: cf[3], ends_at: iso(NOW - 1) }),                  // ended
  row({ product_key: "content", feature_key: cf[4], limits: { pay: "nope" } }),                 // marker can() refuses
  row({ product_key: "content", feature_key: cf[5], organization_id: "org-2" }),               // another unit
  ...social.features.map((f) => row({ product_key: "social", feature_key: f.feature_key, source: "comp", ends_at: iso(NOW + 99) })),
  row({ product_key: "tarot", feature_key: tarot.features[0].feature_key, limits: { pay: "credits" } }),
];

/** The pre-change algorithm: one findActiveEntitlement per feature, re-checked and classed as can() does. */
async function perFeature(store: ReturnType<typeof createEntitlementStore>, p: typeof content): Promise<RightCounts> {
  const c: RightCounts = { covered: 0, gift: 0, credits: 0, locked: 0 };
  for (const f of p.features) {
    const found = await store.findActiveEntitlement({ organizationId: "org-1", productKey: p.key, featureKey: f.feature_key, now: NOW });
    const at = { organizationId: "org-1", productKey: p.key, featureKey: f.feature_key, now: NOW };
    const s = found && isLiveRow(found, at) ? rowSource(found, f) : null;
    if (s === "contract") c.covered += 1; else if (s === "comp") c.gift += 1; else if (s === "credits") c.credits += 1; else c.locked += 1;
  }
  return c;
}

describe("listActiveEntitlements (one read for a unit's held products)", () => {
  it("gives the same counts as one findActiveEntitlement per feature, in one database read", async () => {
    const products = [content, social, tarot];
    const old = fakeDb(TABLE);
    const oldStore = createEntitlementStore(old.db);
    const expected = await Promise.all(products.map((p) => perFeature(oldStore, p)));
    expect(old.reads()).toBe(products.reduce((s, p) => s + p.features.length, 0));

    const fresh = fakeDb(TABLE);
    const records: EntitlementRecord[] = await createEntitlementStore(fresh.db)
      .listActiveEntitlements({ organizationId: "org-1", productKeys: products.map((p) => p.key), now: NOW });
    expect(fresh.reads()).toBe(1);
    expect(products.map((p) => rightCounts(p, records, { organizationId: "org-1", now: NOW }))).toEqual(expected);
    // the fixture exercises every class
    expect(expected[0]).toMatchObject({ covered: 1, gift: 1, credits: 0 });
    expect(expected[1].gift).toBe(social.features.length);
    expect(expected[2]).toMatchObject({ credits: 1 });
  });

  it("reads nothing for no products", async () => {
    const f = fakeDb(TABLE);
    await expect(createEntitlementStore(f.db).listActiveEntitlements({ organizationId: "org-1", productKeys: [], now: NOW })).resolves.toEqual([]);
    expect(f.reads()).toBe(0);
  });
});
