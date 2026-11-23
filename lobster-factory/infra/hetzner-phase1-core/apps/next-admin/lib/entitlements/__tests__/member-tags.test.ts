import { describe, expect, it } from "vitest";
import { memberRole, memberTags, type MemberTagsInput } from "../member-tags";

const base: MemberTagsInput = { kind: "customer", contracts: [], entitlements: [], operations: [], balance: 0 };
const ent = (productKey: string, featureKey: string, o: { source?: string; sourceRef?: string | null; limits?: Record<string, unknown> } = {}) =>
  ({ productKey, featureKey, source: o.source ?? "contract", sourceRef: o.sourceRef ?? null, limits: o.limits ?? {} });
const labels = (i: Partial<MemberTagsInput>) => memberTags({ ...base, ...i }).pairs.map((p) => p.label);

describe("memberTags: ADR 021 §2 examples and the three layers", () => {
  it.each([
    ["Soulful: 客戶; 內容行銷／代操 and 內容行銷／訂閱",
      { contracts: [{ product_key: "content", status: "active" }], operations: [{ productKey: "content", operatedBy: "awarewave" }] },
      "客戶", ["content／代操", "content／訂閱"], ["subscription", "operated"]],
    ["reseller: 客戶; 影片／經銷",
      { entitlements: [ent("video", "video.resell")] }, "客戶", ["video／經銷"], ["reseller"]],
    ["internal = Admin", { kind: "internal" as const }, "Admin", [], []],
    ["test = TEST", { kind: "test" as const }, "TEST", [], []],
    ["a brand follows its root: parent test", { parentKind: "test" as const }, "TEST", [], []],
    ["a brand follows its root: parent internal", { parentKind: "internal" as const }, "Admin", [], []],
    ["a unit with no rights at all", {}, "客戶", [], []],
    ["canceled subscription is not a subscription", { contracts: [{ product_key: "social", status: "canceled" }] }, "客戶", [], []],
    ["customer operated by itself (no 代操)", { operations: [{ productKey: "content", operatedBy: "customer" }] }, "客戶", [], []],
    ["balance > 0 = 點數 way, no product pair", { balance: 5 }, "客戶", [], ["credits"]],
    ["a right that pays from credits = product／點數", { entitlements: [ent("design", "design.export", { limits: { pay: "credits" } })] }, "客戶", ["design／點數"], ["credits"]],
  ] as const)("%s", (_n, input, role, pairLabels, ways) => {
    const t = memberTags({ ...base, ...(input as Partial<MemberTagsInput>) });
    expect(t.role).toBe(role);
    expect(t.pairs.map((p) => p.label)).toEqual(pairLabels);
    expect(t.ways).toEqual(ways);
  });

  it("production today: Soulful's only all-features contract rows = 訂閱 (ADR 021 §2), with no subscription row", () => {
    const t = memberTags({ ...base, entitlements: [ent("content", "content.write", { sourceRef: "all-features:x" }), ent("video", "video.render", { sourceRef: "all-features:x" })] });
    expect(t.pairs.map((p) => p.label)).toEqual(["content／訂閱", "video／訂閱"]);
    expect(t.unclassified).toEqual([]);
    expect(t.ways).toEqual(["subscription"]);
  });

  it("ADR 021 §2 Soulful example: all-features contract rows plus an operated product = 內容行銷／代操 and 內容行銷／訂閱", () => {
    const t = memberTags({ ...base, entitlements: [ent("content", "content.write", { sourceRef: "all-features:x" })], operations: [{ productKey: "content", operatedBy: "awarewave" }] }, () => "內容行銷");
    expect(t.pairs.map((p) => p.label)).toEqual(["內容行銷／代操", "內容行銷／訂閱"]);
  });

  it("a contract-source right that pays from credits is a credit pack, not a subscription", () => {
    const t = memberTags({ ...base, entitlements: [ent("design", "design.export", { limits: { pay: "credits" } })] });
    expect(t.pairs.map((p) => p.label)).toEqual(["design／點數"]);
  });

  it("comp (edd-research) = 贈送: the pair 「產品／贈送」 and the way tag; contract and comp rows on one product give both pairs", () => {
    const t = memberTags({ ...base, entitlements: [ent("content", "content.write", { source: "comp", sourceRef: "all-features:x" })] });
    expect(t.pairs.map((p) => p.label)).toEqual(["content／贈送"]);
    expect(t.ways).toEqual(["comp"]);
    expect(t.unclassified).toEqual([]);
    const both = memberTags({ ...base, entitlements: [ent("content", "content.write"), ent("content", "content.read", { source: "comp" })] });
    expect(both.pairs.map((p) => p.label)).toEqual(["content／贈送", "content／訂閱"]);
  });

  it("every valid source (the entitlements table allows contract and comp only, 0110) maps to a way: nothing falls to 未分類", () => {
    for (const source of ["contract", "comp"]) {
      for (const pay of [undefined, "credits"]) {
        const t = memberTags({ ...base, entitlements: [ent("p", "p.f", { source, limits: pay ? { pay } : {} })] });
        expect(t.unclassified, `${source}/${pay}`).toEqual([]);
        expect(t.pairs.length, `${source}/${pay}`).toBeGreaterThan(0);
      }
    }
    expect(memberTags({ ...base, entitlements: [ent("p", "p.f", { source: "mystery" })] }).unclassified).toEqual([{ product: "p", reason: "other" }]);
  });

  it("internal (Admin): its comp rights give no way tag and no pair; a customer's do", () => {
    const rows = [ent("content", "content.write", { source: "comp", sourceRef: "all-features:x" })];
    const admin = memberTags({ ...base, kind: "internal", entitlements: rows });
    expect(admin.role).toBe("Admin");
    expect(admin.pairs).toEqual([]);
    expect(admin.ways).toEqual([]);
    expect(admin.unclassified).toEqual([]);
    expect(memberTags({ ...base, entitlements: rows }).ways).toEqual(["comp"]);
  });

  it("a held product that also has a way is not 未分類; resell rows are never 'held'", () => {
    const t = memberTags({ ...base, contracts: [{ product_key: "content" }], entitlements: [ent("content", "content.write"), ent("video", "video.resell")] });
    expect(t.unclassified).toEqual([]);
    expect(t.pairs.map((p) => p.label)).toEqual(["content／訂閱", "video／經銷"]);
  });

  it("never outputs 買斷 (U35)", () => {
    const t = memberTags({ ...base, contracts: [{ product_key: "a" }], operations: [{ productKey: "a", operatedBy: "awarewave" }], entitlements: [ent("a", "a.resell"), ent("b", "b.x")], balance: 1 });
    expect(JSON.stringify(t)).not.toContain("買斷");
  });

  it("productName names the product in the pair", () => {
    expect(memberTags({ ...base, contracts: [{ product_key: "content" }] }, () => "內容行銷").pairs[0].label).toBe("內容行銷／訂閱");
  });

  it("memberRole: test beats everything, a brand takes the root's kind", () => {
    expect(memberRole("customer", "test")).toBe("TEST");
    expect(memberRole("test", "customer")).toBe("TEST");
    expect(memberRole("customer", "customer")).toBe("客戶");
  });
});
