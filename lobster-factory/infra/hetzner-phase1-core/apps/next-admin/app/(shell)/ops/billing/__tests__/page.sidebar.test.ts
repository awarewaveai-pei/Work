// /ops/billing's account sidebar, rendered with the two reads stubbed (the real-DB path is payments.e2e.test.ts, which
// npm test skips). Covers what tsc cannot: an open account stays open while the sidebar is filtered, searched or paged,
// and each row still shows its own 30-day totals, which the account detail does not (it reads only 20 ledger rows).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const OPEN = "11111111-1111-4111-8111-111111111111";
const AW = "33333333-3333-4333-8333-333333333333";
const RESELLER = "44444444-4444-4444-8444-444444444444";
const row = (id: string, name: string, extra: object = {}) => ({
  organization_id: id, name, slug: name.toLowerCase(), kind: "customer", sold_by_id: AW, sold_by: "AwareWave", balance: 10, granted_30d: 500, spent_30d: 300,
  frozen_since: null, reasons: [], contracts: [], next_period_end: null, last_payment: null, ...extra,
});
vi.mock("@/lib/entitlements/tables", () => ({
  LEDGER_FILTERS: ["all", "attention", "balance", "contract", "internal"],
  billingAccount: async () => null,
  taipeiMonthStart: () => "2026-10-01",
  billingLedger: async () => ({
    totals: { accounts: 120, unused_units: 0, unused_accounts: 0, granted_30d: 0, spent_30d: 0, attention: 1, frozen: 1, overdrawn: 0, past_due: 0, suspended: 0 },
    matching: 120,
    rows: [row(OPEN, "Alpha", { next_period_end: "2026-11-30T16:00:00Z" }), row("22222222-2222-4222-8222-222222222222", "Beta", { balance: -5, reasons: ["frozen"], sold_by_id: RESELLER, sold_by: "Reseller Co" })],
  }),
  billingSellerMonth: async () => ({
    month: "2026-10",
    rows: [
      { seller_id: AW, seller: "AwareWave", subscription_payments: 3, credit_pack_orders: 1, credit_pack_units: 500 },
      { seller_id: RESELLER, seller: "Reseller Co", subscription_payments: 2, credit_pack_orders: 0, credit_pack_units: 0 },
    ],
  }),
}));

const render = async (sp: Record<string, string>) => {
  const { default: BillingPage } = await import("../page");
  return renderToStaticMarkup(await BillingPage({ searchParams: Promise.resolve(sp) }));
};

describe("/ops/billing sidebar", () => {
  it("keeps the open account on every filter, page and search the sidebar offers", async () => {
    const html = await render({ account: OPEN, q: "al" });
    expect(html).toContain(`/ops/billing?f=attention&amp;q=al&amp;account=${OPEN}`);
    expect(html).toContain(`/ops/billing?q=al&amp;page=2&amp;account=${OPEN}`);
    expect(html).toContain(`name="account" value="${OPEN}"`);
    expect(html).toContain(`/ops/billing?q=al"`);   // 關閉 drops only the account
  });

  it("lists each account with its balance, 30-day totals and what needs a person", async () => {
    const html = await render({});
    expect(html).toContain("Beta");
    expect(html).toContain("+500 / −300");
    expect(html).toContain("錢包凍結</span>");    // the row's tag, not the 需要處理 card's note
    expect(html).toContain("本期到 2026/12/01");    // Taipei date
    expect(html).toContain("點左邊的帳戶");
    expect(html).not.toContain("name=\"account\"");
  });

  it("highlights the open row when the id arrives upper-case", async () => {
    expect(await render({ account: OPEN.toUpperCase() })).toContain(`aria-current="true"`);
  });

  it("shows who sold each account, the per-seller month table, and a seller filter that replaces the status filter", async () => {
    const html = await render({ f: "attention", seller: RESELLER, account: OPEN });
    expect(html).toContain("賣家：Reseller Co");
    expect(html).toContain("本月各賣家合計（2026-10）");
    expect(html).toContain(`/ops/billing?seller=${AW}&amp;account=${OPEN}`);   // another seller replaces this one, keeps the open account
    expect(html).toContain(`/ops/billing?account=${OPEN}"`);   // 所有狀態 chip drops the seller
    expect(html).not.toContain(`name="f"`);
    expect(html).toContain(`name="seller" value="${RESELLER}"`);
  });
});
