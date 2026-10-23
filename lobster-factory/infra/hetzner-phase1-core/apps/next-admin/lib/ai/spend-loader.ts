/**
 * Loads `ai_call_logs` rows for spend-report.ts. Pages through the whole window: PostgREST caps a
 * single response at its max-rows setting no matter what `.limit()` asks for, so one big select
 * silently drops rows once the window outgrows the cap — the totals would look normal and be short.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SpendRow } from "./spend-report";

const PAGE = 1000;
/** Hard stop so a runaway table cannot hang the page; reported back as `truncated`. */
export const MAX_ROWS = 200_000;

export const SPEND_COLUMNS =
  "id,created_at,route,model,vendor,cost_usd,kind,tool,job_id,organization_id,input_tokens,output_tokens,metadata";

export interface SpendLoad {
  rows: SpendRow[];
  error?: string;
  truncated: boolean;
}

export async function loadSpendRows(supabase: SupabaseClient, sinceIso: string): Promise<SpendLoad> {
  const rows: SpendRow[] = [];
  // Advance by what came back and stop only on an empty page: if the server cap is below PAGE, a
  // "short page = last page" test would stop after the first page.
  for (let from = 0; from < MAX_ROWS; ) {
    const { data, error } = await supabase
      .from("ai_call_logs")
      .select(SPEND_COLUMNS)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return { rows, error: error.message, truncated: rows.length > 0 };
    const page = (data ?? []) as SpendRow[];
    if (page.length === 0) return { rows, truncated: false };
    rows.push(...page);
    from += page.length;
  }
  // Reached the cap exactly: only call it truncated if a row actually exists past it.
  const { data: more } = await supabase
    .from("ai_call_logs")
    .select("id")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .range(rows.length, rows.length);
  return { rows, truncated: (more ?? []).length > 0 };
}

/** id → display name for the organizations that appear in the rows. */
export async function loadOrgNames(supabase: SupabaseClient, rows: SpendRow[]): Promise<Record<string, string>> {
  const ids = [...new Set(rows.map((r) => r.organization_id).filter((x): x is string => !!x))];
  if (ids.length === 0) return {};
  const { data } = await supabase.from("organizations").select("id,name").in("id", ids);
  const out: Record<string, string> = {};
  for (const o of (data ?? []) as { id: string; name: string | null }[]) out[o.id] = o.name ?? o.id;
  return out;
}
