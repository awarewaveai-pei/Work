// Where a held product's right comes from and how it is worded (blueprint §7): the pure part of the WordPress summary
// (lib/auth/sources/awarewave-wp.ts) and of the portal workbench, so both draw the same badge. No I/O.
import type { BillingAccount } from "./tables";
import { isLiveRow, rowSource, type EntitlementRecord } from "./can";
import { rightLabel, type RightInput } from "./right-label";
import type { NextAdminProduct } from "@/lib/portal/doors";

export type RightKind = "contract" | "comp" | "credits" | "trial" | "none";
/** Per feature of the product, by the row can() decides by and the source it would sign (rowSource, U5): covered =
 *  contract, gift = comp, credits = a credit-pack row (pay: "credits"), locked = no live row or one can() refuses. */
export interface RightCounts { covered: number; gift: number; credits: number; locked: number }
type ContractStatus = NonNullable<RightInput["contractStatus"]>;

/** Where a held product's right comes from, read off the unit's own billing account: a subscription (active/trial before
 *  a gift, past_due/canceled after), a gift, or the all-features account's source; otherwise null, never guessed. */
export function productRight(account: BillingAccount, productKey: string): Pick<RightInput, "source" | "contractStatus" | "endsAt"> {
  const contracts = account.contracts.filter((c) => c.product_key === productKey);
  const contract = (statuses: ContractStatus[]) => contracts.find((c) => (statuses as string[]).includes(c.status));
  const live = contract(["active", "trial"]);
  if (live) return { source: "contract", contractStatus: live.status as ContractStatus, endsAt: live.current_period_end };
  const comp = account.grants.find((g) => g.product_key === productKey && g.source === "comp" && g.state === "active");
  if (comp) return { source: "comp", contractStatus: null, endsAt: comp.ends_at };
  const lapsing = contract(["past_due", "canceled"]);
  if (lapsing) return { source: "contract", contractStatus: lapsing.status as ContractStatus, endsAt: lapsing.current_period_end };
  const all = account.all_features?.source;
  if (all === "contract" || all === "comp") return { source: all, contractStatus: null, endsAt: null };
  return { source: null, contractStatus: null, endsAt: null };
}

/** In memory over the unit's live rows: each feature's row is re-checked as can() does (isLiveRow) and classed by the
 *  source can() would sign (rowSource). */
export function rightCounts(product: Pick<NextAdminProduct, "key" | "features">, records: readonly EntitlementRecord[],
  at: { organizationId: string; now: number }): RightCounts {
  const counts: RightCounts = { covered: 0, gift: 0, credits: 0, locked: 0 };
  for (const f of product.features) {
    const row = records.find((r) => r.productKey === product.key && r.featureKey === f.feature_key);
    const live = row && isLiveRow(row, { organizationId: at.organizationId, productKey: product.key, featureKey: f.feature_key, now: at.now });
    const source = live ? rowSource(row, f) : null;
    if (source === "contract") counts.covered += 1;
    else if (source === "comp") counts.gift += 1;
    else if (source === "credits") counts.credits += 1;
    else counts.locked += 1;
  }
  return counts;
}

/** The product's source when the billing account names none: what can() signs for its features. */
const featureSource = (c: RightCounts): RightInput["source"] =>
  c.covered > 0 ? "contract" : c.gift > 0 ? "comp" : c.credits > 0 ? "credits" : null;

/** One held product's right: what rightLabel() is asked (`input`, the viewer is the caller's to set), kind, period end, counts. */
export function heldRightInput(p: NextAdminProduct, account: BillingAccount, records: readonly EntitlementRecord[],
  at: { organizationId: string; now: number }): { input: Omit<RightInput, "viewer">; kind: RightKind; until?: string; counts: RightCounts } {
  const counts = rightCounts(p, records, at);
  const r = productRight(account, p.key);
  const source = r.source ?? featureSource(counts);
  const kind: RightKind = r.contractStatus === "trial" ? "trial" : source ?? "none";
  const input = { entry: { allowed: true, verdict: true, reason: null }, door: "open", mode: "enforce", productName: p.name, ...r, source } as const;
  return { input, kind, ...(r.endsAt ? { until: r.endsAt } : {}), counts };
}

/** The WordPress summary's shape of it: kind, badge (rightLabel's label), period end, counts. */
export function heldProductRight(p: NextAdminProduct, account: BillingAccount, records: readonly EntitlementRecord[],
  at: { organizationId: string; now: number }): { kind: RightKind; label: string | null; until?: string; counts: RightCounts } {
  const { input, kind, until, counts } = heldRightInput(p, account, records, at);
  return { kind, label: rightLabel({ ...input, viewer: "manager" }).label, ...(until ? { until } : {}), counts };
}
