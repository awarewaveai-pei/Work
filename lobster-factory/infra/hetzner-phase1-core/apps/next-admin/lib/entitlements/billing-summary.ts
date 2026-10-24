// /ops/billing top line (ADR 017 4b-7; ADR 015 §4): unused customer credits = what the accountant books as a contract
// liability (預收／合約負債) until the credits are spent. Only customer accounts count -- the internal account's credits
// are ours -- and an overdrawn account (negative balance, 0066 hard_credit_limit) never offsets another's.
import type { BillingAccount } from "./tables";

export function unusedCustomerCredits(accounts: Pick<BillingAccount, "kind" | "balance">[]): { units: number; accounts: number } {
  let units = 0;
  let holders = 0;
  for (const a of accounts) {
    if (a.kind !== "customer" || !(a.balance > 0)) continue;
    units += a.balance;
    holders += 1;
  }
  return { units, accounts: holders };
}
