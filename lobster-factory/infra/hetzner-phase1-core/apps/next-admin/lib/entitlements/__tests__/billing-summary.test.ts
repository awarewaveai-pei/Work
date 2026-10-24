import { describe, expect, it } from "vitest";
import { unusedCustomerCredits } from "../billing-summary";

describe("unused customer credits on /ops/billing", () => {
  it("sums only customer balances above zero", () => {
    expect(unusedCustomerCredits([
      { kind: "customer", balance: 500 },
      { kind: "customer", balance: 120 },
      { kind: "internal", balance: 9000 },
      { kind: "customer", balance: -50 },
      { kind: "customer", balance: 0 },
    ])).toEqual({ units: 620, accounts: 2 });
  });

  it("is zero with no accounts", () => {
    expect(unusedCustomerCredits([])).toEqual({ units: 0, accounts: 0 });
  });
});
