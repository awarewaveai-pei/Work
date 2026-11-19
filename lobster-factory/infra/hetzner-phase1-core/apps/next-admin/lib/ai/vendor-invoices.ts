/**
 * Vendor-bill reconciliation for /ops/costs 月報 (FX2). Pure functions; loading lives in vendor-invoices-loader.ts.
 *
 * Invariant: one month, one vendor = three figures — estimate (ai_call_logs usage × list price, spend-report.ts),
 * invoice USD and paid NT$ (both entered by hand in `vendor_invoices`, append-only, newest row per month+vendor wins).
 * Implied rate = paid ÷ invoice; fee rate = implied ÷ the month's accounting rate − 1. Both are derived here, never
 * stored. A vendor with no row is 「尚未登錄」: shown as estimate × accounting rate × (1 + CARD_FEE_RATE), flagged as an
 * estimate, never as paid. A failed read of the table makes every vendor `unavailable`, not 「尚未登錄」.
 */
import { MEDIA_MODELS, MUSIC_RATES, TEXT_RATES, TOOL_RATES, VIDEO_MOTION_RATES } from "./cost-model";
import type { MonthFx } from "./fx-rates";
import type { Bucket } from "./spend-report";

/** Credit-card foreign-transaction fee assumed for a month whose bill is not entered yet. 1.5% is the usual Taiwan card
 *  rate; replace it with the real figure once a few months of 實付 show the fee rate column. Not part of cost-model.ts:
 *  quotes and button prices never include it. */
export const CARD_FEE_RATE = 0.015;

export type PaymentMethod = "card" | "paypal" | "wire" | "other";
export const PAYMENT_METHODS: PaymentMethod[] = ["card", "paypal", "wire", "other"];
export const PAYMENT_LABEL: Record<PaymentMethod, string> = { card: "信用卡", paypal: "PayPal", wire: "電匯", other: "其他" };

/** One `vendor_invoices` row. `month` = 1st of the Asia/Taipei month (YYYY-MM-DD); numerics may arrive as strings. */
export interface VendorInvoice {
  id: string;
  month: string;
  vendor: string;
  invoice_usd: number | string;
  paid_twd: number | string;
  paid_at: string | null;
  payment_method: PaymentMethod | null;
  invoice_ref: string | null;
  tax_twd: number | string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

/** Payee key: who sends the bill. ai_call_logs.vendor carries the model maker too ("BFL/Replicate",
 *  "Black Forest Labs (Replicate)"), but Replicate is the one that bills those, so anything naming Replicate is
 *  'replicate'. Otherwise: drop a parenthetical ("Pexels (免費)"), keep the part before "/", lower-case; every
 *  "Google …" is Google's bill. */
export function vendorKey(logged: string | null | undefined): string {
  const s = (logged ?? "").trim();
  if (!s) return "unknown";
  if (/replicate/i.test(s)) return "replicate";
  const base = s.replace(/[（(][^）)]*[）)]/g, "").split("/")[0].trim().toLowerCase();
  if (base.startsWith("google")) return "google";
  return base || "unknown";
}

/** Vendor buttons on the 登錄 form: every payee priced in cost-model.ts (paid tools only), then any extra key seen in
 *  the month's usage or bills. 「其他（自填）」 covers the rest. */
export function vendorChoices(extra: string[] = []): string[] {
  const priced = [
    ...Object.values(TEXT_RATES).map((r) => r.vendor),
    ...Object.values(MEDIA_MODELS).map((r) => r.vendor),
    ...Object.values(VIDEO_MOTION_RATES).map((r) => r.vendor),
    ...Object.values(MUSIC_RATES).map((r) => r.vendor),
    ...Object.values(TOOL_RATES).filter((r) => r.usd > 0).map((r) => r.vendor),
  ].map(vendorKey);
  return [...new Set([...priced, ...extra.filter((k) => k && k !== "unknown")])];
}

/** YYYY-MM of a `month` date column. */
const monthOf = (d: string) => d.slice(0, 7);

/** Newest row per month and vendor (by created_at instant). Key = `${YYYY-MM}|${vendor}`. */
export function latestInvoiceByVendorMonth(rows: VendorInvoice[]): Map<string, VendorInvoice> {
  const out = new Map<string, VendorInvoice>();
  for (const r of rows) {
    const k = `${monthOf(r.month)}|${r.vendor}`;
    const cur = out.get(k);
    if (!cur || Date.parse(r.created_at) > Date.parse(cur.created_at)) out.set(k, r);
  }
  return out;
}

