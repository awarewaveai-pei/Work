// /api/ops/costs/vendor-invoices — vendor bills behind the /ops/costs 月報 對帳 card (lib/ai/vendor-invoices.ts).
// GET: every row of the last 13 Taipei months (staff only). POST { month:'YYYY-MM', vendor, invoice_usd, paid_twd,
// paid_at?, payment_method?, invoice_ref?, tax_twd?, note? }: appends one row; owner/admin only, same as fx-rates.
// Rows are never updated (DB trigger, migration 0166) -- a correction is a new row and the newest wins.
import { NextResponse } from "next/server";
import { canWriteTenantConfig, resolveOpsRole } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { VENDOR_INVOICE_COLUMNS, loadVendorInvoices } from "@/lib/ai/vendor-invoices-loader";
import { PAYMENT_METHODS, vendorKey, type PaymentMethod } from "@/lib/ai/vendor-invoices";
import { taipeiDay, taipeiMonth, taipeiMonthStartIso } from "@/lib/ai/spend-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
/** numeric(12,2) holds up to 10^10; anything near that is a typo. */
const MAX_AMOUNT = 100_000_000;

const amount = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= MAX_AMOUNT ? Number(n.toFixed(2)) : NaN;
};
const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export async function GET(request: Request) {
  const resolved = resolveOpsRole(request);
  if (resolved.source === "client") return NextResponse.json({ ok: false, error: "forbidden_role" }, { status: 403 });
  const sb = getSupabaseWriteClient();
  if (!sb) return NextResponse.json({ ok: false, error: "db_unavailable" }, { status: 503 });
  const since = `${taipeiMonth(taipeiMonthStartIso(new Date(), 12))}-01`;
  // the same loader as the page: a read that hits the row cap is an error, never a silently shorter list (Codex partialreview-27540faf)
  const { rows, error } = await loadVendorInvoices(sb, since);
  if (error) return NextResponse.json({ ok: false, error: error.slice(0, 200) }, { status: 500 });
  return NextResponse.json({ ok: true, rows });
}

export async function POST(request: Request) {
  const resolved = resolveOpsRole(request);
  if (resolved.source === "client" || !canWriteTenantConfig(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const bad = (error: string) => NextResponse.json({ ok: false, error }, { status: 400 });
  const month = String(body.month ?? "");
  if (!MONTH_RE.test(month)) return bad("month_invalid");
  const rawVendor = typeof body.vendor === "string" ? body.vendor.trim() : "";
  const vendor = vendorKey(rawVendor);
  if (!rawVendor || vendor === "unknown" || vendor.length > 40) return bad("vendor_invalid");
  const invoiceUsd = amount(body.invoice_usd);
  if (invoiceUsd === null || Number.isNaN(invoiceUsd)) return bad("invoice_usd_invalid");
  const paidTwd = amount(body.paid_twd);
  if (paidTwd === null || Number.isNaN(paidTwd)) return bad("paid_twd_invalid");
  // this table records 實付; an invoice received but not paid yet is entered after the payment, not as NT$0
  if (paidTwd <= 0) return bad("paid_twd_must_be_positive：還沒付款的發票先不登，付款後再填實付金額");
  const taxTwd = amount(body.tax_twd);
  if (Number.isNaN(taxTwd) || (taxTwd !== null && taxTwd >= paidTwd)) return bad("tax_twd_invalid");
  // (paid − tax) ÷ invoice is a USD→TWD rate, the same figure reconcileMonth shows: outside 1..1000 the fields were
  // swapped or mistyped (same bound as fx-rates; Codex review-551b5665 -- checking the gross figure let a mistyped tax through).
  if (invoiceUsd > 0) {
    const implied = (paidTwd - (taxTwd ?? 0)) / invoiceUsd;
    if (implied < 1 || implied > 1000) return bad("implied_rate_implausible");
  }
  // 實付 needs the day the money left the account: required, a real date, not in the future (review-46f960dc / 15a38b2f)
  const paidAt = text(body.paid_at, 10);
  if (!paidAt) return bad("paid_at_required：填實際付款日（刷卡日或扣款日）");
  if (!DAY_RE.test(paidAt)) return bad("paid_at_invalid");
  if (paidAt > taipeiDay(new Date().toISOString())) return bad("paid_at_in_future：付款日還沒到，付款後再登");
  const method = body.payment_method == null || body.payment_method === "" ? null : String(body.payment_method) as PaymentMethod;
  if (method && !PAYMENT_METHODS.includes(method)) return bad("payment_method_invalid");

  const sb = getSupabaseWriteClient();
  if (!sb) return NextResponse.json({ ok: false, error: "db_unavailable" }, { status: 503 });
  const userId = request.headers.get("x-ops-user-id")?.trim();
  const createdBy = `${resolved.role}:${userId || resolved.source}`;
  const { data, error } = await sb.from("vendor_invoices")
    .insert({
      month: `${month}-01`, vendor, invoice_usd: invoiceUsd, paid_twd: paidTwd, paid_at: paidAt, payment_method: method,
      invoice_ref: text(body.invoice_ref, 100), tax_twd: taxTwd, note: text(body.note, 500), created_by: createdBy,
    })
    .select(VENDOR_INVOICE_COLUMNS).single();
  if (error) return NextResponse.json({ ok: false, error: error.message.slice(0, 200) }, { status: 500 });
  return NextResponse.json({ ok: true, row: data });
}
