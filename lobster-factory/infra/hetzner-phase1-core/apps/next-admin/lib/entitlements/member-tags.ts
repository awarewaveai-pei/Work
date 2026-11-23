// Member tags (ADR 021 §2, D3): the three identity layers computed from data, never typed in. Pure, no I/O.
// Role = organizations.kind; way = one source each (below); product = the registry key. 買斷 (buyout) is not computed
// here (U35) and is never output. A way the data cannot name is "unclassified", never a guessed way.
import { sellerLicenceKey } from "./can";

export type Role = "Admin" | "客戶" | "TEST";
/** subscription = a live subscription row; operated = organization_product_operations says awarewave; reseller = a live
 *  <product>.resell right; credits = balance > 0 or a live right that pays from credits; unclassified = held, but no
 *  source above explains it (staff-opened all-features rows, gifts). */
export type Way = "subscription" | "operated" | "reseller" | "credits" | "unclassified";
export const WAY_LABELS: Readonly<Record<Way, string>> = {
  subscription: "訂閱", operated: "代操", reseller: "經銷", credits: "點數", unclassified: "未分類",
};

export interface MemberTagsInput {
  kind: "internal" | "customer" | "test";
  /** the parent's kind for a brand: tags follow the root account */
  parentKind?: "internal" | "customer" | "test" | null;
  /** the root account's subscription rows; status absent or not canceled/ended = live */
  contracts: ReadonlyArray<{ product_key: string; status?: string }>;
  /** the account's live rights (already filtered live): only the resell rows and `limits.pay` are read */
  entitlements: ReadonlyArray<{ productKey: string; featureKey: string; source: string; sourceRef: string | null; limits?: Record<string, unknown> | null }>;
  operations: ReadonlyArray<{ productKey: string; operatedBy: string }>;
  balance: number;
}
export interface MemberTags {
  role: Role;
  /** one pair per (product, way): 「產品／方式」 */
  pairs: Array<{ product: string; way: Way; label: string }>;
  /** the way tags: each distinct way once, "unclassified" excluded (it is a flag, listed in `unclassified`) */
  ways: Way[];
  /** products held with no explainable way */
  unclassified: string[];
}

export function memberRole(kind: MemberTagsInput["kind"], parentKind?: MemberTagsInput["parentKind"]): Role {
  if (kind === "test" || parentKind === "test") return "TEST";
  return (parentKind ?? kind) === "internal" ? "Admin" : "客戶";
}

const ENDED = new Set(["canceled", "cancelled", "ended", "expired"]);

export function memberTags(i: MemberTagsInput, productName: (key: string) => string = (k) => k): MemberTags {
  const byProduct = new Map<string, Set<Way>>();
  const add = (p: string, w: Way) => { byProduct.set(p, (byProduct.get(p) ?? new Set()).add(w)); };
  for (const c of i.contracts) if (!c.status || !ENDED.has(c.status)) add(c.product_key, "subscription");
  for (const o of i.operations) if (o.operatedBy === "awarewave") add(o.productKey, "operated");
  const held = new Set<string>();
  for (const e of i.entitlements) {
    if (e.featureKey === sellerLicenceKey(e.productKey)) { add(e.productKey, "reseller"); continue; }
    held.add(e.productKey);
    if (e.limits?.pay === "credits") add(e.productKey, "credits");
  }
  // held with no way above: staff-opened (all-features contract/comp rows) or a gift -- say so, do not pick a way
  const unclassified = [...held].filter((p) => !byProduct.has(p)).sort();
  const pairs = [...byProduct.entries()].sort(([a], [b]) => a.localeCompare(b)).flatMap(([p, ws]) =>
    [...ws].sort().map((w) => ({ product: p, way: w, label: `${productName(p)}／${WAY_LABELS[w]}` })));
  for (const p of unclassified) pairs.push({ product: p, way: "unclassified", label: `${productName(p)}／${WAY_LABELS.unclassified}` });
  const ways = new Set<Way>(pairs.map((x) => x.way).filter((w) => w !== "unclassified"));
  if (i.balance > 0) ways.add("credits");
  const order: Way[] = ["subscription", "operated", "reseller", "credits"];
  return { role: memberRole(i.kind, i.parentKind), pairs, ways: order.filter((w) => ways.has(w)), unclassified };
}
