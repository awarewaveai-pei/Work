/**
 * Codex 免費生圖 usage for /ops/costs: pictures counted from the ledger (ai_call_logs model "codex-image", cost 0), and
 * the plan allowance as the laptop worker last read it from Codex (metadata codex_* written by lib/tarot/codex-bridge.ts).
 * A read that fails is null, never 0.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const CODEX_IMAGE_MODEL = "codex-image";

export interface CodexImageUsage {
  last24h: number | null;
  last7d: number | null;
  /** The newest picture's reading of the plan allowance; null = no picture yet, or the read failed. */
  latest: { at: string; pct5h: number | null; resets5h: number | null; pctWeek: number | null; resetsWeek: number | null } | null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

async function countSince(db: SupabaseClient, since: Date): Promise<number | null> {
  try {
    const { count, error } = await db.from("ai_call_logs").select("id", { count: "exact", head: true })
      .eq("model", CODEX_IMAGE_MODEL).gte("created_at", since.toISOString());
    return error || count === null ? null : count;
  } catch {
    return null;
  }
}

export async function loadCodexImageUsage(db: SupabaseClient, now: Date): Promise<CodexImageUsage> {
  const [last24h, last7d, latestRow] = await Promise.all([
    countSince(db, new Date(now.getTime() - 24 * 3600_000)),
    countSince(db, new Date(now.getTime() - 7 * 24 * 3600_000)),
    (async () => {
      try {
        const { data, error } = await db.from("ai_call_logs").select("created_at, metadata")
          .eq("model", CODEX_IMAGE_MODEL).order("created_at", { ascending: false }).limit(1).maybeSingle();
        return error ? null : (data as { created_at: string; metadata: Record<string, unknown> | null } | null);
      } catch {
        return null;
      }
    })(),
  ]);
  const m = latestRow?.metadata ?? {};
  return {
    last24h, last7d,
    latest: latestRow ? {
      at: latestRow.created_at,
      pct5h: num(m.codex_5h_used_pct), resets5h: num(m.codex_5h_resets_at),
      pctWeek: num(m.codex_week_used_pct), resetsWeek: num(m.codex_week_resets_at),
    } : null,
  };
}
