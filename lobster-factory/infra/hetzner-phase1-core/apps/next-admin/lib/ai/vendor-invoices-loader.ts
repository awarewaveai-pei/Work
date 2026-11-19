/**
 * Loads `vendor_invoices` rows for vendor-invoices.ts (pure). Same cap guard as fx-loader.ts: PostgREST silently cuts a
 * response at max-rows, and a cut read would show billed vendors as 「尚未登錄」, so a full page is an error instead.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { FX_MAX_ROWS } from "./fx-loader";
import type { VendorInvoice } from "./vendor-invoices";

export const VENDOR_INVOICE_COLUMNS = "id,month,vendor,invoice_usd,paid_twd,paid_at,payment_method,invoice_ref,tax_twd,note,created_by,created_at";

/** `sinceMonth` = YYYY-MM-01. Newest first, so a month's history lists in audit order. */
export async function loadVendorInvoices(supabase: SupabaseClient, sinceMonth: string): Promise<{ rows: VendorInvoice[]; error?: string }> {
  const { data, error } = await supabase
    .from("vendor_invoices")
    .select(VENDOR_INVOICE_COLUMNS)
    .gte("month", sinceMonth)
    .order("month", { ascending: false })
    .order("created_at", { ascending: false })
    .range(0, FX_MAX_ROWS - 1);
  if (error) return { rows: [], error: error.message };
  const rows = (data ?? []) as VendorInvoice[];
  if (rows.length >= FX_MAX_ROWS) return { rows: [], error: `vendor_invoices: ${rows.length} rows hit the read cap; refusing a possibly truncated bill list` };
  return { rows };
}
