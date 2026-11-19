// /api/ops/costs/vendor-invoices — vendor bills behind the /ops/costs 月報 對帳 card (lib/ai/vendor-invoices.ts).
// GET: every row of the last 13 Taipei months (staff only). POST { month:'YYYY-MM', vendor, invoice_usd, paid_twd,
// paid_at?, payment_method?, invoice_ref?, tax_twd?, note? }: appends one row; owner/admin only, same as fx-rates.
// Rows are never updated (DB trigger, migration 0166) -- a correction is a new row and the newest wins.
import { NextResponse } from "next/server";
import { canWriteTenantConfig, resolveOpsRole } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { VENDOR_INVOICE_COLUMNS } from "@/lib/ai/vendor-invoices-loader";
import { PAYMENT_METHODS, vendorKey, type PaymentMethod } from "@/lib/ai/vendor-invoices";
import { taipeiMonth, taipeiMonthStartIso } from "@/lib/ai/spend-report";

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
  const { data, error } = await sb.from("vendor_invoices").select(VENDOR_INVOICE_COLUMNS).gte("month", since)
    .order("month", { ascending: false }).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ ok: false, error: error.message.slice(0, 200) }, { status: 500 });
  return NextResponse.json({ ok: true, rows: data ?? [] });
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
  // paid ÷ invoice is a USD→TWD rate: outside 1..1000 the two fields were swapped or mistyped (same bound as fx-rates).
  if (invoiceUsd > 0 && paidTwd > 0) {
    const implied = paidTwd / invoiceUsd;
    if (implied < 1 || implied > 1000) return bad("implied_rate_implausible");
  }
  const taxTwd = amount(body.tax_twd);
  if (Number.isNaN(taxTwd)) return bad("tax_twd_invalid");
  const paidAt = text(body.paid_at, 10);
  if (paidAt && !DAY_RE.test(paidAt)) return bad("paid_at_invalid");
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
