import { describe, expect, it } from "vitest";
import { latestInvoiceByVendorMonth, reconcileMonth, vendorKey, type VendorInvoice } from "../vendor-invoices";
import type { MonthFx } from "../fx-rates";

const fx32: MonthFx = { rate: 32, source: "manual", fallback: false };
const inv = (vendor: string, invoice_usd: number | string, paid_twd: number | string, created_at: string): VendorInvoice => ({
  id: `${vendor}-${created_at}`, month: "2026-10-01", vendor, invoice_usd, paid_twd, paid_at: null, payment_method: "card",
  invoice_ref: null, tax_twd: null, note: null, created_by: "owner:u1", created_at,
});

describe("vendor-invoices", () => {
  it("the newest row for the same vendor and month wins; older corrections stay out of the figure", () => {
    const rows = [inv("openai", 90, 2900, "2026-11-02T01:00:00+00:00"), inv("openai", 100, 3245, "2026-11-03T01:00:00Z")];
    expect(latestInvoiceByVendorMonth(rows).get("2026-10|openai")?.invoice_usd).toBe(100);
    const r = reconcileMonth([{ key: "OpenAI", count: 3, usd: 98 }], rows, fx32).rows[0];
    expect(r.invoiceUsd).toBe(100);
    expect(r.paidTwd).toBe(3245);
  });

  it("implied rate = paid ÷ invoice and fee rate = implied ÷ accounting rate − 1 (100 USD, NT$3,245, rate 32)", () => {
    const r = reconcileMonth([{ key: "OpenAI", count: 1, usd: 98 }], [inv("openai", "100.00", "3245.00", "2026-11-03T01:00:00Z")], fx32).rows[0];
    expect(r.status).toBe("registered");
    expect(r.impliedRate).toBe(32.45);
    expect(r.feeRatePct).toBe(1.41);
    expect(r.diffUsd).toBe(2);
    expect(r.bookTwd).toBe(3245);
  });

  it("tax listed separately on the bill is taken out before the implied rate, so VAT never reads as card fee", () => {
    // NT$3,245 paid of which NT$155 is 5% VAT: net 3,090 ÷ 100 = 30.9, fee −3.44% against rate 32 (a cheap card, not a 6.5% fee)
    const r = reconcileMonth([{ key: "OpenAI", count: 1, usd: 98 }], [{ ...inv("openai", 100, 3245, "2026-11-03T01:00:00Z"), tax_twd: "155" }], fx32).rows[0];
    expect(r.impliedRate).toBe(30.9);
    expect(r.feeRatePct).toBe(-3.44);
    expect(r.bookTwd).toBe(3245); // what left the account is still the booked figure
  });

  it("a row with nothing paid registers nothing: the vendor stays 尚未登錄 with its estimate", () => {
    const m = reconcileMonth([{ key: "OpenAI", count: 1, usd: 98 }], [inv("openai", 100, 0, "2026-11-03T01:00:00Z")], fx32);
    expect(m.rows[0]).toMatchObject({ vendor: "openai", status: "missing" });
    expect(m.rows[0].paidTwd).toBeUndefined();
    expect(m.totals).toMatchObject({ registered: 0, missing: 1, paidTwd: 0 });
  });

  it("a vendor with no bill is 尚未登錄 at estimate × rate × 1.015, never shown as paid", () => {
    const m = reconcileMonth([{ key: "Black Forest Labs (Replicate)", count: 2, usd: 6 }, { key: "BFL/Replicate", count: 1, usd: 4 }], [], fx32);
    expect(m.rows).toHaveLength(1);
    const r = m.rows[0];
    expect(r.vendor).toBe("replicate");
    expect(r.status).toBe("missing");
    expect(r.paidTwd).toBeUndefined();
    expect(r.estimateTwdWithFee).toBeCloseTo(10 * 32 * 1.015, 6);
    expect(m.totals).toMatchObject({ registered: 0, missing: 1, paidTwd: 0 });
    // a failed read is not "not entered"
    expect(reconcileMonth([{ key: "OpenAI", count: 1, usd: 1 }], [], fx32, 0.015, "boom").rows[0].status).toBe("unavailable");
    expect(vendorKey("Google Gemini (direct)")).toBe("google");
  });
});