export type ReconStatus = "registered" | "missing" | "unavailable";

export interface VendorRecon {
  vendor: string;
  estimateUsd: number;
  status: ReconStatus;
  invoiceUsd?: number;
  paidTwd?: number;
  /** paid ÷ invoice, 4 dp; absent when the invoice is 0 */
  impliedRate?: number;
  /** (implied ÷ accounting rate − 1) × 100, 2 dp */
  feeRatePct?: number;
  /** invoice − estimate */
  diffUsd?: number;
  /** estimate × accounting rate × (1 + cardFeeRate): the figure used while no bill is entered */
  estimateTwdWithFee: number;
  /** paid when registered, else estimateTwdWithFee */
  bookTwd: number;
  invoice?: VendorInvoice;
}

export interface MonthRecon {
  rows: VendorRecon[];
  totals: { estimateUsd: number; invoiceUsd: number; paidTwd: number; estimateTwdWithFee: number; bookTwd: number; registered: number; missing: number };
  error?: string;
}

const r4 = (n: number) => Number(n.toFixed(4));
const r2 = (n: number) => Number(n.toFixed(2));

/**
 * `byVendor` = the month's summary.byVendor (logged names, merged here by vendorKey); `invoices` = that month's rows
 * (any order, corrections included); `fx` = the month's accounting rate (fx-rates.ts rateFor); `readError` = the
 * loader's error. Vendors with no usage and no bill are left out; a bill with no usage is listed with estimate 0.
 */
export function reconcileMonth(
  byVendor: Bucket[], invoices: VendorInvoice[], fx: MonthFx, cardFeeRate = CARD_FEE_RATE, readError?: string,
): MonthRecon {
  const est = new Map<string, number>();
  for (const b of byVendor) {
    const k = vendorKey(b.key);
    est.set(k, (est.get(k) ?? 0) + b.usd);
  }
  const latest = new Map<string, VendorInvoice>();
  if (!readError) for (const inv of latestInvoiceByVendorMonth(invoices).values()) latest.set(inv.vendor, inv);

  const keys = new Set([...[...est].filter(([, usd]) => usd > 0).map(([k]) => k), ...latest.keys()]);
  const rows: VendorRecon[] = [...keys].map((vendor): VendorRecon => {
    const estimateUsd = est.get(vendor) ?? 0;
    const estimateTwdWithFee = estimateUsd * fx.rate * (1 + cardFeeRate);
    const inv = latest.get(vendor);
    if (!inv) return { vendor, estimateUsd, status: readError ? "unavailable" : "missing", estimateTwdWithFee, bookTwd: estimateTwdWithFee };
    const invoiceUsd = Number(inv.invoice_usd);
    const paidTwd = Number(inv.paid_twd);
    const impliedRate = invoiceUsd > 0 ? r4(paidTwd / invoiceUsd) : undefined;
    const feeRatePct = impliedRate !== undefined && fx.rate > 0 ? r2((impliedRate / fx.rate - 1) * 100) : undefined;
    return {
      vendor, estimateUsd, status: "registered", invoiceUsd, paidTwd, impliedRate, feeRatePct,
      diffUsd: invoiceUsd - estimateUsd, estimateTwdWithFee, bookTwd: paidTwd, invoice: inv,
    };
  }).sort((a, b) => b.estimateUsd - a.estimateUsd || (b.invoiceUsd ?? 0) - (a.invoiceUsd ?? 0) || a.vendor.localeCompare(b.vendor));

  const totals = { estimateUsd: 0, invoiceUsd: 0, paidTwd: 0, estimateTwdWithFee: 0, bookTwd: 0, registered: 0, missing: 0 };
  for (const r of rows) {
    totals.estimateUsd += r.estimateUsd;
    totals.bookTwd += r.bookTwd;
    if (r.status === "registered") {
      totals.registered += 1; totals.invoiceUsd += r.invoiceUsd ?? 0; totals.paidTwd += r.paidTwd ?? 0;
    } else {
      totals.missing += 1; totals.estimateTwdWithFee += r.estimateTwdWithFee;
    }
  }
  return { rows, totals, ...(readError ? { error: readError } : {}) };
}
