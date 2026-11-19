/**
 * Loads the accounting FX rows for fx-rates.ts (pure). Small tables (a few manual rows a month, ~22 daily rows a month),
 * so one select each — but PostgREST silently caps a response at its max-rows setting (spend-loader.ts pages for that
 * reason). A capped read would drop the oldest months and 月報 would show them as "not filled in", so a full page is
 * reported as an error and rateFor marks the months unavailable instead of guessing.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FxDaily, FxRate } from "./fx-rates";

export const FX_COLUMNS = "id,month,base,quote,rate,source,note,created_by,created_at";
/** Below PostgREST's default max-rows (1000): a response this long may have been cut. */
export const FX_MAX_ROWS = 1000;

function capped<T>(data: T[] | null, table: string): { rows: T[]; error?: string } {
  const rows = data ?? [];
  if (rows.length >= FX_MAX_ROWS) return { rows: [], error: `${table}: ${rows.length} rows hit the read cap; refusing a possibly truncated rate table` };
  return { rows };
}

/** `sinceMonth` = YYYY-MM-01. Newest first, so a month's history lists in audit order. */
export async function loadFxRates(supabase: SupabaseClient, sinceMonth: string): Promise<{ rows: FxRate[]; error?: string }> {
  const { data, error } = await supabase
    .from("fx_rates")
    .select(FX_COLUMNS)
    .gte("month", sinceMonth)
    .order("month", { ascending: false })
    .order("created_at", { ascending: false })
    .range(0, FX_MAX_ROWS - 1);
  if (error) return { rows: [], error: error.message };
  return capped(data as FxRate[] | null, "fx_rates");
}

/** Automatic daily rates (fx-cbc.ts writes them). */
export async function loadFxDaily(supabase: SupabaseClient, sinceMonth: string): Promise<{ rows: FxDaily[]; error?: string }> {
  const { data, error } = await supabase.from("fx_daily_rates").select("day,rate").gte("day", sinceMonth).order("day", { ascending: true }).range(0, FX_MAX_ROWS - 1);
  if (error) return { rows: [], error: error.message };
  return capped(data as FxDaily[] | null, "fx_daily_rates");
}
